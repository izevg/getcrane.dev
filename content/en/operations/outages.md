---
title: "Failure of PostgreSQL, Valkey, S3 and upstream"
description: "What clients get and what the log shows when PostgreSQL, the blob storage, Valkey or an upstream fails, and which actions the deployment administrator takes."
audience: [platform, security]
genre: how-to
state: current
status: available
weight: 40
terms: [fail-closed, namespace, stale-if-error, upstream, singleflight]
---

This page describes how CRANE behaves when PostgreSQL, the blob storage (S3 or a local volume), Valkey or an {{< term "upstream" >}} fails, and what the deployment administrator does. The behavior is checked by failure scenarios on a test stand: the components are stopped one by one, and the source of truth is the server log, the number of objects in the bucket and the audit records.

The main rule: a PostgreSQL failure stops serving packages ({{< term "fail-closed" >}}), a Valkey failure does not. Without the catalog CRANE cannot check that a name is not internal, so it answers `503` instead of serving a package from the cache. Valkey is a cache, not a source of truth: losing it adds load on the upstream but no client errors. Target figures and degradation modes are described in {{< xref "features/operations/availability" >}}.

## Summary {#summary}

| Failure | Reads | Publishing | `/healthz/ready` | Recovery |
| --- | --- | --- | --- | --- |
| PostgreSQL | `503` for everything that needs the catalog, including cache hits | `503` | `503` | By itself, no restart |
| Blob storage (S3) | `503` for blob downloads, index documents are served | `503` | `503` | By itself, no restart |
| Valkey | No errors: misses go to the upstream | Unchanged | `200` | By itself, the Valkey cache is empty |
| Upstream | Documents from the cache with `Age` and `Warning`, otherwise `502` | A new name with a proxy configured: `503` | `200` | By itself |

Every `503` carries the `Retry-After: 10` header, and the response body does not reveal the storage address: {{< xref "reference/errors" >}}. Standard clients and CI templates retry such a request.

## Before you begin {#prerequisites}

- Access to the `crane` log and the ability to filter it: {{< xref "operations/logs" >}}.
- A working readiness probe: {{< xref "operations/health-checks" >}}.

## Steps {#steps}

1. Find out what exactly does not work. Run the readiness probe: code `1` points to PostgreSQL or the blob storage, code `0` with client errors points to Valkey, an upstream or an error in CRANE itself.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml exec -T crane crane healthcheck
   echo $?
   ```

2. Find the error responses and their identifiers.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml logs --no-log-prefix crane \
     | jq -cR 'fromjson? | select(.target == "crane::access" and .status >= 500)
               | {status, path, request_id, upstream_failure}'
   ```

3. Tell the cause apart by the code. `503` means PostgreSQL or the blob storage is unavailable (or that a name cannot be checked in the upstream during publishing), `502` means an upstream failure, `500` means an internal error of CRANE.

4. Read the cause in the `warn` and `error` records: "хранилище недоступно" (storage unavailable) goes with `503`, "внутренняя ошибка запроса" (internal request error) goes with `500`. The `error` field holds the chain of causes with the text of the driver error.

5. Restore the component with its usual tools. There is no need to restart `crane` after PostgreSQL, S3 or Valkey returns.

6. Make sure the server recovered: the readiness probe returns `0`, and a repeated request or publish succeeds.

## PostgreSQL {#postgresql}

**What clients get.** Any protocol request that needs the catalog gets `503` with `Retry-After: 10`. This includes documents that sit in the proxy cache: while the catalog is unavailable, CRANE cannot check the {{< term "namespace" >}} reservations and does not serve the name. There are no fetches from the upstream at that time. Publishing also gets `503`; no new objects appear in the blob storage.

Token checks (`401` and `403`), the liveness probe and the `index/config.json` of a proxy repository, which CRANE builds by itself, keep answering without the catalog.

**What is visible.**

- `/healthz/ready` answers `503` with the type `urn:crane:problem:storage-unreachable`, while `/healthz/live` stays `200`: an unreachable database is no reason to restart the process.
- The `crane` container in Compose becomes `unhealthy` after six failed checks in a row.
- The log gets the records "хранилище недоступно" and "хранилище не готово" (storage not ready) with the cause string in the `error` field.

**What to do.** Restore PostgreSQL. After the database returns, the same request gets `200` again and a repeated publish succeeds: the version was not recorded during the failure, so the answer is not `409`.

**At startup.** If the database is unavailable at launch, the server waits for the connection for at most 5 s and exits with code `1`; `restart: unless-stopped` in Compose starts it again.

## Blob storage (S3) {#s3}

**What clients get.** Downloading a file from the storage and publishing get `503` with `Retry-After: 10`. The answer comes within seconds: the storage client retries a request at most three times and for no longer than 5 s. Index and metadata documents are served while the catalog is available.

For a local volume (`file://`) a disk write failure is not counted as unavailability: the client gets `500` and the cause stays in the log.

**What is visible.**

- `/healthz/ready` answers `503`: the probe tries to open a blob that does not exist and treats any error except "not found" as a failure.
- A refused publish is recorded in the audit as a `publish` event with the result `Failure`.
- The number of objects under `blobs/` in the bucket does not change after the failure. An interrupted write may leave objects under the temporary `staging/` prefix. They are not part of the blob storage and do not affect the catalog; cleaning that prefix is done by a bucket lifecycle rule on the deployment side.

**What to do.** Restore S3 and check the address and keys: {{< xref "deploy/s3-storage" >}}. After the storage returns, a repeated publish succeeds without an error.

## Valkey {#valkey}

**What clients get.** Nothing changes: there are no `5xx` errors. A key that is in the process cache is served from it. A key that is not there is requested from the upstream directly, without the shared cache and without the fetch coordinator; in the access line such a response has `cache` equal to `miss`.

**What is visible.**

- `/healthz/ready` stays `200`: Valkey does not affect readiness, and the server does not wait for the connection at startup.
- The log gets a `warn` record "Valkey: команды отказывают сразу до переподключения" (Valkey: commands fail at once until reconnect) with the `valkey` field equal to `unavailable`; after the return, a record with `available`. Reconnect attempts are logged with the error kind and without an address.
- The number of `crane::upstream` lines grows: while Valkey is unavailable, duplicate requests are not merged across replicas ({{< term "singleflight" >}} stays inside the process).

**Limits.** Every Valkey command is capped at one second, a connection is established within 2 s, and reconnecting runs in the background with an interval from 100 ms to 5 s. Entries in the process cache live no longer than 30 seconds, so during a long failure almost all requests go to the upstream.

**What to do.** Bring Valkey back. In the mode shipped with CRANE, Valkey does not persist data to disk, so after a restart the shared cache is empty and refills with client requests. Details of the mode: {{< xref "deploy/valkey-cache#failure" >}}.

## Upstream {#upstream}

**What clients get.** CRANE serves an index or metadata document that is already in the cache as stale ({{< term "stale-if-error" >}}) until the limit expires: seven days after the freshness ended for the Cargo index and npm documents. The response carries the `Age` and `Warning: 111 - "Revalidation Failed"` headers. If the upstream limited requests (`429` or `403`), a stale document is served for at most a day. If there is no usable copy, the client gets `502` with the text `upstream недоступен` (upstream unavailable); the cause stays in the log.

An archive with a cache record is served from the blob storage without contacting the upstream while its index document is served. Publishing a new name to a hosted repository with a proxy of the same format configured checks whether the name exists in the public registry. If it cannot be checked, the answer is `503` with the text `не удалось проверить имя в публичном upstream: повторите позже` (could not check the name in the public upstream: retry later).

**What is visible.**

- The access line of a proxy request holds `cache` (`stale-on-error` when a stale copy was served) and `upstream_failure`.
- The `crane::upstream` line of every attempt holds `failure`:

  | `failure` | Meaning | What to do |
  | --- | --- | --- |
  | `unavailable` | A network error, a timeout or a `5xx` from the upstream | Check DNS, outgoing network and the firewall of the CRANE host, then the state of the upstream itself |
  | `throttled` | The upstream answered `429` or `403` | Wait until the limit is lifted; stale documents are served for up to a day |
  | `refused` | The outgoing request policy rejected the host or the address | The reason is in the `upstream_reason` field of the access line: {{< xref "features/security/egress-guard" >}} |

- The readiness probe stays `200`.

**Limits.** Establishing a connection to the upstream is capped at 10 s, silence between reads at 30 s. A silent connection is detected by an HTTP/2 ping every 15 s with a 10 s wait for the reply. Concurrent requests for one document are merged into a single fetch.

**What to do.** Fix the network or wait for the upstream. After it returns, the first request refreshes the document and no extra action is needed.

## Verify {#verify}

After the component is restored:

1. The readiness probe returns `0`: {{< xref "operations/health-checks" >}}.
2. The log has no new `crane::access` lines with a `5xx` status.
3. The publish that failed during the outage succeeds when repeated. For Cargo, the repeat is an ordinary `cargo publish` command.

## What next {#next}

- {{< xref "features/operations/availability" >}}
- {{< xref "features/security/fail-closed" >}}
- {{< xref "operations/troubleshooting" >}}
- {{< xref "reference/errors" >}}
