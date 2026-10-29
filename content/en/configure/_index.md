---
title: "How CRANE reads settings"
description: "Where the CRANE server takes settings from: environment variables, _FILE secret files and an optional TOML file, their order and error behavior."
audience: [platform, security]
genre: how-to
state: current
status: available
weight: 40
terms: []
---

This page shows how to set a CRANE setting and how the server picks a value when several sources provide one. The server reads settings once at startup: from environment variables, from secret files (`<NAME>_FILE`) and from an optional TOML file whose path is set by {{< env "CRANE_CONFIG" >}}. An invalid value is never replaced by a default: the server does not start and names the variable in the log.

Pass secrets (the token, the catalog address with a password, the encryption key) in files rather than as environment values. Values of secret variables never appear in error messages: a message names the variable and the reason, not the content.

## Before you begin {#prerequisites}

- A chosen way to run the server: {{< xref "deploy" >}}.
- The list of all variables with their defaults: {{< xref "reference/environment-variables" >}}.

## Steps {#steps}

1. Set the variables the server cannot start without: {{< env "CRANE_DATABASE_URL" >}}, {{< env "CRANE_BLOBS" >}}, {{< env "CRANE_PUBLIC_URL" >}} and {{< env "CRANE_TOKEN" >}}. All other variables have defaults. The minimal set for a stand without persistent storage:

   ```ini
   CRANE_DATABASE_URL=memory
   CRANE_BLOBS=memory
   CRANE_PUBLIC_URL=https://crane.example.com
   CRANE_TOKEN=<token>
   ```

   Write the `memory` value explicitly. Data in memory is lost on restart.

2. Pass secrets in files. For a variable that has a `_FILE` form, set the path to a file instead of the value:

   ```ini
   CRANE_TOKEN_FILE=/run/secrets/crane_token
   CRANE_DATABASE_URL_FILE=/run/secrets/database_url
   ```

   The `_FILE` form exists for {{< env "CRANE_TOKEN" >}}, {{< env "CRANE_DATABASE_URL" >}}, {{< env "CRANE_SETTINGS_KEY" >}}, {{< env "CRANE_CACHE" >}}, {{< env "AWS_ACCESS_KEY_ID" >}} and {{< env "AWS_SECRET_ACCESS_KEY" >}}. File reading rules:

   - the server strips trailing newline characters (`\r`, `\n`) from the content and keeps all other whitespace;
   - an empty value, including an empty file, is an error;
   - a variable together with its `_FILE` form is an error: `переменные CRANE_TOKEN и CRANE_TOKEN_FILE взаимоисключающие` (the two variables are mutually exclusive);
   - a file that cannot be read produces an error with the name of the `_FILE` variable and the I/O reason.

3. If needed, collect the remaining settings in a TOML file and set its path in the environment. Only the environment sets the path: the file itself has no `config` key.

   ```ini
   CRANE_CONFIG=/etc/crane/crane.toml
   ```

   ```toml
   public_url = "https://crane.example.com"
   blobs = "file:///data/blobs"
   token_file = "/run/secrets/crane_token"
   database_url_file = "/run/secrets/database_url"
   cargo_proxy_repos = ["crates-io"]
   max_publish_bytes = 20971520
   ```

   A file key is the variable name without the `CRANE_` prefix, in lower case. A value is a string, an integer or an array of strings (the server joins an array with commas). Secrets in a TOML file are stored in plain text, so use the `token_file`, `database_url_file` and similar keys for them.

4. Restart the server. Settings are not re-read while the server runs.

## Verify {#verify}

On a successful start the server writes the "сервер запущен" (server started) record to the log with the `http_port` and `admin_port` fields. Then check readiness: {{< xref "reference/ports-and-health" >}}.

On an error the server exits with code `1` and writes the "роль завершилась с ошибкой" (role finished with an error) record; the cause is in the `error` field. The server reports one problem per start. The messages are printed in Russian:

```text
не задана переменная CRANE_PUBLIC_URL
переменные CRANE_TOKEN и CRANE_TOKEN_FILE взаимоисключающие
неизвестный ключ `tokn` в файле конфигурации
```

A TOML parse error names the path, the line and the column but does not quote the file, because it may contain a token:

```text
ошибка разбора TOML в /etc/crane/crane.toml: строка 3, столбец 9
```

## Source precedence {#precedence}

A value comes from the first source that sets it:

1. an environment variable, including one set to an empty string;
2. a key of the TOML file from {{< env "CRANE_CONFIG" >}};
3. a row of the `setting` table in PostgreSQL (see [Settings in PostgreSQL](#stored));
4. the default value.

Precedence is evaluated per variable name. For that reason a secret cannot be set in one form in the environment and in the other form in the file: a token in the `token` key of the TOML file together with {{< env "CRANE_TOKEN_FILE" >}} in the environment produces the same mutual-exclusion error.

> [!SECURITY]-
> Ports, the trusted proxy list, the catalog address and the encryption key are read before the PostgreSQL layer, so they are never taken from it. These are {{< env "CRANE_HTTP_PORT" >}}, {{< env "CRANE_ADMIN_PORT" >}}, {{< env "CRANE_TRUSTED_PROXIES" >}}, {{< env "CRANE_DATABASE_URL" >}} and {{< env "CRANE_SETTINGS_KEY" >}}. A row with such a key in the `setting` table has no effect: writing directly to the table does not weaken, for example, the trusted proxy list.

## Settings in PostgreSQL {#stored}

A third layer lies under the TOML file: the `setting` table in PostgreSQL. The server reads it at startup when the catalog is persistent (`postgres://`). Nothing writes settings to this table today: there is no HTTP API and no console. A deployment administrator sets settings through the environment and the file.

What the server does with table rows at startup:

- a row with an unknown key, a row for a key that only the environment and the file may set, and a row for a key already set by the environment or the file have no effect. The server writes a warning with the key and the reason; the value does not reach the log;
- a secret that cannot be decrypted (no key, a different key, damaged ciphertext) stops the start: the value is not replaced by a default. Details: {{< xref "configure/settings-encryption" >}}.

## What next {#next}

- {{< xref "configure/repositories" >}}
- {{< xref "configure/storage" >}}
- {{< xref "configure/access-token" >}}
- {{< xref "reference/environment-variables" >}}
