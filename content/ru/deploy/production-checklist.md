---
title: "Чек-лист перед вводом в работу"
description: "Проверяемые пункты перед вводом CRANE в работу в текущей поставке: образы, секреты, порты, TLS, доверенные прокси, данные, пределы и пробы."
audience: [platform, security]
genre: reference
state: current
status: available
weight: 70
terms: [digest, namespace, readiness-probe]
---

Страница перечисляет, что проверить в Compose-развёртывании CRANE перед тем, как направить на него клиентов. Каждый пункт содержит способ проверки и ссылку на страницу, где объяснено, почему так и как это настроить. В список входит только то, что есть в поставке сейчас.

Пункты сгруппированы по теме: образы и секреты, сеть и TLS, данные, защита от подмены, наблюдаемость. Условные пункты (Valkey, S3, ключ шифрования настроек) нужны только в соответствующем режиме.

## Образы и секреты {#supply}

| Что проверить | Как убедиться | Подробности |
| --- | --- | --- |
| Образы сторонних сервисов закреплены тегом и {{< term "digest" >}}. Образ CRANE собирается локально, и его тег {{< env "CRANE_VERSION" >}} не закреплён | В `.env` значения {{< env "CADDY_IMAGE" >}}, {{< env "POSTGRES_IMAGE" >}} (и {{< env "VALKEY_IMAGE" >}}, {{< env "SEAWEEDFS_IMAGE" >}} в своих режимах) содержат `@sha256:`: `grep '_IMAGE=' .env` | {{< xref "deploy/requirements#images" >}} |
| Секреты лежат в файлах, а не в `.env` и не в окружении контейнера. Каталог `secrets` доступен только владельцу | `ls -ld secrets` начинается с `drwx------`; в `.env` только пути к файлам | {{< xref "security/hardening#steps" >}}, {{< xref "deploy/docker-compose#secrets" >}} |
| Токен хранится в файле и выдан только тем, кому нужен полный доступ: он открывает все репозитории на чтение и запись | В выводе `docker inspect --format '{{.Config.Env}}' <контейнер crane>` есть `CRANE_TOKEN_FILE=` и нет `CRANE_TOKEN=` | {{< xref "configure/access-token" >}} |

## Сеть и TLS {#network}

| Что проверить | Как убедиться | Подробности |
| --- | --- | --- |
| На хосте опубликованы только порты Caddy. Порт проб ({{< env "CRANE_ADMIN_PORT" >}}) и порты `crane`, PostgreSQL не опубликованы. Файл `docker-compose.dev.yaml` не подключён | В колонке `PORTS` вывода `docker compose ps` порты хоста есть только у `caddy` | {{< xref "security/hardening#steps" >}}, {{< xref "reference/ports-and-health" >}} |
| Клиенты ходят по HTTPS через прокси. {{< env "CRANE_HOST" >}} — публичное имя, а не `localhost` | `curl` к `https://<host>/` проходит без отключения проверки сертификата | {{< xref "deploy/tls-reverse-proxy#caddy" >}} |
| {{< env "CRANE_TRUSTED_PROXIES" >}} содержит адреса прокси и только их. В сети `edge` только `caddy` и `crane` | `docker network inspect crane_edge --format '{{range .Containers}}{{.Name}} {{end}}'` выводит `caddy` и `crane`; `client_ip` в журнале доступа — адрес клиента | {{< xref "deploy/tls-reverse-proxy#verify" >}}, {{< xref "configure/network" >}} |
| Valkey, если включён: подключён override `docker-compose.cache.yaml` с аутентификацией, сеть `cache` изолирована, порт не опубликован | `docker network inspect crane_cache --format '{{.Internal}}'` выводит `true` | {{< xref "deploy/valkey-cache#override" >}} |
| S3, если включён: сеть `s3` изолирована, ключи читаются из файлов | `docker network inspect crane_s3 --format '{{.Internal}}'` выводит `true` | {{< xref "deploy/s3-storage#override" >}} |

## Данные {#data}

| Что проверить | Как убедиться | Подробности |
| --- | --- | --- |
| Тома `pg` и `blobs` (в режиме S3 вместо `blobs` том `s3`) и `caddy-data` лежат на постоянном хранилище хоста. {{< env "CRANE_DATABASE_URL" >}} и {{< env "CRANE_BLOBS" >}} не равны `memory`: при `memory` данные теряются при перезапуске | `docker volume inspect crane_pg --format '{{.Mountpoint}}'` указывает на диск, который переживает перезагрузку хоста | {{< xref "deploy/docker-compose#services" >}}, {{< xref "deploy/requirements#postgresql" >}} |
| Ключ шифрования настроек, если в таблице `setting` есть зашифрованные строки: ключ передан файлом {{< env "CRANE_SETTINGS_KEY_FILE" >}} и хранится отдельно от резервных копий PostgreSQL. Без таких строк переменная не нужна | Сервер стартует без сообщений о ключе | {{< xref "configure/settings-encryption" >}} |

## Защита от подмены {#protection}

| Что проверить | Как убедиться | Подробности |
| --- | --- | --- |
| Все внутренние имена зарезервированы в {{< env "CRANE_NAMESPACES" >}}. По умолчанию значение пустое, и тогда не зарезервирован ни один {{< term "namespace" >}} | Запрос внутреннего имени через proxy-репозиторий получает `404` | {{< xref "configure/namespaces#verify" >}} |
| Пределы размеров соответствуют самым большим пакетам: {{< env "CRANE_MAX_PUBLISH_BYTES" >}} (по умолчанию `10485760`) и {{< env "CRANE_PROXY_MAX_ARTIFACT_BYTES" >}} (по умолчанию `2147483648`). Базовый compose-файл эти переменные серверу не передаёт | Публикация сверх предела получает `413`, артефакт сверх предела через proxy получает `502` | {{< xref "configure/limits" >}} |

## Наблюдаемость {#observability}

| Что проверить | Как убедиться | Подробности |
| --- | --- | --- |
| {{< term "readiness-probe" "Проба готовности" >}} `/healthz/ready` подключена к мониторингу. Порт проб не опубликован, поэтому проверка выполняется внутри сети или командой `crane healthcheck` | `docker compose exec crane crane healthcheck` завершается с кодом `0`; мониторинг поднимает тревогу при коде `1` | {{< xref "operations/health-checks" >}}, {{< xref "reference/ports-and-health#probes" >}} |
| Стандартный вывод `crane` собирается в хранилище логов. Три потока журнала ИБ приходят строками JSON, срок хранения задан | В хранилище логов есть записи с `target` равным `crane::access`, `crane::audit` и `crane::upstream` | {{< xref "security/security-events" >}}, {{< xref "operations/logs" >}} |

## Чего в списке нет {#absent}

Резервное копирование и проверка подлинности выпусков: функциональность в разработке, см. {{< xref "operations/backup-restore" >}} и {{< xref "security/release-verification" >}}.

## Что дальше {#next}

{{< cards "security/hardening" "deploy/tls-reverse-proxy" "operations/health-checks" "security" >}}
