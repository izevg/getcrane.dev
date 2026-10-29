---
title: "Security first"
description: "Why CRANE is built around supply chain security and which guarantees it gives, from immutable versions to control of outbound requests."
audience: [security, platform, auditor]
genre: explanation
state: target
status: available
weight: 10
terms: [upstream, quarantine, fail-closed, cas, digest, typosquatting, dependency-confusion, ssrf]
---

CRANE is a private package registry and a proxy for {{< term "upstream" >}} registries for Cargo, npm, PyPI, Maven and NuGet. A registry sits on the path of every build, so it is both the main asset of the supply chain and the best place to control it. CRANE uses that position: it first checks and restricts what reaches builds, and only then offers convenient registry management.

This section describes which threats CRANE defends against and where each defense ends. Every guarantee is worded so that it can be verified, and its limits are stated openly: a security engineer or an auditor sees not only what is covered but also what stays with the deployment.

## What “guarantee” means here {#meaning}

On these pages a guarantee is a property of a CRANE mechanism that can be checked against its behavior and code: what exactly CRANE does and under which conditions. It is not a legal commitment. CRANE is free software under the Apache License 2.0 and, as section 7 of that license states, is provided “as is”, without warranties. That is why every guarantee states its limits, and CRANE does not take on what it cannot enforce with a mechanism.

## Why the registry is the control point {#control-point}

Every dependency passes through the registry before it reaches a build. That gives three capabilities that a scanner placed elsewhere in the pipeline does not have.

- **A decision before the build.** CRANE decides whether to serve a version when the client asks, not after the package is already installed.
- **One place for rules.** Name reservation, the {{< term "quarantine" >}} window and emergency blocks apply to all five formats and all repositories in the same way.
- **The full picture.** CRANE knows which versions were downloaded by whom, and matches new vulnerability information against that inventory without rescanning files.

## Security comes first {#security-first}

The order of this documentation matches the order of priorities: first the threat and the guarantee, then the configuration. When requirements conflict, security wins. Three consequences follow:

- a check that cannot be performed results in a refusal, not in letting the request through ({{< term "fail-closed" >}});
- when the catalog is unavailable, the client gets a refusal rather than data without checks;
- the security journal keeps real identifiers and is protected against tampering; its integrity takes precedence over the right to erasure.

Registry management — teams, roles, search, the console, the CLI — is built on top of these guarantees and does not weaken them.

## Principles {#principles}

### Storage is separate from visibility {#storage-vs-visibility}

Package bytes live in {{< term "cas" >}} under a SHA-256 {{< term "digest" >}} and never change. Whether a version is served to a client is decided by the version state and by policies: quarantine, blocks, deletion. Promotion changes metadata, not bytes. A version can therefore be hidden or forbidden instantly and reversibly, while a released file cannot be replaced. More: {{< xref "features/security/immutable-versions" >}}.

### Default deny and explainability {#default-deny}

Every request is authorized, and access is closed by default. Every decision carries a trace: which rule fired and why. An unknown license means "review needed", and the absence of known vulnerabilities does not mean "safe". More: {{< xref "features/security/access-control" >}}.

### Safety over availability {#safety-over-availability}

When the catalog (PostgreSQL) is unavailable, every protocol request, including proxy reads from the cache, gets a `503` response with the `Retry-After: 10` header. CRANE does not fall back to the upstream. Without the catalog it cannot check name reservations, emergency blocks and quarantine, and a name served from the upstream or the cache would open the way to {{< term "typosquatting" >}} and {{< term "dependency-confusion" >}}. The price of this choice is that reads are unavailable while the catalog is down; a bug in CRANE itself still produces a `500`. More: {{< xref "features/security/fail-closed" >}}.

### A single source of truth {#source-of-truth}

PostgreSQL is the single source of truth. The Valkey cache and the proxy cache in object storage can be lost without losing data. The job queue and outgoing events live in PostgreSQL, so a minimal deployment does not need a message broker.

## Guarantees and their limits {#guarantees}

The table links each guarantee to a threat and names its main limit. The full limits are on the guarantee's page.

| Guarantee | What it protects against | Limit |
| --- | --- | --- |
| {{< xref "features/security/immutable-versions" >}} | Replacing a released file under the same version number; taking a number again after deletion | Does not judge the content of a version: it hides and deletes, but does not decide whether the version is safe |
| {{< xref "features/security/digest-verification" >}} | Tampering with a file on the way from the upstream, in the cache or in storage | Without an expected digest there is no check; a Valkey write combined with a swapped index remains a risk |
| {{< xref "features/security/namespace-reservation" >}} | Dependency confusion: a public package with an internal name | Unscoped npm names are not protected; when the upstream is unavailable, publishing a new name is refused |
| {{< xref "features/security/upstream-quarantine" >}} | A fresh malicious version of a popular package (maintainer account takeover) | Proxy repositories only; a version without a known publication time is handled by a setting |
| {{< xref "features/security/egress-guard" >}} | {{< term "ssrf" >}}: a request to internal addresses through an upstream, a redirect or DNS | Trusts the hosts in the allowlist; protects CRANE's outbound requests, not the network around it |
| {{< xref "features/security/public-upstreams-only" >}} | Injection through a private or arbitrary upstream whose content CRANE does not control | Packages from other registries enter only through a hosted publication, and the publisher is accountable for what was moved |
| {{< xref "features/security/fail-closed" >}} | Skipping a check on failure | The price is a refusal to serve while the catalog is down |
| {{< xref "features/security/untrusted-content" >}} | Active content of a package file (HTML, SVG) running on the console origin | Works when a separate packages origin is set |
| {{< xref "features/security/secrets" >}} | Leaks of tokens and settings secrets | Rolling back a whole settings row is not caught by the cipher: that is a threat at the database access level |
| {{< xref "features/security/access-control" >}} | Actions without the right; mixing administrative and package credentials | The limits of roles and separation of duties are described on the page |
| {{< xref "features/security/security-journal" >}} | Repudiation of an action; unnoticed changes to the journal | Erasure by subject is not supported: deletion only for whole periods by retention |
| {{< xref "features/security/vulnerability-flow" >}} | Known vulnerabilities and malicious packages in the inventory | Aggregates open feeds and does not run its own research |
| {{< xref "features/security/evidence-and-scanning" >}} | Vulnerable and malicious components inside an artifact that the metadata does not name | Analysis runs in an isolated environment; no findings does not mean safe |
| {{< xref "features/security/licenses" >}} | Unexpected license obligations | Passes no verdicts: the organization sets the policy and ambiguous cases go to review |

## Where to start {#start}

- Security engineer: {{< xref "features/security/supply-chain-threats" >}} — a catalog of attacks mapped to guarantees.
- Platform engineer: {{< xref "features/security/namespace-reservation" >}} and {{< xref "features/security/upstream-quarantine" >}} — the two defenses that change client behavior.
- Auditor: {{< xref "features/security/security-journal" >}} — what is recorded and how to verify integrity.
