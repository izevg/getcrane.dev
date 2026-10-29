---
title: "Digest verification"
description: "CRANE addresses files by SHA-256, checks what it downloads from an upstream against the expected digest and verifies upstream attestations, with stated limits."
audience: [platform, security]
genre: explanation
state: target
status: available
weight: 40
terms: [digest, blob, cas, upstream, proxy-repository, attestation, provenance, sparse-registry, packument]
---

CRANE checks that the bytes of a package match what is claimed. Files are addressed by SHA-256, the {{< term "digest" >}} of a file from an {{< term "upstream" >}} is compared with the expected one before the file reaches storage, and upstream {{< term "attestation" "attestations" >}} are verified by their signatures.

The check covers tampering with a file on the way from the upstream, in a mirror and in the cache. It does not replace an assessment of the content: a matching digest proves the bytes are unchanged, not that they are safe.

## Threat {#threat}

A file or a version document is altered on the way from the upstream: in a mirror, on an intermediate node, in a cache. The client receives an archive that differs from what the author published. A second form of the threat is a malicious version published with a stolen token, bypassing the author's CI: it lacks the build platform signature that earlier versions had.

## Guarantee {#guarantee}

- Every file in storage is addressed by its SHA-256 digest. An integrity check amounts to recomputing the hash.
- If the upstream states an expected digest for a file in the version document, CRANE compares it with the received bytes before writing to storage. On a mismatch the file is not written, nothing enters the cache, and the client gets `502`.
- The sha512, sha1 and md5 checksums are computed once at write time and served to clients from the catalog.
- Upstream attestations and signatures are verified against the bytes that CRANE stores.
- If earlier versions had a valid attestation and the new one has none or a different one, the new version is held and an event goes to the SIEM.

## How it works {#mechanism}

### SHA-256 as the address {#address}

The path of a {{< term "blob" >}} in {{< term "cas" >}} is computed from its SHA-256: `blobs/sha256/9f/86/9f86d081…`. Identical files in one storage are stored once. The sampled integrity check recomputes the hash of a share of blobs (1% per day); a blob with a wrong SHA-256 raises an alert.

### Checksums at write time {#checksums}

CRANE reads an uploaded file as a stream and computes SHA-256, SHA-512, SHA-1 and MD5 in a single pass. The values are stored in the catalog row together with the blob. Maven `.sha1`, `.md5`, `.sha256` and `.sha512` files and the NuGet `packageHash` field are served from the catalog instead of re-reading the archive on every request.

When publishing to a hosted repository, CRANE compares the computed values with the checksum sent by the client. A mismatch rejects the publication with a `422` response. For npm, a publication must carry `dist.integrity` with a sha512; without it the version is not accepted.

### The expected digest in a proxy {#proxy-expected}

A {{< term "proxy-repository" >}} takes the expected digest from the version document it received from the upstream. The source depends on the format:

| Format | Where the expected digest comes from | Algorithm |
| --- | --- | --- |
| Cargo | The `cksum` field of the version line in the {{< term "sparse-registry" >}} index ({{< cite "cargo-registry-index" >}}) | SHA-256 |
| npm | The `dist.integrity` field of the version in the {{< term "packument" >}} | SHA-512 |

CRANE builds the file address itself from the name and version confirmed by the document, instead of taking a ready-made URL from the document. A forged tarball link therefore cannot redirect the request to a foreign address.

For npm, one condition is enough: the version has a SHA-512. A version whose `dist.integrity` has no SHA-512 and only a SHA-1 is not served (`502`): SHA-1 can be forged with collisions, and an archive "verified" by it guarantees nothing.

> [!PLATFORM]-
> **What is visible on a mismatch**
>
> The client receives only "upstream unavailable" (`502`). In the access log, the proxy response gets the field `upstream_failure="digest-mismatch"` and an `upstream_reason` field with the expected and the received digest. The event is written to the security log and is not silenced by the log level. The blob is not written to storage, no cache entry is created, and the next request goes to the upstream again.

CRANE also checks cache entries. An entry that points to a blob with a digest other than the one expected for the requested file is treated as stale and is not served.

### Upstream attestations {#attestations}

For versions from an upstream, CRANE verifies attestations and file signatures. Verification runs as a separate job off the hot path: a download does not wait for its result. Whether a version is visible to a client before the result is determined by the repository policy, including the quarantine window ({{< xref "features/security/upstream-quarantine" >}}).

| Format | Where to get it | What arrives |
| --- | --- | --- |
| npm | `dist.attestations` in the packument; `GET /-/npm/v1/attestations/<name>@<version>` | SLSA provenance and a publish attestation in a Sigstore bundle |
| PyPI | Integrity API: `GET /integrity/<project>/<version>/<filename>/provenance` | PEP 740: an in-toto Statement in DSSE, the Trusted Publishing publisher |
| Maven Central | `.asc` (PGP) and `.sigstore.json` next to the file, where published | A file signature; a Sigstore bundle is optional, PGP is mandatory |

The common step: the subject digest of the attestation (for a file signature, the signed file itself) must equal the SHA-256 of the blob; otherwise the result is `invalid`. The rest depends on the kind of signature.

- **Sigstore bundle.** The Fulcio certificate chain, its SAN and the issuer are verified. The Rekor inclusion proof and signed entry timestamp are taken from the bundle itself, without contacting the log: verification works offline. The trust root is the Sigstore `trusted_root.json`, updated through TUF.
- **PGP (Maven `.asc`).** The signature is verified against the publisher's public key; Fulcio, Rekor and TUF are not involved.

An error in the verification itself (no trust root, upstream unavailable, an unfamiliar bundle format) yields `unverifiable`, not `invalid`. Otherwise an infrastructure failure would block other people's releases.

#### Attestation regression {#regression}

The main practical signal is regression. Earlier versions of a package had a valid attestation or signature, and the new one has none, is `invalid`, has a different publisher or repository, or the build moved from a protected ref to an unprotected one. This is what a publication with a stolen token, bypassing CI, can look like. The new version is held (in quarantine or blocked, per the repository policy), and an event about a supply chain signal goes to the SIEM. The signature is compared by stable properties: the issuer, the repository and the workflow path, not the whole SAN, which changes with every release.

> [!SECURITY]-
> **What is compared for different signature kinds**
>
> For Sigstore: the issuer (OID 1.3.6.1.4.1.57264.1.8), the repository (1.15, or 1.12 when empty) and the workflow path (1.9 without `@ref`). The ref, the trigger and the runner environment are recorded as facts but are not part of the comparison. For PGP: the fingerprint of the publisher's key; `valid` means the signature matches a key taken from the same place as the file, and trust in the key comes from the version history. A key change falls under the regression rule.

Attestations from a team's own CI (hosted repositories) are verified by the same verifier. More about {{< term "provenance" >}}, SLSA and in-toto: {{< cite "slsa" >}}, {{< cite "in-toto-attestation" >}}.

## Limits of the guarantee {#limits}

> [!LIMITS]
> - **No expected digest, no check.** The sources of the expected digest are listed in the table above. If a file has no digest, there is nothing to compare with, and CRANE serves the file without this check.
> - **Valkey.** Anyone who can write to Valkey can replace proxy documents and blob pointers. A pointer to a foreign blob is rejected for a file with an expected SHA-256, but this protection does not work when the index is replaced at the same time. Valkey must therefore be network-isolated and require authentication.
> - **A digest does not assess content.** A match proves that bytes are unchanged, not that they are safe. A malicious package with an honest digest passes this check; quarantine, advisories and analysis exist for it.
> - **Attestation verification does not block a download.** It runs off the hot path; the version state before the result is determined by the repository policy.
> - **`unverifiable` is not a verdict.** A verification failure does not turn into a refusal for someone else's release, but it does not confirm authenticity either.
> - **PGP.** `valid` means "the signature matches a key from the same place as the file". Trust in the key comes only from the version history.

## Related settings {#configure}

- {{< xref "deploy/valkey-cache" >}} — Valkey isolation and authentication.
- {{< xref "configure/cache" >}} — the proxy cache.
- {{< xref "configure/storage" >}} — blob storage.
