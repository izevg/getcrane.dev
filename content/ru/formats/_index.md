---
title: "Форматы пакетов"
description: "Какие форматы пакетов CRANE обслуживает сейчас: hosted- и proxy-репозитории Cargo и npm, статус PyPI, Maven и NuGet и клиенты, проверенные на реальном стенде."
audience: [developer, platform]
genre: how-to
state: current
status: available
weight: 50
terms: [hosted-repository, proxy-repository, upstream, static-token]
---

Раздел помогает выбрать страницу своего клиента и понять, что CRANE обслуживает сейчас. Сервер принимает запросы клиентов Cargo и npm к {{< term "hosted-repository" "hosted-репозиториям" >}} и {{< term "proxy-repository" "proxy-репозиториям" >}}. Для PyPI, Maven и NuGet маршрутов протокола и способа создать репозиторий пока нет.

Клиент меняет только адрес репозитория и токен. Все форматы ведут себя одинаково: опубликованную версию нельзя перезаписать, имя из внутреннего репозитория proxy не отдаёт из {{< term "upstream" >}}, а записать что-либо в proxy-репозиторий нельзя.

## Что работает сейчас {#status}

| Формат | Hosted | Proxy (upstream) | Проверенные клиенты |
| --- | --- | --- | --- |
| {{< xref "formats/cargo" >}} | Да | Да (crates.io) | cargo: две последние стабильные версии |
| {{< xref "formats/npm" >}} | Да, только пакеты со scope | Да (registry.npmjs.org) | npm: последняя версия |
| {{< xref "formats/pypi" >}} | В разработке | В разработке | — |
| {{< xref "formats/maven" >}} | В разработке | В разработке | — |
| {{< xref "formats/nuget" >}} | В разработке | В разработке | — |

Проверка идёт на реальных клиентах в контейнерах: публикация, установка, скрытие и удаление версий, установка через proxy. Для других клиентов тех же экосистем, например pnpm и yarn, отдельной проверки на стенде нет.

## Что общего у всех форматов {#common}

Адрес репозитория строится как `<публичный адрес>/<формат>/<имя>/`, где публичный адрес задаёт {{< env "CRANE_PUBLIC_URL" >}}. Например, hosted-репозиторий Cargo `internal` отвечает по адресу `https://crane.example.com/cargo/internal/`. Репозитории создаёт сервер при старте: {{< xref "configure/repositories" >}}.

Доступ закрыт одним {{< term "static-token" "статическим токеном" >}}. Формат определяет, в каком заголовке и в какой схеме клиент присылает токен: {{< xref "configure/access-token#presenting" >}}. Запрос без токена получает `401`, запрос с неверным токеном — `403`.

Тело ошибки имеет форму, которую понимает клиент формата: для Cargo `{"errors":[{"detail":"…"}]}`, для npm `{"error":"…"}`. Текст ошибки на русском языке заканчивается идентификатором запроса `request_id`: по нему запрос находят в журнале сервера.

## Что дальше {#next}

{{< cards "formats/cargo" "formats/npm" "configure/repositories" "features/security/immutable-versions" >}}
