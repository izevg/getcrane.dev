---
title: "Environment variables"
description: "Reference of all variables the CRANE server reads: purpose, default, whether required, the _FILE form, the TOML key and the order of sources."
audience: [platform]
genre: reference
state: current
status: available
weight: 10
terms: []
---

This reference lists every environment variable that the `crane` binary reads: purpose, default value, whether it is required, whether a `<NAME>_FILE` form exists and the TOML file key. Variables are grouped by purpose. How to set them step by step: {{< xref "configure" >}}.

The server reads settings once at startup. Four variables are required: {{< env "CRANE_DATABASE_URL" >}}, {{< env "CRANE_BLOBS" >}}, {{< env "CRANE_PUBLIC_URL" >}} and {{< env "CRANE_TOKEN" >}}. The others have defaults or are optional.

## Source precedence {#precedence}

A value comes from the first source that sets it:

1. an environment variable; one set to an empty string still counts as set and overrides the file;
2. a key of the TOML file whose path is set by {{< env "CRANE_CONFIG" >}};
3. a row of the `setting` table in PostgreSQL (except the keys `http_port`, `admin_port`, `trusted_proxies`, `database_url`, `settings_key`);
4. the default value.

Precedence is evaluated per variable name. The server reports the first error it finds and exits with code `1`.

## TOML file keys {#toml}

- A key is the variable name without the `CRANE_` prefix, in lower case: {{< env "CRANE_HTTP_PORT" >}} is `http_port`. For a `_FILE` form the key has the suffix `_file`: `token_file`.
- Accepted values: a string, an integer, an array of strings. The server joins an array with commas. Other types produce the error ``некорректное значение ключа `<key>` в файле конфигурации: <reason>`` (invalid value of the key in the configuration file).
- An unknown key, including `config`, produces the error ``неизвестный ключ `<key>` в файле конфигурации`` (unknown key in the configuration file).
- The `AWS_*` variables and their `_FILE` forms, {{< env "CRANE_CONFIG" >}} and {{< env "RUST_LOG" >}} have no TOML keys: only the environment sets them.
- A file read error names the path and the I/O reason. A parse error names the path, the line and the column but does not quote the content.
- An empty {{< env "CRANE_CONFIG" >}} means "no file".

## _FILE forms {#file-forms}

- The value of a `_FILE` form is a path to a file. The server strips `\r` and `\n` from the end of the content and keeps other whitespace.
- A variable together with its `_FILE` form produces the error `переменные <NAME> и <NAME>_FILE взаимоисключающие` (the variables are mutually exclusive). This holds for values from different sources too: the `token` key of the TOML file and {{< env "CRANE_TOKEN_FILE" >}} in the environment also conflict.
- An empty value or an empty file produces the error `некорректное значение <NAME>: значение пусто` (invalid value: the value is empty).
- A file that cannot be read produces the error `не удалось прочитать <NAME>_FILE: <reason>` (failed to read).
- Secret values never reach error texts. For a foreign URL scheme only the scheme is named.

## memory and persistent storage {#memory}

- Write the `memory` value of {{< env "CRANE_DATABASE_URL" >}} and {{< env "CRANE_BLOBS" >}} explicitly.
- `memory` cannot be mixed with persistent storage: the pair is either entirely in memory or entirely persistent. Otherwise the server does not start and reports `CRANE_DATABASE_URL и CRANE_BLOBS: memory нельзя смешивать с постоянным хранилищем`.
- With the `memory` catalog, {{< env "CRANE_SETTINGS_KEY" >}} produces the error "not needed with memory". S3 keys from files (`AWS_*_FILE`) produce the same error when the blob storage is `memory`.
- {{< env "CRANE_CACHE" >}} set to `memory` does combine with persistent storage: the cache is not a source of truth.

## Variables {#variables}

The "From file" column names the `_FILE` form when one exists. The "Default" column does not show a default for secret variables; the behavior without a value is described under purpose.

### Settings file {#group-config}

| Name | Purpose | Default | Required | From file | TOML key |
| --- | --- | --- | --- | --- | --- |
| {{< env "CRANE_CONFIG" >}} | Path to the optional TOML file. An empty value means no file | none | No | No | environment only |

### Network {#group-network}

| Name | Purpose | Default | Required | From file | TOML key |
| --- | --- | --- | --- | --- | --- |
| {{< env "CRANE_HTTP_PORT" >}} | API port with the package protocols; an integer 0–65535 | `8080` | No | No | `http_port` |
| {{< env "CRANE_ADMIN_PORT" >}} | Port of the `/healthz/live` and `/healthz/ready` probes; `crane healthcheck` reads it too | `9464` | No | No | `admin_port` |
| {{< env "CRANE_PUBLIC_URL" >}} | External address: `http://` or `https://` and a host; trailing `/` are dropped | none | Yes | No | `public_url` |
| {{< env "CRANE_TRUSTED_PROXIES" >}} | Comma-separated IP addresses and CIDR networks (IPv4, IPv6) whose `X-Forwarded-For` and `X-Request-Id` the server trusts | empty string | No | No | `trusted_proxies` |

### Access {#group-access}

| Name | Purpose | Default | Required | From file | TOML key |
| --- | --- | --- | --- | --- | --- |
| {{< env "CRANE_TOKEN" >}} | Static access token for the protocols; set by a value or a file, in exactly one way | none | Yes | Yes, {{< env "CRANE_TOKEN_FILE" >}} | `token`, `token_file` |
| {{< env "CRANE_TOKEN_PRINCIPAL" >}} | Name of the token principal: non-empty, no control characters; surrounding whitespace is dropped | `crane` | No | No | `token_principal` |

### Storage {#group-storage}

| Name | Purpose | Default | Required | From file | TOML key |
| --- | --- | --- | --- | --- | --- |
| {{< env "CRANE_DATABASE_URL" >}} | Catalog: `memory`, `postgres://` or `postgresql://` | none | Yes | Yes, {{< env "CRANE_DATABASE_URL_FILE" >}} | `database_url`, `database_url_file` |
| {{< env "CRANE_BLOBS" >}} | Blobs: `memory`, `file:///absolute/path` or `s3://bucket[/prefix]` with non-secret query parameters | none | Yes | No | `blobs` |
| {{< env "AWS_ACCESS_KEY_ID" >}} | Identifier of the static S3 key. The S3 client reads the value; the server reads the `_FILE` form, as a pair with the secret part | none | No | Yes, {{< env "AWS_ACCESS_KEY_ID_FILE" >}} | environment only |
| {{< env "AWS_SECRET_ACCESS_KEY" >}} | Secret part of the static S3 key | none | No | Yes, {{< env "AWS_SECRET_ACCESS_KEY_FILE" >}} | environment only |
| {{< env "CRANE_SETTINGS_KEY" >}} | Encryption key for secret settings in PostgreSQL: base64 of exactly 32 bytes (AES-256-GCM). An error with the `memory` catalog | none | No | Yes, {{< env "CRANE_SETTINGS_KEY_FILE" >}} | `settings_key`, `settings_key_file` |

### Cache and limits {#group-limits}

| Name | Purpose | Default | Required | From file | TOML key |
| --- | --- | --- | --- | --- | --- |
| {{< env "CRANE_CACHE" >}} | Proxy cache: `memory` or a Valkey address with the scheme `valkey`, `valkeys`, `valkey-cluster`, `valkeys-cluster`, `valkey-sentinel`, `valkeys-sentinel`. Without the variable and its `_FILE` form, `memory` applies | — | No | Yes, {{< env "CRANE_CACHE_FILE" >}} | `cache`, `cache_file` |
| {{< env "CRANE_PROXY_MAX_ARTIFACT_BYTES" >}} | Size limit of a single proxied artifact, bytes; greater than zero | `2147483648` | No | No | `proxy_max_artifact_bytes` |
| {{< env "CRANE_MAX_PUBLISH_BYTES" >}} | Publish body limit for Cargo and npm, bytes; greater than zero | `10485760` | No | No | `max_publish_bytes` |

### Repositories and namespaces {#group-repositories}

| Name | Purpose | Default | Required | From file | TOML key |
| --- | --- | --- | --- | --- | --- |
| {{< env "CRANE_CARGO_REPOS" >}} | Comma-separated names of Cargo hosted repositories; an empty value is an error | `internal` | No | No | `cargo_repos` |
| {{< env "CRANE_CARGO_PROXY_REPOS" >}} | Comma-separated names of crates.io proxy repositories; empty means the Cargo proxy is off | empty string | No | No | `cargo_proxy_repos` |
| {{< env "CRANE_NPM_REPOS" >}} | Comma-separated names of npm hosted repositories; empty means none | empty string | No | No | `npm_repos` |
| {{< env "CRANE_NPM_PROXY_REPOS" >}} | Comma-separated names of registry.npmjs.org proxy repositories; empty means the npm proxy is off | empty string | No | No | `npm_proxy_repos` |
| {{< env "CRANE_NAMESPACES" >}} | Name reservation: comma-separated `format:pattern` or `format:pattern=uuid` entries | empty string | No | No | `namespaces` |

Repository name rules: ASCII letters, digits, `-`, `_`, `.`; no empty names or duplicates; a proxy repository does not repeat the name of a hosted repository of the same format.

### Logs {#group-logging}

| Name | Purpose | Default | Required | From file | TOML key |
| --- | --- | --- | --- | --- | --- |
| {{< env "RUST_LOG" >}} | Filter of the ordinary logs in `tracing-subscriber` syntax. An unparsable value is replaced with `info`. The targets `crane::audit`, `crane::access` and `crane::upstream` are always enabled at the `info` level | `info` | No | No | environment only |

## What next {#next}

- {{< xref "configure" >}}
- {{< xref "reference/server-cli" >}}
- {{< xref "reference/ports-and-health" >}}
