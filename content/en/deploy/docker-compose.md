---
title: "Docker Compose on a single node"
description: "How to run CRANE on one host with Docker Compose: from the .env file and secrets to a working server behind Caddy and a readiness check."
audience: [platform]
genre: how-to
state: current
status: available
weight: 20
terms: [proxy-repository, namespace, blob]
---

This page takes a cloned repository to a working CRANE server on a single host. Caddy terminates TLS, `crane` serves the package protocols, PostgreSQL stores the catalog, and {{< term "blob" "blobs" >}} live in a local volume. The CRANE image is not published today, so the steps include building it locally.

Safe values are the defaults. Secrets live in files and never enter environment variables. The probe (admin) port is not published. Caddy removes the client `X-Request-Id` header, and CRANE issues the request identifier itself.

## Before you begin {#prerequisites}

- A host with Docker, BuildKit and Docker Compose. Versions: {{< xref "deploy/requirements#tooling" >}}.
- go-task and Node.js 24 for the `task secrets:init` task.
- A copy of the CRANE repository. Run every command from its root.
- Free ports `80` and `443` (the `CADDY_HTTP_PORT` and `CADDY_HTTPS_PORT` variables).
- A public DNS name for `CRANE_HOST`. `localhost` is enough for a trial.

## Steps {#steps}

1. Copy the environment template. All values live in `.env`; the compose files have no defaults, and a missing variable stops the start.

   ```bash
   cp .env.dist .env
   ```

2. Set the public name in `.env`. For a public name Caddy obtains an ACME certificate itself; for `localhost` it uses its internal CA.

   ```bash
   CRANE_HOST=crane.example.com
   ```

3. Create the secret files. The task creates missing files with random values and overwrites nothing.

   ```bash
   task secrets:init
   ```

   The task prints the paths of the files it created and never prints values. The task messages are in Russian:

   ```text
   секреты созданы: ./secrets/crane_token, ./secrets/postgres_password, ./secrets/database_url, ./secrets/s3_access_key_id, ./secrets/s3_secret_access_key, ./secrets/valkey_password, ./secrets/cache_url
   ```

   A repeated run prints `секреты уже на месте` ("the secrets are already in place"). The static token value for clients is in `./secrets/crane_token`.

4. Enable repositories if needed. Set or add the lines in `.env`. An empty value disables the {{< term "proxy-repository" >}}, and a proxy repository name must not match a hosted repository name.

   ```bash
   CRANE_CARGO_PROXY_REPOS=crates-io
   CRANE_NPM_REPOS=web
   CRANE_NPM_PROXY_REPOS=npmjs
   CRANE_NAMESPACES=cargo:acme-*
   ```

   The `CRANE_NAMESPACES` variable reserves internal {{< term "namespace" "namespaces" >}}: the proxy never serves these names. Entries have the form `format:pattern` or `format:pattern=uuid`, separated by commas.

5. Build the image. The name and tag must match `CRANE_IMAGE` and `CRANE_VERSION` in `.env` (`crane/crane` and `latest` by default).

   ```bash
   docker build -f deploy/docker/Dockerfile -t crane/crane:latest .
   ```

6. Start the project.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml up -d
   ```

   The `--project-directory .` option is mandatory: the paths `./deploy/caddy` and `./secrets` and the `.env` file are resolved from the repository root, not from `deploy/compose`. Start order: `postgres` becomes healthy, `migrate` applies the migrations and exits, then `crane` starts, then `caddy`.

## Verify {#verify}

1. Show the service state. The `crane` service must be `healthy`, and `migrate` must have exited with code `0`.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml ps -a
   ```

2. Run the readiness probe inside the container. The `crane healthcheck` command queries `/healthz/ready` on the admin port and exits with code `0` or `1`. It prints nothing on success.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml exec crane crane healthcheck
   echo $?
   ```

   ```text
   0
   ```

3. Find the start-up entry in the log. The log is JSON; the entry is named "сервер запущен" ("server started") and contains the `http_port` and `admin_port` fields.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml logs crane
   ```

The `/healthz/ready` probe checks PostgreSQL and the blob storage and answers within 1.5 s. The admin port is not published, so `curl` from the host cannot reach it: this is by design. Details: {{< xref "operations/health-checks" >}}.

## What runs {#services}

| Service | Purpose |
| --- | --- |
| `caddy` | TLS and reverse proxy to `crane`; publishes the `CADDY_HTTP_PORT` and `CADDY_HTTPS_PORT` ports |
| `migrate` | A one-shot `migrate` role; a lock prevents concurrent migration runs |
| `crane` | The `all` role: the API and the probe port. Resource limits: `CRANE_CPUS` and `CRANE_MEMORY` |
| `postgres` | The catalog in the `pg` volume; no port is published |

Blobs live in the `blobs` volume (`CRANE_BLOBS=file:///data/blobs`), and Caddy data, including issued certificates, lives in the `caddy-data` volume. The proxy cache sits in process memory by default. The `all` role currently equals the `serve` role: see {{< xref "reference/server-cli" >}}.

> [!SECURITY]-
> The `crane` container runs with `read_only: true`, a `tmpfs` on `/tmp`, `no-new-privileges:true` and `cap_drop: [ALL]`. The image is based on `distroless` and runs as user `65532`. More: {{< xref "security/hardening" >}}.

## The edge network and trusted proxies {#edge}

The `edge` network connects only `caddy` and `crane`. Its subnet is fixed by the `CRANE_EDGE_SUBNET` variable (`172.31.250.0/24` by default), and Compose passes the same value to the server as `CRANE_TRUSTED_PROXIES`. As a result CRANE trusts `X-Forwarded-For` and `X-Request-Id` only from Caddy, and the audit shows the client address instead of the proxy. The subnet must be free: one value defines both the network and the trusted proxy list.

Without `CRANE_TRUSTED_PROXIES` the server ignores both headers. The reference `Caddyfile` removes the client `X-Request-Id` (`header_up -X-Request-Id`). More about the network: {{< xref "configure/network" >}}.

> [!WARNING]
> Do not publish the admin port (`CRANE_ADMIN_PORT`, `9464` by default). The probes work without a token and do not pass through Caddy.

## Secrets {#secrets}

The token, the PostgreSQL password and the catalog URL live in files. Compose mounts them under `/run/secrets`, and the server reads them through the `*_FILE` variables.

| `.env` variable | Default file | Read by |
| --- | --- | --- |
| `CRANE_TOKEN_SECRET` | `./secrets/crane_token` | `crane`, through `CRANE_TOKEN_FILE` |
| `POSTGRES_PASSWORD_SECRET` | `./secrets/postgres_password` | `postgres`, through `POSTGRES_PASSWORD_FILE` |
| `CRANE_DATABASE_URL_SECRET` | `./secrets/database_url` | `crane` and `migrate`, through `CRANE_DATABASE_URL_FILE` |

The `secrets` directory is created with mode `0700` and the files with mode `0644`: on Linux, user `65532` and `postgres` read the secrets, not the host owner. The `/secrets/` directory is listed in `.gitignore`. When you create the files by hand, the catalog URL looks like `postgres://crane:<password>@postgres:5432/crane`, and the password contains only URL-safe characters.

Do not set `CRANE_TOKEN` and `CRANE_TOKEN_FILE` together: the server does not start. The PostgreSQL password is written into the `pg` volume on the first start, and changing the file does not change the password in an existing volume.

## What's next {#next}

- {{< xref "deploy/s3-storage" >}}
- {{< xref "deploy/valkey-cache" >}}
- {{< xref "configure/access-token" >}}
- {{< xref "operations/upgrades-and-migrations" >}}
