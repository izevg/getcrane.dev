---
title: "CRANE features"
description: "What CRANE does: it protects the package supply chain first and manages the registry for Cargo, npm, PyPI, Maven and NuGet second."
audience: [platform, security, developer, auditor]
genre: explanation
state: target
status: available
weight: 20
terms: [hosted-repository, proxy-repository, upstream]
---

CRANE is a self-hosted package registry and proxy for five ecosystems: Cargo, npm, PyPI, Maven and NuGet. A registry sits on the path of every build, which makes it both the most valuable asset in the supply chain and the best place to control it. That sets the order of its features: CRANE first guarantees that a build receives only bytes and names that can be trusted, and only then makes working with packages convenient.

This section describes how CRANE is built and what it provides. How to deploy and configure it today is covered in {{< xref "deploy" >}} and {{< xref "configure" >}}.

## Security first {#security-first}

The guarantees CRANE gives for every package that passes through a {{< term "hosted-repository" >}} or a {{< term "proxy-repository" >}}: a published version never changes, bytes are checked against their digest, an internal name never comes from an {{< term "upstream" >}}, a new upstream version waits out a quarantine, egress requests do not reach the internal network, and every security decision is recorded. Each guarantee states its limits: where it applies and where it stops.

{{< xref "features/security" "Security first" >}}

## Registry management {#registry}

Hosted repositories for teams' own packages, a caching proxy for public registries, five ecosystems with their standard clients, teams and ownership, search, a web console, a CLI and an API for integrations.

{{< xref "features/registry" "Registry management" >}}

## Deployment and maintenance {#operations}

One binary and one image for every profile, from a single Docker Compose node to a Kubernetes cluster. PostgreSQL is the only source of truth, the cache and proxy storage can be lost without losing data, and upgrades run without downtime.

{{< xref "features/operations" "Deployment and maintenance" >}}
