---
title: "S3 storage"
description: "How to move CRANE blobs from a local volume to S3: the docker-compose.s3.yaml override with SeaweedFS, keys in files and a bucket created at start."
audience: [platform]
genre: how-to
state: current
status: available
weight: 30
terms: [blob, cas]
---

This page explains how to store {{< term "blob" "blobs" >}} in S3 instead of a local volume. The mode is switched on by the override file `deploy/compose/docker-compose.s3.yaml`: it adds SeaweedFS, creates the bucket once and gives `crane` the access keys from files. Without this file the Compose project does not change and needs no new secrets.

The S3 keys live only in files. They are not in the environment, in the URL or in command arguments, and SeaweedFS runs in a network without outbound access and without anonymous access.

## Before you begin {#prerequisites}

- A working project from {{< xref "deploy/docker-compose" >}}: the `.env` file, the built `crane` image, and `task` and Node.js installed.
- The storage mode chosen before the first publish: this page does not describe moving already stored blobs between modes.

## Steps {#steps}

1. Set the storage address and the bucket name in `.env`. The bucket in the URL must match {{< env "S3_BUCKET" >}}: the `seaweedfs-init` service creates it.

   ```bash
   CRANE_BLOBS=s3://blobs?endpoint=http://seaweedfs:8333&allow_http=true
   S3_BUCKET=blobs
   ```

2. Create the key files. If the files do not exist yet, the task creates `./secrets/s3_access_key_id` and `./secrets/s3_secret_access_key` and overwrites nothing.

   ```bash
   task secrets:init
   ```

3. Start the project with two compose files.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml \
     -f deploy/compose/docker-compose.s3.yaml up -d
   ```

   Instead of the `-f` options you can add one line to `.env`:

   ```bash
   COMPOSE_FILE=deploy/compose/docker-compose.yaml:deploy/compose/docker-compose.s3.yaml
   ```

   The `--project-directory .` option is needed in both ways.

## Verify {#verify}

1. Show the service state. `seaweedfs` and `crane` must be `healthy`, and `seaweedfs-init` must have exited with code `0`.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml \
     -f deploy/compose/docker-compose.s3.yaml ps -a
   ```

2. Run the readiness probe. It also checks the bucket, so `crane` does not become ready without it.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml \
     -f deploy/compose/docker-compose.s3.yaml exec crane crane healthcheck
   echo $?
   ```

   ```text
   0
   ```

3. If `seaweedfs-init` failed, read its log. The service tries 30 times to create the bucket, then prints `бакет <name> не создан` (“bucket `<name>` was not created”) and exits with code `1`.

## What the override changes {#override}

| Service | Change |
| --- | --- |
| `seaweedfs` | An S3 server on port `8333`, data in the `s3` volume; the `crane` identity with the actions `Admin`, `Read`, `Write`, `List`, `Tagging`; no anonymous access |
| `seaweedfs-init` | Creates the {{< env "S3_BUCKET" >}} bucket once; repeated runs are idempotent |
| `crane` | Reads the keys from {{< env "AWS_ACCESS_KEY_ID_FILE" >}} and {{< env "AWS_SECRET_ACCESS_KEY_FILE" >}}; joins the `s3` network; the local `blobs` volume is removed; starts after `seaweedfs-init` |

Compose holds the SeaweedFS access policy, not a secret file: the identities are built at start from the key files into a temporary container file with mode `0600`, and the keys do not reach process arguments, the environment or the log.

The `s3` network is declared `internal: true` and contains only `crane` and `seaweedfs`. `crane` itself reaches the outside through the `default` and `edge` networks.

## `CRANE_BLOBS` parameters {#blobs-url}

The variable is mandatory. The accepted values:

| Value | Storage |
| --- | --- |
| `memory` | Process memory; only together with the `memory` catalog |
| `file:///absolute/path` | The local file system; query parameters are not allowed |
| `s3://bucket[/prefix]?param=value` | S3-compatible storage; a prefix puts all objects under `prefix/` |

The `s3://` query accepts only non-secret parameters, for example `endpoint`, `region`, `allow_http`, `allow_invalid_certificates` and timeouts. Credentials and their providers are forbidden in the URL, and so is an `endpoint` with a login or password. The server does not start and names the key, not the value:

```text
CRANE_BLOBS: ключ `<key>` не из списка несекретных параметров; учётные данные и их поставщики S3 задаются только переменными AWS_*
```

The message says: the key is not in the list of non-secret parameters; S3 credentials and their providers are set only through `AWS_*` variables.

The static key comes from the {{< env "AWS_ACCESS_KEY_ID_FILE" >}} and {{< env "AWS_SECRET_ACCESS_KEY_FILE" >}} files. Both are required: one file without the other is a start error, and a variable together with its own file is a conflict. Without both files, keys, roles and metadata come from the ordinary `AWS_*` variables. For `memory` and `file://` a key is not needed, and the server refuses to start.

The `allow_http=true` parameter permits `http://` in `endpoint` and is needed for SeaweedFS inside the isolated `s3` network.

> [!IMPORTANT]
> The S3 account needs the `s3:ListBucket` permission. Without it a missing key returns `403` instead of `404`, and the readiness probe keeps failing.

When S3 fails, the request ends within seconds: the storage client makes three retries within 5 s. More about {{< term "cas" "CAS" >}} and digests: {{< xref "features/security/digest-verification" >}}.

## What's next {#next}

- {{< xref "configure/storage" >}}
- {{< xref "deploy/valkey-cache" >}}
- {{< xref "operations/health-checks" >}}
- {{< xref "reference/environment-variables" >}}
