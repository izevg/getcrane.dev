---
title: "Evidence, SBOM and scanning"
description: "How CRANE binds evidence and scan results to the content digest, unpacks untrusted archives in a sandbox and turns a scan result into a serving rule."
audience: [security]
genre: explanation
state: target
status: available
weight: 140
terms: [evidence, sbom, digest, blob, purl, finding]
---

CRANE binds {{< term "evidence" >}} (an SBOM, a scanner report, an attestation) to the content {{< term "digest" >}}, not to the package version. The Trivy scanner checks files and the {{< term "sbom" >}}, and untrusted archives are unpacked in an isolated `analyze` role. A scan result affects serving only through a rule that policy defines.

This way a malicious or vulnerable component inside an artifact that metadata does not mention comes into view, and a hostile archive gets no access to CRANE itself. The scanner is off by default, and the absence of findings does not mean safety.

## Threat {#threat}

- **Content that does not match its description.** Package metadata does not name a malicious or vulnerable component that sits inside the archive or is vendored in the sources.
- **A hostile archive.** An archive is built to harm the service that unpacks it: a zip bomb exhausts disk and memory, a path like `../../etc/x` escapes the extraction root, a symlink points to a file outside the root.
- **A scan not bound to content.** A result is recorded against a version while the file under the same number has changed, or the same file is scanned again in ten repositories.

## Guarantee {#guarantee}

- Evidence belongs to a {{< term "blob" >}} by SHA-256: one file in two repositories or two versions yields one piece of evidence. Evidence is never rewritten; a new scanner database creates a new record.
- A scan is idempotent by (SHA-256, scanner, database version).
- A scanner failure produces "could not verify" evidence and an "analysis error", never "clean".
- Archives are unpacked only in the `analyze` role, with no network except the scanner server, with limits and with protection from escaping the root.
- A scan result affects serving only under an explicit policy. The rule is placed on the artifact's coordinates.
- The scanner is off by default, and by default a scan result blocks nothing.

## How it works {#mechanism}

### Evidence bound to content {#evidence}

The key of evidence is the SHA-256 of the file. There is no "version" column: the versions that evidence applies to are found through the link between the file and the version. One blob in hosted and in proxy gives one piece of evidence. A scan is a function of content: there is no overlap between formats, because different bytes give a different digest. The kinds of evidence are an SBOM, a scanner report, an attestation and a file signature.

A new Trivy database creates a new record with the database version, and readers take the latest. A database older than the allowed age is a reason to rescan.

### SBOM {#sbom-format}

CRANE reads SBOMs in the CycloneDX and SPDX formats. An SBOM attached to a hosted version is evidence of its file. A build SBOM describes a consumer and feeds the dependency graph: it shows where a found component is used. A component inside an SBOM or an artifact is matched against advisories by {{< term "purl" >}}: {{< xref "features/security/vulnerability-flow" >}}.

### Scanning {#scanner}

Trivy runs in client/server mode. The scanner adapter is an anti-corruption layer: replacing Trivy with another scanner is a new adapter and a settings line, and archive extraction does not depend on the scanner. The unpacked artifact tree and the SBOM are scanned. Both paths converge on one {{< term "finding" >}} model and one priority calculation.

If the scanner is unavailable, a circuit breaker opens and the check is marked "analysis error" or "check missing". Matching advisories from feeds keeps working.

### The analysis sandbox {#sandbox}

Untrusted archives are unpacked in a separate process role, `analyze`:

- a distroless image, an unprivileged user, a read-only root filesystem, a seccomp profile;
- no network except the scanner server;
- CPU, memory and time limits.

Extraction is written once and does not depend on the scanner. It rejects paths that escape the root (`../`), absolute paths, symlinks and hardlinks outside the root, names with a null byte and backslashes, duplicate archive entries, and exceeding the limits on unpacked size, compression ratio, file count and nesting depth (a jar inside a jar). These cases are covered by tests on hostile archives. The scanner adapter reads the tree read-only and does not step outside its root.

### Scan result and serving {#serving}

A scan result does not change a file and does not delete a version. It can produce a serving rule if it falls under the policy. The policy accepts the values `off` and `malware`; the default is `malware`: a rule is created only for content that the scan found malicious. The scanner is off by default, so on a new installation a scan creates no rules.

- The rule is placed on the coordinates of the artifact (repository, format, name, version) where that digest was found. One file in several repositories gets a rule on each coordinate.
- A component inside an artifact is not blocked by a separate rule. If its advisory is malicious (`MAL-*`), the range rule has already been created from the feed; otherwise a rule on a foreign coordinate based on a vendored copy would be false.
- A rule from a scan is lifted by changing the policy, and that change is a security journal event. Weakening protection (turning off the scanner or a feed, `off` for the policy) is recorded too.
- A client for whom a rule closed a version receives diagnostics: the reason and the rule.

## Limits of the guarantee {#limits}

> [!LIMITS]
> - **No findings does not mean safe.** The result "no known vulnerabilities found" refers to the date and the scanner database version. A scanner looks for what is known: a new malicious technique without a signature will not be found.
> - **The scanner is off by default.** Until an administrator turns it on, no scan runs and the "block on scan" policy does nothing.
> - **CRANE does not execute package code.** Analysis is unpacking and reading, not running.
> - **A false positive holds a version.** A rule from a scan is lifted only by changing the policy; it cannot be lifted for a single version.
> - **A proxy artifact is scanned after it is served.** A scan starts from the event of serving a file to a client. If the event is lost and there are no repeated downloads, the artifact stays unscanned. `MAL-*` advisories work by coordinate and range without a scan, so the most dangerous class does not depend on this.
> - **An unavailable scanner or a stale database gives "not verified".** Neither turns into "clean".
> - **The sandbox does not protect against everything.** It limits the consequences of parsing a hostile archive but does not replace checking the content.

## Related settings {#configure}

- {{< xref "configure" >}} — how CRANE reads settings.
- {{< xref "configure/vulnerability-feeds" >}} — vulnerability feeds.
- {{< xref "security/hardening" >}} — hardening a deployment, including network isolation.
