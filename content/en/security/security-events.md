---
title: "Security journal events"
description: "Reference for the three security journal streams of the CRANE server: targets, fields and events written today, and how to pick them from the logs."
audience: [security, auditor]
genre: reference
state: current
status: available
weight: 20
terms: [security-journal, principal, egress, ocsf, siem]
---

The {{< term "security-journal" >}} of the CRANE server consists of three streams: the action audit (target `crane::audit`), the access log (`crane::access`) and the egress log (`crane::upstream`). The server writes them as JSON lines to standard output and pins them at the `info` level, so {{< env "RUST_LOG" >}} does not turn them off.

This page lists the fields and events the server writes today. The target design of the journal is in {{< xref "features/security/security-journal" >}}. The server has no export to a {{< term "siem" >}} yet.

## Journal targets {#targets}

| Target (`target`) | What it writes | Message (`message`) |
| --- | --- | --- |
| `crane::audit` | One event for every write action and for every authentication refusal | `аудит` |
| `crane::access` | One line for every HTTP request to the API port | `запрос обработан` |
| `crane::upstream` | One record for every real fetch from an upstream, including SSRF guard refusals | `выборка из upstream` |

The `timestamp`, `level` and `target` fields are added by the logging library. Event fields sit at the top level of the line, not in a nested object. The journal never contains headers, request or response bodies, query strings or token values. The message texts are written in Russian; filter by `target`, not by message.

## Picking the journal out of the log stream {#extract}

The server writes all logs to one stream, so the security journal is selected by the `target` field. The command reads the output of the `crane` container, skips lines that are not JSON and keeps one target:

```bash
docker compose --project-directory . \
  -f deploy/compose/docker-compose.yaml logs --no-log-prefix crane \
  | jq -cR --arg t crane::audit 'fromjson? | select(.target == $t)'
```

Substitute `crane::access` or `crane::upstream` to select another stream. An example access log line (fields shortened, order may differ):

```json
{"timestamp":"<time>","level":"INFO","target":"crane::access","message":"запрос обработан","method":"GET","path":"/cargo/internal/index/config.json","status":200,"duration_ms":3,"request_id":"<uuid>","client_ip":"203.0.113.7","user_agent":"cargo/1.90","actor":"crane"}
```

The same filter suits a log collector: a rule on the `target` field selects the security journal without parsing message texts.

## Audit: fields {#audit-fields}

Field names are flat paths of the {{< cite "ocsf" >}} schema; `metadata.version` equals `1.3.0`. An optional field without a value is left out of the line.

| Field | Value |
| --- | --- |
| `class_uid`, `category_uid` | `3002` and `3` for a sign-in event (Authentication, IAM); `6003` and `6` for write actions (API Activity, Application) |
| `activity_id`, `activity_name` | `1` Logon for sign-in; `1` Create, `2` Read, `3` Update, `4` Delete for write actions |
| `type_uid` | `class_uid` × 100 + `activity_id` |
| `status_id`, `status` | `1` `Success` or `2` `Failure` |
| `status_detail` | The refusal reason; only with `Failure` |
| `status_code` | A stable refusal code from a format rule; only when a rule fired |
| `severity_id` | `1` on success, `2` on refusal |
| `metadata.uid` | The event identifier (UUID) |
| `metadata.correlation_uid` | The request identifier (`request_id`); links the event to the access log line |
| `metadata.version`, `metadata.product.name`, `metadata.product.version` | The schema version, `CRANE` and the server version |
| `time` | Event time in milliseconds since the Unix epoch |
| `actor.user.uid`, `actor.user.type_id`, `actor.user.type` | The {{< term "principal" >}} of a write action and its type: `1` `User` (a human), `99` for `Robot`, `Workload`, `Agent` |
| `user.uid`, `user.type_id`, `user.type` | The same for a sign-in event; on refusal the subject is unknown: `type_id` `0`, `type` `Unknown`, no `user.uid` |
| `src_endpoint.ip` | The client address |
| `http_request.user_agent` | `User-Agent`, at most 256 characters |
| `api.operation` | The operation (table below); a sign-in event has no such field |
| `resources.uid`, `resources.type` | The PURL of the package and version, and `package`; only for actions on a version or a package |
| `unmapped.repository` | The repository name; only for actions on a package |
| `unmapped.trace_id` | The trace identifier from the `traceparent` header, if it arrived |

The client address and the request identifier come from `X-Forwarded-For` and `X-Request-Id` only when they arrive from a proxy listed in {{< env "CRANE_TRUSTED_PROXIES" >}}: {{< xref "configure/network" >}}.

## Audit: events {#audit-events}

Events with success and with refusal differ in the `status` field. The refusal reason is a short error text; the chain of internal causes, which can contain storage addresses, does not enter the event.

| `api.operation` | Action | When the server writes the event |
| --- | --- | --- |
| none (sign-in, `class_uid` `3002`) | Authentication refusal | A token was presented and rejected: `status` `Failure`, `status_detail` `токен отвергнут`. A successful sign-in is not written. A request without an authorization header is part of the protocol handshake and is not written |
| `publish` | Publishing a version | Cargo and npm, success and refusal |
| `yank`, `unyank` | Hiding a version and undoing it | Cargo |
| `delete` | Deleting a version | npm |
| `deprecate`, `undeprecate` | Marking a version deprecated and undoing it | npm |
| `tag`, `untag` | Setting and removing a tag | npm (`dist-tag`) |
| `namespace.reserve` | Reserving a namespace | At start for each {{< env "CRANE_NAMESPACES" >}} entry (principal `crane:config`, type `Workload`) and at the first publish of an exact name |
| `upstream.shadow` | Refusal to serve an internal name from a public upstream | Cargo and npm proxies; always `Failure`, `status_detail` `имя внутреннее: из публичного upstream не отдаётся` |

The audit does not record reads: a file download and an index request are visible only in the access log. The adapter has mappings for version files, settings changes and the first-run wizard, but the server does not write these events yet.

## Access log: fields {#access-fields}

| Field | Value |
| --- | --- |
| `method`, `path` | The request method and the path without the query string |
| `status` | The response code |
| `duration_ms` | Processing time in milliseconds |
| `request_id` | The request identifier: a UUIDv7 from the server or a valid value from a trusted proxy; the server returns it in the `X-Request-Id` header |
| `client_ip` | The client address |
| `user_agent` | `User-Agent`, at most 256 characters |
| `actor` | The principal name ({{< env "CRANE_TOKEN_PRINCIPAL" >}}); present only after successful authentication |
| `cache` | Proxy responses only: `hit`, `miss`, `stale` or `stale-on-error` |
| `upstream_failure` | The reason for an upstream failure or an integrity check: `refused`, `unavailable`, `throttled`, `weak-integrity`, `digest-mismatch`, `too-large` |
| `upstream_reason` | The reason text; only with `refused` and `digest-mismatch` (for `digest-mismatch` the text holds the expected and received SHA-256) |

Requests to the probe port ({{< env "CRANE_ADMIN_PORT" >}}) do not reach the access log.

## Egress log: fields {#egress-fields}

| Field | Value |
| --- | --- |
| `host` | The upstream host |
| `path` | The path on the upstream without the query string |
| `status` | The upstream response code; present when a response arrived |
| `failure` | `refused` when the SSRF guard refused the request, or `unavailable` when the connection failed; present instead of `status` |
| `elapsed_ms` | Time until the response headers arrived, in milliseconds |

The server writes the reason for a guard refusal (host outside the allowlist, non-public address, forbidden scheme) to the `upstream_reason` field of the access log line of the request that triggered the fetch: {{< xref "features/security/egress-guard" >}}.

## What the journal does not have today {#absent}

- **Protection against modification.** There is no hash chain and no anchors in immutable storage. An audit event remains a standard output line, and the durability of the line is decided by the organization's log pipeline.
- **SIEM export.** The server does not deliver events to a SIEM. A log collector of the organization picks up the lines in the {{< term "ocsf" >}} schema.
- **Access roles for the journal.** Whoever reads the container output reads the journal. There is no masking of identifiers.
- **A download stream.** A file download is visible only as an access log line.
- **Read auditing.** The server audits write actions and refusals, not reads.

## What's next {#next}

{{< cards "features/security/security-journal" "security/hardening" "configure/network" "reference/environment-variables" >}}
