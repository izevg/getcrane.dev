---
title: "Backup and restore"
description: "What CRANE backs up: PostgreSQL and immutable blobs. Any consistent backup works, and restoration is verified by reconciling the database with storage."
audience: [platform]
genre: explanation
state: target
status: available
weight: 40
terms: [blob, cas, digest, proxy-repository]
---

CRANE keeps metadata in PostgreSQL and immutable {{< term "blob" "blobs" >}} in the {{< term "cas" >}}, so any consistent PostgreSQL backup works, together with versioning, replication or Object Lock for the blob storage. These tools run on the deployment side and are compatible with CRANE.

CRANE does not ship ready-made backup profiles and does not configure them: the configuration of each enterprise and its infrastructure budget differ greatly. What CRANE does provide is a way to check that a restoration succeeded: every file in the database has a blob with a correct SHA-256.

## What is backed up {#what}

| Data | What fits (on the deployment side) | Verification |
| --- | --- | --- |
| PostgreSQL | pgBackRest: full and incremental backups and a continuous WAL archive in a separate bucket with point-in-time recovery (PITR). Volume snapshots and managed cloud backups also fit | Regular restoration into an isolated instance (recommended) |
| Blobs | They are immutable, so replicating the bucket or copying new objects (for example, with rclone) is enough; versioning and Object Lock fit. The `proxy-cache` class is not backed up, and the `restricted` class is backed up separately in its own perimeter | The restore verification command: every file in the database has a blob with a correct SHA-256 |
| Configuration | Helm values and Compose files in Git; secrets in the organization's secret store | — |

A blob is immutable, so it is enough to copy new objects. The cache of {{< term "proxy-repository" "proxy repositories" >}} (the `proxy-cache` class) is not backed up, because it is restored by warm-up ({{< xref "features/registry/proxy-cache#offline" >}}).

## Verified restoration {#restore-verify}

A backup counts as working when a system has been restored from it and checked. The `crane restore verify` command reconciles the restored database with the blob storage: for every file (asset) in the database there must be a blob with a correct SHA-256, and discrepancies go into a report. The command also covers proxy objects: they are recorded in the catalog the same way as publications.

The reconciliation relies on how CRANE is built: a blob lies under its {{< term "digest" >}}, so an integrity check comes down to recomputing the hash ({{< xref "features/security/digest-verification" >}}).

## Restoration procedure {#procedure}

1. Restore PostgreSQL from the backup into an isolated instance, to the required moment if PITR is used.
2. Attach the blob storage: the original bucket, its replica or the required version.
3. Run `crane restore verify`. Eliminate the discrepancies between metadata and blobs before switching traffic.
4. Switch CRANE to the restored PostgreSQL and storage. Warm the `proxy-cache` class cache again.

The targets for data loss and recovery time depend on the profile and are given in {{< xref "features/operations/availability#slo" >}}.

## What CRANE does not do {#not-done}

- CRANE does not ship or configure backup tools for PostgreSQL and the storage.
- CRANE does not back up the `proxy-cache` class.
- Backups of configuration and secrets stay on the organization's side.

## Related pages {#related}

{{< cards "features/operations/availability" "features/operations/upgrades" "features/registry/proxy-cache" >}}
