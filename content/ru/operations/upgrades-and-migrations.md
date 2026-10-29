---
title: "Обновления и миграции"
description: "Как обновить CRANE в Docker Compose: роль crane migrate с блокировкой, расширения vector и pg_trgm, порядок migrate, затем crane и действия при ошибке миграции."
audience: [platform]
genre: how-to
state: current
status: available
weight: 30
terms: [catalog]
---

Страница показывает, как обновить CRANE в Docker Compose на одном узле: применить миграции схемы {{< term "catalog" "каталога" >}} отдельной ролью `migrate`, затем запустить новую версию сервера. Результат: схема PostgreSQL соответствует версии образа, сервер здоров, а при ошибке миграции понятно, что делать.

Роль `crane migrate` применяет только недостающие миграции и безопасна для повторного запуска. Сервер (`serve`, `all`) миграции не применяет: схему готовит `migrate`. Политика версий обновления и схема expand, migrate, contract описаны на странице {{< xref "features/operations/upgrades" >}}.

> [!IMPORTANT]
> Миграции идут только вперёд, отката схемы нет. Перед обновлением сделайте резервную копию PostgreSQL средствами развёртывания: {{< xref "operations/backup-restore" >}}.

## Перед началом {#prerequisites}

- Работающее развёртывание: {{< xref "deploy/docker-compose" >}}.
- Новый исходный код CRANE в рабочем каталоге: образ сейчас собирается локально.
- Роль PostgreSQL из {{< env "CRANE_DATABASE_URL" >}} имеет права на изменение схемы. Расширения `vector` и `pg_trgm` либо уже созданы, либо роли хватает прав их создать: {{< xref "deploy/requirements#extensions" >}}.

## Шаги {#steps}

1. Соберите новый образ. Имя и тег должны совпадать с {{< env "CRANE_IMAGE" >}} и {{< env "CRANE_VERSION" >}} из `.env`.

   ```bash
   docker build -f deploy/docker/Dockerfile -t crane/crane:latest .
   ```

2. Примените миграции явным запуском роли. Команда создаёт одноразовый контейнер с новым образом, дожидается здоровой базы и показывает вывод миграции.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml run --rm migrate
   echo $?
   ```

   ```text
   {"timestamp":"…","level":"INFO","message":"миграции PostgreSQL применены"}
   0
   ```

   Та же запись появляется, когда новых миграций нет.

3. Обновите сервисы. Compose запускает `migrate` до `crane` и не стартует `crane`, пока `migrate` не завершился с кодом `0`; на одном узле контейнер `crane` пересоздаётся, и на это время API недоступен.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml up -d
   ```

   Контейнер получает `SIGTERM`, закрывает слушатели штатно и завершается кодом `0`: {{< xref "reference/server-cli#shutdown" >}}.

4. Если подключены режимы S3 или Valkey, передайте те же файлы `-f`, что и при первом запуске: {{< xref "deploy/s3-storage" >}}, {{< xref "deploy/valkey-cache" >}}.

Обновление в Kubernetes описывает страница {{< xref "deploy/kubernetes-helm" >}}; она находится в разработке.

## Проверка {#verify}

1. Сервис `migrate` завершился с кодом `0`, сервис `crane` имеет состояние `healthy`.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml ps -a
   ```

2. Проба готовности отвечает кодом `0`: {{< xref "operations/health-checks" >}}.

3. Таблица `_sqlx_migrations` содержит все миграции с признаком `success = t`. Последняя строка — самая новая миграция.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml exec postgres sh -c \
     'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
      -c "SELECT version, description, success FROM _sqlx_migrations ORDER BY version"'
   ```

   ```text
    version | description   | success
   ---------+---------------+---------
          1 | catalog       | t
          2 | npm           | t
          3 | namespace     | t
          4 | settings      | t
          5 | version_order | t
          6 | blob_digests  | t
   ```

## Как работает роль migrate {#how}

Роль выполняет шаги по порядку, любая ошибка завершает её с кодом `1`.

1. Подключается к PostgreSQL по {{< env "CRANE_DATABASE_URL" >}}. Остальные настройки (токен, публичный адрес, blob) роли не нужны. Ожидание соединения — не дольше 5 с.
2. Проверяет расширения `vector` и `pg_trgm` и при необходимости создаёт их. Без расширений миграции не применяются.
3. Берёт advisory-блокировку PostgreSQL и применяет недостающие миграции по возрастанию номера.
4. Пишет «миграции PostgreSQL применены». Для каталога `memory` пишет «хранилище в памяти: миграций нет» и завершается с кодом `0`.

Каждая миграция выполняется в одной транзакции вместе с записью в `_sqlx_migrations`. Если миграция упала, её изменения откатываются целиком, а предыдущие миграции остаются применёнными.

### Блокировка {#lock}

Роль использует advisory-блокировку PostgreSQL: пока одна миграция идёт, вторая ждёт на блокировке и начинает работу, когда первая завершится. Отдельная блокировка сериализует создание расширений. CRANE не ограничивает ожидание на блокировке по времени: второй запуск не падает по таймауту, а стоит до конца первого.

### Расширения {#extensions}

CRANE требует `vector` (pgvector 0.8 и новее) и `pg_trgm`. Поведение роли для каждого состояния базы, права на создание расширений и готовый SQL для администратора управляемого PostgreSQL описаны в {{< xref "deploy/requirements#extensions" >}}. Эта страница их не повторяет.

## Если миграция не прошла {#failure}

Причина записана в поле `error` записи «роль завершилась с ошибкой». Ошибки драйвера PostgreSQL остаются на английском языке, остальной текст — на русском.

| Текст ошибки | Причина | Что делать |
| --- | --- | --- |
| `не удалось подключиться к PostgreSQL (CRANE_DATABASE_URL): …` | База недоступна, неверный адрес или учётные данные | Проверьте, что `postgres` здоров, и содержимое секрета с адресом базы. Запустите `migrate` снова |
| `миграции PostgreSQL не применены: расширение PostgreSQL vector недоступно на сервере …` | В образе PostgreSQL нет нужного пакета или его версия ниже требуемой | Используйте образ с pgvector 0.8 или новее: {{< xref "deploy/requirements#images" >}} |
| `миграции PostgreSQL не применены: расширения PostgreSQL pg_trgm нет, а роли не хватает прав его создать …` | У роли нет прав создать расширение | Выполните `CREATE EXTENSION` от имени администратора базы: {{< xref "deploy/requirements#extensions" >}} |
| `миграции PostgreSQL не применены: расширение PostgreSQL vector версии … старше требуемой 0.8 …` | Установлена старая версия расширения | Выполните `ALTER EXTENSION vector UPDATE;` от имени администратора базы |
| `миграции PostgreSQL не применены: while executing migration <N>: …` | Миграция <N> завершилась ошибкой и откатилась | Устраните причину из текста ошибки базы (права, место на диске, блокировки) и запустите `migrate` снова: она продолжит с миграции <N> |
| `миграции PostgreSQL не применены: migration <N> was previously applied but has been modified` | База применила миграцию <N> с другим содержимым: она создана другой сборкой CRANE | Запустите образ, собранный из того же исходного кода, которым база была мигрирована. Не правьте таблицу `_sqlx_migrations` |
| `миграции PostgreSQL не применены: migration <N> was previously applied but is missing in the resolved migrations` | База новее образа: запущен образ старой версии | Запустите образ не старше версии, мигрировавшей базу. Откат схемы не поддерживается |

Пока `migrate` не завершился успешно, Compose не запускает сервис `crane`: он ждёт завершения `migrate` с кодом `0`.

## Что дальше {#next}

- {{< xref "features/operations/upgrades" >}}
- {{< xref "operations/health-checks" >}}
- {{< xref "operations/backup-restore" >}}
- {{< xref "operations/troubleshooting" >}}
