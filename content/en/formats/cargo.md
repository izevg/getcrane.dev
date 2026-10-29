---
title: "Connect Cargo"
description: "How to connect cargo to CRANE hosted and proxy repositories: the sparse index, the token, publishing a crate, yank and the server's replies to refusals."
audience: [developer, platform]
genre: how-to
state: current
status: available
weight: 10
terms: [sparse-registry, hosted-repository, proxy-repository, yank, tombstone, namespace]
---

This page describes how to connect `cargo` to CRANE, publish a crate, build a project with dependencies from CRANE and from crates.io, and hide a version with `cargo yank`. CRANE implements only the {{< term "sparse-registry" >}} ({{< cite "rfc-2789" >}}, {{< cite "cargo-registry-index" >}}); the git index is not supported.

One CRANE repository is one Cargo registry: a {{< term "hosted-repository" >}} stores internal crates, and a {{< term "proxy-repository" >}} serves crates.io crates through the CRANE cache. A published version cannot be overwritten. A version cannot be deleted with `cargo`: the Cargo protocol has no such operation.

## Before you begin {#prerequisites}

- A running CRANE and its public address ({{< env "CRANE_PUBLIC_URL" >}}); it is written as `crane.example.com` below. Deployment: {{< xref "deploy" >}}.
- An access token: {{< xref "configure/access-token" >}}. Cargo sends the token in the `Authorization` header without a scheme.
- A Cargo hosted repository. The `internal` repository exists without configuration. To install through a proxy, set {{< env "CRANE_CARGO_PROXY_REPOS" >}}, for example `crates-io`: {{< xref "configure/repositories" >}}.
- `cargo` of the latest or the previous stable version: CRANE is verified against them on a real stand.

## Steps {#steps}

### Connect a hosted repository {#connect}

1. Describe the registry in `.cargo/config.toml`. The name `crane` is local; `internal` is the name of the hosted repository on the server. The index address ends with `/index/`.

   ```toml
   [registries.crane]
   index = "sparse+https://crane.example.com/cargo/internal/index/"
   credential-provider = "cargo:token"
   ```

   Without `credential-provider = "cargo:token"`, cargo does not read the token of an alternative registry from the environment.

2. Pass the token in a shell variable. Its name is built from the registry name: for `crane` it is `CARGO_REGISTRIES_CRANE_TOKEN`.

   ```bash
   export CARGO_REGISTRIES_CRANE_TOKEN="<token>"
   ```

### Publish a crate {#publish}

1. Publish with the registry name from `.cargo/config.toml`.

   ```bash
   cargo publish --registry crane
   ```

If CRANE refuses the crate, `cargo` prints the status and the error text. The statuses are collected in [Replies to refusals](#errors).

Before writing, CRANE checks:

- **Name and version.** The name starts with an ASCII letter, contains letters, digits, `-` and `_`, and is at most 64 characters long. Case is ignored and `-` equals `_`. If the crate is already published with a different spelling of the name, the publication gets `400`.
- **Dependencies.** A dependency on the same repository and a dependency on crates.io are accepted. A dependency on any other registry is refused with `400` and the reason `foreign-registry-dependency`.
- **Reservation and public name.** A name covered by another team's {{< term "namespace" >}} gets `403`. A new name that is already taken on crates.io also gets `403` unless the platform reserved it; CRANE runs this check when a Cargo proxy repository is configured. Rules: {{< xref "features/security/namespace-reservation#publish-rule" >}}.
- **Size.** A request body larger than {{< env "CRANE_MAX_PUBLISH_BYTES" >}} gets `413`: {{< xref "configure/limits" >}}.
- **Repeated version.** A version that is already published or was deleted gets `409`.

### Depend on a crate from the hosted repository {#consume}

1. Name the registry in the dependency. Cargo downloads the archive from the address CRANE reports in `config.json`.

   ```toml
   [dependencies]
   acme-hello = { version = "0.1", registry = "crane" }
   ```

### Install dependencies through a proxy {#proxy}

1. Replace the `crates-io` source with a CRANE proxy repository in `.cargo/config.toml`. The `crates-io` in the address is the name of the proxy repository on the server.

   ```toml
   [source.crates-io]
   replace-with = "crane-proxy"

   [registries.crane-proxy]
   index = "sparse+https://crane.example.com/cargo/crates-io/index/"
   credential-provider = "cargo:token"
   ```

2. Pass the token. The same token opens hosted and proxy repositories.

   ```bash
   export CARGO_REGISTRIES_CRANE_PROXY_TOKEN="<token>"
   ```

3. Build the project as usual with `cargo build`. CRANE makes the first request for each file to crates.io itself, checks the archive checksum against the index and stores the result in the cache. Repeated requests come from the cache. The download address in the proxy repository's `config.json` points to CRANE, not to crates.io.

A name that is published in a hosted repository or covered by a reservation is served by the proxy as nonexistent (`404`), so a public crate cannot replace an internal one ({{< xref "features/security/namespace-reservation#no-groups" >}}). Publishing to a proxy repository is impossible: the server answers `405`.

> [!NOTE]
> `cargo search` is not supported: CRANE has no Cargo search route. `cargo info` reads crate details from the index.

## Verify {#verify}

1. Request the repository's `config.json`. The token goes through stdin (`-K -`), so it does not show in the process list.

   ```bash
   printf 'header = "Authorization: %s"\n' "$CARGO_REGISTRIES_CRANE_TOKEN" \
     | curl -fsS -K - https://crane.example.com/cargo/internal/index/config.json
   ```

   ```json
   {"api":"https://crane.example.com/cargo/internal","auth-required":true,"dl":"https://crane.example.com/cargo/internal/api/v1/crates"}
   ```

2. After publishing, check that the crate is visible in the index.

   ```bash
   cargo info <crate> --registry crane
   ```

   The command prints the crate details, including the published version.

## Hiding and deleting a version {#hide}

{{< term "yank" >}} removes a version from dependency resolution without deleting it. The command is idempotent: repeating it is not an error.

```bash
cargo yank --registry crane --version <version> <crate>
```

To return the version to resolution, add `--undo`:

```bash
cargo yank --registry crane --undo --version <version> <crate>
```

Behavior after a yank:

- New dependency resolution skips the hidden version and picks the previous matching one.
- A direct dependency on the hidden version (`=<version>`) does not resolve; `cargo generate-lockfile` reports a yanked version.
- An existing `Cargo.lock` that names the version still builds, including from an empty cache: the archive stays available until the version is deleted.

Cargo has no deletion of a version, and CRANE provides no route that deletes a crate. A version in the {{< term "tombstone" >}} state is unavailable: downloading it or yanking it again gets `410`, and publishing the same number again gets `409`. Semantics for all formats: {{< xref "features/security/immutable-versions#formats" >}}.

The owner list `cargo owner --list --registry crane <crate>` returns one owner: the name of the token's principal ({{< env "CRANE_TOKEN_PRINCIPAL" >}}). Adding and removing owners gets `501`.

## Replies to refusals {#errors}

| Status | When | Message |
| --- | --- | --- |
| `400` | The publication body cannot be parsed, an invalid name or version, a dependency on a foreign registry, a change in the spelling of the name | The reason, in Russian; for a foreign registry: «зависимость … указывает на сторонний реестр …» (a dependency points to a foreign registry) |
| `401` | No `Authorization` header | `требуется токен` (a token is required) |
| `403` | The token is wrong | `токен отвергнут` (the token is rejected) |
| `403` | The name is covered by another team's namespace | `имя принадлежит namespace другого workspace` (the name belongs to another workspace's namespace) |
| `403` | The new name is already taken on crates.io | `имя занято в публичном реестре: для публикации нужна резервация платформы (CRANE_NAMESPACES)` (the name is taken in the public registry: publishing needs a platform reservation) |
| `403` | The version is blocked or in quarantine | `версия недоступна: …` (the version is unavailable) |
| `404` | The repository, crate or version is not found; the name is internal and the request goes to a proxy | `не найдено`, `репозиторий не найден` or `версия не найдена` (not found; repository not found; version not found) |
| `405` | Publishing to a proxy repository | `репозиторий не hosted: публикация запрещена` (the repository is not hosted: publishing is forbidden) |
| `409` | The version already exists, including a deleted one | `версия уже существует` (the version already exists) |
| `410` | Downloading or yanking a version in the tombstone state | `версия недоступна: Deleted` (the version is unavailable) |
| `413` | The publication body is larger than {{< env "CRANE_MAX_PUBLISH_BYTES" >}} | — |
| `501` | Adding or removing owners | A message that owner management is not supported |
| `502` | Proxy: crates.io is unavailable, the archive failed the checksum check or is larger than {{< env "CRANE_PROXY_MAX_ARTIFACT_BYTES" >}} | `upstream недоступен` (the upstream is unavailable) |
| `503` | The catalog or the blob storage is unavailable; a new name could not be checked on crates.io | `хранилище временно недоступно` (storage is temporarily unavailable) or `не удалось проверить имя в публичном upstream: повторите позже` (the name could not be checked in the public upstream: try again later) |

An error body looks like `{"errors":[{"detail":"…"}]}`. The text ends with `(request_id <id>)`: the identifier helps the deployment administrator find the request in the log. A `503` comes with a `Retry-After` header.

## What next {#next}

- {{< xref "formats/npm" >}} — connect npm.
- {{< xref "configure/repositories" >}} — how to create hosted and proxy repositories.
- {{< xref "features/security/immutable-versions" >}} — the immutability guarantee and the deletion semantics.
- {{< xref "features/registry/proxy-cache" >}} — how the proxy cache works.
