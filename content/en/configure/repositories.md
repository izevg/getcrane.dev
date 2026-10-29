---
title: "Repositories"
description: "How to create Cargo and npm hosted and proxy repositories: the name-list variables, valid names, restrictions and a check by repository address."
audience: [platform]
genre: how-to
state: current
status: available
weight: 10
terms: [hosted-repository, proxy-repository, upstream]
---

This page describes how to set up CRANE repositories. A repository is a named entry point of a format: a client reaches it at `<public address>/<format>/<name>/`, where {{< env "CRANE_PUBLIC_URL" >}} sets the public address. At startup the server creates the missing {{< term "hosted-repository" "hosted repositories" >}} and {{< term "proxy-repository" "proxy repositories" >}} from the name lists in environment variables.

Today the server serves the Cargo and npm formats. PyPI, Maven and NuGet have no repository lists. A Cargo proxy repository takes packages from crates.io and an npm proxy repository from registry.npmjs.org; these {{< term "upstream" "upstreams" >}} are built into the format and cannot be configured.

## Before you begin {#prerequisites}

- A running server or one ready to start: {{< xref "deploy" >}}.
- An access token: {{< xref "configure/access-token" >}}. One token protects all repositories.

## Steps {#steps}

1. Choose the names. A name becomes part of the repository address, so the rules are strict:

   - ASCII letters, digits, `-`, `_` and `.` are allowed;
   - whitespace around names in a list is dropped, empty names and duplicates are forbidden;
   - a proxy repository cannot have the name of a hosted repository of the same format;
   - the same name may be used in different formats, for example `internal` for Cargo and for npm.

2. Set the lists. Each variable takes comma-separated names:

   - {{< env "CRANE_CARGO_REPOS" >}} — Cargo hosted repositories; the default is `internal`;
   - {{< env "CRANE_CARGO_PROXY_REPOS" >}} — Cargo proxy repositories; empty by default;
   - {{< env "CRANE_NPM_REPOS" >}} — npm hosted repositories; empty by default;
   - {{< env "CRANE_NPM_PROXY_REPOS" >}} — npm proxy repositories; empty by default.

   ```dotenv
   CRANE_CARGO_REPOS=internal,tools
   CRANE_CARGO_PROXY_REPOS=crates-io
   CRANE_NPM_REPOS=web
   CRANE_NPM_PROXY_REPOS=npmjs
   ```

   In the TOML file the same lists use the keys `cargo_repos`, `cargo_proxy_repos`, `npm_repos` and `npm_proxy_repos`, as a string or an array of strings:

   ```toml
   cargo_repos = ["internal", "tools"]
   cargo_proxy_repos = ["crates-io"]
   ```

3. Restart the server. At startup it only adds the missing repositories to the catalog.

> [!NOTE]
> Cargo requires a hosted repository. Without {{< env "CRANE_CARGO_REPOS" >}} the server creates `internal`, and an empty value is a startup error. Empty values of the other three variables mean "no repositories".

The proxy engine is created only when at least one proxy repository of any format is set. It connects only to the upstream hosts of its format and only over https. The proxy cache is chosen separately: {{< xref "configure/cache" >}}.

## Verify {#verify}

1. Find the "сервер запущен" (server started) record in the log. The `repos` and `proxy_repos` fields list the Cargo repositories, and `npm_repos` and `npm_proxy_repos` list the npm repositories.

2. Request the {{< term "sparse-registry" "sparse registry" >}} configuration of the Cargo hosted repository. The token comes from a file, so it does not appear in the process list:

   ```bash
   printf 'header = "Authorization: %s"\n' "$(cat ./secrets/crane_token)" \
     | curl -fsS -K - https://crane.example.com/cargo/internal/index/config.json
   ```

   ```json
   {"api":"https://crane.example.com/cargo/internal","auth-required":true,"dl":"https://crane.example.com/cargo/internal/api/v1/crates"}
   ```

   The addresses in the response are built from {{< env "CRANE_PUBLIC_URL" >}}.

## Startup errors {#errors}

Messages name the variable and the reason. The texts are printed in Russian. The examples are in this order: an invalid character in a name, an empty name in a list, a duplicate name, a proxy named like a hosted repository, a name already taken by a hosted repository in the catalog.

```text
некорректное значение CRANE_CARGO_PROXY_REPOS: имя может содержать только буквы, цифры, `-`, `_` и `.`
некорректное значение CRANE_NPM_REPOS: пустое имя репозитория в списке
некорректное значение CRANE_NPM_REPOS: имя повторяется в списке
некорректное значение CRANE_CARGO_PROXY_REPOS: имя совпадает с hosted-репозиторием
репозиторий `crates-io` уже существует как Hosted; CRANE_CARGO_PROXY_REPOS требует свободное имя
```

## What next {#next}

{{< cards "configure/namespaces" "configure/cache" "configure/limits" "start/quickstart" >}}
