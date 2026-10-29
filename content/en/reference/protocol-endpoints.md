---
title: "Package protocol paths"
description: "Reference of Cargo and npm paths on the CRANE API port: method, purpose and authentication for hosted and proxy repositories; other formats are not mounted yet."
audience: [developer, platform]
genre: reference
state: current
status: available
weight: 50
terms: [hosted-repository, proxy-repository, sparse-registry]
---

The API port ({{< env "CRANE_HTTP_PORT" >}}) serves the package protocols under the paths `/cargo/<repo>` and `/npm/<repo>`. Cargo and npm are mounted today; PyPI, Maven and NuGet are not served, and their paths get `404`. The reference lists paths, methods and purposes for {{< term "hosted-repository" "hosted" >}} and {{< term "proxy-repository" "proxy repositories" >}}.

Every path under a mounted repository needs a token, including an unknown one: a request without a token gets `401` before `404`. Outside the repositories the API port answers `404` without a token. Error body shapes: {{< xref "reference/errors" >}}.

## Common rules {#common}

- `<repo>` is a repository name from {{< env "CRANE_CARGO_REPOS" >}}, {{< env "CRANE_CARGO_PROXY_REPOS" >}}, {{< env "CRANE_NPM_REPOS" >}} or {{< env "CRANE_NPM_PROXY_REPOS" >}}. If the name is not created, the hosted routes answer `404` with the text `репозиторий не найден` (repository not found).
- A proxy repository name outranks the generic hosted route: the path `/cargo/<proxy>` always serves the proxy.
- Addresses in responses are built from {{< env "CRANE_PUBLIC_URL" >}}.
- The publish body limit is {{< env "CRANE_MAX_PUBLISH_BYTES" >}}.

### Authentication {#auth}

| Format | Header | Response without a token |
| --- | --- | --- |
| Cargo | `Authorization: <token>` without a scheme | `401`, `WWW-Authenticate: Cargo` |
| npm | `Authorization: Bearer <token>` | `401`, `WWW-Authenticate: Bearer realm="crane"` |

A header with a wrong token or a foreign scheme gets `403`. How to set the token and how clients present it: {{< xref "configure/access-token#presenting" >}}.

## Cargo {#cargo}

Cargo works as a {{< term "sparse-registry" >}} ({{< cite "rfc-2789" >}}). The registry address in the client is `sparse+https://crane.example.com/cargo/<repo>/index/`.

### Hosted repository {#cargo-hosted}

All paths have the prefix `/cargo/<repo>`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/index/config.json` | Registry configuration: `dl`, `api` and `auth-required` |
| `GET` | `/index/<path>` | An index entry of a crate; supports `If-None-Match` and answers `304` |
| `PUT` | `/api/v1/crates/new` | Publish a crate |
| `GET` | `/api/v1/crates/<name>/<version>/download` | Download the `.crate` file |
| `DELETE` | `/api/v1/crates/<name>/<version>/yank` | Yank a version |
| `PUT` | `/api/v1/crates/<name>/<version>/unyank` | Undo a yank |
| `GET` | `/api/v1/crates/<name>/owners` | The owner of a crate: the principal name of the token |
| `PUT`, `DELETE` | `/api/v1/crates/<name>/owners` | Owner management is not supported: `501` |

The `config.json` response is built from the public address:

```json
{"dl":"https://crane.example.com/cargo/internal/api/v1/crates","api":"https://crane.example.com/cargo/internal","auth-required":true}
```

### Proxy repository {#cargo-proxy}

The prefix is `/cargo/<proxy>`. The repository serves crates.io through a cache with digest verification.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/index/config.json` | Registry configuration; answers without contacting the catalog |
| `GET` | `/index/<path>` | An index entry fetched from the upstream or taken from the cache |
| `GET` | `/api/v1/crates/<name>/<version>/download` | Download the `.crate` file, verified against the SHA-256 from the index |
| `PUT` | `/api/v1/crates/new` | Publishing is forbidden: `405` |

Other paths of a proxy repository answer `404`.

## npm {#npm}

A scoped package name is sent as `@scope/name` or `@scope%2Fname`. `HEAD` is served as `GET`. All paths have the prefix `/npm/<repo>`.

### Hosted repository {#npm-hosted}

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/<package>` | The package document (packument); honors `Accept` and `If-None-Match` |
| `GET` | `/<package>/-/<file>.tgz` | Download the archive of a version |
| `PUT` | `/<package>` and `/<package>/-rev/<rev>` | Publish a version or mark deprecated |
| `DELETE` | `/<package>/-rev/<rev>` | Delete a package |
| `DELETE` | `/<package>/-/<file>.tgz/-rev/<rev>` | Delete a version |
| `GET` | `/-/package/<package>/dist-tags` | List tags |
| `PUT` | `/-/package/<package>/dist-tags/<tag>` | Set a tag; the body holds the version |
| `DELETE` | `/-/package/<package>/dist-tags/<tag>` | Remove a tag |
| `GET` | `/-/whoami` | The principal name of the token |
| `GET` | `/-/ping` | Connectivity check: `{}` |
| `POST` | `/-/npm/v1/security/…` | Vulnerability audit through the registry is not supported: `501` |

### Proxy repository {#npm-proxy}

The repository serves registry.npmjs.org through a cache with SHA-512 verification.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/<package>` | The package document; archive links are rewritten to the CRANE address |
| `GET` | `/<package>/-/<file>.tgz` | Download the archive, verified against the SHA-512 from the document |
| `GET` | `/-/whoami`, `/-/ping` | The principal name and a connectivity check |
| `POST` | `/-/npm/v1/security/…` | `501`: the dependency list of a project is not sent outside |
| `PUT`, `DELETE` | write paths | Writing is forbidden: `405` |
| `GET` | `/-/package/<package>/dist-tags` | `404`: only the upstream keeps tags |

## Paths without a repository {#other}

| Port | Path | Response |
| --- | --- | --- |
| API | any path outside `/cargo/<repo>` and `/npm/<repo>` | `404`, `problem+json`, no token needed |
| API | `/pypi/…`, `/maven/…`, `/nuget/…` | `404`: the formats are not mounted |
| Probes | `/healthz/live`, `/healthz/ready` | Probes without a token: {{< xref "reference/ports-and-health" >}} |
| Probes | any other path | `404` |

## What next {#next}

{{< cards "reference/errors" "configure/repositories" "configure/access-token" "features/registry/formats" >}}
