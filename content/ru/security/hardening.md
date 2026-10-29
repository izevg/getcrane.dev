---
title: "Усиление развёртывания"
description: "Что уже включено в Compose-поставке CRANE для защиты контейнеров, сетей и секретов и какие шаги остаются администратору развёртывания."
audience: [platform, security]
genre: how-to
state: current
status: available
weight: 10
terms: [static-token, security-journal]
---

Страница ведёт от работающего Compose-развёртывания к усиленному: сначала перечисляет, что файлы поставки уже включают, затем даёт шаги, которые выполняет администратор развёртывания, и способы проверить результат. Каждый пункт опирается на файл в каталоге `deploy/` или на код сервера.

Поставка закрывает контейнеры самого CRANE, сети и хранение секретов. Права на файлы хоста, раздача {{< term "static-token" "статического токена" >}}, сбор {{< term "security-journal" >}} и безопасность сторонних контейнеров поставка не определяет: эти шаги ниже.

## Перед началом {#prerequisites}

- Работающий проект из {{< xref "deploy/docker-compose" >}}. Режимы S3 и Valkey необязательны: шаги для них отмечены.
- Доступ к хосту Docker и к корню репозитория, из которого запускался проект.

## Что уже включено в поставке {#shipped}

| Мера | К чему относится | Файл |
| --- | --- | --- |
| Корневая файловая система только для чтения, `tmpfs` на `/tmp` | `crane`, `migrate`, `analyzer` | `deploy/compose/docker-compose.yaml` (якорь `x-crane`) |
| `no-new-privileges:true` и `cap_drop: [ALL]` | `crane`, `migrate`, `analyzer` | `deploy/compose/docker-compose.yaml` (якорь `x-crane`) |
| Образ на основе `distroless` без shell, пользователь `65532:65532` | `crane` | `deploy/docker/Dockerfile` |
| Сборка с `--locked`; базовые образы закреплены тегом и дайджестом | `crane` | `deploy/docker/Dockerfile` |
| Образы Caddy, PostgreSQL, Valkey, SeaweedFS и Trivy закреплены тегом и дайджестом | сторонние сервисы | `.env.dist` |
| Секреты в файлах, смонтированных в `/run/secrets`, а не в переменных окружения | токен, пароль и URL каталога | `deploy/compose/docker-compose.yaml` |
| На хосте опубликованы только порты Caddy; порты `crane` и PostgreSQL не публикуются | `caddy` | `deploy/compose/docker-compose.yaml` |
| Сеть `edge` только для `caddy` и `crane`; её подсеть же служит списком доверенных прокси | `caddy`, `crane` | `deploy/compose/docker-compose.yaml` |
| Удаление клиентского `X-Request-Id` | `caddy` | `deploy/caddy/Caddyfile` |
| Пределы CPU и памяти | `crane` | `deploy/compose/docker-compose.yaml` |
| Сеть `scan` с `internal: true`: у `analyzer` нет выхода наружу | профиль `scan` | `deploy/compose/docker-compose.yaml` |
| Сеть `cache` с `internal: true`, пользователь `default` выключен, ACL без группы `@dangerous`, без записи на диск | Valkey | `deploy/compose/docker-compose.cache.yaml` |
| Сеть `s3` с `internal: true`, анонимного доступа нет, ключи из файлов секретов | SeaweedFS | `deploy/compose/docker-compose.s3.yaml` |

## Шаги {#steps}

1. Оставьте наружу только порты Caddy. Не добавляйте `ports` сервисам `crane` и `postgres` и не публикуйте порт проб ({{< env "CRANE_ADMIN_PORT" >}}): он отвечает без токена. Порт API сервер отдаёт без TLS, поэтому клиенты должны ходить через Caddy.

   > [!WARNING]
   > Файл `deploy/compose/docker-compose.dev.yaml` публикует порты PostgreSQL, Valkey, SeaweedFS и Trivy на хосте. Он создан для разработки, в эксплуатации его не используют.

2. Задайте публичное имя в {{< env "CRANE_HOST" >}}. Для публичного имени Caddy получает сертификат ACME, для `localhost` использует внутренний CA: этот вариант годится только для проверки. Адрес {{< env "CRANE_PUBLIC_URL" >}} Compose выводит из имени сам, поэтому ссылки в ответах протоколов начинаются с `https://`.

3. Проверьте права на каталог секретов. Задача `task secrets:init` создаёт каталог с правами `0700` и файлы с правами `0644`: на Linux секрет читают пользователь `65532` и `postgres`, а не пользователь, создавший файлы. Не расширяйте права на каталог и не копируйте значения секретов в `.env`: в нём лежат только пути к файлам.

   ```bash
   ls -ld secrets
   ```

   Строка вывода начинается с `drwx------`.

4. Замените статический токен, если он мог попасть к постороннему. Запишите новое значение в файл, путь к которому задаёт {{< env "CRANE_TOKEN_SECRET" >}}, и перезапустите `crane`: токен читается один раз при старте. Один токен открывает все репозитории на чтение и запись, поэтому выдавайте его только тем, кому нужен полный доступ: {{< xref "configure/access-token" >}}.

5. Не добавляйте в сеть `edge` другие сервисы и не расширяйте {{< env "CRANE_TRUSTED_PROXIES" >}} на сети клиентов. Сервер верит `X-Forwarded-For` и `X-Request-Id` каждому адресу из списка. Если перед Caddy стоит ещё один прокси, он тоже должен перезаписывать эти заголовки: {{< xref "configure/network" >}}.

6. При режиме Valkey держите сеть `cache` только для `crane` и `valkey`. Не публикуйте порт Valkey, не отключайте аутентификацию и не задавайте {{< env "CRANE_CACHE" >}} с паролем в окружении: адрес с паролем лежит в файле, а сервер читает его через {{< env "CRANE_CACHE_FILE" >}}. Подробности: {{< xref "deploy/valkey-cache" >}}.

7. Если задаёте ключ шифрования настроек, создавайте его с `umask 077` и храните отдельно от резервных копий PostgreSQL. Потерянный ключ восстановить нельзя: {{< xref "configure/settings-encryption" >}}.

8. Обновляйте образы осознанно. Образы сторонних сервисов закреплены дайджестами в `.env.dist`, базовые образы CRANE — в `deploy/docker/Dockerfile`. Дайджест нового тега получайте командой `docker buildx imagetools inspect <образ:тег>`, затем пересобирайте образ CRANE.

9. Настройте сбор стандартного вывода контейнера `crane`. Три потока журнала ИБ идут туда строками JSON. Compose не настраивает драйвер журналов, поэтому сбор, срок хранения и защита от изменений остаются за конвейером логов организации: {{< xref "security/security-events" >}}.

## Проверка {#verify}

1. Убедитесь, что порты на хосте опубликованы только у `caddy`: в колонке `PORTS` вывода команды нет портов хоста у `crane` и `postgres`.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml ps
   ```

2. Проверьте параметры контейнера `crane`.

   ```bash
   docker inspect \
     --format '{{.HostConfig.ReadonlyRootfs}} {{.HostConfig.CapDrop}} {{.HostConfig.SecurityOpt}} {{.Config.User}}' \
     "$(docker compose --project-directory . \
       -f deploy/compose/docker-compose.yaml ps -q crane)"
   ```

   ```text
   true [ALL] [no-new-privileges:true] 65532:65532
   ```

3. Проверьте, что в сети `edge` только два контейнера. Имя сети состоит из имени проекта `crane` и имени сети.

   ```bash
   docker network inspect crane_edge \
     --format '{{range .Containers}}{{.Name}} {{end}}'
   ```

   Вывод содержит имена контейнеров `caddy` и `crane`.

4. В режиме Valkey проверьте, что сеть `cache` изолирована.

   ```bash
   docker network inspect crane_cache --format '{{.Internal}}'
   ```

   ```text
   true
   ```

## Что поставка не закрывает {#outside}

- **Сторонние контейнеры.** У `caddy`, `postgres`, `valkey`, `seaweedfs` и `trivy` в файлах поставки нет `read_only`, `cap_drop` и `no-new-privileges`. Файлы поставки не задают для них такие ограничения. Если администратор добавляет их своим override-файлом, работоспособность образа с ними он проверяет сам.
- **Каналы внутри Docker.** Эталонные URL ведут к PostgreSQL, Valkey и SeaweedFS без TLS (`valkey://`, `http://seaweedfs:8333`). Для внешних сервисов TLS задаётся в адресе: схема `valkeys://` для Valkey, адрес endpoint по `https` для S3, параметры подключения в URL каталога для PostgreSQL.
- **Хост.** Файрвол, обновления ОС и Docker, шифрование дисков и резервных копий, доступ к сокету Docker.
- **Разграничение доступа.** Токен не различает пользователей и права. Роли и вход через OIDC сервер пока не поддерживает: {{< xref "configure/identity" >}}.
- **Журнал ИБ.** Сервер не защищает строки журнала от изменения и не экспортирует их в SIEM: {{< xref "security/security-events#absent" >}}.

## Что дальше {#next}

- {{< xref "security" >}} — границы доверия развёртывания.
- {{< xref "security/security-events" >}} — события журнала ИБ.
- {{< xref "deploy/valkey-cache" >}} — изоляция Valkey.
- {{< xref "configure/network" >}} — доверенные прокси.
