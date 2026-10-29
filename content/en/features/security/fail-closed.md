---
title: "Failing closed"
description: "When CRANE cannot perform a security check, it answers 503 with Retry-After: 10 instead of serving a package unchecked; the price is that reads become unavailable."
audience: [security, platform]
genre: explanation
state: target
status: available
weight: 80
terms: [fail-closed, namespace, quarantine, typosquatting, dependency-confusion, upstream, proxy-repository, stale-if-error]
---

CRANE follows the {{< term "fail-closed" "fail closed" >}} principle: a security check that cannot be performed results in a refusal rather than letting the request through. When the catalog (PostgreSQL) is unavailable, every protocol request, including reads from the cache of a {{< term "proxy-repository" "proxy repository" >}}, gets a `503` response with the `Retry-After: 10` header.

This way an infrastructure failure does not become a window for an attack. Without the catalog, CRANE cannot check namespace reservations, emergency blocks and the {{< term "quarantine" >}}, so it serves nothing: neither from the {{< term "upstream" >}} nor from the cache. The price of this choice is that reads are unavailable until the catalog returns.

## Threat {#threat}

An attacker does not need to break a check; it is enough that the check does not run. A registry that lets a request through when a check fails (fail open) turns any overload or database outage into a window for an attack.

Example. The name `acme-billing` is reserved as internal, and someone has published a package with the same name in a public registry. If the catalog is unavailable and the proxy serves the name from the upstream or from the cache, the build gets a foreign package instead of the internal one ({{< term "dependency-confusion" >}}). The same happens with a {{< term "typosquatting" >}} package that is already blocked, and with a fresh malicious version that the quarantine should have held back.

## Guarantee {#guarantee}

- If the whole catalog is unavailable (no connection, pool timeout, server stopped), every protocol request gets `503` with `Retry-After: 10`. This includes proxy cache hits.
- CRANE does not go to the upstream in place of the catalog.
- A name whose reservation cannot be checked is served neither from the upstream nor from the cache.
- An environment failure and an error in CRANE itself are told apart: an unavailable store gives `503`, a violated invariant (a bug) stays `500`. Retrying a `500` is pointless.
- The audit record is written in the same transaction as the action: if the journal write fails, the action is not performed.

## How it works {#mechanism}

### What the client receives {#client-response}

- **`503` with `Retry-After: 10`.** The response means that the catalog or the blob store did not answer and a retry later makes sense. Standard clients and CI templates retry the request. The error body carries the request ID. The store address and the text of the internal error do not reach the client; they stay in the log.
- **`500`.** The response means an error in CRANE itself. The body carries a generic message and the request ID; the cause is written to the log.

The `Retry-After` header is added in a single place that the responses of all formats and of the admin interface pass through, so every `503` carries it.

### Why serving from the cache is not allowed {#why-no-cache}

The cache stores what the upstream returned, but not the decision whether it may be served. Namespace reservations, emergency blocks and the quarantine window live in the catalog. A cache entry served while the catalog is unavailable would bypass all three checks at once. That is why "downloads from the cache when the database is down" is ruled out: safety takes priority over availability.

### Primary failure with a live read replica {#replica}

While a read replica of the catalog is available, downloads are served from it: the replica holds the same reservations, blocks and version states. Publishing and management get `503` with `Retry-After` while the primary is unavailable. The console shows a read-only banner. A complete catalog failure, that is, neither primary nor replica, turns reads into `503` as well.

### The same principle in other checks {#same-principle}

- A DNS answer with even one non-public address is refused as a whole: {{< xref "features/security/egress-guard" >}}.
- If the IdP did not fit groups into the token, the roles from the token do not change: nothing is closed and nothing is opened. If `auth_time` is missing, MFA freshness is not confirmed and dangerous actions are unavailable: {{< xref "features/security/access-control" >}}.
- If the matching trust policy rules belong to more than one team, the token exchange is refused.
- A scanner failure produces evidence "analysis error" or "check missing", not "clean": {{< xref "features/security/evidence-and-scanning" >}}.
- When the upstream is unavailable, CRANE may serve a stored copy of the document ({{< term "stale-if-error" >}}), but with the same visibility checks: {{< xref "features/security/upstream-quarantine" >}}.

## Limits of the guarantee {#limits}

> [!LIMITS]
> - **The price is unavailable reads.** While the whole catalog is unavailable, builds that go through CRANE do not receive packages even from a warm cache. There is no narrow exception "serve from the cache".
> - **The mode is not switched by a setting.** The behaviour with an unavailable catalog is the same in all deployment profiles. Catalog availability is the deployment's job: a replica, failover, backups.
> - **A Valkey failure does not close reads.** The cache is not the source of truth: any Valkey error is a miss for the proxy engine. Data is not lost, and the load shifts to the upstream, not to the catalog. A silent Valkey is detected in about 1.25 seconds. This is not a skipped security check, so fail closed does not apply to it.
> - **An S3 failure closes reads partially.** Objects present in the process cache or on the CDN keep being served; everything else gets `503` with `Retry-After`, and publishing is unavailable. The failure reaches the client in about 5 seconds, not minutes.
> - **An unavailable upstream does not close reads.** CRANE serves stored documents with the same visibility checks until their retention period expires.
> - **The guarantee covers an unavailable catalog.** It does not detect wrong data inside the catalog itself.

## Related settings {#configure}

- {{< xref "features/operations/availability" >}} — degradation modes and availability targets.
- {{< xref "operations/outages" >}} — what to do when PostgreSQL, Valkey or S3 fails.
- {{< xref "deploy/valkey-cache" >}} — connecting the Valkey cache.
- {{< xref "deploy/s3-storage" >}} — S3 storage.
