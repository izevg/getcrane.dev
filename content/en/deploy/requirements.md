---
title: "Requirements"
description: "PostgreSQL and extension versions, images pinned by digest, default Compose and Helm resources, and the tools needed to deploy CRANE."
audience: [platform]
genre: reference
state: current
status: available
weight: 10
terms: [digest]
---

CRANE requires PostgreSQL 17 or newer with the `vector` (pgvector 0.8 or newer) and `pg_trgm` extensions. The `crane migrate` command creates missing extensions itself when the role has enough privileges, and it applies no migrations before that. This page collects the versions, images, resources and tools the deployment was verified with.

## PostgreSQL {#postgresql}

| Component | Requirement |
| --- | --- |
| PostgreSQL | 17 or newer |
| `vector` (pgvector) | 0.8 or newer |
| `pg_trgm` | any version; the version is not checked |

The catalog is stored only in PostgreSQL. The connection address comes from `CRANE_DATABASE_URL` or `CRANE_DATABASE_URL_FILE`: the `postgres://` or `postgresql://` scheme. The value `memory` selects an in-memory catalog, and its data is lost on restart; such a catalog cannot be combined with a persistent `CRANE_BLOBS`.

## Extensions and `crane migrate` {#extensions}

Before migrations, `crane migrate` checks each extension and behaves as the table shows. Concurrent runs are serialized by locks, so two migrations never run at the same time.

| Database state | What `crane migrate` does |
| --- | --- |
| The extension is installed and its version is high enough | Changes nothing and applies the migrations |
| The extension is missing, the package is available on the server, the role has enough privileges | Runs `CREATE EXTENSION IF NOT EXISTS`, then applies the migrations |
| The extension is missing and the package is not on the server, or its version is too low | Fails with an error that names the extension; no migrations are applied |
| The extension is missing and the role lacks privileges (SQLSTATE `42501`) | Fails with an error and ready-made SQL for the database administrator; no migrations are applied |
| `vector` is installed but older than 0.8 | Fails with an error that suggests `ALTER EXTENSION vector UPDATE;`; no migrations are applied |

The error messages are printed in Russian:

```text
расширение PostgreSQL vector недоступно на сервере (или версия пакета ниже требуемой): установите пакет с ним (pgvector >= 0.8 для vector, contrib для pg_trgm)
расширения PostgreSQL pg_trgm нет, а роли не хватает прав его создать: администратор БД выполняет в базе каталога `CREATE EXTENSION pg_trgm;`
расширение PostgreSQL vector версии 0.7.4 старше требуемой 0.8: администратор БД выполняет в базе каталога `ALTER EXTENSION vector UPDATE;`
```

The privileges differ. The `vector` extension is untrusted: only a superuser can create it. The `pg_trgm` extension is trusted: the `CREATE` privilege on the database is enough. In managed PostgreSQL, the database administrator runs the following in the catalog database beforehand:

```sql
CREATE EXTENSION vector;
CREATE EXTENSION pg_trgm;
```

With the extensions already created, `crane migrate` runs under a role without these privileges.

## Images {#images}

Images are pinned in `.env.dist` in the format `tag@sha256:<index digest>`. The tag is for humans; the multi-architecture index {{< term "digest" >}} selects the image.

| Variable | Value (tag) | Purpose |
| --- | --- | --- |
| `CRANE_IMAGE` | `crane/crane` | The CRANE image; built locally, not published to a registry |
| `CRANE_VERSION` | `latest` | The CRANE image tag; the version is not pinned |
| `CADDY_IMAGE` | `caddy:2.11.7` | Reverse proxy and TLS |
| `POSTGRES_IMAGE` | `pgvector/pgvector:0.8.7-pg17-bookworm` | PostgreSQL 17.11 with pgvector 0.8.7 |
| `VALKEY_IMAGE` | `valkey/valkey:8.1.11` | Cache, {{< xref "deploy/valkey-cache" "Valkey mode" >}} |
| `SEAWEEDFS_IMAGE` | `chrislusf/seaweedfs:4.51` | S3 storage, {{< xref "deploy/s3-storage" "S3 mode" >}} |

The exact digests are recorded in `.env.dist`. To update an image, take the top-level `Digest` line from the output of:

```bash
docker buildx imagetools inspect <image:tag>
```

In the Helm chart, the value `image.digest` sets the digest of the CRANE image: {{< xref "deploy/kubernetes-helm#values" >}}.

## Default resources {#resources}

| Parameter | Default | Where it applies |
| --- | --- | --- |
| `CRANE_CPUS` | `2` | CPU limit of the `crane` service in Compose |
| `CRANE_MEMORY` | `1g` | Memory limit of the `crane` service in Compose |
| `VALKEY_MAXMEMORY` | `512mb` | Valkey memory limit in Valkey mode; the `allkeys-lru` eviction policy is fixed in the compose file |
| `api.resources` (Helm) | request 500m CPU and 512Mi memory, memory limit 1Gi | api pods |
| `worker.resources` (Helm) | request 500m CPU and 512Mi memory, memory limit 1Gi | worker pods |

The `memory` cache is bounded to 256 MiB of entry weight (proxy document bodies). The limit is set in code and no variable changes it.

## Tools {#tooling}

| Tool | Used for | Note |
| --- | --- | --- |
| Docker Compose | Running the project | The repeated `--env-file` option was verified on Compose v5.6.1. The S3 override uses the `!reset` tag |
| Docker with BuildKit | Building the CRANE image | The `Dockerfile` uses `RUN --mount=type=cache` |
| go-task and Node.js 24 | The `task secrets:init` task | The Node.js version is recorded in `.nvmrc` |
| Helm | Installing the chart | The chart uses `apiVersion: v2` |

## Ports {#ports}

| Port | Where | Purpose |
| --- | --- | --- |
| `80`, `443` | Host, `CADDY_HTTP_PORT` and `CADDY_HTTPS_PORT` | The only Compose project ports published outside |
| `8080` | `crane` container, `CRANE_HTTP_PORT` | API and package protocols |
| `9464` | `crane` container, `CRANE_ADMIN_PORT` | The `/healthz/live` and `/healthz/ready` probes |

## What's next {#next}

- {{< xref "deploy/docker-compose" >}}
- {{< xref "deploy/kubernetes-helm" >}}
- {{< xref "reference/environment-variables" >}}
