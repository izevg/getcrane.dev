---
title: "Кэш Valkey"
description: "Как подключить Valkey к CRANE в Compose: override docker-compose.cache.yaml, ACL из пароля, изолированная сеть, допустимые схемы адреса и поведение при отказе."
audience: [platform, security]
genre: how-to
state: current
status: available
weight: 40
terms: [upstream, proxy-repository, blob, cas, digest]
---

Страница описывает, как заменить кэш в памяти процесса общим кэшем Valkey. Valkey хранит кэш {{< term "proxy-repository" >}} и координирует выборки из {{< term "upstream" >}} между репликами `crane`. Режим включает override-файл `deploy/compose/docker-compose.cache.yaml`: он добавляет Valkey с обязательной аутентификацией в изолированной сети `cache`.

В Compose-файле `crane` — один контейнер, поэтому там Valkey не обязателен. По умолчанию сервер берёт кэш `memory`, если не заданы ни {{< env "CRANE_CACHE" >}}, ни {{< env "CRANE_CACHE_FILE" >}}. Valkey нужен, когда реплики должны делить кэш.

> [!WARNING]
> Valkey должен быть доступен только `crane`. Кэш хранит тела документов proxy, которые CRANE отдаёт клиентам, и указатели на {{< term "blob" >}} в {{< term "cas" "CAS" >}}. Тот, кто пишет в Valkey, может подменить документы proxy и указатели. Не публикуйте порт Valkey, не отключайте аутентификацию и не подключайте другие сервисы к сети `cache`.

## Перед началом {#prerequisites}

- Рабочий проект из {{< xref "deploy/docker-compose" >}}.
- Значения {{< env "VALKEY_IMAGE" >}}, {{< env "VALKEY_MAXMEMORY" >}}, {{< env "VALKEY_PASSWORD_SECRET" >}} и {{< env "CRANE_CACHE_URL_SECRET" >}} в `.env` (в `.env.dist` они уже есть).

## Шаги {#steps}

1. При необходимости измените предел памяти Valkey в `.env`. Ключи артефактов proxy живут без TTL, поэтому предел обязателен. Политика вытеснения `allkeys-lru` зафиксирована в compose-файле и не настраивается.

   ```bash
   VALKEY_MAXMEMORY=512mb
   ```

2. Создайте файлы пароля и адреса. Задача создаёт `./secrets/valkey_password` и `./secrets/cache_url` с адресом вида `valkey://crane:<пароль>@valkey:6379` и ничего не перезаписывает.

   ```bash
   task secrets:init
   ```

3. Запустите проект с двумя compose-файлами.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml \
     -f deploy/compose/docker-compose.cache.yaml up -d
   ```

   Вместо ключей `-f` можно добавить в `.env` одну строку:

   ```bash
   COMPOSE_FILE=deploy/compose/docker-compose.yaml:deploy/compose/docker-compose.cache.yaml
   ```

> [!NOTE]
> Не задавайте {{< env "CRANE_CACHE" >}} в этом режиме. Адрес с паролем лежит только в секрете `cache_url`, и сервер читает его через {{< env "CRANE_CACHE_FILE" >}}. Если заданы обе переменные, сервер не стартует.

## Проверка {#verify}

1. Покажите состояние сервисов. `valkey` и `crane` должны иметь статус `healthy`.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml \
     -f deploy/compose/docker-compose.cache.yaml ps -a
   ```

2. Найдите в журнале `crane` запись «кэш proxy выбран» с полем `cache`. Значение `valkey` подтверждает выбор, но не доступность сервера: `crane` не ждёт подключения к Valkey.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml \
     -f deploy/compose/docker-compose.cache.yaml logs crane
   ```

3. Проверьте, что `crane` пишет в Valkey. После первого запроса к proxy-репозиторию число ключей больше нуля.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml \
     -f deploy/compose/docker-compose.cache.yaml exec valkey \
     sh -c 'REDISCLI_AUTH="$(cat /run/secrets/valkey_password)" valkey-cli --user crane dbsize'
   ```

## Что меняет override {#override}

| Сервис | Изменение |
| --- | --- |
| `valkey` | Образ {{< env "VALKEY_IMAGE" >}}; запуск с `--save ""`, `--appendonly no`, `--maxmemory ${VALKEY_MAXMEMORY}`, `--maxmemory-policy allkeys-lru` и `--aclfile`; данные не сохраняются на диск |
| `crane` | Читает адрес из `CRANE_CACHE_FILE=/run/secrets/cache_url`; подключён к сети `cache`; стартует после того, как `valkey` стал здоровым |

ACL собирается при старте контейнера из файла пароля во временном файле с правами `0600`. Пароль не попадает в аргументы процесса, окружение и образ:

```text
user default off
user crane on >пароль ~* &* +@all -@dangerous
```

Пользователь `default` выключен. Пользователю `crane` недоступна группа команд `@dangerous` (`KEYS`, `CONFIG`, `SHUTDOWN` и другие). Политика живёт в compose-файле и обновляется вместе с ним. Проба состояния Valkey читает пароль из секрета внутри контейнера, и в аргументах команды и в `docker inspect` его нет.

Сеть `cache` объявлена `internal: true` и содержит только `crane` и `valkey`. Сам `crane` выходит наружу через сети `default` и `edge`.

## Схемы адреса {#schemes}

Адрес имеет вид `valkey[s][-cluster|-sentinel]://[пользователь:пароль@]хост[:порт][/db]`.

| Схема или значение | Назначение |
| --- | --- |
| `valkey` | Один узел |
| `valkeys` | Один узел, TLS |
| `valkey-cluster`, `valkeys-cluster` | Valkey Cluster, без TLS и с TLS |
| `valkey-sentinel`, `valkeys-sentinel` | Valkey Sentinel, без TLS и с TLS; пример: `valkey-sentinel://<хост>:26379?sentinelServiceName=<имя>` |
| `memory` | Кэш в памяти процесса |

Схемы `redis://` и `rediss://` не принимаются. Сервер не стартует и называет схему, но не остальной адрес:

```text
CRANE_CACHE: значение со схемой `redis` пока не поддерживается
```

TLS (`valkeys`) нужен, когда трафик выходит за пределы узла или доверенной сети. Внешнему Valkey задайте `maxmemory` и `maxmemory-policy allkeys-lru` самостоятельно.

## Поведение при отказе Valkey {#failure}

Valkey не влияет на готовность `crane`: сервер не ждёт подключения, и `/healthz/ready` его не проверяет. Кэш не источник истины, поэтому его потеря не теряет данные.

- Ошибка чтения из кэша движок proxy считает промахом и идёт в {{< term "upstream" >}}.
- Каждая команда ограничена одной секундой. Зависший сокет обнаруживается за секунду плюс интервал проверки в 250 мс, дальше команды отказывают сразу, а переподключение идёт в фоне.
- Запись всегда попадает в кэш процесса (L1, 256 МиБ), даже если Valkey недоступен. Устаревание L1 из-за пропущенной инвалидации ограничено 30 секундами.

Содержимое кэша отдаётся клиентам. Для артефакта с ожидаемым SHA-256 из индекса указатель на чужой blob отвергается, но при одновременной подмене индекса эта защита не работает, а если ожидаемого {{< term "digest" >}} нет, проверки тоже нет. CRANE не подписывает записи кэша, поэтому изоляция и аутентификация Valkey остаются обязательными.

## Что дальше {#next}

{{< cards "configure/cache" "deploy/s3-storage" "security/hardening" "operations/health-checks" >}}
