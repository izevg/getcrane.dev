---
title: "Core concepts"
description: "Hosted and proxy repositories, upstream, namespace, versions and their states, blob and CAS, teams, principals and tokens: the vocabulary CRANE is built on."
audience: [developer, platform]
genre: explanation
state: target
status: available
weight: 30
terms: [hosted-repository, proxy-repository, upstream, namespace, dependency-confusion, yank, tombstone, quarantine, blob, cas, digest, principal, workspace, oidc, bootstrap-token]
---

This page explains the concepts behind repositories, versions, storage and access in CRANE. Each concept takes one to three paragraphs and links to a page with the details.

The concepts run from what a client sees (repositories and names) to how CRANE stores bytes and decides who may receive them.

## Hosted and proxy repositories {#repositories}

A {{< term "hosted-repository" >}} is where teams publish their own packages. CRANE is the source of truth for these packages. A {{< term "proxy-repository" >}} serves packages from a public registry through the CRANE cache: the client talks to CRANE, and CRANE fetches the package itself and applies security checks.

A repository belongs to one package format: Cargo, npm, PyPI, Maven or NuGet. A client connects to it the standard way of its ecosystem.

Details: {{< xref "features/registry/hosted" >}}, {{< xref "features/registry/proxy-cache" >}}.

## Upstream {#upstream}

An {{< term "upstream" >}} is a public registry that CRANE proxies: crates.io, registry.npmjs.org, PyPI, Maven Central, nuget.org. Clients never contact the upstream. CRANE sends the outgoing requests itself, only to allowed hosts, with control over redirects, sizes and timeouts.

Details: {{< xref "features/security/egress-guard" >}}, {{< xref "features/registry/proxy-cache" >}}.

## Namespace {#namespace}

A {{< term "namespace" >}} reserves a package name or a name prefix within a format for a team. A name covered by a namespace is internal and is never served from an upstream: a proxy repository answers `404` for it before it touches the cache or the upstream, and it does not reveal why.

Any name that is already published to a hosted repository of the format is internal too. So the first publication of a new name becomes its reservation. If the name already exists in the upstream, CRANE refuses the publication. This is how CRANE closes the {{< term "dependency-confusion" >}} attack.

Details: {{< xref "features/security/namespace-reservation" >}}.

## Version and its states {#version}

A package version is immutable: a published release cannot be overwritten. A version moves through lifecycle states, and the state decides whether a client can see it.

```mermaid {caption="The lifecycle of a package version: from upload to release, hiding and deletion."}
stateDiagram-v2
  direction TB
  [*] --> Staging: upload starts
  Staging --> [*]: aborted or wrong digest
  Staging --> Quarantined: commit, digest verified
  Quarantined --> Released: checks passed and approval
  Quarantined --> Blocked: policy forbids
  Released --> Blocked: new risk and an explicit rule
  Blocked --> Released: exception or fix
  Released --> Deleted: deletion by format semantics
  Quarantined --> Deleted
  Deleted --> [*]
```

- `Staging`: the upload is in progress. Clients cannot see the version.
- `Quarantined`: the version is accepted and waits for checks and approval. This is a state of the version in the catalog, not the {{< term "quarantine" >}} window after a publication in an upstream.
- `Released`: the version is available to clients.
- `Blocked`: a policy or an explicit rule forbids serving it. An exception or a fix returns the version from this state.
- `Deleted`: the bytes are no longer served. A {{< term "tombstone" >}} remains, and the version number cannot be taken again.

For development repositories, a policy can skip `Quarantined`.

The state is independent of format flags: `yanked` for Cargo and PyPI, `unlisted` for NuGet, `deprecated` for npm and NuGet, dist-tags for npm. A {{< term "yank" >}} hides a version from dependency resolution but keeps it available by its exact number, and the action is reversible. Deletion is not reversible. How each format hides and deletes versions is described on the formats page.

Details: {{< xref "features/security/immutable-versions" >}}, {{< xref "features/registry/formats" >}}.

## Blob and CAS {#blob-cas}

A {{< term "blob" >}} is the bytes of a single package file. CRANE stores a blob in {{< term "cas" >}} under its SHA-256 digest and never changes it. Identical files are stored once, and a changed file gets a different address.

CRANE computes the {{< term "digest" >}} while it receives a file and compares it with the declared hash when one is declared. A blob enters the CAS only after this check.

Details: {{< xref "features/security/digest-verification" >}}.

## Storage is separate from visibility {#storage-visibility}

Bytes in the CAS do not change. Whether a client can get a version is decided by the version state and by policies. Blocking and restoring a version change metadata, not bytes. Moving a version from checks to release (promotion) works the same way.

One visibility rule applies to hosted and proxy repositories on every request, including a direct file download from a lockfile. So a blocked version is served neither from a fresh nor from a stale cache.

Details: {{< xref "features/security/immutable-versions" >}}, {{< xref "features/security/digest-verification" >}}.

## Principal and team {#principal-team}

A {{< term "principal" >}} is the party on whose behalf CRANE performs an action: a human, a robot or a workload such as a CI job. Every access decision is made for a principal.

A {{< term "workspace" >}} is the unit of ownership and membership. It owns namespaces, packages, repositories and robots, and people are its members. There is no separate "team" entity: in the API and in configuration it is called `workspace`.

Details: {{< xref "features/registry/teams-and-ownership" >}}, {{< xref "features/security/access-control" >}}.

## Tokens {#tokens}

People sign in to CRANE only through an {{< term "oidc" >}} provider. Package managers cannot complete such a sign-in, so CRANE issues them its own tokens bound to an identity. Rights are not embedded in a token: every request is authorized again against the current roles.

The prefix shows the token type. `crp_` is a developer's personal token. `crr_` is a robot token. `crci_` is a short-lived CI job token that CRANE issues in exchange for a platform token. `crb_` is a {{< term "bootstrap-token" >}}; it opens only the first-run wizard.

Details: {{< xref "features/security/secrets" >}}, {{< xref "features/security/access-control" >}}. The access token of the current deployment is described on {{< xref "configure/access-token" >}}.
