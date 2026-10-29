---
title: "Управление реестром"
description: "Hosted-репозитории и proxy с кэшем, пять экосистем, команды, поиск, веб-консоль, CLI и API: как CRANE организует работу с пакетами."
audience: [developer, platform]
genre: explanation
state: target
status: available
weight: 30
terms: [hosted-repository, proxy-repository, upstream, namespace, oidc]
---

CRANE хранит собственные пакеты команд в {{< term "hosted-repository" "hosted-репозиториях" >}} и отдаёт пакеты публичных реестров через {{< term "proxy-repository" "proxy-репозитории" >}} с кэшем. Разработчик подключает стандартный клиент своей экосистемы (Cargo, npm, PyPI, Maven или NuGet) и работает с пакетами привычными командами. Реестр, команды, поиск, консоль, CLI и API строятся поверх гарантий безопасности и не ослабляют их.

Раздел описывает, как устроена работа с пакетами: как версия попадает в реестр, как кэшируется upstream, кому принадлежат пакеты и как их находят. Гарантии цепочки поставки описаны в разделе {{< xref "features/security" >}}.

## Два вида репозиториев {#repository-kinds}

Репозиторий относится к одному формату пакетов и к одному из двух видов.

```mermaid {caption="Рисунок 1. Клиент обращается только к CRANE. В upstream ходит сам CRANE, и только из proxy-репозитория."}
flowchart LR
  client["Клиент пакетного менеджера"]
  crane["CRANE"]
  hosted[("Hosted-репозиторий<br>пакеты команд")]
  proxy[("Proxy-репозиторий<br>кэш upstream")]
  upstream["Публичный реестр<br>(upstream)"]
  client --> crane
  crane --> hosted
  crane --> proxy
  proxy -.-> upstream
```

- **Hosted** — место для собственных пакетов. CRANE для них источник истины. Подробнее: {{< xref "features/registry/hosted" >}}.
- **Proxy** — кэш публичного реестра. CRANE сам получает пакеты из upstream, проверяет и отдаёт клиенту. Подробнее: {{< xref "features/registry/proxy-cache" >}}.

Одно и то же namespace защищает внутренние имена в обоих видах: имя, покрытое namespace, никогда не приходит из upstream ({{< xref "features/security/namespace-reservation" >}}).

## Что входит в управление реестром {#contents}

- {{< xref "features/registry/hosted" >}} — атомарная публикация, состояния версии, продвижение к релизу, квоты и очистка.
- {{< xref "features/registry/proxy-cache" >}} — двухуровневый кэш, объединение выборок, устаревшие копии при сбое upstream, офлайн-готовность.
- {{< xref "features/registry/formats" >}} — что поддерживается в каждой экосистеме и какие клиенты проверены.
- {{< xref "features/registry/teams-and-ownership" >}} — команды как единица владения, роли, группы IdP, передача владения.
- {{< xref "features/registry/search" >}} — гибридный поиск по задаче, а не только по имени.
- {{< xref "features/registry/console" >}} — веб-консоль и рабочие столы ролей.
- {{< xref "features/registry/cli" >}} — консольный клиент `cctl`.
- {{< xref "features/registry/integrations" >}} — REST API, подписанные webhooks, обмен токена CI.
- {{< xref "features/registry/migration-from-nexus" >}} — перенос hosted-пакетов из Nexus.

## Принципы {#principles}

### Стандартные клиенты {#standard-clients}

CRANE реализует протоколы экосистем по их спецификациям и не требует собственного клиента для установки и публикации. Совместимость проверяет автоматическая матрица реальных клиентов. Вся логика, от прав до видимости версии, общая для всех форматов, а адаптер формата только переводит протокол в команды ядра.

### Один путь решения {#one-decision-path}

Каждый запрос, включая запрос пакетного менеджера, проходит авторизацию, и доступ по умолчанию закрыт. Скрытый от пользователя пакет протокол отдаёт как несуществующий, а причину отказа видно в диагностике по идентификатору запроса. Подробнее: {{< xref "features/security/access-control" >}}.

### Без плагинов {#no-plugins}

Форматы, хранилища и интеграции встроены в бинарник как реализации внутренних интерфейсов. Динамической загрузки кода и API для сторонних расширений нет ({{< xref "features/operations/deployment-model#monolith" >}}).

## Чего CRANE не делает {#not-done}

- **Групповых репозиториев нет.** CRANE не сливает hosted и proxy под одним адресом. Защиту даёт инвариант имён, а не порядок источников ({{< xref "features/security/namespace-reservation#no-groups" >}}).
- **Git-индекса Cargo нет.** CRANE реализует только sparse-протокол ({{< xref "features/registry/formats#cargo" >}}).
- **Прямого подключения к LDAP, Active Directory и SAML нет.** Людей CRANE принимает только через провайдера oidc, а каталоги подключаются через него ({{< xref "features/registry/teams-and-ownership#idp" >}}).

## С чего начать {#start}

- Разработчику: {{< xref "features/registry/formats" >}} и {{< xref "features/registry/cli" >}}.
- Инженеру платформы: {{< xref "features/registry/proxy-cache" >}} и {{< xref "features/registry/teams-and-ownership" >}}.
