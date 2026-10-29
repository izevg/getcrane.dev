---
title: "Operations"
description: "Tasks of a CRANE administrator: health checks, logs, upgrades and migrations, behavior when dependencies fail, backups and troubleshooting common errors."
audience: [platform]
genre: how-to
state: current
status: available
weight: 80
terms: [security-journal, fail-closed]
---

This section collects the everyday tasks of a deployment administrator and a platform engineer: check that CRANE works, read the log, upgrade the version, understand the behavior when PostgreSQL, S3, Valkey or an upstream fails, and troubleshoot an error. Every page describes the current state of the server and is checked against the code and the failure scenarios.

Two properties set the order of work. CRANE answers `503` when it cannot check a request without the catalog ({{< term "fail-closed" >}}), and it writes the {{< term "security-journal" >}} to standard output regardless of the log level. So the first sources of a diagnosis are the readiness probe and the process log.

## Tasks {#tasks}

- {{< xref "operations/health-checks" >}}: check liveness and readiness, connect the probes to Compose and external monitoring.
- {{< xref "operations/logs" >}}: read the JSON log, filter the security journal and set the log level.
- {{< xref "operations/upgrades-and-migrations" >}}: apply migrations with a separate role and upgrade the version in Compose.
- {{< xref "operations/outages" >}}: what clients see and what the administrator does when PostgreSQL, S3, Valkey and the upstream fail.
- {{< xref "operations/backup-restore" >}}: backup and restore verification (in development).
- {{< xref "operations/troubleshooting" >}}: common startup and runtime errors with the exact text and the action.

## Reference data {#reference}

The facts the tasks refer to live in the references:

- {{< xref "reference/ports-and-health" >}}: ports and probes.
- {{< xref "reference/server-cli" >}}: roles of the `crane` binary and exit codes.
- {{< xref "reference/errors" >}}: error bodies and response codes.
- {{< xref "reference/environment-variables" >}}: environment variables, including {{< env "RUST_LOG" >}}.

How CRANE is built from the operations point of view is explained in {{< xref "features/operations" >}}: availability, observability, backup and upgrades in the target state.
