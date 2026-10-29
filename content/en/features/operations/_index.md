---
title: "Deployment and operations"
description: "How CRANE is deployed and operated: one image, PostgreSQL as the source of truth, degradation without data loss, telemetry, backups and upgrades."
audience: [platform]
genre: explanation
state: target
status: available
weight: 40
terms: [upstream, cas]
---

CRANE is deployed as one binary and one image: from a single small virtual machine in Docker Compose to a Kubernetes cluster. State is kept in PostgreSQL, and the proxy cache and storage can be lost without losing data. Upgrades run without downtime, and telemetry is exposed in open formats.

This section describes how CRANE is built from an operations point of view and what a platform engineer can expect from it in normal operation, during failures, upgrades and recovery. Step-by-step instructions and setting values for the current deployment are in {{< xref "deploy" >}} and {{< xref "configure" >}}.

## Operating principles {#principles}

- **One source of truth.** PostgreSQL stores metadata, policies, the audit, the job queue and the outbox. Package bytes live in the {{< term "cas" >}} and never change. Valkey and the proxy cache can be lost: the content is restored from the {{< term "upstream" >}} ({{< xref "features/operations/deployment-model#source-of-truth" >}}).
- **Safety over availability.** If the catalog is unavailable, CRANE serves no packages and answers `503`: without the catalog, reservations and blocks cannot be checked ({{< xref "features/security/fail-closed" >}}).
- **Degradation, not failure.** The failure of Valkey, an upstream, the scanner, a feed or the SIEM does not stop package reads: every component has a described degradation mode ({{< xref "features/operations/availability" >}}).
- **Telemetry not tied to a stack.** CRANE exposes metrics, traces and logs in open formats ({{< xref "features/operations/observability" >}}).
- **Zero-downtime upgrades.** The migration scheme allows the old and the new version to run at the same time ({{< xref "features/operations/upgrades" >}}).
- **Backups on the deployment side.** CRANE is compatible with any consistent backup of PostgreSQL and of the storage, and restoration is verified ({{< xref "features/operations/backup-restore" >}}).

## Pages in this section {#pages}

- {{< xref "features/operations/deployment-model" >}}: process roles, two equal topologies and the S, M and L profiles.
- {{< xref "features/operations/availability" >}}: availability targets by profile and degradation modes.
- {{< xref "features/operations/observability" >}}: scrape points, metrics, logs, traces and alerts.
- {{< xref "features/operations/backup-restore" >}}: what is backed up and how restoration is verified.
- {{< xref "features/operations/upgrades" >}}: schema migrations and the upgrade version policy.

## How to deploy and configure {#next}

{{< cards "deploy/docker-compose" "deploy/kubernetes-helm" "deploy/requirements" >}}
