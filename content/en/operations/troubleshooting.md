---
title: "Troubleshooting common errors"
description: "Common startup and runtime errors of CRANE with the exact log and response text: configuration, PostgreSQL, storage, port, token, repositories and proxy."
audience: [platform, developer]
genre: how-to
state: current
status: available
weight: 60
terms: [static-token, upstream]
---

This page helps to find the cause of an error by its exact text and tells what to do. Errors fall into three groups: the server does not start, the server starts but is not ready, and a client gets an error in a response. Each group has its own source of text.

A server that failed to start writes a `роль завершилась с ошибкой` (the role finished with an error) record with an `error` field and exits with code `1`. A client error arrives in the response body, and the full context sits in the log under the same request identifier. Server texts are in Russian; errors of the PostgreSQL driver and of the operating system stay in English.

## Before you begin {#prerequisites}

- Access to the `crane` log: {{< xref "operations/logs" >}}.
- For client errors, the `request_id` from the response body or the `X-Request-Id` header.

## Steps {#steps}

1. Determine the stage. The container restarts or is stopped: the server does not start. The container runs but `crane healthcheck` returns `1`: the server is not ready. The container is healthy and a client gets an error: a request error.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml ps -a
   ```

2. Find the error text. For a server that does not start, it is the `error` field of the last `ERROR` record.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml logs --no-log-prefix --tail 50 crane \
     | jq -cR 'fromjson? | select(.level == "ERROR") | .error'
   ```

3. Match the text with the tables below and take the action.

4. Restart the service if the configuration changed, and make sure `crane healthcheck` returns `0`: {{< xref "operations/health-checks" >}}.

## The server does not start {#startup}

Detailed lists of messages by topic are on the configuration pages: {{< xref "configure/network#errors" "addresses and ports" >}}, {{< xref "configure/storage#errors" "storages" >}}, {{< xref "configure/cache#errors" "cache" >}}, {{< xref "configure/limits#errors" "limits" >}}. This table holds the cases people meet most often.

| Text in the `error` field | Cause | What to do |
| --- | --- | --- |
| `использование: crane <serve\|all\|migrate\|healthcheck>` (code `2`) | There is not exactly one argument, or the role is unknown | Run exactly one role: {{< xref "reference/server-cli#usage" >}} |
| `не задана переменная CRANE_DATABASE_URL` (also `CRANE_BLOBS`, `CRANE_PUBLIC_URL`, `CRANE_TOKEN`) | A required variable is not set | Set the variable or its `_FILE` form: {{< xref "reference/environment-variables" >}} |
| `переменные CRANE_TOKEN и CRANE_TOKEN_FILE взаимоисключающие` (the same for `CRANE_DATABASE_URL` and `CRANE_CACHE`) | Both forms of one secret are set | Keep one form |
| `не удалось прочитать CRANE_TOKEN_FILE: No such file or directory (os error 2)` | The secret file is not mounted, the path is wrong, or user `65532` has no read permission | Check the path and the file permissions: {{< xref "deploy/docker-compose#secrets" >}} |
| `некорректное значение CRANE_TOKEN: значение пусто` | The secret file is empty | Write the value into the file; a trailing newline is dropped |
| `CRANE_DATABASE_URL и CRANE_BLOBS: memory нельзя смешивать с постоянным хранилищем` | One of the addresses is `memory`, the other is not | Make both persistent or both `memory` |
| `не удалось подключиться к PostgreSQL (CRANE_DATABASE_URL): pool timed out while waiting for an open connection` | PostgreSQL did not become reachable within 5 s: stopped, wrong address or blocked network. An immediate failure gives `error communicating with database: …` | Start PostgreSQL, check the address in the secret. Compose restarts `crane` by itself |
| `не удалось подключиться к PostgreSQL (CRANE_DATABASE_URL): error returned from database: password authentication failed …` | Wrong password or user | Make the password in the address secret match the database. Changing the password file does not change the password in an existing `pg` volume |
| `не удалось открыть CRANE_BLOBS: …` | The storage address was parsed but the storage did not open: S3 parameters, directory permissions | Check the address parameters and credentials: {{< xref "deploy/s3-storage" >}} |
| `не удалось занять порт 8080: Address already in use (os error 98)` | The port is taken by another process | Free the port or set another: {{< xref "configure/network" >}} |
| ``репозиторий `<имя>` уже существует как Hosted; CRANE_CARGO_PROXY_REPOS требует свободное имя`` | The proxy repository name equals an existing hosted repository in the catalog | Choose another name: {{< xref "configure/repositories" >}} |
| `namespace <шаблон> уже принадлежит другому workspace; владение не передаётся через конфигурацию` | A pattern from {{< env "CRANE_NAMESPACES" >}} is held by another owner | Remove or change the pattern: {{< xref "configure/namespaces" >}} |
| `не удалось прочитать файл конфигурации <путь>: …` | The file from {{< env "CRANE_CONFIG" >}} cannot be read | Check the path and permissions |
| `ошибка разбора TOML в <путь>: строка <N>, столбец <M>` | A syntax error in the file. The line content does not enter the text | Fix the file at the given position |
| ``неизвестный ключ `<ключ>` в файле конфигурации`` | The key is not on the list | Compare the keys: {{< xref "reference/environment-variables#toml" >}} |

Errors of migrations and PostgreSQL extensions are covered in {{< xref "operations/upgrades-and-migrations#failure" >}}.

## The server is not ready {#not-ready}

| Symptom | Cause | What to do |
| --- | --- | --- |
| `crane healthcheck` prints `порт 9464 ответил нездоровым статусом: HTTP/1.1 503 Service Unavailable` | The catalog or the blob storage is unavailable or answered with an error | Read the "хранилище не готово" records: {{< xref "operations/health-checks#failed" >}}, {{< xref "operations/outages" >}} |
| `crane healthcheck` prints `проба порта 9464 не уложилась в 2s` | The probe port does not answer: the server is still starting or hangs | Check the startup log; in Compose wait for `migrate` to finish |
| `crane healthcheck` prints a connection error | The server is not running or listens on another probe port | The command reads {{< env "CRANE_ADMIN_PORT" >}} from its own environment: set the same value as the server |
| The `crane` container is not created, `migrate` exited with code `1` | A migration failed | {{< xref "operations/upgrades-and-migrations#failure" >}} |

## A client gets an error {#client}

The body shape and the full list of codes: {{< xref "reference/errors" >}}. Cargo and npm clients show the error text with the suffix `(request_id <id>)`; find the log record by that identifier.

| Code and text | Cause | What to do |
| --- | --- | --- |
| `401` `требуется токен` (token required) | The client did not send a token header | Configure the client: {{< xref "configure/access-token#presenting" >}} |
| `403` `токен отвергнут` (token rejected) | The token does not match the server token or is presented in a wrong scheme (for example, Basic instead of Bearer for npm) | Check the value of the {{< term "static-token" >}} and the scheme. The refusal is visible in the audit: an event of class `3002` |
| `403` `имя занято в публичном реестре: …` (the name is taken in the public registry) | The new name already exists in the public registry | Choose another name, or ask the platform administrator to reserve it in {{< env "CRANE_NAMESPACES" >}} |
| `403` `имя принадлежит namespace другого workspace` (the name belongs to another workspace's namespace) | The name is reserved for another team | Choose another name |
| `404` `репозиторий не найден` (repository not found) | The repository is not created, or the client address has a typo | Compare the name with {{< env "CRANE_CARGO_REPOS" >}} and {{< env "CRANE_NPM_REPOS" >}} |
| `404` `не найдено` (not found) on a proxy request | The package is absent upstream, or CRANE treats the name as internal | Find an `upstream.shadow` audit event with the same `request_id`: {{< xref "operations/logs#fields-audit" >}} |
| `405` `репозиторий не hosted: публикация запрещена` (the repository is not hosted: publishing is forbidden) | The client publishes to a proxy repository | Point the client at the address of the hosted repository |
| `409` `версия уже существует` (the version already exists) | The version is already published; the number is taken forever | Publish a new version number |
| `413` | The publish body is larger than {{< env "CRANE_MAX_PUBLISH_BYTES" >}} | Reduce the publish or raise the limit: {{< xref "configure/limits" >}} |
| `502` `upstream недоступен` (upstream unavailable) | The {{< term "upstream" >}} did not answer, refused or sent an archive with a wrong checksum | Find `upstream_failure` in the access line: {{< xref "operations/outages#upstream" >}} |
| `503` `хранилище временно недоступно` (storage temporarily unavailable) | The catalog or the blob storage does not answer | Retry later; restore the component: {{< xref "operations/outages" >}} |
| `500` `внутренняя ошибка сервера` (internal server error) | An error in CRANE itself | Find the "внутренняя ошибка запроса" record by the request identifier |

## The log does not show what is expected {#logs}

| Symptom | Cause | What to do |
| --- | --- | --- |
| Access lines show the proxy address instead of the client address | The proxy is not in {{< env "CRANE_TRUSTED_PROXIES" >}} | Add the address or network of the proxy: {{< xref "configure/network" >}} |
| There is no "сервер запущен" (server started) record | {{< env "RUST_LOG" >}} hides `info` records | Return to `info`; the security journal does not disappear meanwhile |
| An access line has no `actor` field | The request had no accepted token | This is not an error: `actor` is written only on successful authentication |

## Verify {#verify}

Check that the fix worked:

1. `crane healthcheck` returns `0`.
2. The request that failed returns the expected code. For a check without a token, `401` on any repository path is enough: {{< xref "operations/health-checks#steps" >}}.
3. The log has no new `ERROR` records.

## What next {#next}

{{< cards "operations/outages" "operations/logs" "reference/errors" "reference/server-cli" >}}
