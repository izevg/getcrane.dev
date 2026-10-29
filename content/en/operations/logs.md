---
title: "Logs"
description: "The CRANE log format (JSON to stdout), the three security journal targets that RUST_LOG does not turn off, event fields and how to filter the security journal."
audience: [platform, security, auditor]
genre: how-to
state: current
status: available
weight: 20
terms: [security-journal, ocsf, principal, upstream]
---

CRANE writes its log to standard output as JSON, one line per event. Among those lines, three targets form the {{< term "security-journal" >}}: audit (`crane::audit`), access (`crane::access`) and outgoing requests (`crane::upstream`). The log level {{< env "RUST_LOG" >}} does not turn them off: the server always enables these targets at the `info` level and places its directives after the administrator's value.

This page shows how to read the log, choose the level of ordinary logs, isolate the security journal and follow a single request. It also lists the event fields and what never reaches the log.

## Before you begin {#prerequisites}

- A running Docker Compose deployment: {{< xref "deploy/docker-compose" >}}.
- The `jq` utility on the host for filtering.
- Permission to read the container log. The log holds request paths and client addresses, and chains of failure causes may hold a storage address: grant access only to those who are entitled to see them.

## Steps {#steps}

1. Read the log of the `crane` service. The `--no-log-prefix` flag removes the Compose prefix, so every line stays valid JSON.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml logs --no-log-prefix crane
   ```

2. Filter the security journal by the `target` field. The `fromjson?` filter skips lines that are not JSON (for example, panic text).

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml logs --no-log-prefix crane \
     | jq -cR 'fromjson? | select(.target == "crane::audit"
                                  or .target == "crane::access"
                                  or .target == "crane::upstream")'
   ```

3. Pick one target. Examples: authentication failures, attempts to fetch an internal name through the proxy, and upstream failures.

   ```bash
   # authentication failures (OCSF class 3002)
   jq -cR 'fromjson? | select(.target == "crane::audit" and .class_uid == 3002)'

   # proxy refusals to serve a name that CRANE treats as internal
   jq -cR 'fromjson? | select(."api.operation" == "upstream.shadow")'

   # requests where the upstream did not answer or refused
   jq -cR 'fromjson? | select(.target == "crane::access" and .upstream_failure != null)'
   ```

   Put each `jq` command after the pipe `|` from step 2.

4. Follow one request. The client receives the identifier in the `X-Request-Id` header and in the error body (`request_id`). In an access line the identifier is in the `request_id` field, in an audit event it is in the `metadata.correlation_uid` field.

   ```bash
   jq -cR --arg id "<request_id>" 'fromjson?
     | select(.request_id == $id or ."metadata.correlation_uid" == $id)'
   ```

5. Set the level of ordinary logs. The {{< env "RUST_LOG" >}} variable is not passed to the container in the Compose project, so add it to your own override file, for example `logging.yaml`:

   ```yaml
   services:
     crane:
       environment:
         RUST_LOG: warn
   ```

   Add the file as the last `-f` (together with the other project files if the S3 or Valkey modes are on) and recreate the container:

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml \
     -f logging.yaml up -d crane
   ```

> [!TIP]
> The value `warn` hides `info` records, including "сервер запущен" (server started). The value `off` also hides startup errors ("роль завершилась с ошибкой", the role finished with an error): return to `info` when diagnosing. Events of the three security journal targets stay in any case.

## Verify {#verify}

Send any request to the API and find its access line. An example for a request without a token:

```bash
curl -sS -o /dev/null https://crane.example.com/cargo/internal/index/config.json
docker compose --project-directory . \
  -f deploy/compose/docker-compose.yaml logs --no-log-prefix --tail 20 crane \
  | jq -cR 'fromjson? | select(.target == "crane::access")
            | {status, method, path, request_id}'
```

```text
{"status":401,"method":"GET","path":"/cargo/internal/index/config.json","request_id":"…"}
```

The access line appears at any `RUST_LOG`, including `off`.

## Line format {#format}

Every line is a separate JSON object. The event fields sit at the top level, not in a nested `fields` object: a collector needs no second path. Besides the event fields, the line has service fields:

| Field | Value |
| --- | --- |
| `timestamp` | time of the record |
| `level` | `ERROR`, `WARN`, `INFO`, `DEBUG` or `TRACE` |
| `message` | event text; server message texts are in Russian |
| `target` | log target: `crane::audit`, `crane::access`, `crane::upstream` or a server module |
| `span`, `spans` | request context: `request_id` and `trace_id` from the `traceparent` header ({{< cite "w3c-trace-context" >}}) if the client sent it and it is valid |

The {{< env "RUST_LOG" >}} filter uses the `tracing-subscriber` syntax. A value that cannot be parsed is replaced with `info` rather than turning the log off.

## The security journal: three targets {#security-targets}

The security journal answers three questions: what a principal did, who requested what, and where CRANE went by itself. The server pins all three targets to the `info` level, so an administrator who lowered the noise through {{< env "RUST_LOG" >}} does not lose security events silently. More about the guarantee: {{< xref "features/security/security-journal#targets" >}}.

| Target | One event per | Message |
| --- | --- | --- |
| `crane::audit` | an action or a refusal: publish, yank, delete, deprecate, tag, namespace reservation, authentication failure, refusal to serve an internal name | `аудит` (audit) |
| `crane::access` | every HTTP request to the API port | `запрос обработан` (request handled) |
| `crane::upstream` | every real fetch from an {{< term "upstream" >}}, including refusals of the egress policy | `выборка из upstream` (fetch from upstream) |

Requests to the probe port do not reach the access log: the orchestrator calls them every few seconds.

## Event fields {#fields}

### Access: `crane::access` {#fields-access}

| Field | Value |
| --- | --- |
| `method`, `path` | request method and path without the query |
| `status` | response code |
| `duration_ms` | handling time in milliseconds |
| `request_id` | request identifier |
| `client_ip` | client address; taken from `X-Forwarded-For` only from trusted proxies ({{< env "CRANE_TRUSTED_PROXIES" >}}) |
| `user_agent` | `User-Agent`, at most 256 characters |
| `actor` | name of the {{< term "principal" >}} ({{< env "CRANE_TOKEN_PRINCIPAL" >}}); present only for requests with an accepted token |
| `cache` | for proxy repositories: `hit`, `miss`, `stale`, `stale-on-error` |
| `upstream_failure` | for proxy repositories: `refused`, `unavailable`, `throttled`, `digest-mismatch`, `too-large`, `weak-integrity` |
| `upstream_reason` | the reason for an egress policy refusal or a checksum mismatch |

Fields without a value are not written.

### Audit: `crane::audit` {#fields-audit}

The field names are flat paths of the {{< term "ocsf" >}} schema (`actor.user.uid`, {{< cite "ocsf" >}}); the collector assembles the nested object.

| Field | Value |
| --- | --- |
| `class_uid` | `6003` (API Activity) for actions, `3002` (Authentication) for authentication failures |
| `category_uid`, `activity_id`, `activity_name`, `type_uid` | OCSF classification: `Create`, `Read`, `Update`, `Delete` or `Logon` |
| `status_id`, `status`, `severity_id` | `1`, `Success`, `1` on success; `2`, `Failure`, `2` on refusal |
| `status_detail` | the reason for the refusal |
| `status_code` | a stable refusal code for a rule, for example `foreign-registry-dependency` |
| `metadata.uid`, `metadata.correlation_uid` | the event identifier and the request identifier |
| `metadata.version`, `metadata.product.name`, `metadata.product.version` | the OCSF schema version, `CRANE` and the server version |
| `time` | event time in milliseconds since the Unix epoch |
| `actor.user.uid`, `actor.user.type_id`, `actor.user.type` | the principal of the action (class `6003`); the access token gives the type `Robot` |
| `user.uid`, `user.type_id`, `user.type` | the subject of an authentication event (class `3002`); the type is `Unknown` when the subject is unknown |
| `src_endpoint.ip`, `http_request.user_agent` | client address and `User-Agent` |
| `api.operation` | operation: `publish`, `yank`, `unyank`, `delete`, `deprecate`, `undeprecate`, `tag`, `untag`, `namespace.reserve`, `upstream.shadow` |
| `resources.uid`, `resources.type` | the package as a purl (`pkg:cargo/demo-crate@1.0.0`), the type `package` |
| `unmapped.repository`, `unmapped.trace_id` | the repository and the trace identifier, if present |

A successful authentication is not recorded as a separate event, and a request without a token is part of the protocol handshake and is not audited: {{< xref "configure/access-token#presenting" >}}. The reservations from {{< env "CRANE_NAMESPACES" >}} are recorded by the server at startup on behalf of `crane:config`.

### Outgoing requests: `crane::upstream` {#fields-egress}

| Field | Value |
| --- | --- |
| `host`, `path` | the upstream host and the path without the query |
| `status` | the upstream response code, if a response arrived |
| `failure` | `refused` is a refusal of the egress policy, `unavailable` is a network error, `throttled` means the upstream limited requests |
| `elapsed_ms` | time until the headers arrived |

A request served from the cache or joined to another fetch produces no line, so the number of lines with the same `path` shows how many times CRANE really contacted the upstream. Details: {{< xref "features/security/egress-guard#journal" >}}.

## Server messages {#messages}

Ordinary records are easiest to find by the `message` field. The table lists the messages needed for operations.

| Message | Level | When and which fields |
| --- | --- | --- |
| `сервер запущен` (server started) | info | The ports are bound, the server accepts requests. Fields `http_port`, `admin_port`, `repos`, `proxy_repos`, `npm_repos`, `npm_proxy_repos` |
| `получен SIGINT`, `получен SIGTERM`, `сервер остановлен` (SIGINT or SIGTERM received, server stopped) | info | Graceful stop |
| `миграции PostgreSQL применены` (PostgreSQL migrations applied) | info | The `migrate` role finished successfully |
| `кэш proxy выбран` (proxy cache selected) | info | The `cache` field: `memory` or `valkey` |
| `роль завершилась с ошибкой` (the role finished with an error) | error | The role finished with code `1`. The `error` field holds the cause |
| `строка настройки в БД не действует` (a setting row in the database is ignored) | warn | Fields `key` and `reason`; the value is not written |
| `хранилище не готово`, `проба хранилищ не уложилась в 1.5s` (storage not ready, storage probe did not finish in 1.5s) | warn | The readiness probe answered with a failure |
| `хранилище недоступно` (storage unavailable) | warn | A request got `503`; the `error` field is the chain of causes |
| `внутренняя ошибка запроса` (internal request error) | error | A request got `500`; the `error` field is the chain of causes |
| `документ upstream не разобран` (upstream document not parsed) | warn | The upstream sent a document CRANE could not parse; the client got `502` |
| `фоновое обновление proxy не удалось` (proxy background refresh failed) | warn | A background revalidation of a document ended with an error |
| `Valkey: команды отказывают сразу до переподключения` (Valkey: commands fail at once until reconnect) | warn | The `valkey` field equals `unavailable`: the cache degraded |
| `Valkey: соединение установлено` (Valkey: connection established) | info | The `valkey` field equals `available` |
| `Valkey: подключение не удалось, повтор`, `Valkey: соединение потеряно, переподключение` (Valkey: connection failed, retry; connection lost, reconnecting) | warn | The `kind` field names the client error kind without an address |

## What does not reach the log {#excluded}

- **Secrets.** The token, the Basic password, connection passwords and S3 keys are not written. Secrets live in a type without output, and configuration errors name the variable but not the value.
- **The query string.** Only the request path goes to the log: queries may carry tokens and personal data.
- **Bodies and headers.** Request and response bodies and headers are not written. The exceptions are `User-Agent` (up to 256 characters) and the `X-Request-Id` value from a trusted proxy. An outgoing request line has no headers, bodies or `ETag`.
- **The error detail sent to the client.** The client gets a short text and a `request_id`. The storage address and the internal cause stay in the server log, which is why access to the log must be restricted.

## What next {#next}

{{< cards "features/security/security-journal" "operations/troubleshooting" "reference/errors" >}}

- {{< xref "reference/environment-variables#group-logging" >}}
