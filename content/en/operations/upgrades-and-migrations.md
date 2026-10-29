---
title: "Upgrades and migrations"
description: "How to upgrade CRANE in Docker Compose: the crane migrate role and its lock, the vector and pg_trgm extensions, migrate before crane, and a failed migration."
audience: [platform]
genre: how-to
state: current
status: available
weight: 30
terms: [catalog]
---

This page shows how to upgrade CRANE in Docker Compose on a single node: apply the schema migrations of the {{< term "catalog" >}} with a separate `migrate` role, then start the new server version. The result is a PostgreSQL schema that matches the image version, a healthy server, and a clear action when a migration fails.

The `crane migrate` role applies only the missing migrations and is safe to run again. The server (`serve`, `all`) does not apply migrations: `migrate` prepares the schema. The upgrade version policy and the expand, migrate, contract scheme are described in {{< xref "features/operations/upgrades" >}}.

> [!IMPORTANT]
> Migrations only move forward; the schema is never rolled back. Back up PostgreSQL with the deployment's own tools before upgrading: {{< xref "operations/backup-restore" >}}.

## Before you begin {#prerequisites}

- A running deployment: {{< xref "deploy/docker-compose" >}}.
- The new CRANE source code in the working directory: the image is built locally today.
- The PostgreSQL role from {{< env "CRANE_DATABASE_URL" >}} may change the schema. The `vector` and `pg_trgm` extensions are either already created or the role may create them: {{< xref "deploy/requirements#extensions" >}}.

## Steps {#steps}

1. Build the new image. The name and tag must match {{< env "CRANE_IMAGE" >}} and {{< env "CRANE_VERSION" >}} from `.env`.

   ```bash
   docker build -f deploy/docker/Dockerfile -t crane/crane:latest .
   ```

2. Apply the migrations by running the role explicitly. The command creates a one-off container with the new image, waits for a healthy database and shows the output of the migration.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml run --rm migrate
   echo $?
   ```

   ```text
   {"timestamp":"…","level":"INFO","message":"миграции PostgreSQL применены"}
   0
   ```

   The same record appears when there are no new migrations. The message means "PostgreSQL migrations applied".

3. Update the services. Compose starts `migrate` before `crane` and does not start `crane` until `migrate` exits with code `0`; on a single node the `crane` container is recreated, and the API is unavailable meanwhile.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml up -d
   ```

   The container receives `SIGTERM`, closes the listeners gracefully and exits with code `0`: {{< xref "reference/server-cli#shutdown" >}}.

4. If the S3 or Valkey modes are on, pass the same `-f` files as at the first start: {{< xref "deploy/s3-storage" >}}, {{< xref "deploy/valkey-cache" >}}.

Upgrading in Kubernetes is described on {{< xref "deploy/kubernetes-helm" >}}; that page is in development.

## Verify {#verify}

1. The `migrate` service exited with code `0` and the `crane` service is `healthy`.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml ps -a
   ```

2. The readiness probe returns code `0`: {{< xref "operations/health-checks" >}}.

3. The `_sqlx_migrations` table holds every migration with `success = t`. The last row is the newest migration.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml exec postgres sh -c \
     'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
      -c "SELECT version, description, success FROM _sqlx_migrations ORDER BY version"'
   ```

   ```text
    version | description   | success
   ---------+---------------+---------
          1 | catalog       | t
          2 | npm           | t
          3 | namespace     | t
          4 | settings      | t
          5 | version_order | t
          6 | blob_digests  | t
   ```

## How the migrate role works {#how}

The role runs its steps in order; any error ends it with code `1`.

1. It connects to PostgreSQL by {{< env "CRANE_DATABASE_URL" >}}. The role needs no other settings (token, public address, blob). Waiting for the connection takes at most 5 s.
2. It checks the `vector` and `pg_trgm` extensions and creates them if needed. Without the extensions no migrations are applied.
3. It takes a PostgreSQL advisory lock and applies the missing migrations in ascending order.
4. It writes "миграции PostgreSQL применены" (PostgreSQL migrations applied). For the `memory` catalog it writes "хранилище в памяти: миграций нет" (in-memory storage: no migrations) and exits with code `0`.

Each migration runs in one transaction together with its row in `_sqlx_migrations`. If a migration fails, all its changes are rolled back, and the earlier migrations stay applied.

### The lock {#lock}

The role uses a PostgreSQL advisory lock: while one migration runs, a second one waits on the lock and starts when the first one finishes. A separate lock serializes the creation of extensions. CRANE does not limit the wait on the lock: the second run does not fail by timeout, it stands until the first one ends.

### Extensions {#extensions}

CRANE needs `vector` (pgvector 0.8 and newer) and `pg_trgm`. The behavior of the role for each database state, the rights to create extensions and ready SQL for the administrator of a managed PostgreSQL are described in {{< xref "deploy/requirements#extensions" >}}. This page does not repeat them.

## If a migration fails {#failure}

The cause is written to the `error` field of the "роль завершилась с ошибкой" (the role finished with an error) record. Errors of the PostgreSQL driver stay in English, the rest of the text is in Russian.

| Error text | Cause | What to do |
| --- | --- | --- |
| `не удалось подключиться к PostgreSQL (CRANE_DATABASE_URL): …` (could not connect to PostgreSQL) | The database is unreachable, or the address or credentials are wrong | Check that `postgres` is healthy and check the content of the secret with the database address. Run `migrate` again |
| `миграции PostgreSQL не применены: расширение PostgreSQL vector недоступно на сервере …` (migrations not applied: the vector extension is unavailable on the server) | The PostgreSQL image lacks the package or its version is lower than required | Use an image with pgvector 0.8 or newer: {{< xref "deploy/requirements#images" >}} |
| `миграции PostgreSQL не применены: расширения PostgreSQL pg_trgm нет, а роли не хватает прав его создать …` (the pg_trgm extension is missing and the role may not create it) | The role has no right to create the extension | Run `CREATE EXTENSION` as the database administrator: {{< xref "deploy/requirements#extensions" >}} |
| `миграции PostgreSQL не применены: расширение PostgreSQL vector версии … старше требуемой 0.8 …` (the vector version is older than the required 0.8) | An old version of the extension is installed | Run `ALTER EXTENSION vector UPDATE;` as the database administrator |
| `миграции PostgreSQL не применены: while executing migration <N>: …` | Migration `<N>` failed and was rolled back | Remove the cause named in the database error (rights, disk space, locks) and run `migrate` again: it continues from migration `<N>` |
| `миграции PostgreSQL не применены: migration <N> was previously applied but has been modified` | The database applied migration `<N>` with other content: it was created by another CRANE build | Run an image built from the same source code that migrated the database. Do not edit the `_sqlx_migrations` table |
| `миграции PostgreSQL не применены: migration <N> was previously applied but is missing in the resolved migrations` | The database is newer than the image: an image of an older version is running | Run an image no older than the version that migrated the database. A schema rollback is not supported |

Until `migrate` finishes successfully, Compose does not start the `crane` service: it waits for `migrate` to finish with code `0`.

## What next {#next}

{{< cards "features/operations/upgrades" "operations/health-checks" "operations/backup-restore" "operations/troubleshooting" >}}
