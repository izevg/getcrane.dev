---
title: "Подключение Cargo"
description: "Как подключить cargo к hosted- и proxy-репозиториям CRANE: sparse-индекс, токен, публикация крейта, yank и ответы сервера при отказах."
audience: [developer, platform]
genre: how-to
state: current
status: available
weight: 10
terms: [sparse-registry, hosted-repository, proxy-repository, yank, tombstone, namespace]
---

Страница описывает, как подключить `cargo` к CRANE, опубликовать крейт, собрать проект с зависимостями из CRANE и из crates.io и скрыть версию командой `cargo yank`. CRANE реализует только {{< term "sparse-registry" >}} ({{< cite "rfc-2789" >}}, {{< cite "cargo-registry-index" >}}); git-индекс не поддерживается.

Один репозиторий CRANE — один реестр Cargo: {{< term "hosted-repository" >}} хранит внутренние крейты, {{< term "proxy-repository" >}} отдаёт крейты crates.io через кэш CRANE. Опубликованную версию нельзя перезаписать. Удалить версию командой `cargo` нельзя: протокол Cargo не имеет такой операции.

## Перед началом {#prerequisites}

- Работающий CRANE и его публичный адрес ({{< env "CRANE_PUBLIC_URL" >}}); ниже он записан как `crane.example.com`. Развёртывание: {{< xref "deploy" >}}.
- Токен доступа: {{< xref "configure/access-token" >}}. Cargo присылает токен в заголовке `Authorization` без схемы.
- Hosted-репозиторий Cargo. Репозиторий `internal` существует без настройки. Для установки через proxy задайте {{< env "CRANE_CARGO_PROXY_REPOS" >}}, например `crates-io`: {{< xref "configure/repositories" >}}.
- `cargo` последней или предыдущей стабильной версии: на них CRANE проверяется на реальном стенде.

## Шаги {#steps}

### Подключить hosted-репозиторий {#connect}

1. Опишите реестр в `.cargo/config.toml`. Имя `crane` локальное, `internal` — имя hosted-репозитория на сервере. Адрес индекса заканчивается на `/index/`.

   ```toml
   [registries.crane]
   index = "sparse+https://crane.example.com/cargo/internal/index/"
   credential-provider = "cargo:token"
   ```

   Без `credential-provider = "cargo:token"` cargo не берёт токен альтернативного реестра из окружения.

2. Передайте токен переменной оболочки. Её имя строится из имени реестра: для `crane` это `CARGO_REGISTRIES_CRANE_TOKEN`.

   ```bash
   export CARGO_REGISTRIES_CRANE_TOKEN="<token>"
   ```

### Опубликовать крейт {#publish}

1. Выполните публикацию с именем реестра из `.cargo/config.toml`.

   ```bash
   cargo publish --registry crane
   ```

Если CRANE отклонил крейт, `cargo` печатает статус и текст ошибки. Значения статусов собраны в разделе [Ответы при отказах](#errors).

Перед записью CRANE проверяет:

- **Имя и версию.** Имя начинается с ASCII-буквы, содержит буквы, цифры, `-` и `_` и не длиннее 64 символов. Регистр не различается, `-` и `_` равнозначны. Если крейт уже опубликован с другим написанием имени, публикация получает `400`.
- **Зависимости.** Зависимость из этого же репозитория и зависимость с crates.io принимаются. Зависимость на любой другой реестр отклоняется с кодом `400` и причиной `foreign-registry-dependency`.
- **Резервирование и публичное имя.** Имя, покрытое {{< term "namespace" "namespace-ом" >}} другой команды, даёт `403`. Новое имя, которое уже занято на crates.io, тоже даёт `403`, если оно не зарезервировано платформой; эту проверку CRANE выполняет, когда настроен proxy-репозиторий Cargo. Правила: {{< xref "features/security/namespace-reservation#publish-rule" >}}.
- **Размер.** Тело запроса больше {{< env "CRANE_MAX_PUBLISH_BYTES" >}} получает `413`: {{< xref "configure/limits" >}}.
- **Повтор версии.** Версия, которая уже опубликована или была удалена, получает `409`.

### Подключить зависимость из hosted-репозитория {#consume}

1. Укажите реестр в зависимости. Cargo скачивает архив по адресу, который CRANE сообщает в `config.json`.

   ```toml
   [dependencies]
   acme-hello = { version = "0.1", registry = "crane" }
   ```

### Установить зависимости через proxy {#proxy}

1. Замените источник `crates-io` на proxy-репозиторий CRANE в `.cargo/config.toml`. Имя `crates-io` в адресе — имя proxy-репозитория на сервере.

   ```toml
   [source.crates-io]
   replace-with = "crane-proxy"

   [registries.crane-proxy]
   index = "sparse+https://crane.example.com/cargo/crates-io/index/"
   credential-provider = "cargo:token"
   ```

2. Передайте токен. Один и тот же токен открывает hosted- и proxy-репозитории.

   ```bash
   export CARGO_REGISTRIES_CRANE_PROXY_TOKEN="<token>"
   ```

3. Соберите проект как обычно: `cargo build`. Первый запрос к каждому файлу CRANE выполняет к crates.io сам, сверяет контрольную сумму архива с индексом и сохраняет результат в кэше. Повторные запросы идут из кэша. Адрес скачивания в `config.json` proxy-репозитория указывает на CRANE, а не на crates.io.

Имя, которое опубликовано в hosted-репозитории или покрыто резервированием, proxy отдаёт как несуществующее (`404`): так публичный крейт не подменяет внутренний ({{< xref "features/security/namespace-reservation#no-groups" >}}). Публикация в proxy-репозиторий невозможна: сервер отвечает `405`.

> [!NOTE]
> Поиск `cargo search` не поддерживается: у CRANE нет маршрута поиска по Cargo. Сведения о крейте `cargo info` читает из индекса.

## Проверка {#verify}

1. Запросите `config.json` репозитория. Токен передаётся через stdin (`-K -`), поэтому он не виден в списке процессов.

   ```bash
   printf 'header = "Authorization: %s"\n' "$CARGO_REGISTRIES_CRANE_TOKEN" \
     | curl -fsS -K - https://crane.example.com/cargo/internal/index/config.json
   ```

   ```json
   {"api":"https://crane.example.com/cargo/internal","auth-required":true,"dl":"https://crane.example.com/cargo/internal/api/v1/crates"}
   ```

2. После публикации проверьте, что крейт виден в индексе.

   ```bash
   cargo info <crate> --registry crane
   ```

   Команда печатает сведения о крейте, среди них опубликованную версию.

## Скрытие и удаление версии {#hide}

{{< term "yank" >}} убирает версию из выбора при разрешении зависимостей, не удаляя её. Команда идемпотентна: повтор не считается ошибкой.

```bash
cargo yank --registry crane --version <version> <crate>
```

Чтобы вернуть версию в выбор, добавьте `--undo`:

```bash
cargo yank --registry crane --undo --version <version> <crate>
```

Поведение после yank:

- Новое разрешение зависимостей пропускает скрытую версию и выбирает предыдущую подходящую.
- Прямая зависимость от скрытой версии (`=<version>`) не разрешается, `cargo generate-lockfile` сообщает о yanked-версии.
- Существующий `Cargo.lock` с этой версией собирается, в том числе из пустого кэша: архив остаётся доступным, пока версия не удалена.

Удаление версии в Cargo не предусмотрено: CRANE не даёт маршрута удаления крейта. Версия в состоянии {{< term "tombstone" >}} недоступна: скачивание и повторный yank получают `410`, а повторная публикация того же номера — `409`. Семантика по всем форматам: {{< xref "features/security/immutable-versions#formats" >}}.

Список владельцев `cargo owner --list --registry crane <crate>` возвращает одного владельца: имя принципала токена ({{< env "CRANE_TOKEN_PRINCIPAL" >}}). Добавление и удаление владельцев получает `501`.

## Ответы при отказах {#errors}

| Статус | Когда | Сообщение |
| --- | --- | --- |
| `400` | Тело публикации разобрать нельзя, недопустимые имя или версия, зависимость на сторонний реестр, смена написания имени | Причина на русском языке; для стороннего реестра: «зависимость … указывает на сторонний реестр …» |
| `401` | Нет заголовка `Authorization` | `требуется токен` |
| `403` | Токен неверный | `токен отвергнут` |
| `403` | Имя покрыто namespace другой команды | `имя принадлежит namespace другого workspace` |
| `403` | Новое имя уже занято на crates.io | `имя занято в публичном реестре: для публикации нужна резервация платформы (CRANE_NAMESPACES)` |
| `403` | Версия заблокирована или находится в карантине | `версия недоступна: …` |
| `404` | Репозиторий, крейт или версия не найдены; имя внутреннее, а запрос идёт в proxy | `не найдено`, `репозиторий не найден` или `версия не найдена` |
| `405` | Публикация в proxy-репозиторий | `репозиторий не hosted: публикация запрещена` |
| `409` | Версия уже существует, в том числе удалённая | `версия уже существует` |
| `410` | Скачивание или yank версии в состоянии tombstone | `версия недоступна: Deleted` |
| `413` | Тело публикации больше {{< env "CRANE_MAX_PUBLISH_BYTES" >}} | — |
| `501` | Добавление или удаление владельцев | Сообщение о том, что управление владельцами не поддерживается |
| `502` | Proxy: crates.io недоступен, архив не прошёл проверку суммы или больше {{< env "CRANE_PROXY_MAX_ARTIFACT_BYTES" >}} | `upstream недоступен` |
| `503` | Каталог или хранилище blob недоступны; не удалось проверить новое имя на crates.io | `хранилище временно недоступно` или `не удалось проверить имя в публичном upstream: повторите позже` |

Тело ошибки имеет вид `{"errors":[{"detail":"…"}]}`. Текст заканчивается на `(request_id <id>)`: идентификатор помогает администратору развёртывания найти запрос в журнале. Статус `503` приходит с заголовком `Retry-After`.

## Что дальше {#next}

- {{< xref "formats/npm" >}} — подключение npm.
- {{< xref "configure/repositories" >}} — как создать hosted- и proxy-репозитории.
- {{< xref "features/security/immutable-versions" >}} — гарантия неизменяемости и семантика удаления.
- {{< xref "features/registry/proxy-cache" >}} — как работает кэш proxy.
