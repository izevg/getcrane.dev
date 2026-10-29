---
title: "Availability and degradation"
description: "CRANE availability targets for profiles S, M and L, durability versus availability, and degradation modes when PostgreSQL, Valkey, an upstream or S3 fails."
audience: [platform, security]
genre: explanation
state: target
status: available
weight: 20
terms: [fail-closed, stale-if-error, quarantine, namespace, siem, cas]
---

CRANE distinguishes the durability of data from the availability of the service. Durability is achievable almost without limits: storage with erasure coding and SHA-256 verification rule out the loss and silent corruption of files. Availability is limited by the architecture: the realistic target for downloads in profile L is 99.99% in a single region with three zones.

This page describes the targets by profile and CRANE's behavior when each component fails. The figures are design targets, not commitments. When a component fails, CRANE degrades by the described rules, and if a security check suffers, it chooses safety: {{< xref "features/security/fail-closed" >}}.

## Durability and availability {#durability}

"Nine nines" are achievable for durability and unachievable for availability. 99.9999999% availability means about 32 milliseconds of downtime a year, and cloud providers do not promise such a level either (usually 99.9–99.99%).

- **Durability** of package bytes is provided by S3 storage with erasure coding (11 nines) and a {{< term "cas" >}} with SHA-256 verification. A substituted or damaged file is caught by digest verification ({{< xref "features/security/digest-verification" >}}).
- **Availability** depends on PostgreSQL, because every request is checked against the catalog.

## Reads and writes {#classes}

Operations fall into two classes with different achievable availability.

- **Reads (package downloads)** are critical for builds. Stateless replicas serve them from the cache and the storage. Every request is checked against the catalog: {{< term "namespace" >}} reservations, emergency blocks and {{< term "quarantine" >}}. So reads survive the failure of the PostgreSQL primary as long as a catalog read replica is available. If there is no catalog at all, a read gets `503`.
- **Writes (publishing and management)** need the primary. While a failover runs, which takes 10–30 seconds, clients get `503` with the `Retry-After: 10` header. Standard clients and CI templates repeat the request.

## Targets by profile {#slo}

The S, M and L profiles are described in {{< xref "features/operations/deployment-model#profiles" >}}.

| Metric | S | M | L |
| --- | --- | --- | --- |
| Download availability | 99.5% (one VM) | 99.9% | 99.99% (3 zones) |
| Publish availability | 99.5% | 99.9% | 99.95% |
| p99 metadata on a cache hit (server side) | < 20 ms | < 10 ms | < 10 ms |
| p99 time to first byte of a blob from the cache | < 50 ms | < 30 ms | < 30 ms |
| Metadata RPO | ≤ 24 h (snapshot) or ≤ 5 min (WAL) | ≤ 1 min (WAL archive) | 0 (synchronous replica) |
| RTO | ≤ 4 h | ≤ 1 h | ≤ 1 min (failover), ≤ 4 h (disaster recovery) |
| Blob durability | depends on the disk | ≥ 99.999999999% (S3 with EC) | ≥ 99.999999999% (S3 with EC) |
| Vulnerability detection time (advisory in a feed → finding) | ≤ 60 min | ≤ 15 min | ≤ 15 min |
| {{< term "siem" >}} export lag | ≤ 15 min | ≤ 5 min | ≤ 5 min |

Credential revocation takes effect on all replicas typically within 5 seconds (by an invalidation event) and is guaranteed within 30 seconds (by the cache TTL) in all profiles.

## Degradation modes {#degradation}

The table describes what happens when a component fails and what keeps working.

| Failure | CRANE behavior |
| --- | --- |
| PostgreSQL primary, a read replica is available | Downloads are served from the replica. Publishing and management answer `503` with `Retry-After`. The console shows a read-only banner |
| The whole PostgreSQL catalog is unavailable | All protocol requests, including cache hits and proxy, get `503` with `Retry-After`. There are no fetches from the upstream. A violated internal invariant stays a `500` response: repeating such a request is pointless |
| Valkey | The cache moves to process memory, and no data is lost. The load shifts to the upstream, not to PostgreSQL. Coalescing of fetches across replicas disappears and stays within a process: a key gets no more fetches than there are replicas. A silent connection is detected in about a second, and the staleness of the process cache from a missed invalidation is bounded by 30 seconds |
| Upstream | CRANE serves stored metadata ({{< term "stale-if-error" >}}) up to the configured period, 7 days by default, with age headers. On `429` and `403` the period is at most 24 hours, and on `410` and `451` a stale copy is not served. The offline readiness report shows what builds without the upstream ({{< xref "features/registry/proxy-cache#stale" >}}) |
| A silent drop of the upstream connection (NAT, firewall) | CRANE sends an HTTP/2 PING every 15 seconds, including on an idle connection. If there is no reply within 10 seconds, the connection is closed and the next request opens a new one. A dead connection is noticed in about 25 seconds instead of holding requests until the read timeout. For HTTP/1.1, a connection idle in the pool for more than 30 seconds is not reused |
| Trivy | Checks get the status "analysis error" or "check missing". The policy defines promotion behavior: promotion is blocked by default, downloads are not. Advisory matching keeps working |
| A vulnerability feed | The last loaded state is used. An event about the feed lag goes to the SIEM and an alert fires; the other feeds keep working |
| The scoring model | Priority and license decisions are computed by rules (CVSS, EPSS, KEV, SPDX category). P0 priority for KEV and malicious packages does not depend on the model |
| A language model | No explanations and assistants, search works lexically, the A2A agent answers with structured data |
| SIEM | Events accumulate in the outbox, and export continues from the cursor after recovery. The audit is not lost |
| S3 | Downloading what is in the process cache or on a CDN continues. Everything else gets `503 Retry-After`, and publishing is unavailable. An S3 failure reaches the client in about 5 seconds, not in minutes |

## Safety over availability {#fail-closed}

The row about the unavailable catalog describes a deliberate choice. Without the catalog, CRANE cannot check namespace reservations, emergency blocks and quarantine, and serving a name from the upstream or the cache without these checks would open the way to typosquatting and dependency confusion. So CRANE answers `503` instead of letting the request through ({{< term "fail-closed" >}}). The price of this choice is that reads are unavailable when the catalog fails. The guarantee and its limits are described in {{< xref "features/security/fail-closed" >}}.

## How clients and people learn about degradation {#signals}

- Clients get `503` with `Retry-After`, and for stale proxy responses, the `Age` header.
- The status endpoint reports the mode (`normal`, `read-only` or `degraded`), the state of components and feeds, and the SIEM export lag.
- The console shows banners for read-only and degraded modes.
- Alerts (loss of download availability, read-only mode, an unavailable upstream, feed and SIEM lag) are described in {{< xref "features/operations/observability#alerts" >}}.

## Related pages {#related}

{{< cards "features/operations/deployment-model" "features/operations/observability" "features/operations/backup-restore" "deploy/requirements" >}}
