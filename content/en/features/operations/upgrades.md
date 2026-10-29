---
title: "Zero-downtime upgrades"
description: "How CRANE upgrades without downtime: expand, migrate, contract migrations, a separate migrate role with a lock against parallel runs, and the version policy."
audience: [platform]
genre: explanation
state: target
status: available
weight: 50
terms: []
---

CRANE upgrades without downtime. Database schema migrations follow the expand, migrate, contract scheme: the new application version works with both the old and the new schema, so a rolling update needs no stop. A separate process role runs the migrations, and a lock prevents two migrations from starting at once.

This page explains how an upgrade works and describes the supported upgrade paths. Step-by-step instructions for the current deployment are in {{< xref "deploy/docker-compose" >}} and {{< xref "deploy/kubernetes-helm" >}}.

## Expand, migrate, contract {#expand-migrate-contract}

The scheme splits a database change into three steps, between which the system stays operational.

- **Expand.** A migration adds new structures so that they do not interfere with the current application version.
- **Migrate.** Data moves into the new structures.
- **Contract.** When no replica uses the old structures any more, a migration removes them.

The new application version is compatible with both the old and the new schema. For this reason, during a rolling update old and new replicas run at the same time. API replicas hold no state and are replaced gradually, and in Kubernetes a PodDisruptionBudget keeps part of the replicas available ({{< xref "features/operations/deployment-model#kubernetes" >}}).

## A separate migrate role {#migrate-role}

A separate process role, `migrate`, runs the migrations, not an API replica or a worker ({{< xref "features/operations/deployment-model#roles" >}}).

- In Kubernetes it is a `Job` started by the `pre-upgrade` hook.
- In Docker Compose it is a one-shot service.

The `startup` probe reports that migrations are applied and caches are warmed ({{< xref "features/operations/observability#endpoints" >}}).

## Lock {#lock}

The `migrate` role uses a PostgreSQL advisory lock. While the lock is held, a second migration does not start.

## Upgrade version policy {#version-policy}

- Upgrading across one minor version is supported.
- Major versions have a documented upgrade path. CRANE verifies it in CI against a snapshot of the real schema.

## Related pages {#related}

- {{< xref "features/operations/deployment-model" >}}
- {{< xref "features/operations/backup-restore" >}}
- {{< xref "deploy/kubernetes-helm" >}}
- {{< xref "deploy/docker-compose" >}}
