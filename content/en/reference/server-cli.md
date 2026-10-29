---
title: "The crane binary: roles and exit codes"
description: "Reference of the crane binary roles (serve, all, migrate, healthcheck): arguments, required configuration, startup order, shutdown and exit codes."
audience: [platform]
genre: reference
state: current
status: available
weight: 20
terms: []
---

The CRANE server ships as a single `crane` binary. It takes exactly one argument, the role: `serve`, `all`, `migrate` or `healthcheck`. The image runs `crane all`. This reference describes what each role does, which settings it needs and which codes it exits with.

Every role writes a JSON log to standard output and reads settings from the environment and an optional TOML file: {{< xref "reference/environment-variables" >}}.

## Usage {#usage}

```text
crane <serve|all|migrate|healthcheck>
```

Any other number of arguments and any other role name produce an error record with the text `использование: crane <serve|all|migrate|healthcheck>` (usage) and exit code `2`.

## Roles {#roles}

| Role | What it does | Configuration it needs |
| --- | --- | --- |
| `serve` | Starts the API on {{< env "CRANE_HTTP_PORT" >}} and the probe port on {{< env "CRANE_ADMIN_PORT" >}}; runs until a signal | {{< env "CRANE_DATABASE_URL" >}}, {{< env "CRANE_BLOBS" >}}, {{< env "CRANE_PUBLIC_URL" >}}, {{< env "CRANE_TOKEN" >}}; the rest is optional |
| `all` | A synonym of `serve`: the server has no separate background tasks | Same as `serve` |
| `migrate` | Applies PostgreSQL migrations and exits | Only {{< env "CRANE_DATABASE_URL" >}}: no token, public address or blobs needed |
| `healthcheck` | Requests `/healthz/ready` on `127.0.0.1` and exits | Only {{< env "CRANE_ADMIN_PORT" >}} |

If {{< env "CRANE_CONFIG" >}} is set, any role reads that file before parsing the other settings. An unreadable or invalid file stops any role.

## Exit codes {#exit-codes}

| Code | When |
| --- | --- |
| `0` | The role succeeded: `migrate` and `healthcheck` passed, `serve` was stopped by a signal |
| `1` | The role finished with an error: invalid configuration, unreachable PostgreSQL or storage, a busy port, a probe that is not ready. The cause is in the "роль завершилась с ошибкой" (role finished with an error) record, the `error` field |
| `2` | Usage error: not exactly one argument, or an unknown role |

## serve {#serve}

The role performs the steps in order. Any error stops the start with code `1`.

1. Parses the catalog ({{< env "CRANE_DATABASE_URL" >}}) and the encryption key ({{< env "CRANE_SETTINGS_KEY" >}}).
2. Connects to PostgreSQL if the catalog is persistent. The connection wait is at most 5 s. Reads the `setting` table.
3. Parses the remaining configuration: repositories, cache, limits, network, token, blobs, namespaces.
4. Opens the blob storage and creates the missing hosted and proxy repositories in the catalog.
5. Applies {{< env "CRANE_NAMESPACES" >}}. A pattern owned by another team stops the start.
6. Binds the ports: the API first, then the probes, both on `0.0.0.0`. A busy port produces the error `не удалось занять порт <port>: <reason>` (failed to bind the port).
7. Writes the "сервер запущен" (server started) record with the fields `http_port`, `admin_port`, `repos`, `proxy_repos`, `npm_repos` and `npm_proxy_repos`.

The `serve` role does not apply migrations: `migrate` prepares the schema.

### Shutdown {#shutdown}

The role stops on `SIGINT` or `SIGTERM`: it writes "получен SIGINT" or "получен SIGTERM" (signal received), shuts both listeners down gracefully, writes "сервер остановлен" (server stopped) and exits with code `0`.

## migrate {#migrate}

The role connects to PostgreSQL (waiting at most 5 s) and applies migrations. Success is the "миграции PostgreSQL применены" (PostgreSQL migrations applied) record. A lock prevents parallel runs. The PostgreSQL extension checks before migrations: {{< xref "deploy/requirements#extensions" >}}. With the `memory` catalog the role writes "хранилище в памяти: миграций нет" (in-memory storage: no migrations) and exits with code `0`.

## healthcheck {#healthcheck}

The role connects to `127.0.0.1:<admin port>`, requests `/healthz/ready` and exits with code `0` on a `200` response. It prints nothing on success. Probe details and the timeout: {{< xref "reference/ports-and-health#healthcheck" >}}.

## Log {#logging}

- The format is JSON, one line per event. Event fields sit at the top level of the line.
- {{< env "RUST_LOG" >}} sets the level; the default is `info`.
- Security journal events (the targets `crane::audit`, `crane::access`, `crane::upstream`) are always written at the `info` level: {{< env "RUST_LOG" >}} does not turn them off.

## What next {#next}

- {{< xref "reference/ports-and-health" >}}
- {{< xref "reference/environment-variables" >}}
- {{< xref "deploy/docker-compose" >}}
