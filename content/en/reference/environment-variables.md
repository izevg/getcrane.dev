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

{{< env-table group="config" >}}

### Network {#group-network}

{{< env-table group="network" >}}

### Access {#group-access}

{{< env-table group="access" >}}

### Storage {#group-storage}

{{< env-table group="storage" >}}

### Cache and limits {#group-limits}

{{< env-table group="limits" >}}

### Repositories and namespaces {#group-repositories}

{{< env-table group="repositories" >}}

Repository name rules: ASCII letters, digits, `-`, `_`, `.`; no empty names or duplicates; a proxy repository does not repeat the name of a hosted repository of the same format.

### Logs {#group-logging}

{{< env-table group="logging" >}}

## Docker Compose variables {#compose}

These variables are read by Docker Compose from the `.env` file, not by the server. The values below come from the `.env.dist` template: the compose files have no defaults, and a missing variable stops the start.

{{< env-table scope="compose" >}}

## Variables in CI examples {#ci}

Names that appear in CI configuration examples. The server does not read them.

{{< env-table scope="ci" >}}

## What next {#next}

{{< cards "configure" "reference/server-cli" "reference/ports-and-health" >}}
