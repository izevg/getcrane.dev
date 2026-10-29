---
title: "Proxy and upstream cache"
description: "How a CRANE proxy repository caches public registries: a two-level cache, one upstream request per key, stale copies during failures and offline readiness."
audience: [platform, developer]
genre: explanation
state: target
status: available
weight: 20
terms: [proxy-repository, upstream, stale-if-error, blob, cas, namespace, quarantine]
---

A {{< term "proxy-repository" >}} serves clients the packages of a public registry (an {{< term "upstream" >}}) through the CRANE cache. The client talks only to CRANE. CRANE itself fetches a document or a file from the upstream, checks it and stores it, so that later requests do not reach the public registry.

The cache speeds up builds and protects against upstream unavailability, but it is not the source of truth: losing it costs time and traffic, not data ({{< xref "features/operations/deployment-model#source-of-truth" >}}). This page describes how the cache works and what happens during failures. The proxy security checks are described separately: {{< xref "features/security/upstream-quarantine" >}}, {{< xref "features/security/digest-verification" >}} and {{< xref "features/security/egress-guard" >}}.

## Request path {#request-path}

CRANE distinguishes two kinds of objects. Documents (a package's version list, an index, `maven-metadata.xml`) are small and change over time; the two-level cache holds them. Artifact files (package archives) are immutable; CRANE stores them as a {{< term "blob" >}} in the {{< term "cas" >}} under a SHA-256 digest.

```mermaid {caption="Figure 1. A simplified document path. If a copy is stale within the stale-while-revalidate window, the client gets it immediately and the refresh runs in the background."}
flowchart TB
  req["Client request"]
  l1["L1: process memory"]
  l2["L2: Valkey, shared by replicas"]
  fresh{"Is the copy fresh?"}
  up["Upstream request<br>one per key"]
  store["Store in the cache"]
  resp["Response to the client"]
  req --> l1 --> l2 --> fresh
  fresh -- "yes" --> resp
  fresh -- "no" --> up --> store --> resp
```

The first level (L1) lives in process memory. The second (L2) is shared by replicas and stored in Valkey. If Valkey is unavailable, CRANE runs on the process cache: no data is lost, and the load shifts to the upstream rather than to PostgreSQL.

## One upstream request: singleflight {#singleflight}

When several clients request the same key that is missing from the cache at the same time, CRANE sends one request to the upstream and the others wait for its result. This reduces the load on the upstream and speeds up builds where hundreds of CI jobs ask for one archive. The coalesced request metric is described in {{< xref "features/operations/observability#metrics" >}}.

> [!PLATFORM]-
> **How requests are coalesced**
>
> Inside a process, waiters share one result: hundreds of requests for one archive wait for a single byte stream. Between replicas a lock in Valkey works: the replica that takes the lock goes to the upstream, and the others wait for the cache to update; they subscribe to the invalidation channel before trying to take the lock, so a lock release is never lost. If Valkey is unavailable, replicas go to the upstream independently. This is safe because a CAS write is idempotent. The upper bound of fetches in this mode is the number of replicas per key.

## Freshness and stale-while-revalidate {#freshness}

Each kind of document has a freshness period (TTL). When it has expired but the stale-while-revalidate window has not, CRANE serves the stored copy with an `Age` header and refreshes it in the background ({{< cite "rfc-5861" >}}). The values below are starting values; they are tuned per repository.

| Object | TTL | stale-while-revalidate | Negative TTL | stale-if-error |
| --- | --- | --- | --- | --- |
| Archives and files (all formats) | does not expire | — | 5 minutes | — |
| npm packument | 5 minutes | 5 minutes | 1 minute | 7 days |
| PyPI Simple API | 10 minutes | 10 minutes | 2 minutes | 7 days |
| Maven release metadata | 6 hours | 6 hours | 10 minutes | 7 days |
| Maven SNAPSHOT metadata | 1 minute | 1 minute | 1 minute | 1 day |
| NuGet registration and flat container index | 10 minutes | 10 minutes | 2 minutes | 7 days |
| Cargo sparse index (crate file, `config.json`) | 5 minutes, conditional requests by ETag | 5 minutes | 1 minute | 7 days |

Artifact files do not expire because the record key includes the path and the digest, and the content is immutable.

Three rules affect freshness beyond the table.

- **Refresh ahead.** Any request in the last 10% of the freshness period starts a background refresh. Thanks to singleflight there is one per key.
- **Adaptive TTL.** If a document has not changed for three refreshes in a row, the period doubles up to an upper bound (8 times the original) and resets on a change.
- **Upstream hints.** The upstream `Cache-Control` header can extend the period, but not beyond the adaptive bound and not below the configured value. With `no-cache`, `no-store` and `private` the hint is ignored: CRANE confirms the document with a conditional request by ETag. The upstream usually answers `304`.

## Upstream failure: stale-if-error {#stale}

When the upstream is unavailable (a `5xx` error, a timeout, a network failure), CRANE serves the stored copy of the document ({{< term "stale-if-error" >}}, {{< cite "rfc-5861" >}}). The default period is 7 days, and 1 day for Maven SNAPSHOT metadata. The response carries an `Age` header and, for old clients, a `Warning` header. The copy passes the same visibility checks as a fresh one: how is described in {{< xref "features/security/upstream-quarantine#stale" >}}. If there is no copy, the client gets `502` with diagnostics.

Responses by which the upstream refuses to serve CRANE or reports a removal are handled separately:

- **`429` and `403`** mean rate limiting or a block. CRANE serves a stale copy for at most 24 hours after the TTL expires and no longer than the format's stale-if-error period, and marks the reason as `throttled`. Otherwise an attacker who provoked rate limiting could freeze documents for a week.
- **`410` and `451`** mean removal, including by law. CRANE handles them as `404`: it writes a negative entry and does not serve a stale copy. The original status stays in the egress log, so that a legal takedown can be told apart from an ordinary `404`.

A silent connection drop to the upstream (NAT, firewall) is detected quickly, not by the read timeout: details in {{< xref "features/operations/availability#degradation" >}}.

## Negative cache {#negative}

CRANE also remembers an upstream `404`, for a short time (the "Negative TTL" column). Repeated `404` responses for one key double the period up to 1 hour. This protects the upstream from a flood of requests, for example from a typo in a CI configuration. A name covered by a {{< term "namespace" >}} gets `404` before the cache and the upstream are consulted ({{< xref "features/security/namespace-reservation" >}}).

## Artifact size limit {#size-limit}

CRANE limits the size of a body before writing it. A document is assembled in memory with a ceiling of 64 MiB. An archive stream is cut off at the artifact size threshold (2 GiB by default) at the entrance to staging, so not a single byte beyond the limit reaches the disk. On excess the client gets `502` with the reason `too-large`, the blob is not stored, no cache entry is created and the next request goes to the upstream again.

The limit applies to one stream. N simultaneous requests for different keys can occupy up to N limits in staging. Setting: {{< xref "configure/limits" >}}.

## Visibility and checks {#visibility}

One visibility rule serves hosted and proxy repositories and applies to every request. A version that the rule does not serve (an emergency block, a manual block, the upstream {{< term "quarantine" >}} window) is removed from a document before it is cached, and a file download is checked independently of the document. For this reason a lockfile with a direct link to a file does not bypass the rule. Description and limits: {{< xref "features/security/upstream-quarantine" >}}.

Only files whose digest is verified enter the cache ({{< xref "features/security/digest-verification" >}}), and outbound requests go only to allowed hosts ({{< xref "features/security/egress-guard" >}}).

## Offline readiness and warm-up {#offline}

CRANE answers the question "will the project build without access to the upstream". A developer or CI passes a lockfile or an SBOM, and CRANE checks for every coordinate whether the document and the file are in the cache and whether the digest matches. The report contains the share of ready coordinates, the list of missing ones and the list of mismatches.

- **Input files.** `package-lock.json`, the pnpm lockfile, `yarn.lock`, `poetry.lock`, `uv.lock`, requirements with hashes, `packages.lock.json` and SBOMs in CycloneDX and SPDX are supported.
- **What is taken from the file.** Only coordinates and hashes. CRANE ignores `resolved` addresses and other URLs.
- **Warm-up.** For missing coordinates CRANE queues warm-up jobs, and a worker fills the cache.

The report and warm-up are available through the API, the `cctl readiness` and `cctl warm` commands ({{< xref "features/registry/cli#commands" >}}) and the console screen "Readiness and warm-up". After a cache loss, the same warm-up restores the content from the upstream ({{< xref "features/operations/backup-restore" >}}).

## Cache storage {#storage}

Proxy files live in the `proxy-cache` storage class: it is not included in backups, can sit on cheaper media and can have its own retention. When a package from a proxy is promoted into an internal hosted repository, CRANE copies the blob into the `primary` class ({{< xref "features/registry/hosted#promotion" >}}).

## Related pages {#related}

{{< cards "features/security/upstream-quarantine" "features/security/digest-verification" "features/operations/availability" "configure/repositories" "configure/cache" >}}
