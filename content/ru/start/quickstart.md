---
title: "Первый запуск"
description: "Поднять CRANE на одном узле в Docker Compose, опубликовать крейт Cargo в hosted-репозиторий и установить зависимости через proxy crates.io и npmjs."
audience: [platform, developer]
genre: tutorial
state: current
status: available
weight: 20
terms: [hosted-repository, proxy-repository, upstream, namespace, sparse-registry]
---

Руководство поднимает CRANE на одном узле в Docker Compose и проводит по одному пути: публикация крейта в {{< term "hosted-repository" >}} `internal`, сборка проекта с этой зависимостью, сборка проекта с зависимостью из crates.io через {{< term "proxy-repository" >}} и установка npm-пакета через proxy-репозиторий npm. Все команды выполняются на одной машине.

Стенд минимальный: кэш в памяти процесса (`memory`), blob на локальном томе Docker, PostgreSQL в контейнере. Доступ к протоколам защищён статическим токеном, а TLS обслуживает Caddy собственным центром сертификации для имени `localhost`. Рабочее развёртывание описано в разделе {{< xref "deploy" >}}.

## Что понадобится {#prerequisites}

- Docker Engine и Docker Compose.
- Git, curl и POSIX-оболочка (Linux или macOS).
- Task (go-task) и Node.js 24: они нужны только для `task secrets:init`.
- `cargo` последней стабильной версии. Для последнего шага нужны ещё Node.js и `npm`.
- Свободные порты 80 и 443 на хосте ({{< env "CADDY_HTTP_PORT" >}}, {{< env "CADDY_HTTPS_PORT" >}}).
- Доступ в интернет: образы и зависимости собираются из публичных источников, а proxy-репозитории CRANE обращаются к crates.io и registry.npmjs.org.

## Получите исходники и соберите образ {#build}

Образ CRANE собирается локально из `deploy/docker/Dockerfile` и в реестр не публикуется. Имя и тег `crane/crane:latest` совпадают со значениями {{< env "CRANE_IMAGE" >}} и {{< env "CRANE_VERSION" >}} в `.env.dist`.

```bash
git clone <repository-url> crane
cd crane
docker build -f deploy/docker/Dockerfile -t crane/crane:latest .
```

Остальные образы (Caddy, PostgreSQL) Compose скачает при запуске.

## Подготовьте окружение {#env}

Скопируйте шаблон окружения. Все значения Compose берёт из `.env`: в compose-файле дефолтов нет, и пропущенная переменная останавливает запуск.

```bash
cp .env.dist .env
```

В `.env` задайте три значения. Строка {{< env "CRANE_NAMESPACES" >}} уже есть и пуста, две остальные строки нужно добавить.

```dotenv
CRANE_NAMESPACES=cargo:acme-*
CRANE_CARGO_PROXY_REPOS=crates-io
CRANE_NPM_PROXY_REPOS=npmjs
```

{{< env "CRANE_NAMESPACES" >}} резервирует за платформой имена крейтов Cargo с префиксом `acme-`. Публикация имени, покрытого {{< term "namespace" >}}, проходит без запроса к crates.io, а сам CRANE никогда не отдаёт такое имя из {{< term "upstream" >}}. {{< env "CRANE_CARGO_PROXY_REPOS" >}} и {{< env "CRANE_NPM_PROXY_REPOS" >}} создают proxy-репозитории `crates-io` и `npmjs`. Hosted-репозиторий Cargo `internal` существует без настройки.

Создайте файлы секретов: токен доступа, пароль PostgreSQL и URL каталога. Задача создаёт только недостающие файлы и ничего не перезаписывает. Значения она не печатает.

```bash
task secrets:init
```

Файлы лежат в каталоге `secrets/`, который исключён из git.

## Запустите стек {#start}

Команда выполняется из корня репозитория. Параметр `--project-directory .` обязателен: пути в compose-файле считаются от корня, а не от `deploy/compose`.

```bash
docker compose --project-directory . -f deploy/compose/docker-compose.yaml up -d --wait
```

Compose запускает PostgreSQL, применяет миграции отдельным контейнером `migrate`, запускает `crane` в роли `all` и Caddy. Команда возвращается, когда проверка `crane healthcheck` проходит.

## Доверьте сертификат Caddy и проверьте доступ {#trust}

Для `localhost` Caddy выпускает сертификат собственным центром сертификации. Скопируйте его корневой сертификат из контейнера. Если файла ещё нет, подождите несколько секунд и повторите команду: Caddy создаёт сертификат при первом запуске.

```bash
docker compose --project-directory . -f deploy/compose/docker-compose.yaml \
  cp caddy:/data/caddy/pki/authorities/local/root.crt secrets/caddy-root.crt
```

Задайте переменные оболочки. Они нужны `cargo` и `npm` на следующих шагах, поэтому выполняйте остальные команды в этой же оболочке. Токен лежит в `secrets/crane_token`: Compose передаёт его серверу файлом через {{< env "CRANE_TOKEN_FILE" >}}, а CRANE сравнивает с ним токен каждого запроса к протоколам. Один и тот же токен служит и для hosted-, и для proxy-репозиториев.

```bash
export STAND_CA="$PWD/secrets/caddy-root.crt"
export CARGO_HTTP_CAINFO="$STAND_CA"
export NODE_EXTRA_CA_CERTS="$STAND_CA"
export CARGO_REGISTRIES_CRANE_TOKEN="$(cat secrets/crane_token)"
export CARGO_REGISTRIES_CRANE_PROXY_TOKEN="$CARGO_REGISTRIES_CRANE_TOKEN"
export NPM_TOKEN="$CARGO_REGISTRIES_CRANE_TOKEN"
```

> [!WARNING]
> `CARGO_HTTP_CAINFO` заменяет набор доверенных сертификатов `cargo`, а корневой сертификат Caddy действует только на этом стенде. Не добавляйте его в системное хранилище сертификатов.

Проверьте, что реестр отвечает. Токен передаётся через stdin (`-K -`), поэтому он не виден в списке процессов.

```bash
printf 'header = "Authorization: %s"\n' "$CARGO_REGISTRIES_CRANE_TOKEN" \
  | curl -fsS --cacert "$STAND_CA" -K - https://localhost/cargo/internal/index/config.json
```

CRANE возвращает конфигурацию {{< term "sparse-registry" >}} hosted-репозитория `internal`:

```json
{"api":"https://localhost/cargo/internal","auth-required":true,"dl":"https://localhost/cargo/internal/api/v1/crates"}
```

Запрос без заголовка `Authorization` получает `401`, запрос с неверным токеном — `403`.

## Подключите cargo к репозиторию {#cargo-config}

Создайте рабочий каталог рядом с исходниками CRANE. `cargo` читает `.cargo/config.toml` из каталога и всех родительских каталогов, поэтому настройка действует для всех проектов внутри него.

```bash
mkdir -p ../crane-quickstart/.cargo
cd ../crane-quickstart
cat > .cargo/config.toml <<'EOF'
[registries.crane]
index = "sparse+https://localhost/cargo/internal/index/"
credential-provider = "cargo:token"
EOF
```

`credential-provider = "cargo:token"` нужен, чтобы `cargo` брал токен из переменной `CARGO_REGISTRIES_CRANE_TOKEN`.

## Опубликуйте крейт {#publish}

Создайте крейт `acme-hello`. Его имя покрыто резервированием `cargo:acme-*`.

```bash
mkdir -p acme-hello/src
cat > acme-hello/Cargo.toml <<'EOF'
[package]
name = "acme-hello"
version = "0.1.0"
edition = "2021"
description = "CRANE quickstart"
license = "MIT"
EOF
cat > acme-hello/src/lib.rs <<'EOF'
pub fn version() -> &'static str {
    "0.1.0"
}
EOF
cd acme-hello
cargo publish --registry crane
cd ..
```

Команда завершается без ошибки, когда CRANE принял крейт. Повторная публикация той же версии отклоняется: опубликованный релиз нельзя перезаписать.

## Соберите проект с зависимостью из hosted-репозитория {#consume}

Проект `acme-app` зависит от `acme-hello` из репозитория `crane`.

```bash
mkdir -p acme-app/src
cat > acme-app/Cargo.toml <<'EOF'
[package]
name = "acme-app"
version = "0.1.0"
edition = "2021"

[dependencies]
acme-hello = { version = "0.1", registry = "crane" }
EOF
cat > acme-app/src/main.rs <<'EOF'
fn main() {
    println!("{}", acme_hello::version());
}
EOF
cd acme-app
cargo run -q
cd ..
```

Проект печатает версию из опубликованного крейта:

```text
0.1.0
```

## Соберите проект через proxy crates.io {#proxy}

Добавьте в конфигурацию замену источника `crates-io` на proxy-репозиторий `crates-io`. После этого `cargo` скачивает все зависимости с crates.io через CRANE. Первый запрос к каждому файлу CRANE выполняет к upstream сам и сохраняет результат в кэше, повторные запросы идут из кэша.

```bash
cat >> .cargo/config.toml <<'EOF'

[source.crates-io]
replace-with = "crane-proxy"

[registries.crane-proxy]
index = "sparse+https://localhost/cargo/crates-io/index/"
credential-provider = "cargo:token"
EOF
```

Соберите проект с зависимостью `form_urlencoded` версии 1.2.1:

```bash
mkdir -p proxy-app/src
cat > proxy-app/Cargo.toml <<'EOF'
[package]
name = "proxy-app"
version = "0.1.0"
edition = "2021"

[dependencies]
form_urlencoded = "=1.2.1"
EOF
cat > proxy-app/src/main.rs <<'EOF'
fn main() {
    println!("{}", form_urlencoded::byte_serialize(b"a b").collect::<String>());
}
EOF
cd proxy-app
cargo run -q
cd ..
```

Результат:

```text
a+b
```

## Установите пакет npm через proxy {#npm}

Proxy-репозиторий npm `npmjs` доступен по адресу `https://localhost/npm/npmjs/`. Файл `.npmrc` называет его реестром по умолчанию и передаёт токен из переменной `NPM_TOKEN`: значение в файл не попадает.

```bash
mkdir npm-app
cd npm-app
cat > .npmrc <<'EOF'
registry=https://localhost/npm/npmjs/
//localhost/npm/npmjs/:_authToken=${NPM_TOKEN}
EOF
cat > package.json <<'EOF'
{ "name": "npm-app", "version": "1.0.0" }
EOF
npm install is-number@7.0.0
ls node_modules/is-number/package.json
cd ..
```

Команда `ls` печатает путь к файлу, если пакет установлен:

```text
node_modules/is-number/package.json
```

## Остановите стенд {#stop}

Вернитесь в каталог с исходниками CRANE и остановите контейнеры:

```bash
cd ../crane
docker compose --project-directory . -f deploy/compose/docker-compose.yaml down
```

Тома с каталогом и blob сохраняются, и следующий запуск продолжит с теми же данными. Чтобы удалить стенд вместе с данными, добавьте ключ `-v`.

> [!WARNING]
> `down -v` необратимо удаляет тома PostgreSQL и blob: все опубликованные пакеты и кэш proxy пропадут.

## Что дальше {#next}

- {{< xref "start/concepts" >}} — понятия, на которых построены репозитории, версии и доступ.
- {{< xref "deploy/docker-compose" >}} — развёртывание на одном узле с публичным именем и сертификатом ACME.
- {{< xref "features/security/namespace-reservation" >}} — как резервирование имён защищает от подмены внутренних пакетов.
- {{< xref "start/first-run" >}} — мастер первого запуска.
