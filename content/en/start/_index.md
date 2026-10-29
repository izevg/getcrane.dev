---
title: "What is CRANE"
description: "CRANE is a self-hosted package registry and upstream proxy for Cargo, npm, PyPI, Maven and NuGet, built around software supply chain security."
audience: [developer, platform, security]
genre: explanation
state: target
status: available
weight: 10
terms: [upstream, proxy-repository, hosted-repository, dependency-confusion, namespace, fail-closed, advisory, evidence, oidc, security-journal, siem, ocsf]
---

CRANE is a self-hosted package registry and {{< term "upstream" >}} proxy for Cargo, npm, PyPI, Maven and NuGet, built first of all for software supply chain security. It stores the internal packages of teams and serves packages from public registries through its own cache with security checks, so every build gets its dependencies from one controlled place.

A registry sits on the path of every build. That is why CRANE answers the security questions first: can a public package replace an internal one, have the bytes of a release changed, what does the log show after an incident. Registry management is built on top of these guarantees.

## What CRANE provides {#benefits}

### For developers {#developer}

One address and standard clients for all five ecosystems: `cargo`, `npm`, `pip`, Maven, Gradle, `dotnet`. Internal packages are published to a {{< term "hosted-repository" >}}, public ones are installed through a {{< term "proxy-repository" >}}. A published release cannot be overwritten. A refusal names the rule that fired and the steps to fix it instead of a bare `403`.

### For platform engineers {#platform}

One binary and one image for every profile, from a single node in Docker Compose to a Kubernetes cluster. PostgreSQL is the only source of truth. The Valkey cache and S3 storage are added when needed: the minimal profile needs only PostgreSQL and a local disk. A new format or integration is a module inside CRANE, not a plugin that must be installed and updated separately.

### For security engineers {#security}

Internal names are protected from {{< term "dependency-confusion" >}}: a name covered by a {{< term "namespace" >}} is never served from an upstream. Versions are immutable, and bytes are stored under their SHA-256 digest. When CRANE cannot perform a security check, it refuses the request instead of letting it through ({{< term "fail-closed" >}}). New {{< term "advisory" "advisories" >}} are matched against the package inventory, and a dangerous version can be blocked.

### For auditors {#auditor}

User actions and security events go to the {{< term "security-journal" >}}, which is protected against modification. Events reach a {{< term "siem" >}} in the open {{< term "ocsf" >}} schema. Access to the journal is separate from the rights to manage the registry: whoever performs actions does not control their log.

## How CRANE differs {#differences}

- **Security before convenience.** When a check and convenience conflict, the check wins. The pages of this site follow the same order: threat and guarantee first, configuration second.
- **One binary.** The server, background jobs and analysis run from one image in different roles. State lives in PostgreSQL, in blob storage and in a cache that can be lost without losing data.
- **OIDC only for people.** People sign in through an {{< term "oidc" "OpenID Connect" >}} provider. LDAP, Active Directory and SAML directories connect through it, not directly. Package managers that cannot complete an OIDC sign-in receive CRANE's own tokens.
- **No plugins.** Formats, integrations and storage backends are compiled into the binary. There is no dynamic code loading and no API for third-party extensions, so the attack surface and the maintenance surface are smaller.

## What CRANE does not include {#out-of-scope}

CRANE deliberately does not provide:

- its own Git and CI;
- a replacement for SonarQube and Trivy: CRANE accepts their results as {{< term "evidence" >}};
- its own vulnerability research: CRANE aggregates open feeds;
- execution of package code;
- active-active deployment and geo-replication;
- package formats beyond the five listed;
- automatic legal or security decisions made by a model;
- direct LDAP, Active Directory and SAML connections.

## License {#license}

CRANE is distributed under the Apache License 2.0. It grants an explicit patent license and is compatible with the rest of the stack.

## Where to go next {#next}

{{< cards "start/quickstart" "start/concepts" "features/security" "deploy" >}}
