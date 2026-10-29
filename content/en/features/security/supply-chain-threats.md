---
title: "Supply chain threats"
description: "A catalog of attacks on the supply chain and on the CRANE registry itself: how each one appears and which CRANE guarantee answers it."
audience: [security]
genre: explanation
state: target
status: available
weight: 20
terms: [typosquatting, slopsquatting, dependency-confusion, upstream, proxy-repository, namespace, quarantine, attestation, digest, advisory, ssrf, security-journal]
---

The supply chain is the path of a package from its author to a build. An attacker can step in at any point: in the choice of a name, in the author's account, in the delivery channel. This page lists the threats in the CRANE threat model and names the guarantee that answers each one. A separate list covers threats to the registry itself.

The catalog does not replace the guarantee pages. The conditions under which a defense does not apply are described on each of them in the "Limits of the guarantee" block.

## Attacks through dependencies {#supply-chain}

### Typosquatting {#typosquatting}

**How it appears.** An attacker publishes a package whose name resembles a popular one: `reqeusts` instead of `requests`. A developer mistypes one letter and installs someone else's code. This is {{< term "typosquatting" >}}.

**CRANE's answer.** For proxy repositories, CRANE compares the name with popular packages and with internal names. A name at Damerau–Levenshtein distance 1 from a known one, with few downloads from the upstream, gets a warning on the package card. A policy can block such a name in a {{< term "proxy-repository" >}}. A typosquatting candidate is recorded in the {{< term "security-journal" >}} as a detection event. See {{< xref "features/security/security-journal" >}}.

### Slopsquatting {#slopsquatting}

**How it appears.** A language model advises installing a package that does not exist. An attacker registers that name in a public registry and waits for the advice to be followed. This is {{< term "slopsquatting" >}}.

**CRANE's answer.** A package without history (age, downloads, maintainer) from a public {{< term "upstream" >}} goes into {{< term "quarantine" >}} and is not served until the window ends. A SIEM rule fires on the first request for such a name. A slopsquatting candidate is recorded as a detection event. See {{< xref "features/security/upstream-quarantine" >}}.

### Dependency confusion {#dependency-confusion}

**How it appears.** A package with the name of an internal package and a higher version appears in a public registry. The package manager picks it instead of the internal one. {{< cite "birsan-dependency-confusion" >}} described the attack. It is called {{< term "dependency-confusion" >}}.

**CRANE's answer.** An internal name is never served from an upstream. If the name is covered by a {{< term "namespace" >}} or already exists in a hosted repository of the same format, a proxy of any format answers it with `404`. See {{< xref "features/security/namespace-reservation" >}}.

### Maintainer account takeover {#maintainer-takeover}

**How it appears.** An attacker gains access to the account of a popular package's author and publishes a malicious new version. Such a version is usually taken down within hours, but it can be installed in that time.

**CRANE's answer.** Several defenses work together:

- a new version from the upstream is not served during a configurable window after its publication ({{< xref "features/security/upstream-quarantine" >}});
- CRANE flags a suspicious publication: a sharp growth in version size (5 times), new npm install scripts, binary files in an sdist;
- CRANE verifies upstream {{< term "attestation" "attestations" >}}. If earlier versions had a valid attestation and the new one lost it, made it invalid or changed the publisher, the version is held and an event goes to the SIEM ({{< xref "features/security/digest-verification#attestations" >}});
- an advisory from a malicious package feed leads to an emergency block ({{< xref "features/security/vulnerability-flow" >}}).

### Tampering on the way from the upstream {#path-tampering}

**How it appears.** A file or its metadata is changed in transit: in a mirror, on an intermediate node, in a cache.

**CRANE's answer.** Files are stored by their SHA-256 {{< term "digest" >}}. The digest of a downloaded file is compared with the one the upstream states in the version document. For attestations, the subject digest and the signature (Sigstore or PGP) are verified. Connections to the upstream are protected by TLS. See {{< xref "features/security/digest-verification" >}}.

### Malicious package {#malware}

**How it appears.** A known malicious package is already published in a public registry, and someone's build depends on it.

**CRANE's answer.** An {{< term "advisory" >}} of the `MAL-*` kind from a feed gets the highest priority and creates an emergency block. The block applies to hosted and proxy repositories, including versions nobody has downloaded yet, and reaches all replicas within 5 seconds. See {{< xref "features/security/vulnerability-flow" >}}.

### Abandoned package {#abandoned}

**How it appears.** A package has had no releases for years, and known vulnerabilities in it remain unfixed.

**CRANE's answer.** Such a package is ranked lower in search and gets an EOL badge and a replacement recommendation. See {{< xref "features/registry/search" >}}.

## Threats to the registry itself {#registry-threats}

The registry is a target too. The table follows the STRIDE classification.

| Threat | Example | Control | Guarantee |
| --- | --- | --- | --- |
| Spoofing | Publishing under someone else's CI project | Verification of the ID token signature and claims, trust policy for specific projects and refs, provenance from claims, signature and publisher checks on attestations from CI | {{< xref "features/security/access-control" >}} |
| Tampering | Replacing a release file | CAS by SHA-256, no overwriting, sampled integrity checks, a hash chain in the audit | {{< xref "features/security/immutable-versions" >}}, {{< xref "features/security/digest-verification" >}} |
| Repudiation | An action is denied after the fact | Audit of all actions with actor, request id, decision and rule; WORM anchors; export to a SIEM | {{< xref "features/security/security-journal" >}} |
| Information disclosure | A token leaking into CI logs or into a language model's context | Token prefixes for secret scanning, log redaction, permission checks before data goes to a model, tokens never in URLs | {{< xref "features/security/secrets" >}} |
| Denial of service | Zip bomb, huge upload, flood | Limits on size, decompression ratio, file count and time; rate limiting (GCRA); isolated pools (bulkheads) | — |
| Elevation of privilege | Dependency confusion, {{< term "ssrf" >}} through an upstream | Namespace reservation, no fallback to the upstream; a host allowlist, a ban on private addresses and on redirects to them | {{< xref "features/security/namespace-reservation" >}}, {{< xref "features/security/egress-guard" >}} |

## Scope of the catalog {#scope}

The catalog lists the threats for which CRANE has a mechanism. It does not claim that there are no other threats. The absence of an advisory for a version does not mean the version is safe: it only means there is no known information. The limits of each defense are on the page of the corresponding guarantee.
