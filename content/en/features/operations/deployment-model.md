---
title: "Deployment model"
description: "CRANE is one binary and one image with process roles, PostgreSQL as the single source of truth and two equal topologies: Docker Compose and Kubernetes."
audience: [platform]
genre: explanation
state: target
status: available
weight: 10
terms: [quarantine, cas, blob, upstream, fail-closed, dependency-confusion, typosquatting]
---

CRANE is built as a modular monolith: one binary and one image run in different process roles. State lives in PostgreSQL, and Valkey and the proxy S3 cache can be lost without losing data. The same image, the same configuration and the same migrations work in Docker Compose on a single node and in Kubernetes; only the topology and the replica count differ.

Security sets the limits of this model. When the PostgreSQL catalog is unavailable, CRANE serves packages neither from the cache nor from the {{< term "upstream" >}}; it answers `503`. Without the catalog, reservations, emergency blocks and {{< term "quarantine" >}} cannot be checked.

## One image, several roles {#roles}

A launch argument selects the role. Roles give the same independent scaling as separate services, without distributed transactions and a dozen deployments.

| Role | What it does | Scaling |
| --- | --- | --- |
| `serve` | The API: the protocols of five formats, the REST API, SPA delivery, authentication and authorization, the hot download path. Holds no state | Replicas by request rate and CPU |
| `worker` | Background jobs from the PostgreSQL queue: vulnerability feed sync, SIEM export, scans, indexing, GC, retention, webhooks, rescans, cache warm-up, Nexus import | Replicas by queue length |
| `all` | `serve` and `worker` in one process; the single-node role | One container |
| `migrate` | A one-shot schema migration. A lock prevents two migrations from running at once | One run per upgrade |
| `analyze` | An isolated sandbox: unpacking untrusted archives with limits, extracting metadata and license files, generating SBOMs. No network except Trivy; read-only file system | A pool, by queue |
| `healthcheck` | The readiness probe for the container: the image needs no `curl` | Not applicable |

## Modular monolith {#monolith}

The registry domain is compact, and the hot path "authorization, cache, file delivery" gains from having no network hops. For this reason CRANE runs as a single process with strict module boundaries. Crates map to the layers of the hexagonal architecture, and bounded contexts map to modules inside the layers. Modules communicate through traits and domain events.

The core depends only on the interfaces of storage, cache, job queue and scanner. Package formats, storage backends and integrations are built into the binary as implementations of those interfaces. There is no dynamic code loading and no API for third-party extensions: the attack surface and the support surface stay smaller.

## PostgreSQL as the single source of truth {#source-of-truth}

PostgreSQL 17+ with the pgvector and pg_trgm extensions stores metadata, policies, the audit, the outbox for external delivery and the job queue. Transactions make publishing atomic, and full-text and vector search need no separate search cluster.

The job queue and the outbox live in PostgreSQL, so the minimal profile needs no message broker.

Package bytes ({{< term "blob" "blobs" >}}) live in the {{< term "cas" >}} under their SHA-256 and never change. Valkey (metadata cache, fetch coordination, rate limiting, invalidations) and the proxy cache in S3 can be lost without losing data: their content is restored from the upstream.

- **Valkey failure.** CRANE falls back to the in-process cache. The load shifts to the upstream, not to PostgreSQL. Cross-replica fetch coordination disappears, and fetch merging inside a process remains.
- **S3 failure.** Downloads of what is in the process cache or on a CDN continue. All other requests get `503 Retry-After`, and publishing is unavailable.
- **Catalog failure.** Every protocol request, including cache and proxy reads, gets `503 Retry-After`, and nothing is fetched from the upstream. This is {{< term "fail-closed" >}}: serving a name from the upstream or the cache without checking reservations would open the door to {{< term "dependency-confusion" >}} and {{< term "typosquatting" >}}. More: {{< xref "features/security/fail-closed" >}}.

## Profiles S, M and L {#profiles}

One image covers profiles from a single small VM to a cluster. In profile S every external dependency except PostgreSQL is optional.

The figures in the table are planning guidelines. They are neither guarantees nor minimum requirements. The current defaults are described in {{< xref "deploy/requirements#resources" >}}.

| Component | S · single node | M · single node or Kubernetes | L · Kubernetes, 3 zones |
| --- | --- | --- | --- |
| CRANE api | 1 container: 1–2 vCPU, 0.5–1 GB | 2 × (2 vCPU, 1 GB) | 6–12 × (4 vCPU, 2–4 GB) |
| CRANE worker | in the `all` role | 2 × (1 vCPU, 1 GB) | 4–8 × (2 vCPU, 2 GB) |
| Analyzer and Trivy | optional: 1 vCPU, 2 GB | 2 × (2 vCPU, 4 GB) | 4–8 × (2 vCPU, 4 GB) |
| PostgreSQL | 1 vCPU, 1 GB | 4 vCPU, 16 GB and a replica | 3 × (16 vCPU, 64 GB), NVMe |
| Valkey | not required | 1 × 2 GB | 3 × (2 vCPU, 8 GB) |
| Blob storage | local disk, 50–200 GB | S3, 2–10 TB | S3 with erasure coding, 100–500 TB |
| Compute total | 2 vCPU / 4 GB | about 16 vCPU / 48 GB | about 120–180 vCPU / about 350 GB |

In profile L most of the CPU goes to PostgreSQL, scanning and storage. The API replicas themselves take 24–48 vCPU.

## Two equal topologies {#topologies}

Docker Compose and Kubernetes are supported equally. They share the image, the configuration (a TOML file and environment variables) and the migrations.

### Docker Compose on a single node {#compose}

The diagram shows the target topology, including the analyzer and Trivy. What ships today: {{< xref "deploy/docker-compose" >}}.

```mermaid {caption="Figure 1. The target single-node topology: the minimal variant consists of caddy, crane, PostgreSQL and a local volume."}
flowchart LR
  clients["Clients, CI"]
  subgraph host["Host: Docker Compose"]
    caddy["caddy<br>TLS, ACME or your own certificate"]
    crane["crane<br>all role: serve + worker"]
    analyzer["crane-analyzer<br>analyze role, no network"]
    pg[("PostgreSQL 17+<br>with pgvector")]
    valkey[("valkey<br>optional in profile S")]
    blobs[("SeaweedFS, RustFS<br>or the /data/blobs volume")]
    trivy["Trivy server<br>optional"]
  end
  clients --> caddy --> crane
  crane --> pg
  crane --> valkey
  crane --> blobs
  crane --> analyzer
  analyzer --> trivy
```

Caddy terminates TLS and forwards requests to `crane` over a shared network whose address belongs to the trusted proxy list. Secrets live in files, not in environment variables. Valkey requires authentication and sits in a network with no outbound access, where only `crane` is present besides it. The analyzer runs in a separate network where only Trivy is reachable.

### Kubernetes {#kubernetes}

The diagram shows the target topology. Deployment to Kubernetes with a Helm chart is currently in development: {{< xref "deploy/kubernetes-helm" >}}.

```mermaid {caption="Figure 2. The target Kubernetes topology: every stateful component can be an external managed service of the organization."}
flowchart TB
  gateway["Gateway API<br>Envoy Gateway, Traefik, Cilium"]
  subgraph namespace["namespace crane"]
    api["Deployment api<br>3..N replicas, HPA by RPS and CPU<br>topology spread by zone, PDB"]
    worker["Deployment worker<br>2..N, KEDA or HPA by queue length"]
    analyzer["Deployment analyzer<br>restricted PSS, NetworkPolicy deny-all except Trivy"]
    migrate["Job migrate<br>pre-upgrade hook"]
    pgbouncer["PgBouncer"]
  end
  subgraph data["Data"]
    pg[("PostgreSQL<br>Percona or CloudNativePG<br>1 primary and 2 sync replicas")]
    valkey[("Valkey<br>3-node Sentinel or Cluster")]
    s3[("S3<br>SeaweedFS, RustFS, Ceph, cloud")]
  end
  observability["VictoriaMetrics, VictoriaLogs, Jaeger,<br>Perses or an existing stack"]
  gateway --> api
  api --> pgbouncer --> pg
  worker --> pgbouncer
  api --> valkey
  worker --> valkey
  api --> s3
  worker --> s3
  worker --> analyzer
  api -.-> observability
  worker -.-> observability
```

The api replicas hold no state and scale by request rate and CPU; the worker replicas scale by queue length. A `Job` with a `pre-upgrade` hook runs the migrations. Valkey is isolated by NetworkPolicies and protected by a password from a `Secret`.

If the ingress controller is listed among the trusted proxies, it overwrites or removes the `X-Request-Id` sent by the client and appends its peer address to the end of `X-Forwarded-For`. Otherwise a client would supply its own request identifier and address.

## Upgrades without downtime {#upgrades}

Schema migrations follow the expand, migrate, contract pattern: the new application version works with both the old and the new schema. For this reason a rolling update needs no downtime. A separate `migrate` role runs the migrations: a `pre-upgrade` hook in Kubernetes and a one-shot service in Compose.

## Related pages {#related}

- {{< xref "deploy/docker-compose" >}}
- {{< xref "deploy/kubernetes-helm" >}}
- {{< xref "features/operations/availability" >}}
- {{< xref "features/operations/upgrades" >}}
