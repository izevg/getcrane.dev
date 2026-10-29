---
title: "Журналы"
description: "Формат журнала CRANE (JSON в stdout), три цели журнала ИБ, которые не отключает RUST_LOG, поля событий и фильтрация журнала безопасности."
audience: [platform, security, auditor]
genre: how-to
state: current
status: available
weight: 20
terms: [security-journal, ocsf, principal, upstream]
---

CRANE пишет журнал в стандартный вывод в формате JSON, по одной строке на событие. Среди этих строк три цели образуют {{< term "security-journal" >}}: аудит (`crane::audit`), доступ (`crane::access`) и исходящие запросы (`crane::upstream`). Уровень логов {{< env "RUST_LOG" >}} их не отключает: сервер всегда включает эти цели на уровне `info` и ставит директивы после значения администратора.

Страница показывает, как прочитать журнал, выбрать уровень обычных логов, выделить журнал безопасности и проследить один запрос. Здесь же перечислены поля событий и то, что в журнал не попадает.

## Перед началом {#prerequisites}

- Работающее развёртывание в Docker Compose: {{< xref "deploy/docker-compose" >}}.
- Утилита `jq` на хосте для фильтрации.
- Право читать журнал контейнера. Журнал содержит пути запросов и адреса клиентов, а цепочки причин сбоев могут содержать адрес хранилища: доступ нужен только тем, кто вправе это видеть.

## Шаги {#steps}

1. Прочитайте журнал сервиса `crane`. Флаг `--no-log-prefix` убирает префикс Compose, и каждая строка остаётся валидным JSON.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml logs --no-log-prefix crane
   ```

2. Отфильтруйте журнал безопасности по полю `target`. Фильтр `fromjson?` пропускает строки, которые не являются JSON (например, текст паники).

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml logs --no-log-prefix crane \
     | jq -cR 'fromjson? | select(.target == "crane::audit"
                                  or .target == "crane::access"
                                  or .target == "crane::upstream")'
   ```

3. Выберите одну цель. Примеры: отказы аутентификации, попытки получить внутреннее имя через proxy и отказы upstream.

   ```bash
   # отказы аутентификации (класс OCSF 3002)
   jq -cR 'fromjson? | select(.target == "crane::audit" and .class_uid == 3002)'

   # отказы proxy отдавать имя, которое CRANE считает внутренним
   jq -cR 'fromjson? | select(."api.operation" == "upstream.shadow")'

   # запросы, где upstream не ответил или отказал
   jq -cR 'fromjson? | select(.target == "crane::access" and .upstream_failure != null)'
   ```

   Каждую команду `jq` подставьте после канала `|` из шага 2.

4. Проследите один запрос. Клиент получает идентификатор в заголовке `X-Request-Id` и в теле ошибки (`request_id`). В строке доступа идентификатор лежит в поле `request_id`, в событии аудита — в поле `metadata.correlation_uid`.

   ```bash
   jq -cR --arg id "<request_id>" 'fromjson?
     | select(.request_id == $id or ."metadata.correlation_uid" == $id)'
   ```

5. Задайте уровень обычных логов. Переменная {{< env "RUST_LOG" >}} в проекте Compose не передаётся контейнеру, поэтому добавьте её в собственный override-файл, например `logging.yaml`:

   ```yaml
   services:
     crane:
       environment:
         RUST_LOG: warn
   ```

   Подключите файл последним `-f` (вместе с остальными файлами проекта, если подключены режимы S3 или Valkey) и пересоздайте контейнер:

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml \
     -f logging.yaml up -d crane
   ```

> [!TIP]
> Значение `warn` скрывает записи уровня `info`, в том числе «сервер запущен». Значение `off` скрывает и ошибки запуска («роль завершилась с ошибкой»): при диагностике верните `info`. События трёх целей журнала ИБ остаются в любом случае.

## Проверка {#verify}

Выполните любой запрос к API и найдите его строку доступа. Пример для запроса без токена:

```bash
curl -sS -o /dev/null https://crane.example.com/cargo/internal/index/config.json
docker compose --project-directory . \
  -f deploy/compose/docker-compose.yaml logs --no-log-prefix --tail 20 crane \
  | jq -cR 'fromjson? | select(.target == "crane::access")
            | {status, method, path, request_id}'
```

```text
{"status":401,"method":"GET","path":"/cargo/internal/index/config.json","request_id":"…"}
```

Строка доступа появляется при любом `RUST_LOG`, в том числе при `off`.

## Формат строки {#format}

Каждая строка — отдельный объект JSON. Поля события лежат на верхнем уровне, а не во вложенном объекте `fields`: коллектору не нужен второй путь. Кроме полей события, строку формируют служебные поля:

| Поле | Значение |
| --- | --- |
| `timestamp` | время записи |
| `level` | `ERROR`, `WARN`, `INFO`, `DEBUG` или `TRACE` |
| `message` | текст события; тексты сообщений сервера — на русском языке |
| `target` | цель журнала: `crane::audit`, `crane::access`, `crane::upstream` или модуль сервера |
| `span`, `spans` | контекст запроса: `request_id` и `trace_id` из заголовка `traceparent` ({{< cite "w3c-trace-context" >}}), если клиент его прислал и он корректен |

Фильтр {{< env "RUST_LOG" >}} использует синтаксис `tracing-subscriber`. Значение, которое не удаётся разобрать, заменяется на `info`, а не отключает журнал.

## Журнал ИБ: три цели {#security-targets}

Журнал безопасности отвечает на три вопроса: что сделал принципал, кто и что запрашивал и куда CRANE ходил сам. Сервер закрепляет все три цели на уровне `info`, поэтому администратор, снизивший шум через {{< env "RUST_LOG" >}}, не теряет события безопасности молча. Подробнее о гарантии: {{< xref "features/security/security-journal#targets" >}}.

| Цель | Одно событие на | Сообщение |
| --- | --- | --- |
| `crane::audit` | действие или отказ: публикация, yank, удаление, deprecate, тег, резервирование namespace, отказ аутентификации, отказ выдать внутреннее имя | `аудит` |
| `crane::access` | каждый HTTP-запрос к порту API | `запрос обработан` |
| `crane::upstream` | каждую реальную выборку из {{< term "upstream" >}}, включая отказы egress-политики | `выборка из upstream` |

Запросы к порту проб в журнал доступа не попадают: оркестратор дёргает их каждые несколько секунд.

## Поля событий {#fields}

### Доступ: `crane::access` {#fields-access}

| Поле | Значение |
| --- | --- |
| `method`, `path` | метод и путь запроса без query |
| `status` | код ответа |
| `duration_ms` | длительность обработки в миллисекундах |
| `request_id` | идентификатор запроса |
| `client_ip` | адрес клиента; из `X-Forwarded-For` только от доверенных прокси ({{< env "CRANE_TRUSTED_PROXIES" >}}) |
| `user_agent` | `User-Agent`, не более 256 знаков |
| `actor` | имя {{< term "principal" "принципала" >}} ({{< env "CRANE_TOKEN_PRINCIPAL" >}}); поле есть только у запросов с принятым токеном |
| `cache` | для proxy-репозиториев: `hit`, `miss`, `stale`, `stale-on-error` |
| `upstream_failure` | для proxy-репозиториев: `refused`, `unavailable`, `throttled`, `digest-mismatch`, `too-large`, `weak-integrity` |
| `upstream_reason` | причина отказа egress-политики или расхождения контрольной суммы |

Поля без значения в строку не пишутся.

### Аудит: `crane::audit` {#fields-audit}

Имена полей — плоские пути схемы {{< term "ocsf" >}} (`actor.user.uid`, {{< cite "ocsf" >}}), вложенный объект собирает коллектор.

| Поле | Значение |
| --- | --- |
| `class_uid` | `6003` (API Activity) для действий, `3002` (Authentication) для отказов аутентификации |
| `category_uid`, `activity_id`, `activity_name`, `type_uid` | классификация OCSF: `Create`, `Read`, `Update`, `Delete` или `Logon` |
| `status_id`, `status`, `severity_id` | `1`, `Success`, `1` при успехе; `2`, `Failure`, `2` при отказе |
| `status_detail` | причина отказа |
| `status_code` | стабильный код отказа по правилу, например `foreign-registry-dependency` |
| `metadata.uid`, `metadata.correlation_uid` | идентификатор события и идентификатор запроса |
| `metadata.version`, `metadata.product.name`, `metadata.product.version` | версия схемы OCSF, `CRANE` и версия сервера |
| `time` | время события в миллисекундах от эпохи Unix |
| `actor.user.uid`, `actor.user.type_id`, `actor.user.type` | принципал действия (у класса `6003`); токен доступа даёт тип `Robot` |
| `user.uid`, `user.type_id`, `user.type` | субъект события аутентификации (класс `3002`); при неизвестном субъекте тип `Unknown` |
| `src_endpoint.ip`, `http_request.user_agent` | адрес клиента и `User-Agent` |
| `api.operation` | операция: `publish`, `yank`, `unyank`, `delete`, `deprecate`, `undeprecate`, `tag`, `untag`, `namespace.reserve`, `upstream.shadow` |
| `resources.uid`, `resources.type` | пакет в виде purl (`pkg:cargo/demo-crate@1.0.0`), тип `package` |
| `unmapped.repository`, `unmapped.trace_id` | репозиторий и идентификатор трассы, если есть |

Успешная аутентификация отдельным событием не фиксируется, а запрос без токена — часть рукопожатия протокола и не аудируется: {{< xref "configure/access-token#presenting" >}}. Резервирования из {{< env "CRANE_NAMESPACES" >}} сервер записывает при старте от имени `crane:config`.

### Исходящие запросы: `crane::upstream` {#fields-egress}

| Поле | Значение |
| --- | --- |
| `host`, `path` | хост upstream и путь без query |
| `status` | код ответа upstream, если ответ получен |
| `failure` | `refused` — отказ политики egress, `unavailable` — сетевая ошибка, `throttled` — upstream ограничил запросы |
| `elapsed_ms` | время до получения заголовков |

Запрос, обслуженный из кэша или присоединившийся к чужой выборке, строки не порождает: по числу строк с одним `path` видно, сколько раз CRANE реально обращался к upstream. Подробнее: {{< xref "features/security/egress-guard#journal" >}}.

## Сообщения сервера {#messages}

Обычные записи проще всего искать по полю `message`. Таблица содержит сообщения, которые нужны при эксплуатации.

| Сообщение | Уровень | Когда и какие поля |
| --- | --- | --- |
| `сервер запущен` | info | Порты заняты, сервер принимает запросы. Поля `http_port`, `admin_port`, `repos`, `proxy_repos`, `npm_repos`, `npm_proxy_repos` |
| `получен SIGINT`, `получен SIGTERM`, `сервер остановлен` | info | Штатная остановка |
| `миграции PostgreSQL применены` | info | Роль `migrate` завершилась успешно |
| `кэш proxy выбран` | info | Поле `cache`: `memory` или `valkey` |
| `роль завершилась с ошибкой` | error | Роль завершилась с кодом `1`. Поле `error` содержит причину |
| `строка настройки в БД не действует` | warn | Поля `key` и `reason`; значение не пишется |
| `хранилище не готово`, `проба хранилищ не уложилась в 1.5s` | warn | Проба готовности ответила отказом |
| `хранилище недоступно` | warn | Запрос получил `503`; поле `error` — цепочка причин |
| `внутренняя ошибка запроса` | error | Запрос получил `500`; поле `error` — цепочка причин |
| `документ upstream не разобран` | warn | Upstream прислал документ, который CRANE не смог разобрать; клиент получил `502` |
| `фоновое обновление proxy не удалось` | warn | Фоновая ревалидация документа завершилась ошибкой |
| `Valkey: команды отказывают сразу до переподключения` | warn | Поле `valkey` равно `unavailable`: кэш деградировал |
| `Valkey: соединение установлено` | info | Поле `valkey` равно `available` |
| `Valkey: подключение не удалось, повтор`, `Valkey: соединение потеряно, переподключение` | warn | Поле `kind` называет вид ошибки клиента без адреса |

## Что не попадает в журнал {#excluded}

- **Секреты.** Токен, пароль Basic, пароли подключений и ключи S3 не пишутся. Секреты хранятся в типе без вывода, а ошибки конфигурации называют переменную, но не значение.
- **Query-строка.** В журнал идёт только путь запроса: в query бывают токены и персональные данные.
- **Тела и заголовки.** Тела запросов и ответов и заголовки не пишутся. Исключение — `User-Agent` (до 256 знаков) и значение `X-Request-Id` от доверенного прокси. Строка исходящего запроса не содержит заголовков, тел и `ETag`.
- **Содержимое ошибок для клиента.** Клиент получает короткий текст и `request_id`. Адрес хранилища и внутренняя причина остаются в журнале сервера: по этой причине доступ к журналу нужно ограничивать.

## Что дальше {#next}

{{< cards "features/security/security-journal" "operations/troubleshooting" "reference/errors" >}}

- {{< xref "reference/environment-variables#group-logging" >}}
