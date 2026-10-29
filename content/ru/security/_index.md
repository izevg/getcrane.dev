---
title: "Безопасность развёртывания"
description: "Границы доверия развёртывания CRANE: что защищено поставкой, что остаётся на стороне администратора и где искать журнал ИБ."
audience: [security, auditor, platform]
genre: explanation
state: current
status: available
weight: 60
terms: [blob, upstream, security-journal, static-token, fail-closed]
---

Раздел описывает безопасность развёртывания CRANE на Docker Compose в его текущем состоянии: путь запроса от клиента через Caddy и `crane` к PostgreSQL, хранилищу {{< term "blob" "blob" >}}, кэшу и {{< term "upstream" >}}, и для каждой границы доверия — что защищено поставкой и что остаётся за администратором развёртывания.

Целевые гарантии продукта описаны в разделе {{< xref "features/security" >}}. Здесь только то, что подтверждают код и файлы поставки. Различия названы прямо. Например, доступ к протоколам сейчас защищает один {{< term "static-token" >}}, а ролей и входа через OIDC в сервере пока нет.

## Путь запроса {#request-path}

```mermaid {caption="Путь запроса через текущее развёртывание: клиент, Caddy, crane и хранилища."}
flowchart LR
  client["Клиент пакетов"] -->|"HTTPS, токен"| caddy["Caddy: TLS"]
  caddy -->|"сеть edge, HTTP"| crane["crane"]
  crane -->|"сеть default"| pg[("PostgreSQL: каталог")]
  crane -->|"том или сеть s3"| blobs[("Хранилище blob")]
  crane -->|"сеть cache, ACL"| valkey[("Valkey: кэш, необязателен")]
  crane -->|"HTTPS через SSRF-guard"| up["Публичные upstream"]
```

Клиент обращается к Caddy по HTTPS. Caddy передаёт запрос серверу `crane` по HTTP внутри сети `edge`. Сервер читает каталог в PostgreSQL, байты пакетов в хранилище blob и, если включён Valkey, кэш. К публичным upstream сервер ходит сам, через один HTTP-клиент с проверкой адресов.

## Границы доверия {#boundaries}

### Клиент и Caddy {#client-caddy}

- Caddy завершает TLS. Для публичного имени он получает сертификат ACME, для `localhost` использует внутренний CA: второй вариант годится для проверки, а не для эксплуатации.
- Сервер `crane` TLS не завершает: он слушает обычный TCP-порт. Токен, предъявленный в обход Caddy, уходит по сети открытым текстом.
- Анонимного доступа к протоколам нет. Запрос без токена получает `401`, с неверным токеном — `403`: {{< xref "configure/access-token" >}}.

### Caddy и crane {#caddy-crane}

- Сеть `edge` соединяет только `caddy` и `crane`. Её подсеть совпадает со списком доверенных прокси ({{< env "CRANE_EDGE_SUBNET" >}} передаётся серверу как {{< env "CRANE_TRUSTED_PROXIES" >}}).
- Сервер верит `X-Forwarded-For` и `X-Request-Id` только от прокси из этого списка. Caddy удаляет клиентский `X-Request-Id`, и сервер выдаёт идентификатор запроса сам.
- Порт проб ({{< env "CRANE_ADMIN_PORT" >}}) отвечает без токена и слушает все интерфейсы контейнера. Compose его не публикует: {{< xref "reference/ports-and-health" >}}.

### crane и каталог {#catalog}

- PostgreSQL хранит каталог, его порт не опубликован. Пароль и URL каталога лежат в файлах секретов, а не в переменных окружения.
- Если каталог не отвечает, CRANE не обращается к upstream вместо него ({{< term "fail-closed" "fail closed" >}}): без каталога нельзя проверить, что имя не внутреннее. Гарантия: {{< xref "features/security/fail-closed" >}}.

### crane и хранилище blob {#blobs}

- По умолчанию blob лежат в локальном томе `blobs`. В режиме S3 хранилище SeaweedFS работает в сети `s3` с флагом `internal: true`, анонимного доступа нет, ключи лежат в файлах секретов: {{< xref "deploy/s3-storage" >}}.
- Blob адресуются дайджестом SHA-256: {{< xref "features/security/digest-verification" >}}.

### crane и кэш {#cache}

- По умолчанию кэш находится в памяти процесса. Valkey подключается override-файлом: сеть `cache` с флагом `internal: true`, обязательная аутентификация, пользователь `default` выключен.
- Кэш хранит тела документов proxy и указатели на blob. Кто пишет в Valkey, тот подменяет эти данные, поэтому изоляция и пароль обязательны: {{< xref "deploy/valkey-cache" >}}.

### crane и upstream {#upstream}

- Адреса upstream встроены в бинарник, конфигурация задаёт только имена proxy-репозиториев: {{< xref "features/security/public-upstreams-only" >}}.
- Весь исходящий трафик идёт через один HTTP-клиент с проверкой хоста и адреса после DNS. Каждая выборка пишется в журнал исходящих запросов: {{< xref "features/security/egress-guard" >}}.

## Что защищено сейчас {#protected}

- Внутренние имена, заданные в {{< env "CRANE_NAMESPACES" >}}, proxy не отдаёт из upstream: {{< xref "features/security/namespace-reservation" >}}.
- Номер версии, однажды занятый, не освобождается: {{< xref "features/security/immutable-versions" >}}.
- Исходящие запросы проходят через SSRF-guard: {{< xref "features/security/egress-guard" >}}.
- Недоступный каталог приводит к отказу, а не к пропуску проверок: {{< xref "features/security/fail-closed" >}}.
- Сервисы CRANE в Compose работают с неизменяемой корневой файловой системой, без привилегий и от непривилегированного пользователя: {{< xref "security/hardening#shipped" >}}.
- Три потока {{< term "security-journal" >}} пишутся независимо от уровня обычных логов: {{< xref "security/security-events" >}}.

## Что остаётся на стороне развёртывания {#deployment-side}

- **Раздача токена.** Токен один на весь экземпляр: он открывает все репозитории на чтение и запись. Кто его получил, тот имеет полный доступ. Роли и вход через OIDC в сервере пока не работают: {{< xref "configure/identity" >}}.
- **Секреты на диске.** Права на каталог `secrets`, резервные копии, смена токена и пароля остаются за администратором: {{< xref "security/hardening#steps" >}}.
- **Сеть и хост.** Файрвол, DNS, доступ к портам `80` и `443`, безопасность хоста Docker и дисков. Compose не ограничивает ресурсы и привилегии сторонних контейнеров (`caddy`, `postgres`, `valkey`, `seaweedfs`).
- **Каналы внутри Docker.** В эталонных файлах `crane` соединяется с PostgreSQL, Valkey и SeaweedFS без TLS. Для внешних сервисов TLS настраивается в их адресах.
- **Сохранность журнала.** Сервер пишет строки журнала в стандартный вывод. Сбор, срок хранения и защита от изменений лежат на конвейере логов организации. Экспорта в SIEM сервер пока не содержит.

## Что дальше {#next}

{{< cards "security/hardening" "security/security-events" "security/vulnerability-disclosure" "security/release-verification" >}}
