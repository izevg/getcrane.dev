---
title: "Public upstreams only"
description: "CRANE proxies only public registries with addresses built into the binary and supports no private or arbitrary upstreams; foreign packages enter via hosted."
audience: [platform, security]
genre: explanation
state: target
status: available
weight: 75
terms: [upstream, proxy-repository, hosted-repository, dependency-confusion, namespace]
---

CRANE proxies only public registries: crates.io, registry.npmjs.org, PyPI, Maven Central and nuget.org. The {{< term "upstream" >}} addresses are built into the binary, and configuration sets only the names of {{< term "proxy-repository" "proxy repositories" >}}. CRANE does not support private or arbitrary registries as an upstream and has no setting for it.

A package from another registry enters CRANE by one path: a person, or their script, publishes it to a {{< term "hosted-repository" "hosted repository" >}}. Every such publication is written to the journal with its author, so responsibility for the transferred content lies with whoever transferred it.

## Threat {#threat}

An arbitrary upstream is a ready-made channel for an attack on the supply chain.

- **Content outside control.** CRANE does not know who runs a foreign registry or what is in it. Whatever the registry returned would reach builds automatically.
- **Nobody answers for it.** When a package arrives by itself, through a setting, no specific person chose it. A program cannot answer for malicious code that leaked in from a foreign registry.
- **A swapped address.** If the upstream address can be given in a request or in client configuration, an attacker points CRANE at their own server.
- **Mixed names.** Several sources of one package open the way to {{< term "dependency-confusion" >}}: a public package replaces an internal one.

## Guarantee {#guarantee}

- The upstreams in CRANE are only the public registries of their formats: crates.io for Cargo, registry.npmjs.org for npm, and PyPI, Maven Central and nuget.org for the other formats.
- A client cannot point CRANE at another upstream: the address arrives neither in a request nor in client configuration.
- Instance configuration sets the names of proxy repositories, not their addresses.
- Packages from any other registry enter CRANE only as a publication to a hosted repository. The publication is written to the journal with its author.

## How it works {#mechanism}

### Addresses built into the binary {#constants}

Upstream hosts are constants in the format's code. For example, the Cargo adapter talks to `index.crates.io` and `static.crates.io`, and checks whether a name is public through `crates.io`; the npm adapter talks to `registry.npmjs.org`. These addresses can be changed only by rebuilding, not by a setting.

### An exact allowlist {#allowlist}

All outbound traffic goes through one HTTP client with an SSRF guard. It passes only hosts from an exact list: there are no wildcards, every upstream is listed explicitly, the address after DNS is checked, and every redirect passes the same check. Details: {{< xref "features/security/egress-guard" >}}.

### Configuration sets only names {#configuration}

In settings, a proxy repository is a name that corresponds to the public registry of a format. There is no "upstream address" field. Details: {{< xref "configure/repositories" >}}.

### Name protection {#names}

CRANE has no group repositories that merge several sources into one. A name is considered internal if a {{< term "namespace" >}} covers it or a hosted repository of the same format already has a package with that name; for an internal name, the proxy answers `404`. This way a public package cannot replace an internal one: {{< xref "features/security/namespace-reservation" >}}.

## How to bring in a package from another registry {#bring-package}

1. Get the package file from the registry you need and check it the way the organization's policy requires.
2. Publish it to a hosted repository with the standard client of the format, using the token of a specific principal.
3. Make sure the publication is reflected in the journal: the event records the author, the repository and the version.

The publication passes the same checks as any publication to a hosted repository, and the journal keeps a record of who published what. The journal is described on {{< xref "features/security/security-journal" >}}. A transfer from Nexus works the same way: it is an import into hosted repositories, not connecting Nexus as an upstream: {{< xref "features/registry/migration-from-nexus" >}}.

## Limits of the guarantee {#limits}

> [!LIMITS]
> - **CRANE does not check the origin of a package transferred by hand** beyond the checks of an ordinary publication to a hosted repository. It does not know which registry the file came from or whether it was altered before publication.
> - **Responsibility for transferred content lies with the publisher.** The journal records who published, but it does not make the content safe.
> - **Scanning and the vulnerability flow apply to hosted packages the same way** as to all others: {{< xref "features/security/evidence-and-scanning" >}} and {{< xref "features/security/vulnerability-flow" >}}. The scanner is off by default, and the absence of findings does not mean safety.
> - **Private registries are not supported as sources.** To work with an internal registry in a single flow, its packages are transferred to hosted.
> - **The protection works on the CRANE side.** A client that goes to another registry directly, bypassing CRANE, is protected only by its own configuration.

## Related settings {#configure}

- {{< xref "configure/repositories" >}} — hosted and proxy repositories.
- {{< xref "configure/namespaces" >}} — reserving internal names.
- {{< xref "features/registry/migration-from-nexus" >}} — transferring hosted packages from Nexus.
