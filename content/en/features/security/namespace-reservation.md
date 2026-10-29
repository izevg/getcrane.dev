---
title: "Namespace reservation"
description: "How CRANE stops a public package from replacing an internal one (dependency confusion) and where the limits of that protection lie."
audience: [developer, platform, security]
genre: explanation
state: target
status: available
weight: 50
terms: [namespace, dependency-confusion, hosted-repository, proxy-repository, upstream, workspace, step-up, security-journal, tombstone, fail-closed]
---

CRANE never serves from a public {{< term "upstream" >}} a package whose name is considered internal. Any proxy answers a request for such a name with `404`, without consulting the cache or the upstream. This closes {{< term "dependency-confusion" >}}: a public package with an internal name cannot replace the internal one.

A name becomes internal in two ways: a {{< term "namespace" >}} covers it, or it is already published in a hosted repository. The first publication of a new name reserves it by itself.

## Threat {#threat}

A company keeps an internal package `acme-billing`. An attacker publishes a package with the same name and a higher version in a public registry. A package manager configured with several sources picks the highest version, and foreign code lands in the build. {{< cite "birsan-dependency-confusion" >}} described the attack. Clients such as pip with `--extra-index-url`, NuGet and Maven with `maven-metadata.xml` can merge versions from several indexes, so the order of sources cannot be the defense.

## Guarantee {#guarantee}

- **The invariant.** An internal name is never served from an upstream.
- A proxy of any format answers an internal name with `404` before it touches the cache or the upstream, and does not reveal the reason: hidden is indistinguishable from not found.
- Every such refusal is written to the {{< term "security-journal" >}}, and the SIEM rule "Dependency confusion reconnaissance" is built on it.
- A hosted repository does not accept a name that is taken in a public registry or belongs to another team.
- A reservation is never lifted implicitly.

## How it works {#mechanism}

### What counts as internal {#internal}

A name (a format and a normalized name) is internal if either condition holds:

1. a namespace of that format covers it;
2. a package row with that name exists in any hosted repository of that format.

The second condition means that the first publication to a {{< term "hosted-repository" >}} is itself the reservation: the package row is created by the same transaction as the first version. Package rows are never deleted: versions keep only a {{< term "tombstone" >}}. The protection applies to a format, not to a particular {{< term "proxy-repository" >}}.

### Patterns and normalization {#patterns}

A namespace pattern is an exact name or a prefix with a single `*` at the end, right after the format's separator; the prefix base is not empty. So `acme-*` does not cover `acmecorp`, and `com.acme.*` does not cover `com.acmecorp:x`. Names are normalized by the format's rules:

| Format | Normalization | Prefix | Separator |
| --- | --- | --- | --- |
| Cargo | lowercase, `-` ≡ `_` (stored as `_`) | `acme-*` → `acme_*` | `-` or `_` |
| PyPI | {{< cite "pep-503" >}}: lowercase, runs of `-_.` → `-` | `acme-*` | `-` |
| Maven | case is preserved; the name is `groupId:artifactId` | by groupId only: `com.acme.*` covers groupId `com.acme` and `com.acme.*` | `.` |
| NuGet | lowercase | `Acme.*` → `acme.*` | `.` |
| npm | case is preserved | scope only: `@acme/*`; prefixes without a scope are forbidden | `/` after the scope |

### Resolution and carving {#resolution}

The most specific covering namespace wins: first the exact name, then the longest prefix. This rule determines both the owner of a name and the priority of hosted over proxy. For Cargo, the name `acme_payments_core` is checked against the patterns `acme_payments_core`, `acme_payments_*`, `acme_*`; for Maven, the name `com.acme.b:c` is checked against `com.acme.b:c`, `com.acme.b.*`, `com.acme.*`, `com.*`.

A namespace is owned by a team ({{< term "workspace" >}}). A platform team can own `com.acme` while the payments team owns `com.acme.payments`: the subspace is "carved out". A name under a parent that is not carved out separately belongs to the parent's owner. Only a platform administrator with {{< term "step-up" >}} can carve out a subspace for another team, or create any namespace that overlaps another team's namespace. Nesting within one team is allowed. Every reservation and carve-out is a `Reserve` audit event with the actor and the request context.

### The publication rule in hosted repositories {#publish-rule}

The rule is checked after the repository checks and before the request body is read.

| Condition | Result |
| --- | --- |
| npm, a name without a scope | `422` |
| The name is covered by another team's namespace | `403` |
| The name is covered by the team's own namespace or already exists in a hosted repository of the same format | The publication is allowed |
| A new name that the upstream does not know | The publication is allowed and becomes a reservation (a `Reserve` event with the exact name in addition to the publish event) |
| A new name that the upstream knows | `403` |
| The upstream is unavailable | `503` |

Reserving a well-known public name, a prefix or a scope requires a platform administrator with step-up.

CRANE finds out whether the upstream has a name with the same engine and the same cache as the proxy. For Cargo it queries the crates.io API by the canonical name: the index is unsuitable because its path depends on spelling, and `serde-json` would not find the public `serde_json`. For npm it queries the registry.npmjs.org packument. A document response, even a stale one, means "the name is public"; "not found" means "the name is free"; any other failure means "unknown", and the publication gets `503`.

### Why npm accepts only scoped names {#npm-scoped}

npm chooses the registry by scope. An internal package without a scope cannot be protected from dependency confusion: the client looks for such a name in the public registry as well. A hosted npm repository therefore accepts only scoped names.

### Why there are no group repositories {#no-groups}

CRANE does not merge hosted and proxy under one address. Safety rests on the name invariant, not on the order of sources: even a client that merges the hosted and proxy indexes itself will not get a public version of an internal name, because any proxy of the format answers it with `404`. More about repository roles: {{< xref "features/registry/proxy-cache" >}}.

> [!PLATFORM]-
> **How a name is checked**
>
> The list of candidate patterns for a name is built from the most specific to the least specific, and a single indexed query (`pattern = ANY(...)`, no `LIKE`) finds the covering one. The check is a single point in front of the cache and the upstream in every proxy. If the catalog is unavailable or returns an error, the protection closes: CRANE refuses ({{< term "fail-closed" >}}), and the client gets `503` with `Retry-After`. The source of truth for the check is the catalog, not a replica's cache.

## Limits of the guarantee {#limits}

> [!LIMITS]
> - **Unscoped npm names are not protected.** Names without a scope are not accepted into a hosted repository, so they cannot be reserved. Publish internal npm packages under a scope.
> - **Upstream unavailable means refusal.** If CRANE cannot find out whether a new name is taken in the public registry, the publication gets `503`. A public name is not shadowed, and an internal name is not left unreserved.
> - **A reservation is not lifted implicitly.** Removing an entry from the reservation configuration does not lift the reservation: reservations are only added.
> - **A format without a proxy.** If no proxy is configured for a format, CRANE does not check whether the name exists in the public registry: there is nothing to shadow.
> - **The protection works on the CRANE side.** A client that reaches a public registry directly, bypassing CRANE, is protected only by its own configuration.

## Related settings {#configure}

- {{< xref "configure/namespaces" >}} — how reservations are set.
- {{< xref "configure/repositories" >}} — hosted and proxy repositories.
- {{< xref "formats/npm" >}} — publishing scoped packages.
