---
title: "Observability"
description: "What CRANE exposes for monitoring: metrics, JSON logs, OTLP traces, readiness probes, SLOs and error budget burn rate alerts, with no tie to a stack."
audience: [platform]
genre: explanation
state: target
status: available
weight: 30
terms: [security-journal, siem]
---

CRANE exposes telemetry only in open formats: Prometheus and OpenMetrics metrics, OTLP traces and logs, JSON logs on stdout. It is not tied to a specific stack: VictoriaMetrics, Prometheus, Jaeger, VictoriaLogs, any OpenTelemetry Collector or the organization's existing stack all fit. Telemetry does not affect request processing.

This page describes where to collect data, which metrics exist, what goes into logs and traces and how SLOs and alerts are built. Setting values and ports of the current deployment are described in {{< xref "deploy" >}}.

## Scrape points {#endpoints}

| Point | Purpose | Who can reach it |
| --- | --- | --- |
| `GET /metrics` | OpenMetrics metrics with exemplars (`trace_id`) | Only from the monitoring network; Helm provides a ServiceMonitor and a PodMonitor |
| `GET /healthz/live` | The process is alive and the event loop is not hung | Kubelet |
| `GET /healthz/ready` | Ready to accept traffic: PostgreSQL and the storage are available. Valkey and upstreams do not affect readiness | Kubelet, load balancer |
| `GET /healthz/startup` | Migrations are applied, caches are warmed | Kubelet |
| `GET /api/v1/status` | Version, mode (`normal`, `read-only`, `degraded`), state of components and feeds, SIEM export lag | Users, `cctl diag`, external status pages |
| OTLP | Traces, logs and optionally metrics to an OpenTelemetry Collector over gRPC or HTTP | Outbound; the address and headers are set |

Metrics and health probes are served on a service port separate from the main one.

## Metrics {#metrics}

All metrics have the `crane_` prefix. Durations are in seconds, sizes in bytes. The table lists the groups and typical metrics; the full catalog is in the reference ({{< xref "reference/metrics" >}}).

| Group | Example metrics |
| --- | --- |
| Protocols and API | Request count, duration (histogram), in-flight requests, response size; labels format, operation, status class |
| Cache and proxy | Cache requests by layer and result (hit, miss, stale), coalesced requests, upstream requests and their duration, an upstream availability flag |
| Publishing and storage | Publications and their size, blob count and size, volume reclaimed by garbage collection, integrity failures, moves between stores, quota usage |
| Downloads | Downloads and bytes by source (hosted, hit, stale, miss, coalesced) and team; metadata requests separately |
| Access | Authorization decisions, authentication failures, authorization epoch resets, tokens about to expire |
| Queues and events | Jobs in the queue, the age of the oldest, dead jobs, duration, outbox lag, webhook deliveries |
| Vulnerabilities | Open findings, SLA breaches, ingested advisories, feed lag, detection time, active emergency blocks, scanner database age |
| AI and scoring | Model requests, duration, tokens, the share of fallback providers, score distribution, overrides |
| A2A | Tasks, confirmations and duration |
| SIEM | Events and export lag |
| Dependencies and runtime | Database connection pool, query duration, Valkey errors, S3 request duration, runtime load, build information |

### Cardinality budget {#cardinality}

Package names, users, IP addresses and tokens never become labels. Labels by team are limited to the largest teams (ten by default), the rest go to the `other` bucket, and unassigned downloads go to the `none` bucket. A package, a version, a principal, a token and an IP are never labels. The target is at most 5000 series per replica; the current value is visible in the `crane_metric_series` metric.

## Logs {#logs}

- **Format.** JSON on stdout, one line per event. Required fields: time, level, message, target, `request_id`, `trace_id`, `span_id`. For requests, the format, operation, status, duration, principal kind (human, robot, agent), team and the rule on a denial are added.
- **Streams.** The `stream` field separates the application log from the access log. The access log is operational: errors are written to it at 100%, and successful downloads are thinned out (10% are kept by default) so that CI traffic does not drown the logs.
- **Proxy fields.** A proxy access log line has where the response came from (`hit`, `miss`, `stale`, `stale-on-error`), why the upstream refused (`refused`, `unavailable`, `throttled`, `digest-mismatch`, `too-large`) and the reason. The response carries the `Age` header and, for old clients, `Warning`. The client itself gets only "upstream unavailable".
- **Outbound requests.** Every real fetch from an upstream is written as a separate line in the {{< term "security-journal" >}}: host, path without the query, status or refusal reason, time to headers. There are no headers, bodies or ETags in the line. A request served from the cache or joined to someone else's fetch produces no line, so the number of lines shows the real traffic to the upstream ({{< xref "features/security/egress-guard#journal" >}}).
- **The audit is not the application log.** People's actions and access decisions go to the immutable audit and to the {{< term "siem" >}}, not to the application log: they have different delivery and retention guarantees. The full record of downloads is kept as a separate stream ({{< xref "features/security/security-journal" >}}).
- **Redaction.** Secrets do not implement log output at the type level, and an extra filter removes known token formats and `Authorization` headers.

## Tracing {#tracing}

CRANE exports traces over OTLP and propagates context with W3C Trace Context ({{< cite "w3c-trace-context" >}}). An incoming `traceparent` from CI and external agents is accepted, and tracing headers are not sent to public upstreams.

- **Spans:** protocol request handling, the authorization decision, cache lookup, upstream fetch, blob read and write, a database query, job execution, AI scoring and generation, SIEM delivery, an A2A task. The team attribute holds the slug of the attribution team; there are no identifiers of people in traces.
- **Sampling.** Parent-based, 1% by default, while errors and slow requests are kept in full (tail sampling in the Collector).
- **Exemplars** link histogram points to traces.

## SLOs and alerts {#alerts}

SLIs are computed from metrics. Alerts are built on the burn rate of the error budget in two windows: the fast window catches acute outages, the slow one catches smoldering ones. The targets are described in {{< xref "features/operations/availability#slo" >}}.

| Alert | Condition | Severity |
| --- | --- | --- |
| `CraneDownloadErrorBudgetBurn` | The download availability budget burns 14.4 times faster than normal over 1 hour and 5 minutes | page |
| `CraneMetadataLatencyHigh` | p99 metadata on a cache hit above the SLO for 15 minutes | page |
| `CraneReadOnlyMode` | The service is in read-only mode for more than 5 minutes | page |
| `CraneUpstreamDown` | An upstream is unavailable for 10 minutes | ticket |
| `CraneQueueBacklog` | The age of the oldest job exceeds 10 minutes | ticket |
| `CraneJobDeadGrowth` | The number of dead jobs grows over 15 minutes | ticket |
| `CraneOutboxLag` | The external delivery outbox lag exceeds 5 minutes | page |
| `CraneFeedLagging` | A vulnerability feed has not synced for 30 minutes | page |
| `CraneP0WithoutAction` | A P0 has been open for more than an hour without a block or a decision | page |
| `CraneVulnDbStale` | The scanner database is older than 24 hours | ticket |
| `CraneSiemExportLag` | The SIEM export lag exceeds 5 minutes | page |
| `CraneIntegrityFailure` | Any blob with a wrong SHA-256 | page |
| `CraneScoreDrift` | The distribution of model scores has shifted from the baseline week | ticket |

The rules ship as a PrometheusRule in the Helm chart and as a separate YAML for other systems.

## Dashboards {#dashboards}

Perses dashboards and their JSON versions for compatible systems ship with CRANE: "Overview and SLO", "Protocols", "Proxy and upstream", "Storage and GC", "Queues and outbox", "Security: findings, SLA, feeds", "AI, scoring and A2A", "SIEM export", "PostgreSQL and Valkey". Each panel links to the matching section of the operations runbook.

## Related pages {#related}

- {{< xref "features/operations/availability" >}}
- {{< xref "features/security/security-journal" >}}
- {{< xref "deploy/kubernetes-helm" >}}
