---
title: "Namespace reservation"
description: "How to reserve internal package names with CRANE_NAMESPACES: the entry format, patterns per format, the owner, startup errors and a check."
audience: [platform, security]
genre: how-to
state: current
status: available
weight: 20
terms: [namespace, dependency-confusion, proxy-repository, workspace]
---

This page describes how to reserve package names for the platform so that CRANE never serves them from a public registry. The reservation is set by {{< env "CRANE_NAMESPACES" >}}: a list of `format:pattern` entries. A name covered by a {{< term "namespace" >}} is internal, and every {{< term "proxy-repository" >}} answers it with `404`. This closes {{< term "dependency-confusion" >}}. Why the protection works this way and where it ends: {{< xref "features/security/namespace-reservation" >}}.

The server applies the list at startup, idempotently. Entries are only added: removing an entry from the list does not release the reservation.

## Before you begin {#prerequisites}

- A list of internal prefixes and names for each format.
- A running server with a persistent catalog: {{< xref "configure/storage" >}}.

## Steps {#steps}

1. Compose comma-separated entries of the form `format:pattern`. Write the format in lower case: `cargo`, `npm`, `pypi`, `maven` or `nuget`. A pattern is an exact name or a prefix with a single `*` at the end, right after the format separator. Whitespace around entries is dropped.

   | Format | Entry | What it covers |
   | --- | --- | --- |
   | Cargo | `cargo:acme-*` | Names with the prefix `acme-`; `-` and `_` are equivalent in Cargo |
   | PyPI | `pypi:acme-*` | Names with the prefix `acme-` |
   | NuGet | `nuget:Acme.*` | Names with the prefix `acme.`; case is normalized |
   | Maven | `maven:com.acme.*` | The groupId `com.acme` and nested groups |
   | Maven | `maven:com.acme:core` | A single `groupId:artifactId` name; the format ends at the first colon |
   | npm | `npm:@acme/*` | All packages of the scope `@acme`; prefixes without a scope are forbidden |

   The prefix `acme-*` does not cover `acmecorp`: the format separator before `*` is mandatory.

2. If needed, set the owner. The owner is a {{< term "workspace" "team" >}}; its identifier is written as a `=<uuid>` suffix after the pattern. Without a suffix the owner is the default team `00000000-0000-0000-0000-000000000001`. The owner is split off at the last `=` sign.

3. Set the variable.

   ```ini
   CRANE_NAMESPACES=cargo:acme-*,cargo:acme-payments-*=<uuid>,npm:@acme/*
   ```

   In the TOML file the key is `namespaces`; a string or an array of strings is accepted:

   ```toml
   namespaces = ["cargo:acme-*", "npm:@acme/*"]
   ```

4. Restart the server.

The server records every entry applied at startup in the audit log on behalf of `crane:config`. A pattern that already belongs to another team stops the start: ownership does not change through configuration.

## Verify {#verify}

Check the reservation on a separate test stand where the catalog and blobs live in memory (`memory`). A reservation is written to the catalog and stays there forever in a persistent catalog. Reserve a name that certainly exists on crates.io and request it through a Cargo proxy repository.

```ini
CRANE_NAMESPACES=cargo:serde
CRANE_CARGO_PROXY_REPOS=crates-io
```

```bash
printf 'header = "Authorization: %s"\n' "$(cat ./secrets/crane_token)" \
  | curl -sS -o /dev/null -w '%{http_code}\n' -K - \
    https://crane.example.com/cargo/crates-io/index/se/rd/serde
```

```text
404
```

Without the entry in {{< env "CRANE_NAMESPACES" >}} the same request returns the index document.

## Startup errors {#errors}

Messages name the variable and the reason but do not quote the whole value. The texts are printed in Russian. The examples are in this order: an empty entry, no format, an unknown format, an invalid pattern, an invalid uuid, a pattern repeated after normalization, a foreign owner.

```text
некорректное значение CRANE_NAMESPACES: пустая запись в списке
некорректное значение CRANE_NAMESPACES: ожидается `формат:шаблон`
некорректное значение CRANE_NAMESPACES: неизвестный формат
некорректное значение CRANE_NAMESPACES: некорректный шаблон
некорректное значение CRANE_NAMESPACES: некорректный uuid workspace
некорректное значение CRANE_NAMESPACES: шаблон повторяется в списке
namespace acme_* уже принадлежит другому workspace; владение не передаётся через конфигурацию
```

## What next {#next}

- {{< xref "features/security/namespace-reservation" >}}
- {{< xref "configure/repositories" >}}
- {{< xref "reference/environment-variables" >}}
