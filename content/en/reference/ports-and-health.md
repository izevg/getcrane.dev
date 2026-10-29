---
title: "Ports and probes"
description: "Reference of CRANE ports and the /healthz/live and /healthz/ready probes: checks, response codes and format, timeouts and the crane healthcheck command."
audience: [platform]
genre: reference
state: current
status: available
weight: 30
terms: []
---

The CRANE server listens on two ports: the API port with the package protocols and the probe port. The probe port serves two probes without a token: `/healthz/live` answers while the process is alive, and `/healthz/ready` checks the catalog and the blob storage. The `crane healthcheck` command queries `/healthz/ready` for orchestrator checks.

The probe port is open without authentication, so do not publish it and do not route it through the reverse proxy: {{< xref "deploy/docker-compose#edge" >}}.

## Ports {#ports}

| Port | Variable | Default | What answers |
| --- | --- | --- | --- |
| API | {{< env "CRANE_HTTP_PORT" >}} | `8080` | The package protocols behind a token; paths outside repositories are `404` |
| Probes (admin) | {{< env "CRANE_ADMIN_PORT" >}} | `9464` | `/healthz/live` and `/healthz/ready` without a token; other paths are `404` |

The server binds both ports on `0.0.0.0`. A port is an integer 0–65535. How to change them: {{< xref "configure/network" >}}.

## Probes {#probes}

| Path | What it checks | Success |
| --- | --- | --- |
| `/healthz/live` | Only that the process answers. It does not touch the storages: an unreachable database is no reason to restart the process | `200`, body `ok` |
| `/healthz/ready` | The catalog (a query to PostgreSQL or the in-memory catalog) and the blob storage (opening a blob that does not exist: a "not found" answer counts as success) | `200`, body `ok` |

The `/healthz/ready` probe does not check the cache (Valkey), the upstreams or the token. The probe budget is 1.5 s: if the storages do not answer in that time, the probe answers with a failure.

### Failure response {#failure}

A failure is `503` with an `application/problem+json` body and the `Retry-After: 10` header. The body has the fields `type`, `title`, `status`, `detail` and `request_id`. The cause of the failure (a storage address, a password) never reaches the body.

| Situation | `type` | `detail` |
| --- | --- | --- |
| The storage does not answer or the 1.5 s budget is exhausted | `urn:crane:problem:storage-unreachable` | `хранилище временно недоступно` (storage temporarily unavailable) |
| The storage answered with an error (configuration or a fault) | `about:blank` | `хранилище не готово` (storage not ready) |

Failure details go to the log at the `warn` level: "хранилище не готово" or "проба хранилищ не уложилась в 1.5s" (the storage probe did not finish in time).

## crane healthcheck {#healthcheck}

The `crane healthcheck` command exists for places where the image has no `curl`: the image is based on `distroless`. It:

1. reads {{< env "CRANE_ADMIN_PORT" >}} (no token, public address or storage needed);
2. connects to `127.0.0.1:<admin port>` and sends `GET /healthz/ready` over HTTP/1.1;
3. reads the status line (at most 128 bytes) and counts the check as successful only if the version is `HTTP/1.0` or `HTTP/1.1` and the code is exactly `200`;
4. exits with code `0` on success and `1` on failure.

The whole probe, including the connection, is limited to 2 s. It prints nothing on success. On failure the command writes the "роль завершилась с ошибкой" (role finished with an error) record with the `error` field, for example:

```text
порт 9464 ответил нездоровым статусом: HTTP/1.1 503 Service Unavailable
проба порта 9464 не уложилась в 2s
```

The probe connects to `127.0.0.1`, so run it in the same container or on the same host as the server:

```bash
docker compose --project-directory . \
  -f deploy/compose/docker-compose.yaml exec crane crane healthcheck
echo $?
```

```text
0
```

## Probes in orchestrators {#orchestrators}

- Compose: the `crane healthcheck` check with a 10 s interval, a 3 s timeout and six retries: {{< xref "deploy/docker-compose" >}}.
- Kubernetes: `/healthz/ready` and `/healthz/live` probes on the admin port; the mismatch with the startup probe is described in {{< xref "deploy/kubernetes-helm#limitations" >}}.

## What next {#next}

- {{< xref "reference/server-cli" >}}
- {{< xref "configure/network" >}}
- {{< xref "configure/storage" >}}
