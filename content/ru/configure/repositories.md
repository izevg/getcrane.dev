---
title: "Репозитории"
description: "Как создать hosted- и proxy-репозитории Cargo и npm: переменные со списками имён, допустимые имена, ограничения и проверка по адресу репозитория."
audience: [platform]
genre: how-to
state: current
status: available
weight: 10
terms: [hosted-repository, proxy-repository, upstream]
---

Страница описывает, как задать репозитории CRANE. Репозиторий — именованная точка входа формата: клиент обращается к нему по адресу `<публичный адрес>/<формат>/<имя>/`, где публичный адрес задаёт {{< env "CRANE_PUBLIC_URL" >}}. Сервер при старте создаёт недостающие {{< term "hosted-repository" "hosted-репозитории" >}} и {{< term "proxy-repository" "proxy-репозитории" >}} по спискам имён в переменных окружения.

Сейчас сервер обслуживает форматы Cargo и npm. Для PyPI, Maven и NuGet списков репозиториев нет. Proxy-репозиторий Cargo берёт пакеты из crates.io, proxy-репозиторий npm — из registry.npmjs.org; эти {{< term "upstream" "upstream" >}} зашиты в формат и не настраиваются.

## Перед началом {#prerequisites}

- Работающий или готовый к запуску сервер: {{< xref "deploy" >}}.
- Токен доступа: {{< xref "configure/access-token" >}}. Все репозитории закрыты одним токеном.

## Шаги {#steps}

1. Выберите имена. Имя попадает в адрес репозитория, поэтому правила строгие:

   - допустимы буквы ASCII, цифры, `-`, `_` и `.`;
   - пробелы вокруг имён в списке отбрасываются, пустые имена и повторы запрещены;
   - proxy-репозиторий не может называться как hosted-репозиторий того же формата;
   - одно имя можно использовать в разных форматах, например `internal` для Cargo и для npm.

2. Задайте списки. Каждая переменная принимает имена через запятую:

   - {{< env "CRANE_CARGO_REPOS" >}} — hosted-репозитории Cargo; по умолчанию `internal`;
   - {{< env "CRANE_CARGO_PROXY_REPOS" >}} — proxy-репозитории Cargo; по умолчанию пусто;
   - {{< env "CRANE_NPM_REPOS" >}} — hosted-репозитории npm; по умолчанию пусто;
   - {{< env "CRANE_NPM_PROXY_REPOS" >}} — proxy-репозитории npm; по умолчанию пусто.

   ```ini
   CRANE_CARGO_REPOS=internal,tools
   CRANE_CARGO_PROXY_REPOS=crates-io
   CRANE_NPM_REPOS=web
   CRANE_NPM_PROXY_REPOS=npmjs
   ```

   В файле TOML те же списки записываются ключами `cargo_repos`, `cargo_proxy_repos`, `npm_repos` и `npm_proxy_repos` строкой или массивом строк:

   ```toml
   cargo_repos = ["internal", "tools"]
   cargo_proxy_repos = ["crates-io"]
   ```

3. Перезапустите сервер. При старте он только добавляет недостающие репозитории в каталог.

> [!NOTE]
> У Cargo hosted-репозиторий обязателен. Без переменной {{< env "CRANE_CARGO_REPOS" >}} создаётся `internal`, а пустое значение — ошибка запуска. Пустые значения остальных трёх переменных означают «репозиториев нет».

Движок proxy создаётся, только если задан хотя бы один proxy-репозиторий любого формата. Он ходит только на хосты upstream своего формата и только по https. Кэш proxy выбирается отдельно: {{< xref "configure/cache" >}}.

## Проверка {#verify}

1. Найдите в журнале запись «сервер запущен». Поля `repos` и `proxy_repos` перечисляют репозитории Cargo, а `npm_repos` и `npm_proxy_repos` — репозитории npm.

2. Запросите конфигурацию {{< term "sparse-registry" "sparse-реестра" >}} hosted-репозитория Cargo. Токен лежит в файле, поэтому его не видно в списке процессов:

   ```bash
   printf 'header = "Authorization: %s"\n' "$(cat ./secrets/crane_token)" \
     | curl -fsS -K - https://crane.example.com/cargo/internal/index/config.json
   ```

   ```json
   {"api":"https://crane.example.com/cargo/internal","auth-required":true,"dl":"https://crane.example.com/cargo/internal/api/v1/crates"}
   ```

   Адреса в ответе строятся из {{< env "CRANE_PUBLIC_URL" >}}.

## Ошибки запуска {#errors}

Сообщения называют переменную и причину. Тексты на русском языке. Примеры идут в таком порядке: недопустимый символ в имени, пустое имя в списке, повтор имени, proxy с именем hosted-репозитория, имя уже занято hosted-репозиторием в каталоге.

```text
некорректное значение CRANE_CARGO_PROXY_REPOS: имя может содержать только буквы, цифры, `-`, `_` и `.`
некорректное значение CRANE_NPM_REPOS: пустое имя репозитория в списке
некорректное значение CRANE_NPM_REPOS: имя повторяется в списке
некорректное значение CRANE_CARGO_PROXY_REPOS: имя совпадает с hosted-репозиторием
репозиторий `crates-io` уже существует как Hosted; CRANE_CARGO_PROXY_REPOS требует свободное имя
```

## Что дальше {#next}

- {{< xref "configure/namespaces" >}}
- {{< xref "configure/cache" >}}
- {{< xref "configure/limits" >}}
- {{< xref "start/quickstart" >}}
