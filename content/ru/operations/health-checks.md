---
title: "Проверки здоровья"
description: "Как проверить, что CRANE жив и готов принимать запросы: команда crane healthcheck, проверка в Docker Compose и внешний мониторинг без публикации порта проб."
audience: [platform]
genre: how-to
state: current
status: available
weight: 10
terms: [readiness-probe, catalog]
---

Страница показывает, как проверить живость и готовность CRANE и подключить эти проверки к Docker Compose и внешнему мониторингу. Результат: проверка, которая отличает «процесс жив» от «сервер может обслуживать запросы», и понятный порядок действий при отказе.

CRANE отдаёт две пробы на отдельном порту без токена. Проба `/healthz/live` отвечает, пока жив процесс. Проба `/healthz/ready` ({{< term "readiness-probe" >}}) отвечает `200`, когда доступны {{< term "catalog" >}} в PostgreSQL и хранилище blob. Команда `crane healthcheck` опрашивает `/healthz/ready` изнутри контейнера. Точные пути, коды и таймауты: {{< xref "reference/ports-and-health" >}}.

> [!WARNING]
> Порт проб не требует токена. Не публикуйте {{< env "CRANE_ADMIN_PORT" >}} на хосте и не пропускайте его через обратный прокси: {{< xref "deploy/docker-compose#edge" >}}.

## Перед началом {#prerequisites}

- Работающее развёртывание в Docker Compose: {{< xref "deploy/docker-compose" >}}.
- Доступ к хосту с Docker и к файлу `deploy/compose/docker-compose.yaml`. Команды выполняются из корня репозитория.

## Шаги {#steps}

1. Запустите пробу готовности внутри контейнера `crane`. Образ основан на `distroless`, в нём нет `curl`, поэтому проба встроена в бинарник.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml exec -T crane crane healthcheck
   echo $?
   ```

   ```text
   0
   ```

   Код `0` означает, что `/healthz/ready` ответила `200`. Код `1` означает отказ или таймаут пробы (2 с). При успехе команда ничего не печатает.

2. Проверьте состояние, которое видит Compose. В проекте проверка уже настроена: сервис `crane` запускает `crane healthcheck` каждые 10 с, ждёт ответ 3 с и считает контейнер нездоровым после шести неудач подряд.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml ps crane
   ```

   В колонке состояния должно быть `healthy`. Для скрипта мониторинга то же состояние читает `docker inspect`:

   ```bash
   docker inspect --format '{{.State.Health.Status}}' \
     "$(docker compose --project-directory . \
       -f deploy/compose/docker-compose.yaml ps -q crane)"
   ```

   ```text
   healthy
   ```

3. Добавьте внешнюю проверку по пути клиентов. Запрос без токена к любому репозиторию получает `401`, если Caddy, TLS и API работают. Токен для такой проверки не нужен.

   ```bash
   curl -sS -o /dev/null -w '%{http_code}\n' \
     https://crane.example.com/cargo/internal/index/config.json
   ```

   ```text
   401
   ```

   Подставьте имя своего hosted-репозитория Cargo: по умолчанию это `internal`. Проверка подтверждает путь от клиента до API, но не проверяет PostgreSQL и хранилище blob. Для них служит проба готовности из шага 1.

4. Подключите шаг 1 к системе мониторинга как команду на хосте CRANE. Код выхода команды и есть результат проверки: `0` — готов, `1` — не готов.

## Какую пробу для чего использовать {#which}

| Вопрос | Проверка | Что делать при отказе |
| --- | --- | --- |
| Жив ли процесс | Контейнер `crane` запущен, `/healthz/live` отвечает `200` | Перезапуск. Проба живости не зависит от хранилищ: недоступная база не повод перезапускать процесс |
| Может ли сервер обслуживать запросы | `crane healthcheck` или `/healthz/ready` | Не направлять трафик; искать причину в журнале: {{< xref "operations/outages" >}} |
| Доходят ли клиенты до API | Запрос без токена возвращает `401` | Проверять Caddy, DNS и TLS |

Проба готовности не проверяет Valkey, upstream и токен. Отказ кэша или upstream не делает сервер неготовым, он виден в журнале: {{< xref "operations/outages" >}}.

В Kubernetes те же пробы подключаются к порту admin. Расхождения описаны в {{< xref "reference/ports-and-health#orchestrators" >}}.

## Проверка {#verify}

Проверка работает, если она замечает отказ. Остановите PostgreSQL на стенде и убедитесь, что готовность пропала, а живость нет.

```bash
docker compose --project-directory . \
  -f deploy/compose/docker-compose.yaml stop postgres
docker compose --project-directory . \
  -f deploy/compose/docker-compose.yaml exec -T crane crane healthcheck
echo $?
```

```text
{"timestamp":"…","level":"ERROR","message":"роль завершилась с ошибкой","error":"порт 9464 ответил нездоровым статусом: HTTP/1.1 503 Service Unavailable"}
1
```

Верните базу и дождитесь кода `0`:

```bash
docker compose --project-directory . \
  -f deploy/compose/docker-compose.yaml start postgres
```

После возврата PostgreSQL перезапуск `crane` не нужен: сервер восстанавливается сам.

## Если проба отвечает отказом {#failed}

Причина записана в журнале `crane` на уровне `warn`. Запись называет событие, поле `error` содержит цепочку причин.

| Запись в журнале | Что произошло |
| --- | --- |
| `хранилище не готово` | Каталог или хранилище blob ответили ошибкой или не ответили; причина в поле `error` |
| `проба хранилищ не уложилась в 1.5s` | Хранилища не ответили за бюджет пробы |

Если хранилище не ответило (соединение, таймаут), проба отвечает `503` с типом `urn:crane:problem:storage-unreachable`. Если хранилище ответило ошибкой, например нет таблицы или бакета, тип `about:blank`: повторять запрос бессмысленно, нужно исправить конфигурацию или схему. Формат ответа: {{< xref "reference/errors#problem-types" >}}. Что делает администратор по каждому компоненту: {{< xref "operations/outages" >}}. Типичные ошибки запуска: {{< xref "operations/troubleshooting" >}}.

## Что дальше {#next}

- {{< xref "reference/ports-and-health" >}}
- {{< xref "operations/outages" >}}
- {{< xref "operations/logs" >}}
- {{< xref "operations/troubleshooting" >}}
