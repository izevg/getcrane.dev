---
title: "Valkey cache"
description: "How to connect Valkey to CRANE in Compose: the cache override, a password-based ACL, an isolated network, URL schemes and failure behavior."
audience: [platform, security]
genre: how-to
state: current
status: available
weight: 40
terms: [upstream, proxy-repository, blob, cas, digest]
---

This page explains how to replace the in-process cache with a shared Valkey cache. Valkey holds the {{< term "proxy-repository" >}} cache and coordinates fetches from the {{< term "upstream" >}} between `crane` replicas. The mode is switched on by the override file `deploy/compose/docker-compose.cache.yaml`: it adds Valkey with mandatory authentication in the isolated `cache` network.

In the Compose file `crane` is a single container, so Valkey is optional there. By default the server uses the `memory` cache when neither {{< env "CRANE_CACHE" >}} nor {{< env "CRANE_CACHE_FILE" >}} is set. Valkey is needed when replicas must share the cache.

> [!WARNING]
> Valkey must be reachable only by `crane`. The cache holds proxy document bodies that CRANE serves to clients and pointers to {{< term "blob" "blobs" >}} in the {{< term "cas" "CAS" >}}. Whoever can write to Valkey can substitute proxy documents and pointers. Do not publish the Valkey port, do not disable authentication and do not attach other services to the `cache` network.

## Before you begin {#prerequisites}

- A working project from {{< xref "deploy/docker-compose" >}}.
- The {{< env "VALKEY_IMAGE" >}}, {{< env "VALKEY_MAXMEMORY" >}}, {{< env "VALKEY_PASSWORD_SECRET" >}} and {{< env "CRANE_CACHE_URL_SECRET" >}} values in `.env` (`.env.dist` already has them).

## Steps {#steps}

1. Change the Valkey memory limit in `.env` if needed. Proxy artifact keys live without a TTL, so the limit is mandatory. The `allkeys-lru` eviction policy is fixed in the compose file and cannot be configured.

   ```bash
   VALKEY_MAXMEMORY=512mb
   ```

2. Create the password and address files. The task creates `./secrets/valkey_password` and `./secrets/cache_url` with an address of the form `valkey://crane:<password>@valkey:6379` and overwrites nothing.

   ```bash
   task secrets:init
   ```

3. Start the project with two compose files.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml \
     -f deploy/compose/docker-compose.cache.yaml up -d
   ```

   Instead of the `-f` options you can add one line to `.env`:

   ```bash
   COMPOSE_FILE=deploy/compose/docker-compose.yaml:deploy/compose/docker-compose.cache.yaml
   ```

> [!NOTE]
> Do not set {{< env "CRANE_CACHE" >}} in this mode. The address with the password lives only in the `cache_url` secret, and the server reads it through {{< env "CRANE_CACHE_FILE" >}}. If both variables are set, the server does not start.

## Verify {#verify}

1. Show the service state. `valkey` and `crane` must be `healthy`.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml \
     -f deploy/compose/docker-compose.cache.yaml ps -a
   ```

2. Find the "кэш proxy выбран" ("proxy cache selected") entry with the `cache` field in the `crane` log. The value `valkey` confirms the choice, not that the server is reachable: `crane` does not wait for the Valkey connection.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml \
     -f deploy/compose/docker-compose.cache.yaml logs crane
   ```

3. Check that `crane` writes to Valkey. After the first request to a proxy repository, the key count is greater than zero.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml \
     -f deploy/compose/docker-compose.cache.yaml exec valkey \
     sh -c 'REDISCLI_AUTH="$(cat /run/secrets/valkey_password)" valkey-cli --user crane dbsize'
   ```

## What the override changes {#override}

| Service | Change |
| --- | --- |
| `valkey` | The {{< env "VALKEY_IMAGE" >}} image; started with `--save ""`, `--appendonly no`, `--maxmemory ${VALKEY_MAXMEMORY}`, `--maxmemory-policy allkeys-lru` and `--aclfile`; data is not saved to disk |
| `crane` | Reads the address from `CRANE_CACHE_FILE=/run/secrets/cache_url`; joins the `cache` network; starts after `valkey` is healthy |

The ACL is built at container start from the password file into a temporary file with mode `0600`. The password does not reach process arguments, the environment or the image:

```text
user default off
user crane on >password ~* &* +@all -@dangerous
```

The `default` user is disabled. The `crane` user cannot run the `@dangerous` command group (`KEYS`, `CONFIG`, `SHUTDOWN` and others). The policy lives in the compose file and is updated with it. The Valkey health check reads the password from the secret inside the container, so it is absent from command arguments and from `docker inspect`.

The `cache` network is declared `internal: true` and contains only `crane` and `valkey`. `crane` itself reaches the outside through the `default` and `edge` networks.

## URL schemes {#schemes}

The address has the form `valkey[s][-cluster|-sentinel]://[user:password@]host[:port][/db]`.

| Scheme or value | Purpose |
| --- | --- |
| `valkey` | A single node |
| `valkeys` | A single node, TLS |
| `valkey-cluster`, `valkeys-cluster` | Valkey Cluster, without and with TLS |
| `valkey-sentinel`, `valkeys-sentinel` | Valkey Sentinel, without and with TLS; example: `valkey-sentinel://<host>:26379?sentinelServiceName=<name>` |
| `memory` | The in-process cache |

The `redis://` and `rediss://` schemes are rejected. The server does not start and names the scheme, not the rest of the address:

```text
CRANE_CACHE: значение со схемой `redis` пока не поддерживается
```

The message says: a value with the `redis` scheme is not supported yet.

TLS (`valkeys`) is needed when traffic leaves the node or the trusted network. For an external Valkey, set `maxmemory` and `maxmemory-policy allkeys-lru` yourself.

## Behavior when Valkey fails {#failure}

Valkey does not affect the readiness of `crane`: the server does not wait for the connection, and `/healthz/ready` does not check it. The cache is not a source of truth, so losing it loses no data.

- The proxy engine treats a cache read error as a miss and goes to the {{< term "upstream" >}}.
- Every command is limited to one second. A hung socket is detected within one second plus a 250 ms check interval; after that commands fail immediately while reconnection runs in the background.
- A write always lands in the in-process cache (L1, 256 MiB), even when Valkey is unreachable. L1 staleness caused by a missed invalidation is limited to 30 seconds.

The cache content is served to clients. For an artifact with an expected SHA-256 from the index, a pointer to a foreign blob is rejected, but if the index is substituted at the same time this protection does not work, and when there is no expected {{< term "digest" >}} there is no check either. CRANE does not sign cache entries, so Valkey isolation and authentication remain mandatory.

## What's next {#next}

- {{< xref "configure/cache" >}}
- {{< xref "deploy/s3-storage" >}}
- {{< xref "security/hardening" >}}
- {{< xref "operations/health-checks" >}}
