---
title: "Connect npm"
description: "How to connect npm to CRANE hosted and proxy repositories: .npmrc, publishing scoped packages, dist-tags, deprecate, unpublish and replies to refusals."
audience: [developer, platform]
genre: how-to
state: current
status: available
weight: 20
terms: [hosted-repository, proxy-repository, packument, namespace, tombstone, upstream]
---

This page describes how to connect `npm` to CRANE, publish a scoped package, manage dist-tags, mark a version as deprecated, unpublish it, and install packages from registry.npmjs.org through a CRANE {{< term "proxy-repository" "proxy repository" >}}. CRANE serves a {{< term "packument" >}} with archive links that point to its own address and accepts publishing with the standard `npm publish` command.

An npm {{< term "hosted-repository" >}} accepts only scoped names (`@acme/lib`): npm picks the registry by scope, and an internal package without a scope cannot be protected from replacement by a public one ({{< xref "features/security/namespace-reservation#npm-scoped" >}}). A published version cannot be overwritten, and it can be unpublished only within 72 hours of publication.

## Before you begin {#prerequisites}

- A running CRANE and its public address ({{< env "CRANE_PUBLIC_URL" >}}); it is written as `crane.example.com` below. Deployment: {{< xref "deploy" >}}.
- An access token: {{< xref "configure/access-token" >}}. npm sends the token in the `Authorization: Bearer <token>` header.
- npm repositories. The lists are empty by default: set {{< env "CRANE_NPM_REPOS" >}} for hosted repositories (for example `internal`) and {{< env "CRANE_NPM_PROXY_REPOS" >}} for proxy repositories (for example `npmjs`): {{< xref "configure/repositories" >}}.
- `npm` of the latest version: CRANE is verified against it on a real stand.

## Steps {#steps}

### Connect a hosted repository {#connect}

1. Pass the token in a shell variable. The `.npmrc` file refers to it, so the value never lands in the file.

   ```bash
   export NPM_TOKEN="<token>"
   ```

2. Name the repository as the registry of your scope and set the token for its address in the project's `.npmrc`. The repository address ends with `/`: npm picks the token by this prefix.

   ```ini
   @acme:registry=https://crane.example.com/npm/internal/
   //crane.example.com/npm/internal/:_authToken=${NPM_TOKEN}
   ```

### Publish a package {#publish}

1. Make sure `package.json` has a scoped name and a version that is not yet in the repository.

   ```json
   { "name": "@acme/lib", "version": "1.0.0" }
   ```

2. Publish the package.

   ```bash
   npm publish
   ```

3. To give the version its own dist-tag, add `--tag`. Without it, publishing sets the `latest` tag.

   ```bash
   npm publish --tag next
   ```

Before writing, CRANE checks:

- **Name.** A name without a scope gets `422`. The name of a new package may contain only lowercase letters, digits and `-._`.
- **Contents of the publication.** The document contains exactly one version, one attachment and one dist-tag that points to the published version. The name and version in the manifest match the request.
- **Checksums.** A sha512 sum in `dist.integrity` is required. CRANE compares it, and the sha1 from `dist.shasum` if present, with the actual content of the archive. A mismatch gets `422`.
- **Dependencies.** The `dependencies`, `optionalDependencies` and `peerDependencies` sections may refer only to the registry: a version range, a tag or `npm:<name>@<range>`. Git, URL, `file:`, `link:` and `workspace:` are refused with `400`. The `devDependencies` section is not checked.
- **Reservation and public name.** A name covered by another team's {{< term "namespace" >}} gets `403`. A new name that is already taken on registry.npmjs.org also gets `403`; CRANE runs this check when an npm proxy repository is configured. Rules: {{< xref "features/security/namespace-reservation#publish-rule" >}}.
- **Size.** A publication document larger than {{< env "CRANE_MAX_PUBLISH_BYTES" >}} gets `413`. The archive arrives as base64 inside JSON, so it is about a third larger than the original file: {{< xref "configure/limits" >}}.

CRANE does not store the `deprecated` and `publishConfig` fields or service fields with the `_` prefix.

### Manage dist-tags {#dist-tags}

1. Set a tag on a version, list the tags and remove a tag.

   ```bash
   npm dist-tag add @acme/lib@1.0.0 stable
   npm dist-tag ls @acme/lib
   npm dist-tag rm @acme/lib stable
   ```

A tag name is non-empty, at most 128 characters long, made of ASCII letters, digits and `-._~`, and is not a version number. A tag points only to a version that CRANE serves to clients. The `latest` tag cannot be removed: if it is missing, CRANE derives it by taking the highest version without a pre-release (or the highest version at all if there are none).

### Mark a version as deprecated {#deprecate}

1. Set the message. An empty string instead of a message removes the mark.

   ```bash
   npm deprecate @acme/lib@1.0.0 "use 2.x"
   ```

`npm install` prints the warning `deprecated @acme/lib@1.0.0: use 2.x`. The version stays available.

### Install dependencies through a proxy {#proxy}

1. Add the default registry and the token for the proxy repository to `.npmrc`. The `npmjs` in the address is the name of the proxy repository on the server. Packages in the `@acme` scope still go to the hosted repository, all others go to the proxy.

   ```ini
   registry=https://crane.example.com/npm/npmjs/
   //crane.example.com/npm/npmjs/:_authToken=${NPM_TOKEN}
   ```

2. Install a package as usual.

   ```bash
   npm install is-number@7.0.0
   ```

CRANE makes the first request for each document and archive to registry.npmjs.org itself, stores the result in the cache and returns it to the client; repeated requests come from the cache. The `dist.tarball` links in the document point to CRANE. The archive is checked against the sha512 from `dist.integrity` in the {{< term "upstream" >}} document.

A version whose upstream document has only a sha1 (`dist.shasum`) is not served through the proxy: there is nothing to check the archive with, and CRANE answers `502`. A name that is published in a hosted repository or covered by a reservation is served by the proxy as nonexistent (`404`) ({{< xref "features/security/namespace-reservation#no-groups" >}}). Writing to a proxy repository is impossible: the server answers `405`.

> [!NOTE]
> `npm audit` is not supported through CRANE: the server answers `501`, because a project's dependency list must not be sent outside. The installation is not interrupted.

## Verify {#verify}

1. Check that the repository answers `ping`. The token goes through stdin (`-K -`), so it does not show in the process list.

   ```bash
   printf 'header = "Authorization: Bearer %s"\n' "$NPM_TOKEN" \
     | curl -fsS -K - https://crane.example.com/npm/internal/-/ping
   ```

   ```json
   {}
   ```

2. After publishing, check the package tags.

   ```bash
   npm view @acme/lib dist-tags --json
   ```

   The `latest` tag points to the published version.

3. Check that installation goes through CRANE.

   ```bash
   npm view is-number@7.0.0 dist.tarball
   ```

   The address starts with `https://crane.example.com/npm/npmjs/`.

## Unpublishing a version {#unpublish}

`npm unpublish` removes a version if no more than 72 hours have passed since publication. The version gets a {{< term "tombstone" >}}: its archive is no longer served, and the number cannot be taken again.

```bash
npm unpublish @acme/lib@1.1.0-beta.0
```

After that the version disappears from `npm view @acme/lib versions`, and publishing the same number again gets `409`. If the window is closed, the server answers `403`.

`npm unpublish @acme/lib --force` removes the whole package. If at least one version was published more than 72 hours ago, CRANE changes nothing and answers `403`. The other ways to hide a version in npm are `npm deprecate` and moving a dist-tag. Semantics for all formats: {{< xref "features/security/immutable-versions#formats" >}}.

## Replies to refusals {#errors}

| Status | When | Message |
| --- | --- | --- |
| `400` | The publication document cannot be parsed, the contents are wrong, a dependency points outside the registry, an invalid package or tag name, removing the `latest` tag, an unsupported change of the document | The reason, in Russian; for an unsupported operation: `операция не поддерживается` (the operation is not supported) |
| `401` | No `Authorization` header | `требуется токен` (a token is required) |
| `403` | The token is wrong | `токен отвергнут` (the token is rejected) |
| `403` | The name is covered by another team's namespace | `имя принадлежит namespace другого workspace` (the name belongs to another workspace's namespace) |
| `403` | The new name is already taken on registry.npmjs.org | `имя занято в публичном реестре: для публикации нужна резервация платформы (CRANE_NAMESPACES)` (the name is taken in the public registry: publishing needs a platform reservation) |
| `403` | The unpublish window is closed; the version is blocked or in quarantine | `окно удаления закрыто: версия опубликована слишком давно` (the deletion window is closed: the version was published too long ago) or `версия недоступна: …` (the version is unavailable) |
| `404` | The repository, package or version is not found; the name is internal and the request goes to a proxy | `не найдено`, `репозиторий не найден` or `версия не найдена` (not found; repository not found; version not found) |
| `405` | Writing to a proxy repository | `репозиторий не hosted: публикация запрещена` (the repository is not hosted: publishing is forbidden) |
| `409` | The version already exists, including an unpublished one | `версия уже существует` (the version already exists) |
| `410` | Downloading the archive of a version in the tombstone state | `версия недоступна: Deleted` (the version is unavailable) |
| `413` | The publication document is larger than {{< env "CRANE_MAX_PUBLISH_BYTES" >}} | — |
| `422` | A name without a scope; the archive sum does not match the declared one | `формат требует scope в имени пакета` (the format requires a scope in the package name) or `контрольная сумма не совпала: …` (the checksum does not match) |
| `501` | `npm audit` | `аудит уязвимостей через реестр не поддерживается` (vulnerability audit through the registry is not supported) |
| `502` | Proxy: registry.npmjs.org is unavailable, the archive failed the checksum check, the document has no sha512, or the archive is larger than {{< env "CRANE_PROXY_MAX_ARTIFACT_BYTES" >}} | `upstream недоступен` (the upstream is unavailable) |
| `503` | The catalog or the blob storage is unavailable; a new name could not be checked on registry.npmjs.org | `хранилище временно недоступно` (storage is temporarily unavailable) or `не удалось проверить имя в публичном upstream: повторите позже` (the name could not be checked in the public upstream: try again later) |

An error body looks like `{"error":"…"}`. The text ends with `(request_id <id>)`: the identifier helps the deployment administrator find the request in the log. A `503` comes with a `Retry-After` header.

## What next {#next}

{{< cards "formats/cargo" "features/security/namespace-reservation" "configure/repositories" "features/registry/proxy-cache" >}}
