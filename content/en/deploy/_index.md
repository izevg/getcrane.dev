---
title: "Deployment"
description: "How to run CRANE today: Docker Compose on a single node, the S3 and Valkey modes, and how to choose between them."
audience: [platform]
genre: how-to
state: current
status: available
weight: 30
terms: [blob]
---

CRANE runs through Docker Compose on a single node; S3 storage and the Valkey cache are added with override files. Configuration consists of environment variables and an optional TOML file. Deployment to Kubernetes with a Helm chart is in development. The CRANE image is currently built locally from `deploy/docker/Dockerfile` and is not published to a registry.

Access to the protocols is protected by the static token `CRANE_TOKEN`. The probe (admin) port is not published in the Compose file: only the API port is exposed, through Caddy.

## Deployment options {#options}

| Option | When it fits | What it includes | Page |
| --- | --- | --- | --- |
| Docker Compose on a single node | One host; PostgreSQL, Caddy and `crane` in one project; {{< term "blob" "blobs" >}} in a local volume | `caddy`, `migrate`, `crane`, `postgres` | {{< xref "deploy/docker-compose" >}} |
| S3 mode (override) | Blobs are stored in S3; SeaweedFS ships with the project | `docker-compose.s3.yaml`: `seaweedfs`, `seaweedfs-init` | {{< xref "deploy/s3-storage" >}} |
| Valkey mode (override) | A shared cache with mandatory authentication in an isolated network | `docker-compose.cache.yaml`: `valkey` | {{< xref "deploy/valkey-cache" >}} |
| Kubernetes and Helm | A cluster is available; PostgreSQL, Valkey and S3 are provided by the organization | This functionality is in development | {{< xref "deploy/kubernetes-helm" >}} |

The S3 and Valkey modes are Compose override files, not profiles: they change the configuration of `crane` itself (keys, networks, dependencies), which a profile cannot do. The override files are layered on top of the base `docker-compose.yaml`.

## Before you begin {#prerequisites}

- Check the PostgreSQL and extension versions, the images and the tools: {{< xref "deploy/requirements" >}}.
- Decide where blobs are stored: a local volume, the bundled SeaweedFS or an external S3.
- Decide how many `crane` replicas run at the same time and whether they need a shared cache.

## Steps {#steps}

1. One host with the fewest dependencies: deploy Docker Compose on a single node. By default the cache lives in process memory and blobs live in a local volume.
2. Blobs must be stored in S3: add the `docker-compose.s3.yaml` override.
3. `crane` replicas need a shared cache: add the `docker-compose.cache.yaml` override. In the Compose file `crane` is a single container, so Valkey is optional there.

## Verify {#verify}

The server is ready when `/healthz/ready` on the admin port (`9464` by default) returns `200`. The probe checks PostgreSQL and the blob storage. In Compose the `crane healthcheck` command runs it. Details: {{< xref "operations/health-checks" >}}.

## What's next {#next}

- {{< xref "deploy/requirements" >}}
- {{< xref "deploy/docker-compose" >}}
- {{< xref "deploy/kubernetes-helm" >}}
- {{< xref "reference/environment-variables" >}}
