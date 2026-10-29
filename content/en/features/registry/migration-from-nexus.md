---
title: "Migration from Nexus"
description: "How CRANE moves hosted packages from Nexus: a REST API crawl, SHA-256 verification, idempotent reruns and switching clients with a fresh proxy cache warm-up."
audience: [platform]
genre: explanation
state: target
status: available
weight: 90
terms: [hosted-repository, proxy-repository, digest, cas]
---

CRANE moves {{< term "hosted-repository" "hosted repositories" >}} out of Nexus through the Nexus REST API: it crawls the components, copies the files as a stream, verifies the checksums and records the versions in its own storage. The migration goes step by step, team by team, and is safe to repeat.

Only hosted packages are migrated. The cache of {{< term "proxy-repository" "proxy repositories" >}} is not migrated: CRANE fills it again from lockfiles. This page describes what is migrated, how verification works and how to switch clients.

## What is migrated {#scope}

- **Migrated:** hosted repositories, their components, files (assets) and checksums, and the metadata a format needs.
- **Not migrated:** the proxy cache. CRANE warms it again from lockfiles ({{< xref "features/registry/proxy-cache#offline" >}}).
- **Not migrated as history:** download history. It does not become usage history in CRANE.
- **There are no group repositories.** Nexus group repositories have no counterpart, because CRANE does not merge hosted and proxy under one address ({{< xref "features/security/namespace-reservation#no-groups" >}}).

Migrated versions get the `Released` state and the source `import:nexus`.

## How the migration runs {#steps}

1. **Inventory.** CRANE crawls the Nexus REST API and builds a list of hosted repositories, components, files and checksums.
2. **Transfer.** CRANE copies each file as a stream, recomputes SHA-256, compares it with the Nexus checksum and writes the file into the {{< term "cas" >}}.
3. **Metadata.** CRANE migrates the metadata a format needs.
4. **Reconciliation.** CRANE builds a report of discrepancies.
5. **Switchover.** Teams change the repository addresses in their CI templates and client configuration, and the proxy cache is warmed again.

The migration is started manually as a background worker job and keeps a log. Files are transferred in parallel, and errors are retried.

## Verification and reruns {#verify}

A file reaches the storage only after its {{< term "digest" >}} matches the Nexus checksum. How CRANE verifies digests is described in {{< xref "features/security/digest-verification" >}}.

A rerun is idempotent: CRANE skips what is already migrated and adds what is missing, so the discrepancy report can be closed by repeated runs.

## Switching clients {#cutover}

The switchover is done team by team. For each team:

1. Issue tokens with `cctl setup`, which configures clients with CRANE addresses ({{< xref "features/registry/cli#setup" >}}).
2. Replace the repository addresses in the CI templates.
3. Warm the proxy cache from the team's lockfiles: the readiness report shows what is missing from the cache ({{< xref "features/registry/proxy-cache#offline" >}}).

Migrated names become names of a hosted repository, and so internal: a proxy does not serve them from an upstream ({{< xref "features/security/namespace-reservation" >}}).

## Related pages {#related}

- {{< xref "features/registry/hosted" >}}
- {{< xref "features/registry/proxy-cache" >}}
- {{< xref "features/registry/cli" >}}
