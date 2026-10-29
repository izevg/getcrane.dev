---
title: "Пути протоколов пакетов"
description: "Справочник путей Cargo и npm на порту API CRANE: метод, назначение и аутентификация для hosted- и proxy-репозиториев; другие форматы пока не смонтированы."
audience: [developer, platform]
genre: reference
state: current
status: available
weight: 50
terms: [hosted-repository, proxy-repository, sparse-registry]
---

Порт API ({{< env "CRANE_HTTP_PORT" >}}) обслуживает протоколы пакетов под путями `/cargo/<repo>` и `/npm/<repo>`. Сейчас смонтированы Cargo и npm; PyPI, Maven и NuGet не обслуживаются, их пути получают `404`. Справочник перечисляет пути, методы и назначение для {{< term "hosted-repository" "hosted-" >}} и {{< term "proxy-repository" "proxy-репозиториев" >}}.

Каждый путь под смонтированным репозиторием требует токена, в том числе неизвестный: запрос без токена получает `401` раньше, чем `404`. Вне репозиториев порт API отвечает `404` без токена. Формы тел ошибок: {{< xref "reference/errors" >}}.

## Общие правила {#common}

- `<repo>` — имя репозитория из {{< env "CRANE_CARGO_REPOS" >}}, {{< env "CRANE_CARGO_PROXY_REPOS" >}}, {{< env "CRANE_NPM_REPOS" >}} или {{< env "CRANE_NPM_PROXY_REPOS" >}}. Если имя не создано, hosted-маршруты отвечают `404` с текстом `репозиторий не найден`.
- Имя proxy-репозитория сильнее универсального hosted-маршрута: путь `/cargo/<proxy>` всегда обслуживает proxy.
- Адреса в ответах строятся из {{< env "CRANE_PUBLIC_URL" >}}.
- Лимит тела публикации — {{< env "CRANE_MAX_PUBLISH_BYTES" >}}.

### Аутентификация {#auth}

| Формат | Заголовок | Ответ без токена |
| --- | --- | --- |
| Cargo | `Authorization: <token>` без схемы | `401`, `WWW-Authenticate: Cargo` |
| npm | `Authorization: Bearer <token>` | `401`, `WWW-Authenticate: Bearer realm="crane"` |

Заголовок с неверным токеном или чужой схемой получает `403`. Как задать токен и как клиенты его предъявляют: {{< xref "configure/access-token#presenting" >}}.

## Cargo {#cargo}

Cargo работает как {{< term "sparse-registry" >}} ({{< cite "rfc-2789" >}}). Адрес реестра в клиенте: `sparse+https://crane.example.com/cargo/<repo>/index/`.

### Hosted-репозиторий {#cargo-hosted}

Префикс всех путей — `/cargo/<repo>`.

| Метод | Путь | Назначение |
| --- | --- | --- |
| `GET` | `/index/config.json` | Конфигурация реестра: `dl`, `api` и `auth-required` |
| `GET` | `/index/<путь>` | Запись индекса крейта; поддерживает `If-None-Match` и отвечает `304` |
| `PUT` | `/api/v1/crates/new` | Публикация крейта |
| `GET` | `/api/v1/crates/<имя>/<версия>/download` | Скачивание файла `.crate` |
| `DELETE` | `/api/v1/crates/<имя>/<версия>/yank` | Yank версии |
| `PUT` | `/api/v1/crates/<имя>/<версия>/unyank` | Снятие yank |
| `GET` | `/api/v1/crates/<имя>/owners` | Владелец крейта: имя принципала токена |
| `PUT`, `DELETE` | `/api/v1/crates/<имя>/owners` | Управление владельцами не поддерживается: `501` |

Ответ `config.json` строится из публичного адреса:

```json
{"dl":"https://crane.example.com/cargo/internal/api/v1/crates","api":"https://crane.example.com/cargo/internal","auth-required":true}
```

### Proxy-репозиторий {#cargo-proxy}

Префикс — `/cargo/<proxy>`. Репозиторий отдаёт crates.io через кэш с проверкой дайджеста.

| Метод | Путь | Назначение |
| --- | --- | --- |
| `GET` | `/index/config.json` | Конфигурация реестра; отвечает без обращения к каталогу |
| `GET` | `/index/<путь>` | Запись индекса, полученная у upstream или из кэша |
| `GET` | `/api/v1/crates/<имя>/<версия>/download` | Скачивание файла `.crate` с проверкой SHA-256 из индекса |
| `PUT` | `/api/v1/crates/new` | Публикация запрещена: `405` |

Остальные пути proxy-репозитория отвечают `404`.

## npm {#npm}

Имя пакета со scope передаётся как `@scope/name` или `@scope%2Fname`. `HEAD` обслуживается как `GET`. Префикс всех путей — `/npm/<repo>`.

### Hosted-репозиторий {#npm-hosted}

| Метод | Путь | Назначение |
| --- | --- | --- |
| `GET` | `/<пакет>` | Документ пакета (packument); учитывает `Accept` и `If-None-Match` |
| `GET` | `/<пакет>/-/<файл>.tgz` | Скачивание архива версии |
| `PUT` | `/<пакет>` и `/<пакет>/-rev/<rev>` | Публикация версии или пометка deprecate |
| `DELETE` | `/<пакет>/-rev/<rev>` | Удаление пакета |
| `DELETE` | `/<пакет>/-/<файл>.tgz/-rev/<rev>` | Удаление версии |
| `GET` | `/-/package/<пакет>/dist-tags` | Список тегов |
| `PUT` | `/-/package/<пакет>/dist-tags/<тег>` | Установка тега; тело содержит версию |
| `DELETE` | `/-/package/<пакет>/dist-tags/<тег>` | Снятие тега |
| `GET` | `/-/whoami` | Имя принципала токена |
| `GET` | `/-/ping` | Проверка связи: `{}` |
| `POST` | `/-/npm/v1/security/…` | Аудит уязвимостей через реестр не поддерживается: `501` |

### Proxy-репозиторий {#npm-proxy}

Репозиторий отдаёт registry.npmjs.org через кэш с проверкой SHA-512.

| Метод | Путь | Назначение |
| --- | --- | --- |
| `GET` | `/<пакет>` | Документ пакета; ссылки на архивы переписаны на адрес CRANE |
| `GET` | `/<пакет>/-/<файл>.tgz` | Скачивание архива с проверкой SHA-512 из документа |
| `GET` | `/-/whoami`, `/-/ping` | Имя принципала и проверка связи |
| `POST` | `/-/npm/v1/security/…` | `501`: список зависимостей проекта не отдаётся наружу |
| `PUT`, `DELETE` | пути записи | Запись запрещена: `405` |
| `GET` | `/-/package/<пакет>/dist-tags` | `404`: теги ведёт только upstream |

## Пути без репозитория {#other}

| Порт | Путь | Ответ |
| --- | --- | --- |
| API | любой путь вне `/cargo/<repo>` и `/npm/<repo>` | `404`, `problem+json`, токен не нужен |
| API | `/pypi/…`, `/maven/…`, `/nuget/…` | `404`: форматы не смонтированы |
| Проб | `/healthz/live`, `/healthz/ready` | Пробы без токена: {{< xref "reference/ports-and-health" >}} |
| Проб | остальные пути | `404` |

## Что дальше {#next}

- {{< xref "reference/errors" >}}
- {{< xref "configure/repositories" >}}
- {{< xref "configure/access-token" >}}
- {{< xref "features/registry/formats" >}}
