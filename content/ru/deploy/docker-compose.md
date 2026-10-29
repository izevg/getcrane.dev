---
title: "Docker Compose на одном узле"
description: "Как запустить CRANE на одном хосте через Docker Compose: от файла .env и секретов до работающего сервера за Caddy и проверки готовности."
audience: [platform]
genre: how-to
state: current
status: available
weight: 20
terms: [proxy-repository, namespace, blob]
---

Страница ведёт от клонированного репозитория до работающего сервера CRANE на одном хосте. Caddy принимает TLS, `crane` обслуживает протоколы пакетов, PostgreSQL хранит каталог, а {{< term "blob" >}} лежат в локальном томе. Образ CRANE сейчас не публикуется, поэтому шаги включают его локальную сборку.

Безопасные значения заданы по умолчанию. Секреты лежат в файлах и не попадают в переменные окружения. Порт проб (admin) не публикуется. Caddy удаляет клиентский заголовок `X-Request-Id`, и CRANE выдаёт идентификатор запроса сам.

## Перед началом {#prerequisites}

- Хост с Docker, BuildKit и Docker Compose. Версии: {{< xref "deploy/requirements#tooling" >}}.
- go-task и Node.js 24 для задачи `task secrets:init`.
- Копия репозитория CRANE. Все команды выполняются из его корня.
- Свободные порты `80` и `443` (переменные {{< env "CADDY_HTTP_PORT" >}} и {{< env "CADDY_HTTPS_PORT" >}}).
- Публичное DNS-имя для {{< env "CRANE_HOST" >}}. Для проверки подойдёт `localhost`.

## Шаги {#steps}

1. Скопируйте шаблон окружения. Все значения живут в `.env`; в compose-файлах умолчаний нет, и пропущенная переменная останавливает запуск.

   ```bash
   cp .env.dist .env
   ```

2. Задайте публичное имя в `.env`. Для публичного имени Caddy сам получает сертификат ACME, для `localhost` использует внутренний CA.

   ```bash
   CRANE_HOST=crane.example.com
   ```

3. Создайте файлы секретов. Задача создаёт недостающие файлы со случайными значениями и ничего не перезаписывает.

   ```bash
   task secrets:init
   ```

   Задача печатает пути созданных файлов и не печатает значения. Сообщения задачи выводятся на русском языке:

   ```text
   секреты созданы: ./secrets/crane_token, ./secrets/postgres_password, ./secrets/database_url, ./secrets/s3_access_key_id, ./secrets/s3_secret_access_key, ./secrets/valkey_password, ./secrets/cache_url
   ```

   При повторном запуске выводится `секреты уже на месте`. Значение статического токена для клиентов лежит в `./secrets/crane_token`.

4. При необходимости включите репозитории. Задайте или добавьте строки в `.env`. Пустое значение выключает {{< term "proxy-repository" >}}, а имя proxy-репозитория не должно совпадать с именем hosted-репозитория.

   ```bash
   CRANE_CARGO_PROXY_REPOS=crates-io
   CRANE_NPM_REPOS=web
   CRANE_NPM_PROXY_REPOS=npmjs
   CRANE_NAMESPACES=cargo:acme-*
   ```

   Переменная {{< env "CRANE_NAMESPACES" >}} резервирует внутренние {{< term "namespace" >}}: proxy никогда не отдаёт эти имена. Формат записей: `формат:шаблон` или `формат:шаблон=uuid`, через запятую.

5. Соберите образ. Имя и тег должны совпадать с {{< env "CRANE_IMAGE" >}} и {{< env "CRANE_VERSION" >}} из `.env` (по умолчанию `crane/crane` и `latest`).

   ```bash
   docker build -f deploy/docker/Dockerfile -t crane/crane:latest .
   ```

6. Запустите проект.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml up -d
   ```

   Ключ `--project-directory .` обязателен: пути `./deploy/caddy` и `./secrets` и файл `.env` считаются от корня репозитория, а не от `deploy/compose`. Порядок запуска: `postgres` становится здоровым, `migrate` применяет миграции и завершается, затем стартует `crane`, затем `caddy`.

## Проверка {#verify}

1. Покажите состояние сервисов. Сервис `crane` должен иметь статус `healthy`, а `migrate` — завершиться с кодом `0`.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml ps -a
   ```

2. Запустите пробу готовности внутри контейнера. Команда `crane healthcheck` опрашивает `/healthz/ready` на порту admin и завершается с кодом `0` или `1`. Вывода при успехе нет.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml exec crane crane healthcheck
   echo $?
   ```

   ```text
   0
   ```

3. Найдите в журнале запись о запуске. Журнал пишется в формате JSON; запись называется «сервер запущен» и содержит порты `http_port` и `admin_port`.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml logs crane
   ```

Проба `/healthz/ready` проверяет PostgreSQL и хранилище blob и укладывается в 1,5 с. Порт admin не опубликован, поэтому с хоста `curl` до него не дойдёт: так задумано. Подробности: {{< xref "operations/health-checks" >}}.

## Что запускается {#services}

| Сервис | Назначение |
| --- | --- |
| `caddy` | TLS и обратный прокси к `crane`; публикует порты {{< env "CADDY_HTTP_PORT" >}} и {{< env "CADDY_HTTPS_PORT" >}} |
| `migrate` | Одноразовая роль `migrate`; блокировка исключает параллельный запуск миграций |
| `crane` | Роль `all`: API и порт проб. Пределы ресурсов: {{< env "CRANE_CPUS" >}} и {{< env "CRANE_MEMORY" >}} |
| `postgres` | Каталог в томе `pg`; наружу порт не опубликован |

Блобы лежат в томе `blobs` (`CRANE_BLOBS=file:///data/blobs`), данные Caddy, включая выданные сертификаты, в томе `caddy-data`. Кэш proxy по умолчанию находится в памяти процесса. Роль `all` сейчас равна роли `serve`: см. {{< xref "reference/server-cli" >}}.

> [!SECURITY]-
> Контейнер `crane` запущен с `read_only: true`, `tmpfs` на `/tmp`, `no-new-privileges:true` и `cap_drop: [ALL]`. Образ основан на `distroless` и работает от пользователя `65532`. Подробнее: {{< xref "security/hardening" >}}.

## Сеть edge и доверенные прокси {#edge}

Сеть `edge` соединяет только `caddy` и `crane`. Её подсеть фиксирована переменной {{< env "CRANE_EDGE_SUBNET" >}} (по умолчанию `172.31.250.0/24`), и то же значение Compose передаёт серверу как {{< env "CRANE_TRUSTED_PROXIES" >}}. Поэтому CRANE верит `X-Forwarded-For` и `X-Request-Id` только от Caddy, а в аудите виден адрес клиента, а не прокси. Подсеть должна быть свободной: одно значение задаёт и сеть, и список доверенных прокси.

Без {{< env "CRANE_TRUSTED_PROXIES" >}} сервер игнорирует оба заголовка. Эталонный `Caddyfile` удаляет клиентский `X-Request-Id` (`header_up -X-Request-Id`). Подробнее о сети: {{< xref "configure/network" >}}.

> [!WARNING]
> Не публикуйте порт admin ({{< env "CRANE_ADMIN_PORT" >}}, по умолчанию `9464`). Пробы работают без токена и не проходят через Caddy.

## Секреты {#secrets}

Токен, пароль PostgreSQL и URL каталога лежат в файлах. Compose монтирует их в `/run/secrets`, а сервер читает через переменные `*_FILE`.

| Переменная в `.env` | Файл по умолчанию | Кто читает |
| --- | --- | --- |
| {{< env "CRANE_TOKEN_SECRET" >}} | `./secrets/crane_token` | `crane`, через {{< env "CRANE_TOKEN_FILE" >}} |
| {{< env "POSTGRES_PASSWORD_SECRET" >}} | `./secrets/postgres_password` | `postgres`, через `POSTGRES_PASSWORD_FILE` |
| {{< env "CRANE_DATABASE_URL_SECRET" >}} | `./secrets/database_url` | `crane` и `migrate`, через {{< env "CRANE_DATABASE_URL_FILE" >}} |

Каталог `secrets` создаётся с правами `0700`, файлы — с правами `0644`: на Linux секрет читают пользователь `65532` и `postgres`, а не владелец на хосте. Каталог `/secrets/` внесён в `.gitignore`. Если создавать файлы вручную, URL каталога имеет вид `postgres://crane:<пароль>@postgres:5432/crane`, а пароль состоит только из символов, безопасных в URL.

Переменные {{< env "CRANE_TOKEN" >}} и {{< env "CRANE_TOKEN_FILE" >}} задавать вместе нельзя: сервер не стартует. Пароль PostgreSQL записывается в том `pg` при первом запуске, и смена файла пароль в уже созданном томе не меняет.

## Что дальше {#next}

{{< cards "deploy/s3-storage" "deploy/valkey-cache" "configure/access-token" "operations/upgrades-and-migrations" >}}
