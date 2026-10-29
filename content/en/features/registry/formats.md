---
title: "Five ecosystems"
description: "What CRANE supports in Cargo, npm, PyPI, Maven and NuGet and which clients are verified: protocols by specification, one behavior across formats."
audience: [developer, platform]
genre: explanation
state: target
status: available
weight: 30
terms: [sparse-registry, packument, yank, purl]
---

CRANE implements the Cargo, npm, PyPI, Maven and NuGet protocols to their specifications. A developer changes neither the client nor installs extensions: only the repository address and the token change. An automated matrix of real clients checks compatibility.

Only the protocols differ. Permissions, version visibility, name reservation, the cache and the security checks are shared by all formats, because a format adapter only translates client requests into core commands and decides nothing itself. Step-by-step connection of each client is described in {{< xref "formats" >}}.

## Verified clients {#clients}

| Ecosystem | Clients in the compatibility matrix |
| --- | --- |
| Cargo | cargo |
| npm | npm, pnpm, yarn |
| PyPI | pip, uv, poetry |
| Maven | Maven, Gradle |
| NuGet | dotnet, nuget.exe |

The protocols are implemented to their specifications, and the matrix checks them on real clients.

## Client versions {#versions}

The two latest major versions of each client are supported. For cargo, the two latest stable versions are supported. The compatibility matrix fixes the set of versions.

## Cargo {#cargo}

CRANE implements only the sparse protocol ({{< term "sparse-registry" >}}, {{< cite "rfc-2789" >}}, {{< cite "cargo-registry-index" >}}); the git index is not supported. One CRANE repository is one cargo registry, hosted (internal crates) or proxy (a crates.io mirror).

- **Index.** `config.json` reports the download address and the authentication requirement. A crate index file holds one JSON line per version; the index supports `ETag` and conditional requests.
- **Download.** CRANE serves a `.crate` archive as a stream or by redirecting to the storage.
- **Publishing.** CRANE accepts the cargo binary format and checks SHA-256, the `Cargo.toml` inside the archive and ownership of the name. The dependencies of a published crate are checked: a dependency from the same registry is stored without the `registry` field, a dependency from crates.io is normalized to its canonical address, and a dependency on any other registry is rejected by the publication with code `400`.
- **Yank.** The `yank` and `unyank` commands ({{< term "yank" >}}) hide and restore a version; a hidden version stays available through a lockfile.
- **Owners.** The owners of a crate are the `owner` and `maintainer` roles of the owning team ({{< xref "features/registry/teams-and-ownership#membership" >}}).
- **Names.** Crate names are compared case-insensitively, and `-` and `_` are equal. On first publication CRANE checks whether a name is public through the crates.io API: any spelling of a public crate is refused, and if the check fails CRANE answers `503`.
- **Proxy.** For a proxy repository CRANE puts its own download address into `config.json` and takes the index and archives from crates.io. A consumer routes crates.io dependencies through CRANE with the `[source.crates-io] replace-with` setting.

The SBOM uses `Cargo.lock`, and a package is identified as the {{< term "purl" >}} `pkg:cargo/<name>@<version>`.

## npm {#npm}

CRANE serves a {{< term "packument" >}} with archive addresses rewritten to its own address and accepts publishing with the standard `npm publish` command. Dist-tags, `deprecate` and `unpublish` within a window set by policy (72 hours) are supported.

- **Scoped names.** A hosted npm repository accepts only names with a scope. The reason is that npm picks a registry by scope: an internal package without a scope cannot be protected from dependency confusion ({{< xref "features/security/namespace-reservation#npm-scoped" >}}).
- **Publication time.** For the quarantine window CRANE reads the publication time of a version from the document's `time` field.
- **Dist-tag on a hidden version.** If a tag points to a version that CRANE does not serve, it is moved to the highest served version not above the tag's version, and if there is none, the tag is removed ({{< xref "features/security/upstream-quarantine#document" >}}).

## PyPI {#pypi}

CRANE serves the Simple API ({{< cite "pep-503" >}}) and supports yank ({{< cite "pep-592" >}}). A file name is unique forever: it can neither be overwritten nor taken again after deletion.

- **Name normalization.** Names are lowercased, and runs of `-`, `_` and `.` are replaced by `-` ({{< cite "pep-503" >}}).
- **Publication time.** For the quarantine window CRANE reads `upload-time` ({{< cite "pep-700" >}}).
- **Several indexes.** The pip option `--extra-index-url` merges versions from several indexes. CRANE does not rely on the order of sources: a name covered by a namespace or already published in a hosted repository is served by the proxy as nonexistent ({{< xref "features/security/namespace-reservation#no-groups" >}}).

## Maven {#maven}

CRANE serves `maven-metadata.xml` and artifact files; Maven and Gradle work with it. CRANE takes the `.sha1`, `.md5`, `.sha256` and `.sha512` checksums from the catalog, where they are recorded when a file is received, and does not recompute them on every request.

- **Hiding.** The Maven protocol has no way to hide a version, so CRANE moves it to the `Blocked` state and shows diagnostics.
- **SNAPSHOT.** Each timestamped build is a separate immutable version, and `1.0-SNAPSHOT` is a view in `maven-metadata.xml` ({{< xref "features/security/immutable-versions#snapshots" >}}).
- **Publication time.** For the quarantine window CRANE reads the file's `Last-Modified`.

## NuGet {#nuget}

CRANE implements the NuGet V3 resources ({{< cite "nuget-server-api" >}}): registration, the flat container and publishing. The dotnet client gets a token through the `crane` credential provider, which renews the token itself through the CLI ({{< xref "features/registry/cli#setup" >}}).

- **Unlist.** `unlist` and `relist` are implemented as yank and its reverse: the version is hidden from selection, stays available by its exact number, and the action is reversible ({{< xref "features/security/immutable-versions#nuget-unlist" >}}).
- **Checksums.** CRANE serves the `packageHash` value from the catalog.
- **Publication time.** For the quarantine window CRANE reads the `published` field from registration.

## Hiding and deleting by format {#hide}

The semantics of hiding and deleting depend on the protocol: PyPI and Cargo have yank, NuGet has unlist, npm has deprecate and dist-tags, and Maven has no hiding. The table for all five formats is in {{< xref "features/security/immutable-versions#formats" >}}; it is not repeated here.

## Related pages {#related}

{{< cards "formats" "features/registry/cli" "features/security/immutable-versions" "features/registry/proxy-cache" >}}
