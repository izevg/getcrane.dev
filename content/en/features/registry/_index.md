---
title: "Registry management"
description: "Hosted repositories and a caching proxy, five ecosystems, teams, search, the web console, CLI and API: how CRANE organizes work with packages."
audience: [developer, platform]
genre: explanation
state: target
status: available
weight: 30
terms: [hosted-repository, proxy-repository, upstream, namespace, oidc]
---

CRANE keeps teams' own packages in {{< term "hosted-repository" "hosted repositories" >}} and serves packages from public registries through a {{< term "proxy-repository" "proxy repository" >}} with a cache. A developer connects the standard client of an ecosystem (Cargo, npm, PyPI, Maven or NuGet) and works with packages using familiar commands. The registry, teams, search, console, CLI and API are built on top of the security guarantees and do not weaken them.

This section describes how work with packages is organized: how a version enters the registry, how an upstream is cached, who owns packages and how they are found. The supply chain guarantees are described in {{< xref "features/security" >}}.

## Two kinds of repositories {#repository-kinds}

A repository belongs to one package format and to one of two kinds.

```mermaid {caption="Figure 1. The client talks only to CRANE. CRANE itself contacts the {{< term “upstream“ >}}, and only from a proxy repository."}
flowchart LR
  client["Package manager client"]
  crane["CRANE"]
  hosted[("Hosted repository<br>team packages")]
  proxy[("Proxy repository<br>upstream cache")]
  upstream["Public registry<br>(upstream)"]
  client --> crane
  crane --> hosted
  crane --> proxy
  proxy -.-> upstream
```

- **Hosted** is the place for your own packages. CRANE is their source of truth. Details: {{< xref "features/registry/hosted" >}}.
- **Proxy** is a cache of a public registry. CRANE fetches packages from the upstream itself, checks them and serves them to the client. Details: {{< xref "features/registry/proxy-cache" >}}.

The same {{< term "namespace" >}} protects internal names in both kinds: a name covered by a namespace is never served from an upstream ({{< xref "features/security/namespace-reservation" >}}).

## What registry management covers {#contents}

- {{< xref "features/registry/hosted" >}}: atomic publishing, version states, promotion to release, quotas and cleanup.
- {{< xref "features/registry/proxy-cache" >}}: the two-level cache, request coalescing, stale copies during an upstream failure, offline readiness.
- {{< xref "features/registry/formats" >}}: what is supported in each ecosystem and which clients are verified.
- {{< xref "features/registry/teams-and-ownership" >}}: teams as the unit of ownership, roles, IdP groups, ownership transfer.
- {{< xref "features/registry/search" >}}: hybrid search by task, not only by name.
- {{< xref "features/registry/console" >}}: the web console and role desks.
- {{< xref "features/registry/cli" >}}: the `cctl` command-line client.
- {{< xref "features/registry/integrations" >}}: the REST API, signed webhooks, CI token exchange.
- {{< xref "features/registry/migration-from-nexus" >}}: moving hosted packages from Nexus.

## Principles {#principles}

### Standard clients {#standard-clients}

CRANE implements the ecosystem protocols to their specifications and needs no custom client to install or publish. An automated matrix of real clients checks compatibility. All logic, from permissions to version visibility, is shared by every format, and a format adapter only translates the protocol into core commands.

### One decision path {#one-decision-path}

Every request, including a package manager request, goes through authorization, and access is closed by default. A package hidden from a user is returned by the protocol as nonexistent, and the reason for the refusal is visible in diagnostics by request ID. Details: {{< xref "features/security/access-control" >}}.

### No plugins {#no-plugins}

Formats, storage backends and integrations are built into the binary as implementations of internal interfaces. There is no dynamic code loading and no API for third-party extensions ({{< xref "features/operations/deployment-model#monolith" >}}).

## What CRANE does not do {#not-done}

- **There are no group repositories.** CRANE does not merge hosted and proxy under one address. The protection comes from the name invariant, not from the order of sources ({{< xref "features/security/namespace-reservation#no-groups" >}}).
- **There is no Cargo git index.** CRANE implements only the sparse protocol ({{< xref "features/registry/formats#cargo" >}}).
- **There is no direct connection to LDAP, Active Directory or SAML.** CRANE accepts people only through an {{< term "oidc" >}} provider, and directories connect through it ({{< xref "features/registry/teams-and-ownership#idp" >}}).

## Where to start {#start}

- Developers: {{< xref "features/registry/formats" >}} and {{< xref "features/registry/cli" >}}.
- Platform engineers: {{< xref "features/registry/proxy-cache" >}} and {{< xref "features/registry/teams-and-ownership" >}}.
