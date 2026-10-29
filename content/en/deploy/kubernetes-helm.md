---
title: "Kubernetes and Helm"
description: "What the CRANE Helm chart contains, how to connect external PostgreSQL, Valkey and S3 through existingSecret and values, and the chart's current limitations."
audience: [platform]
genre: how-to
state: current
status: available
weight: 50
terms: [blob, digest, namespace]
---

The Helm chart `deploy/helm/crane` deploys CRANE to Kubernetes: api and worker `Deployment`s, a migration `Job`, a `Service` and an optional `Ingress`. PostgreSQL, Valkey and S3 are not part of the chart: they are external services of the organization. The chart receives the server settings from a secret that is created outside the chart and named in the `existingSecret` value.

> [!IMPORTANT]
> The chart and the binary currently disagree in two places. The `worker` template starts the `worker` role, which the binary does not have. The `startupProbe` of the api pod requests the `/healthz/startup` path, which the admin port does not serve. Details and consequences: [Mismatches between the chart and the server](#limitations).

## Before you begin {#prerequisites}

- A Kubernetes cluster, `kubectl` and Helm. The chart uses `apiVersion: v2`.
- An external PostgreSQL 17 or newer with the `vector` and `pg_trgm` extensions: {{< xref "deploy/requirements#postgresql" >}}.
- {{< term "blob" >}} storage: the organization's S3-compatible storage.
- A CRANE image in a registry the cluster can reach. The image is not published, so build it and push it to your own registry.

  ```bash
  docker build -f deploy/docker/Dockerfile \
    -t registry.example.com/crane/crane:<tag> .
  docker push registry.example.com/crane/crane:<tag>
  ```

- For Valkey: `maxmemory` and `maxmemory-policy allkeys-lru`, plus authentication and network isolation. Artifact keys live without a TTL.

## Steps {#steps}

1. Create the namespace.

   ```bash
   kubectl create namespace crane
   ```

2. Prepare a file with the server settings. The file contains secrets: do not add it to a repository. The list of keys: [The settings secret](#secret).

   ```ini
   CRANE_DATABASE_URL=postgres://crane:<password>@<postgres-host>:5432/crane
   CRANE_BLOBS=s3://<bucket>?region=<region>
   CRANE_PUBLIC_URL=https://crane.example.com
   CRANE_TOKEN=<token>
   AWS_ACCESS_KEY_ID=<access-key-id>
   AWS_SECRET_ACCESS_KEY=<secret-access-key>
   ```

3. Create the secret from the file. The secret must exist before the installation: the migrations run as a hook before the other resources.

   ```bash
   kubectl create secret generic crane-env --namespace crane \
     --from-env-file=crane.env
   ```

4. Create a values file.

   ```yaml
   existingSecret: crane-env
   image:
     repository: registry.example.com/crane/crane
     tag: "<tag>"
     digest: "sha256:<digest>"
   ingress:
     enabled: true
     className: <ingress-class>
     host: crane.example.com
     tls:
       - secretName: <tls-secret>
         hosts: [crane.example.com]
   ```

5. Lint the chart.

   ```bash
   helm lint deploy/helm/crane --set existingSecret=crane-env
   ```

6. Install the chart.

   ```bash
   helm install crane deploy/helm/crane --namespace crane \
     --values values.yaml
   ```

## Verify {#verify}

1. Wait for `helm install` to finish. Before the installation, Helm runs the migration `Job` as a `pre-install` hook and waits for it to complete. A successful `Job` is deleted; a failed one stays so that you can read its log: `kubectl logs job/crane-crane-migrate --namespace crane`.
2. List the pods.

   ```bash
   kubectl get pods --namespace crane
   ```

3. The api pods are ready when the `/healthz/ready` probe on the admin port returns `200`. The probe checks PostgreSQL and the blob storage. While the `startupProbe` points to a missing path, the api pods never reach `Ready`: this is a mismatch between the chart and the server, not a configuration error (see [Mismatches between the chart and the server](#limitations)).

## What the chart contains {#contents}

| Resource | Purpose |
| --- | --- |
| api `Deployment` | The `serve` role. Ports `http` and `admin`. Probes on the admin port: `startupProbe` (`/healthz/startup`), `readinessProbe` (`/healthz/ready`), `livenessProbe` (`/healthz/live`) |
| `Service` | Type `ClusterIP`, port `80` to the `http` port of the api pod. The admin port is not part of the `Service` |
| worker `Deployment` | The `worker` role. The admin port. `readinessProbe` and `livenessProbe` probes |
| migrate `Job` | The `migrate` role. Hook `pre-install,pre-upgrade`, delete policy `before-hook-creation,hook-succeeded`, `backoffLimit: 2`, `restartPolicy: Never`. Disabled by the `migrate.enabled` value |
| `Ingress` | Created when `ingress.enabled: true`. Path `/` with `pathType: Prefix` to the `Service` |

All pods start with `runAsNonRoot: true`, the `RuntimeDefault` seccomp profile, `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true` and `capabilities.drop: [ALL]`. An `emptyDir` is mounted for `/tmp`. The pods take their environment variables from the whole `existingSecret` secret (`envFrom`), and the `config.cache` and `config.blobs` values additionally set `CRANE_CACHE` and `CRANE_BLOBS`.

## The settings secret {#secret}

The secret is created outside the chart: by hand, through external-secrets or through sealed-secrets. The chart does not mount secret files, so the secret uses variables without the `_FILE` suffix.

| Key | Required | Purpose |
| --- | --- | --- |
| `CRANE_DATABASE_URL` | yes | The catalog address `postgres://…` |
| `CRANE_BLOBS` | yes, if `config.blobs` is empty | The blob storage, for example `s3://<bucket>?region=<region>` |
| `CRANE_PUBLIC_URL` | yes | The external address, `http://` or `https://` |
| `CRANE_TOKEN` | yes | The static token for protocol access |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | no | The static S3 key; without it the keys come from roles and metadata |
| `CRANE_TOKEN_PRINCIPAL` | no | The token owner name (`crane` by default) |
| `CRANE_TRUSTED_PROXIES` | no | Trusted proxies: [Ingress and trusted proxies](#ingress) |
| `CRANE_CARGO_PROXY_REPOS`, `CRANE_NPM_REPOS`, `CRANE_NPM_PROXY_REPOS`, `CRANE_NAMESPACES` | no | Repositories and {{< term "namespace" >}} reservation; the format is the same as in {{< xref "deploy/docker-compose" >}} |

The Valkey address is set by the `config.cache` value, not by a secret key.

> [!WARNING]
> The Valkey address in `config.cache` lands in the `Deployment` manifest as an ordinary environment variable. If the address contains a password, everyone who reads the manifest or runs `helm get values` can see it. The chart always sets `CRANE_CACHE` from `config.cache`, and an `env` value wins over an `envFrom` value, so a `CRANE_CACHE` key in the secret has no effect.

URL schemes: {{< xref "deploy/valkey-cache#schemes" >}}.

## Values {#values}

| Value | Default | Purpose |
| --- | --- | --- |
| `existingSecret` | empty | The settings secret name; mandatory, the template does not render without it |
| `image.repository` | `crane/crane` | The image repository |
| `image.tag` | empty | The tag; an empty value gives the chart `appVersion` |
| `image.digest` | empty | The image index {{< term "digest" >}} (`sha256:…`); when set, the image is referenced as `repository:tag@digest` and selected by the digest |
| `image.pullPolicy` | `IfNotPresent` | The image pull policy |
| `imagePullSecrets` | `[]` | Secrets for a private registry |
| `config.cache` | `memory` | The `CRANE_CACHE` value |
| `config.blobs` | empty | The `CRANE_BLOBS` value; an empty value does not set the variable |
| `ports.http` | `8080` | The `http` container port |
| `ports.admin` | `9464` | The `admin` container port and the probe port |
| `api.replicas` | `2` | The number of api replicas |
| `api.resources` | request `500m` CPU and `512Mi`, memory limit `1Gi` | The api resources |
| `worker.replicas` | `2` | The number of worker replicas |
| `worker.resources` | request `500m` CPU and `512Mi`, memory limit `1Gi` | The worker resources |
| `migrate.enabled` | `true` | Run the migration `Job` as a hook |
| `service.type`, `service.port` | `ClusterIP`, `80` | The `Service` type and port |
| `ingress.enabled` | `false` | Create the `Ingress` |
| `ingress.className`, `ingress.annotations` | empty | The `Ingress` class and annotations |
| `ingress.host` | `crane.example.com` | The host name |
| `ingress.tls` | `[]` | The `tls` block of the `Ingress` |
| `podAnnotations`, `nodeSelector`, `tolerations`, `affinity` | empty | Passed to the api and worker pods |

The chart does not pass the `ports` values to the server. The server ports are set by `CRANE_HTTP_PORT` and `CRANE_ADMIN_PORT`, which default to the same `8080` and `9464`. When you change `ports`, set the same values in the secret.

## Ingress and trusted proxies {#ingress}

The chart does not set `CRANE_TRUSTED_PROXIES`. As a result the server ignores `X-Request-Id` and `X-Forwarded-For` from the ingress, and the client address in events equals the address of the ingress controller.

If the ingress controller is listed in `CRANE_TRUSTED_PROXIES` (a secret key; the value is IP addresses and CIDR ranges separated by commas), it must overwrite or remove the `X-Request-Id` sent by the client and append its peer address to the end of `X-Forwarded-For`. The server parses `X-Forwarded-For` from right to left, so the client's left-hand entries do not affect the result. Without this, a client supplies its own request identifier and address.

## Mismatches between the chart and the server {#limitations}

The server accepts exactly one role: `serve`, `all`, `migrate` or `healthcheck`. Any other argument prints `использование: crane <serve|all|migrate|healthcheck>` ("usage: crane <serve|all|migrate|healthcheck>") and exits with code `2`. The `all` role currently equals the `serve` role: the server has no separate background tasks.

- **The `worker` role.** The `templates/worker.yaml` template starts the container with the `worker` argument. The binary exits with code `2`, and the worker pods never become ready.
- **The api startup probe.** The admin port serves only `/healthz/live` and `/healthz/ready`, and every other path gets `404`. The `startupProbe` requests `/healthz/startup` up to 30 times at a 2 s interval, after which Kubernetes restarts the container. The api pods never reach `Ready`.
- **The cache.** A comment in `values.yaml` names `CRANE_CACHE` as a secret key, but the template always sets `CRANE_CACHE` from `config.cache` (see the warning above).

The migrations do not depend on these mismatches: the migrate `Job` starts the `migrate` role, which the binary accepts.

## What's next {#next}

- {{< xref "deploy/requirements" >}}
- {{< xref "configure/cache" >}}
- {{< xref "operations/upgrades-and-migrations" >}}
- {{< xref "reference/environment-variables" >}}
