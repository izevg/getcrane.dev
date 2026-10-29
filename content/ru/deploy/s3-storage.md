---
title: "Хранилище S3"
description: "Как перенести blob CRANE с локального тома в S3: override docker-compose.s3.yaml с SeaweedFS, ключи в файлах и бакет, который создаётся при запуске."
audience: [platform]
genre: how-to
state: current
status: available
weight: 30
terms: [blob, cas]
---

Страница описывает, как хранить {{< term "blob" >}} в S3 вместо локального тома. Режим включает override-файл `deploy/compose/docker-compose.s3.yaml`: он добавляет SeaweedFS, одноразово создаёт бакет и передаёт `crane` ключи доступа из файлов. Без этого файла Compose-проект не меняется и новых секретов не требует.

Ключи S3 лежат только в файлах. В окружении, в URL и в аргументах команд их нет, а SeaweedFS работает в сети без выхода наружу и без анонимного доступа.

## Перед началом {#prerequisites}

- Рабочий проект из {{< xref "deploy/docker-compose" >}}: файл `.env`, собранный образ `crane`, установленные `task` и Node.js.
- Выбранный режим хранения до первой публикации: страница не описывает перенос уже сохранённых blob между режимами.

## Шаги {#steps}

1. Задайте в `.env` адрес хранилища и имя бакета. Бакет в URL должен совпадать с {{< env "S3_BUCKET" >}}: его создаёт сервис `seaweedfs-init`.

   ```bash
   CRANE_BLOBS=s3://blobs?endpoint=http://seaweedfs:8333&allow_http=true
   S3_BUCKET=blobs
   ```

2. Создайте файлы ключей. Если файлов ещё нет, задача создаёт `./secrets/s3_access_key_id` и `./secrets/s3_secret_access_key` и ничего не перезаписывает.

   ```bash
   task secrets:init
   ```

3. Запустите проект с двумя compose-файлами.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml \
     -f deploy/compose/docker-compose.s3.yaml up -d
   ```

   Вместо ключей `-f` можно добавить в `.env` одну строку:

   ```bash
   COMPOSE_FILE=deploy/compose/docker-compose.yaml:deploy/compose/docker-compose.s3.yaml
   ```

   Ключ `--project-directory .` нужен в обоих способах.

## Проверка {#verify}

1. Покажите состояние сервисов. `seaweedfs` и `crane` должны иметь статус `healthy`, `seaweedfs-init` — завершиться с кодом `0`.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml \
     -f deploy/compose/docker-compose.s3.yaml ps -a
   ```

2. Запустите пробу готовности. Она проверяет в том числе бакет, поэтому без него `crane` не станет готов.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml \
     -f deploy/compose/docker-compose.s3.yaml exec crane crane healthcheck
   echo $?
   ```

   ```text
   0
   ```

3. Если `seaweedfs-init` завершился с ошибкой, прочитайте его журнал. Сервис 30 раз пробует создать бакет, затем печатает `бакет <имя> не создан` и завершается с кодом `1`.

## Что меняет override {#override}

| Сервис | Изменение |
| --- | --- |
| `seaweedfs` | S3-сервер на порту `8333`, данные в томе `s3`; идентичность `crane` с действиями `Admin`, `Read`, `Write`, `List`, `Tagging`; анонимного доступа нет |
| `seaweedfs-init` | Одноразово создаёт бакет {{< env "S3_BUCKET" >}}; повторный запуск идемпотентен |
| `crane` | Читает ключи из {{< env "AWS_ACCESS_KEY_ID_FILE" >}} и {{< env "AWS_SECRET_ACCESS_KEY_FILE" >}}; подключён к сети `s3`; локальный том `blobs` снят; стартует после `seaweedfs-init` |

Политику доступа SeaweedFS держит Compose, а не файл секрета: идентичности собираются при старте из файлов ключей во временном файле контейнера с правами `0600`, и ключи не попадают в аргументы процесса, окружение и журнал.

Сеть `s3` объявлена `internal: true` и содержит только `crane` и `seaweedfs`. Сам `crane` выходит наружу через сети `default` и `edge`.

## Параметры `CRANE_BLOBS` {#blobs-url}

Переменная обязательна. Допустимые значения:

| Значение | Хранилище |
| --- | --- |
| `memory` | Память процесса; только вместе с каталогом `memory` |
| `file:///абсолютный/путь` | Локальная файловая система; параметры запроса не допускаются |
| `s3://бакет[/префикс]?параметр=значение` | S3-совместимое хранилище; префикс помещает все объекты под `префикс/` |

В запросе `s3://` допустимы только несекретные параметры, например `endpoint`, `region`, `allow_http`, `allow_invalid_certificates`, таймауты. Учётные данные и их поставщики в URL запрещены, как и `endpoint` с логином или паролем. Сервер не стартует и называет ключ, но не значение:

```text
CRANE_BLOBS: ключ `<ключ>` не из списка несекретных параметров; учётные данные и их поставщики S3 задаются только переменными AWS_*
```

Статический ключ задают файлы {{< env "AWS_ACCESS_KEY_ID_FILE" >}} и {{< env "AWS_SECRET_ACCESS_KEY_FILE" >}}. Нужна вся пара: один файл без второго — ошибка запуска, а переменная вместе со своим файлом — конфликт. Без обоих файлов ключи, роли и метаданные берутся из обычных переменных `AWS_*`. Для `memory` и `file://` ключ не нужен, и сервер отказывается стартовать.

Параметр `allow_http=true` разрешает `http://` в `endpoint` и нужен для SeaweedFS внутри изолированной сети `s3`.

> [!IMPORTANT]
> Учётной записи S3 нужно право `s3:ListBucket`. Без него отсутствующий ключ даёт ответ `403` вместо `404`, и проба готовности остаётся неуспешной.

При отказе S3 запрос завершается за несколько секунд: клиент хранилища делает три повтора в пределах 5 с. Подробнее о {{< term "cas" "CAS" >}} и дайджестах: {{< xref "features/security/digest-verification" >}}.

## Что дальше {#next}

- {{< xref "configure/storage" >}}
- {{< xref "deploy/valkey-cache" >}}
- {{< xref "operations/health-checks" >}}
- {{< xref "reference/environment-variables" >}}
