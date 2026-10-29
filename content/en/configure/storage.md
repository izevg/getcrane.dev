---
title: "Blob storage"
description: "How to choose the catalog and the blob storage: PostgreSQL with a local volume or S3, the memory mode, S3 keys, valid combinations and startup errors."
audience: [platform]
genre: how-to
state: current
status: available
weight: 40
terms: [blob, cas]
---

This page describes how to set the two CRANE storages: the catalog and the {{< term "blob" >}} storage. The catalog keeps metadata in PostgreSQL, and blobs hold the bytes of package files in the {{< term "cas" "CAS" >}}: a local file system or S3. {{< env "CRANE_DATABASE_URL" >}} sets the catalog and {{< env "CRANE_BLOBS" >}} sets the blobs. Both variables are required.

The storages are chosen as a pair. A persistent catalog works only with persistent blobs, and an in-memory catalog only with in-memory blobs. A mixed pair does not start: after a restart the PostgreSQL catalog would point to lost blobs.

## Before you begin {#prerequisites}

- PostgreSQL and its extensions at the required versions: {{< xref "deploy/requirements#postgresql" >}}.
- For S3: a bucket and an account with the `s3:ListBucket` permission. A Compose example: {{< xref "deploy/s3-storage" >}}.

## Steps {#steps}

1. Choose a combination. The table lists the three valid pairs:

   | Mode | Catalog | Blobs | After a restart |
   | --- | --- | --- | --- |
   | Memory | `memory` | `memory` | Data is lost |
   | Disk | `postgres://…` | `file:///absolute/path` | Data is kept |
   | S3 | `postgres://…` | `s3://bucket…` | Data is kept |

   Write the `memory` value explicitly: a silent in-memory catalog would lose data on restart.

2. Set the catalog. The address contains a password, so pass it in a file. The `postgres://` and `postgresql://` schemes are accepted. Use only URL-safe characters in the password.

   ```dotenv
   CRANE_DATABASE_URL_FILE=/run/secrets/database_url
   ```

   The file holds one line:

   ```text
   postgres://crane:<password>@postgres:5432/crane
   ```

3. Set the blobs.

   ```dotenv
   CRANE_BLOBS=file:///data/blobs
   ```

   - `file:///absolute/path`: the path is absolute, without a host and without query parameters. The server creates the directory if it does not exist and writes files with `fsync`.
   - `s3://bucket[/prefix]?parameter=value`: only non-secret parameters are allowed in the query (`endpoint`, `region`, `allow_http` and similar). Credentials in the URL are forbidden. The parameter list and an example: {{< xref "deploy/s3-storage#blobs-url" >}}.

4. For S3, pass the static key in files, as a pair:

   ```dotenv
   AWS_ACCESS_KEY_ID_FILE=/run/secrets/s3_access_key_id
   AWS_SECRET_ACCESS_KEY_FILE=/run/secrets/s3_secret_access_key
   ```

   Rules:

   - the whole pair is required: one file without the other is a startup error;
   - {{< env "AWS_ACCESS_KEY_ID" >}} together with {{< env "AWS_ACCESS_KEY_ID_FILE" >}} (and the same for {{< env "AWS_SECRET_ACCESS_KEY" >}}) are mutually exclusive;
   - without the files, the S3 client takes keys, roles and metadata from the ordinary `AWS_*` variables;
   - with `memory` and `file://` no key is needed, and the server refuses to start with one;
   - S3 keys are not among the TOML file keys: only the environment sets them.

5. Apply migrations before the first server start. The `serve` role does not apply migrations.

   ```bash
   crane migrate
   ```

   The role writes "миграции PostgreSQL применены" (PostgreSQL migrations applied) to the log. With the `memory` catalog it writes "хранилище в памяти: миграций нет" (in-memory storage: no migrations) and exits successfully. Details: {{< xref "reference/server-cli" >}}.

## Verify {#verify}

Start the server and check readiness. The probe queries the catalog and the blob storage and finishes within 1.5 s:

```bash
crane healthcheck
echo $?
```

```text
0
```

Probe details: {{< xref "reference/ports-and-health" >}}.

## Startup errors {#errors}

Messages name the variable and the reason. URL content, passwords and keys never reach the text: for a foreign scheme only the scheme is named. The texts are printed in Russian. The examples are in this order: no catalog, no blobs, a mixed pair, a foreign catalog scheme, an unparsable catalog address, a foreign blob scheme, an unparsable blob address, a secret parameter in the S3 query, an S3 key with `memory`, an unreachable PostgreSQL.

```text
не задана переменная CRANE_DATABASE_URL
не задана переменная CRANE_BLOBS
CRANE_DATABASE_URL и CRANE_BLOBS: memory нельзя смешивать с постоянным хранилищем
CRANE_DATABASE_URL: значение со схемой `mysql` пока не поддерживается
некорректное значение CRANE_DATABASE_URL: не разобран как URL postgres://
CRANE_BLOBS: значение со схемой `gs` пока не поддерживается
некорректное значение CRANE_BLOBS: ожидалось memory, file:///абсолютный/путь или s3://бакет
CRANE_BLOBS: ключ `access_key_id` не из списка несекретных параметров; учётные данные и их поставщики S3 задаются только переменными AWS_*
AWS_ACCESS_KEY_ID_FILE и AWS_SECRET_ACCESS_KEY_FILE: ключ S3 не нужен при memory
не удалось подключиться к PostgreSQL (CRANE_DATABASE_URL): …
```

The server finds address errors of {{< env "CRANE_BLOBS" >}} when the catalog is persistent. If the catalog is `memory`, any blob value other than `memory` produces the mixed-pair error.

The server waits for the PostgreSQL connection for at most 5 s. An unreachable database stops the start rather than the first request.

## What next {#next}

- {{< xref "deploy/s3-storage" >}}
- {{< xref "configure/settings-encryption" >}}
- {{< xref "configure/cache" >}}
- {{< xref "reference/server-cli" >}}
