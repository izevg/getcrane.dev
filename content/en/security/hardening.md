---
title: "Hardening a deployment"
description: "What the CRANE Compose files already enable to protect containers, networks and secrets, and which steps remain for the deployment administrator."
audience: [platform, security]
genre: how-to
state: current
status: available
weight: 10
terms: [static-token, security-journal]
---

This page takes a working Compose deployment to a hardened one. It first lists what the shipped files already enable, then gives the steps the deployment administrator performs, with ways to check the result. Every item rests on a file in the `deploy/` directory or on the server code.

The shipped files harden the CRANE containers, the networks and the storage of secrets. They do not decide the permissions of host files, who receives the {{< term "static-token" >}}, how the {{< term "security-journal" >}} is collected, or how third-party containers are secured. Those steps are below.

## Before you begin {#prerequisites}

- A working project from {{< xref "deploy/docker-compose" >}}. The S3 and Valkey modes are optional; steps for them are marked.
- Access to the Docker host and to the repository root from which the project was started.

## What the shipped files already enable {#shipped}

| Measure | Applies to | File |
| --- | --- | --- |
| Read-only root file system, `tmpfs` on `/tmp` | `crane`, `migrate`, `analyzer` | `deploy/compose/docker-compose.yaml` (anchor `x-crane`) |
| `no-new-privileges:true` and `cap_drop: [ALL]` | `crane`, `migrate`, `analyzer` | `deploy/compose/docker-compose.yaml` (anchor `x-crane`) |
| `distroless` image without a shell, user `65532:65532` | `crane` | `deploy/docker/Dockerfile` |
| Build with `--locked`; base images pinned by tag and digest | `crane` | `deploy/docker/Dockerfile` |
| Caddy, PostgreSQL, Valkey, SeaweedFS and Trivy images pinned by tag and digest | third-party services | `.env.dist` |
| Secrets in files mounted at `/run/secrets`, not in environment variables | token, password and catalog URL | `deploy/compose/docker-compose.yaml` |
| Only the Caddy ports are published on the host; the `crane` and PostgreSQL ports are not | `caddy` | `deploy/compose/docker-compose.yaml` |
| An `edge` network only for `caddy` and `crane`; its subnet doubles as the trusted proxy list | `caddy`, `crane` | `deploy/compose/docker-compose.yaml` |
| Removal of the client `X-Request-Id` | `caddy` | `deploy/caddy/Caddyfile` |
| CPU and memory limits | `crane` | `deploy/compose/docker-compose.yaml` |
| A `scan` network with `internal: true`: `analyzer` has no way out | the `scan` profile | `deploy/compose/docker-compose.yaml` |
| A `cache` network with `internal: true`, the `default` user switched off, an ACL without the `@dangerous` group, no writes to disk | Valkey | `deploy/compose/docker-compose.cache.yaml` |
| An `s3` network with `internal: true`, no anonymous access, keys from secret files | SeaweedFS | `deploy/compose/docker-compose.s3.yaml` |

## Steps {#steps}

1. Leave only the Caddy ports published. Do not add `ports` to the `crane` and `postgres` services, and do not publish the probe port ({{< env "CRANE_ADMIN_PORT" >}}): it answers without a token. The server serves the API port without TLS, so clients must go through Caddy.

   > [!WARNING]
   > The file `deploy/compose/docker-compose.dev.yaml` publishes the PostgreSQL, Valkey, SeaweedFS and Trivy ports on the host. It is meant for development and is not used in production.

2. Set the public name in {{< env "CRANE_HOST" >}}. For a public name Caddy obtains an ACME certificate; for `localhost` it uses its internal CA, which suits a trial only. Compose derives {{< env "CRANE_PUBLIC_URL" >}} from the name itself, so links in protocol responses start with `https://`.

3. Check the permissions of the secrets directory. The `task secrets:init` task creates the directory with mode `0700` and the files with mode `0644`: on Linux, user `65532` and `postgres` read the secrets, not the user who created the files. Do not widen the directory permissions and do not copy secret values into `.env`: it holds only file paths.

   ```bash
   ls -ld secrets
   ```

   The output line starts with `drwx------`.

4. Replace the static token if it may have reached an outsider. Write the new value to the file whose path {{< env "CRANE_TOKEN_SECRET" >}} sets, and restart `crane`: the token is read once at start. One token opens all repositories for reading and writing, so hand it out only to those who need full access: {{< xref "configure/access-token" >}}.

5. Do not add other services to the `edge` network and do not widen {{< env "CRANE_TRUSTED_PROXIES" >}} to client networks. The server trusts `X-Forwarded-For` and `X-Request-Id` from every address on the list. If another proxy stands in front of Caddy, it must also overwrite these headers: {{< xref "configure/network" >}}.

6. In Valkey mode keep the `cache` network for `crane` and `valkey` only. Do not publish the Valkey port, do not disable authentication, and do not set {{< env "CRANE_CACHE" >}} with a password in the environment: the address with the password lives in a file, and the server reads it through {{< env "CRANE_CACHE_FILE" >}}. Details: {{< xref "deploy/valkey-cache" >}}.

7. If you set a settings encryption key, create it with `umask 077` and keep it apart from the PostgreSQL backups. A lost key cannot be recovered: {{< xref "configure/settings-encryption" >}}.

8. Update images deliberately. Third-party images are pinned by digest in `.env.dist`, and the CRANE base images in `deploy/docker/Dockerfile`. Get the digest of a new tag with `docker buildx imagetools inspect <image:tag>`, then rebuild the CRANE image.

9. Set up collection of the standard output of the `crane` container. The three streams of the security journal go there as JSON lines. Compose does not configure a log driver, so collection, retention and protection against modification stay with the organization's log pipeline: {{< xref "security/security-events" >}}.

## Verify {#verify}

1. Make sure ports on the host are published only for `caddy`: in the `PORTS` column of the command output, `crane` and `postgres` have no host ports.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml ps
   ```

2. Check the parameters of the `crane` container.

   ```bash
   docker inspect \
     --format '{{.HostConfig.ReadonlyRootfs}} {{.HostConfig.CapDrop}} {{.HostConfig.SecurityOpt}} {{.Config.User}}' \
     "$(docker compose --project-directory . \
       -f deploy/compose/docker-compose.yaml ps -q crane)"
   ```

   ```text
   true [ALL] [no-new-privileges:true] 65532:65532
   ```

3. Check that the `edge` network holds only two containers. The network name consists of the project name `crane` and the network name.

   ```bash
   docker network inspect crane_edge \
     --format '{{range .Containers}}{{.Name}} {{end}}'
   ```

   The output contains the names of the `caddy` and `crane` containers.

4. In Valkey mode check that the `cache` network is isolated.

   ```bash
   docker network inspect crane_cache --format '{{.Internal}}'
   ```

   ```text
   true
   ```

## What the shipped files do not cover {#outside}

- **Third-party containers.** In the shipped files `caddy`, `postgres`, `valkey`, `seaweedfs` and `trivy` have no `read_only`, `cap_drop` or `no-new-privileges`. If the administrator adds them in their own override file, checking that the image works with them is up to the administrator.
- **Channels inside Docker.** The reference URLs reach PostgreSQL, Valkey and SeaweedFS without TLS (`valkey://`, `http://seaweedfs:8333`). For external services TLS is set in the address: the `valkeys://` scheme for Valkey, an `https` endpoint for S3, connection parameters in the catalog URL for PostgreSQL.
- **The host.** The firewall, OS and Docker updates, disk and backup encryption, access to the Docker socket.
- **Access control.** The token does not tell users or permissions apart. The server does not support roles or OIDC sign-in yet: {{< xref "configure/identity" >}}.
- **The security journal.** The server neither protects journal lines from modification nor exports them to a SIEM: {{< xref "security/security-events#absent" >}}.

## What's next {#next}

{{< cards "security" "security/security-events" "deploy/valkey-cache" "configure/network" >}}
