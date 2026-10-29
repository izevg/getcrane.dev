---
title: "Pre-production checklist"
description: "Checks to run before putting CRANE into production in the current delivery: images, secrets, ports, TLS, trusted proxies, data, limits and probes."
audience: [platform, security]
genre: reference
state: current
status: available
weight: 70
terms: [digest, namespace, readiness-probe]
---

This page lists what to check in a Compose deployment of CRANE before pointing clients at it. Each item has a way to verify it and a link to the page that explains why and how to configure it. The list covers only what the delivery contains today.

Items are grouped by topic: images and secrets, network and TLS, data, protection against substitution, observability. Conditional items (Valkey, S3, the settings encryption key) apply only in the matching mode.

## Images and secrets {#supply}

| What to check | How to verify | Details |
| --- | --- | --- |
| Third-party images are pinned by tag and {{< term "digest" >}}. The CRANE image is built locally, and its {{< env "CRANE_VERSION" >}} tag is not pinned | In `.env`, the values of {{< env "CADDY_IMAGE" >}}, {{< env "POSTGRES_IMAGE" >}} (and {{< env "VALKEY_IMAGE" >}}, {{< env "SEAWEEDFS_IMAGE" >}} in their modes) contain `@sha256:`: `grep '_IMAGE=' .env` | {{< xref "deploy/requirements#images" >}} |
| Secrets live in files, not in `.env` and not in the container environment. The `secrets` directory is accessible only to its owner | `ls -ld secrets` starts with `drwx------`; `.env` holds only file paths | {{< xref "security/hardening#steps" >}}, {{< xref "deploy/docker-compose#secrets" >}} |
| The token is stored in a file and issued only to those who need full access: it opens all repositories for reading and writing | The output of `docker inspect --format '{{.Config.Env}}' <crane container>` has `CRANE_TOKEN_FILE=` and no `CRANE_TOKEN=` | {{< xref "configure/access-token" >}} |

## Network and TLS {#network}

| What to check | How to verify | Details |
| --- | --- | --- |
| Only the Caddy ports are published on the host. The probe port ({{< env "CRANE_ADMIN_PORT" >}}) and the `crane` and PostgreSQL ports are not published. The `docker-compose.dev.yaml` file is not attached | In the `PORTS` column of `docker compose ps`, only `caddy` has host ports | {{< xref "security/hardening#steps" >}}, {{< xref "reference/ports-and-health" >}} |
| Clients reach the proxy over HTTPS. {{< env "CRANE_HOST" >}} is a public name, not `localhost` | `curl` to `https://<host>/` succeeds without disabling certificate verification | {{< xref "deploy/tls-reverse-proxy#caddy" >}} |
| {{< env "CRANE_TRUSTED_PROXIES" >}} holds the proxy addresses and only them. The `edge` network holds only `caddy` and `crane` | `docker network inspect crane_edge --format '{{range .Containers}}{{.Name}} {{end}}'` prints `caddy` and `crane`; `client_ip` in the access log is the client address | {{< xref "deploy/tls-reverse-proxy#verify" >}}, {{< xref "configure/network" >}} |
| Valkey, if enabled: the `docker-compose.cache.yaml` override with authentication is attached, the `cache` network is isolated, the port is not published | `docker network inspect crane_cache --format '{{.Internal}}'` prints `true` | {{< xref "deploy/valkey-cache#override" >}} |
| S3, if enabled: the `s3` network is isolated, keys are read from files | `docker network inspect crane_s3 --format '{{.Internal}}'` prints `true` | {{< xref "deploy/s3-storage#override" >}} |

## Data {#data}

| What to check | How to verify | Details |
| --- | --- | --- |
| The `pg` and `blobs` volumes (in S3 mode the `s3` volume replaces `blobs`) and `caddy-data` sit on persistent host storage. {{< env "CRANE_DATABASE_URL" >}} and {{< env "CRANE_BLOBS" >}} are not `memory`: with `memory`, data is lost on restart | `docker volume inspect crane_pg --format '{{.Mountpoint}}'` points to a disk that survives a host reboot | {{< xref "deploy/docker-compose#services" >}}, {{< xref "deploy/requirements#postgresql" >}} |
| The settings encryption key, if the PostgreSQL `setting` table holds encrypted rows: the key is passed as the {{< env "CRANE_SETTINGS_KEY_FILE" >}} file and stored apart from PostgreSQL backups. Without such rows the variable is not needed | The server starts without key messages | {{< xref "configure/settings-encryption" >}} |

## Protection against substitution {#protection}

| What to check | How to verify | Details |
| --- | --- | --- |
| All internal names are reserved in {{< env "CRANE_NAMESPACES" >}}. The default value is empty, and then no {{< term "namespace" >}} is reserved | A request for an internal name through a proxy repository gets `404` | {{< xref "configure/namespaces#verify" >}} |
| Size limits match the largest packages: {{< env "CRANE_MAX_PUBLISH_BYTES" >}} (default `10485760`) and {{< env "CRANE_PROXY_MAX_ARTIFACT_BYTES" >}} (default `2147483648`). The base compose file does not pass these variables to the server | A publish over the limit gets `413`, and an artifact over the limit through a proxy gets `502` | {{< xref "configure/limits" >}} |

## Observability {#observability}

| What to check | How to verify | Details |
| --- | --- | --- |
| The {{< term "readiness-probe" "readiness probe" >}} `/healthz/ready` is connected to monitoring. The probe port is not published, so the check runs inside the network or with the `crane healthcheck` command | `docker compose exec crane crane healthcheck` exits with code `0`; monitoring raises an alert on code `1` | {{< xref "operations/health-checks" >}}, {{< xref "reference/ports-and-health#probes" >}} |
| The `crane` standard output is collected into a log store. The three security journal streams arrive as JSON lines, and a retention period is set | The log store holds records whose `target` is `crane::access`, `crane::audit` and `crane::upstream` | {{< xref "security/security-events" >}}, {{< xref "operations/logs" >}} |

## What the list does not cover {#absent}

Backup and release authenticity verification: this functionality is in development, see {{< xref "operations/backup-restore" >}} and {{< xref "security/release-verification" >}}.

## What next {#next}

{{< cards "security/hardening" "deploy/tls-reverse-proxy" "operations/health-checks" "security" >}}
