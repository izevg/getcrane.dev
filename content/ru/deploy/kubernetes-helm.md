---
title: "Kubernetes и Helm"
description: "Что входит в Helm-чарт CRANE, как подключить внешние PostgreSQL, Valkey и S3 через existingSecret и значения и какие ограничения у чарта сейчас."
audience: [platform]
genre: how-to
state: current
status: available
weight: 50
terms: [blob, digest, namespace]
---

Helm-чарт `deploy/helm/crane` разворачивает CRANE в Kubernetes: `Deployment` api и worker, `Job` миграций, `Service` и необязательный `Ingress`. PostgreSQL, Valkey и S3 в чарт не входят: это внешние сервисы организации. Настройки сервера чарт получает из секрета, который создаётся вне чарта и называется в значении `existingSecret`.

> [!IMPORTANT]
> Чарт и бинарник сейчас расходятся в двух местах. Шаблон `worker` запускает роль `worker`, которой у бинарника нет. Проба `startupProbe` пода api запрашивает путь `/healthz/startup`, которого нет у порта admin. Подробности и последствия: [Расхождения чарта и сервера](#limitations).

## Перед началом {#prerequisites}

- Кластер Kubernetes, `kubectl` и Helm. Чарт использует `apiVersion: v2`.
- Внешний PostgreSQL 17 и новее с расширениями `vector` и `pg_trgm`: {{< xref "deploy/requirements#postgresql" >}}.
- Хранилище {{< term "blob" >}}: S3-совместимое хранилище организации.
- Образ CRANE в реестре, доступном кластеру. Образ не публикуется, поэтому соберите его и отправьте в свой реестр.

  ```bash
  docker build -f deploy/docker/Dockerfile \
    -t registry.example.com/crane/crane:<tag> .
  docker push registry.example.com/crane/crane:<tag>
  ```

- Для Valkey: `maxmemory` и `maxmemory-policy allkeys-lru`, а также аутентификация и сетевая изоляция. Ключи артефактов живут без TTL.

## Шаги {#steps}

1. Создайте пространство имён.

   ```bash
   kubectl create namespace crane
   ```

2. Подготовьте файл с настройками сервера. Файл содержит секреты: не добавляйте его в репозиторий. Список ключей: [Секрет с настройками](#secret).

   ```ini
   CRANE_DATABASE_URL=postgres://crane:<password>@<postgres-host>:5432/crane
   CRANE_BLOBS=s3://<bucket>?region=<region>
   CRANE_PUBLIC_URL=https://crane.example.com
   CRANE_TOKEN=<token>
   AWS_ACCESS_KEY_ID=<access-key-id>
   AWS_SECRET_ACCESS_KEY=<secret-access-key>
   ```

3. Создайте секрет из файла. Секрет должен существовать до установки: миграции запускаются хуком до остальных ресурсов.

   ```bash
   kubectl create secret generic crane-env --namespace crane \
     --from-env-file=crane.env
   ```

4. Создайте файл значений.

   ```yaml
   existingSecret: crane-env
   image:
     repository: registry.example.com/crane/crane
     tag: "<tag>"
     digest: "sha256:<digest>"
   ingress:
     enabled: true
     className: <ingress-class>
     host: crane.example.com
     tls:
       - secretName: <tls-secret>
         hosts: [crane.example.com]
   ```

5. Проверьте чарт.

   ```bash
   helm lint deploy/helm/crane --set existingSecret=crane-env
   ```

6. Установите чарт.

   ```bash
   helm install crane deploy/helm/crane --namespace crane \
     --values values.yaml
   ```

## Проверка {#verify}

1. Дождитесь завершения `helm install`. Перед установкой Helm запускает `Job` миграций как хук `pre-install` и ждёт его завершения. Успешный `Job` удаляется, неуспешный остаётся для чтения журнала: `kubectl logs job/crane-crane-migrate --namespace crane`.
2. Покажите поды.

   ```bash
   kubectl get pods --namespace crane
   ```

3. Поды api готовы, когда проба `/healthz/ready` на порту admin отвечает `200`. Проба проверяет PostgreSQL и хранилище blob. Пока `startupProbe` указывает на отсутствующий путь, поды api не доходят до состояния `Ready`: это расхождение чарта и сервера, а не ошибка настройки (см. [Расхождения чарта и сервера](#limitations)).

## Что содержит чарт {#contents}

| Ресурс | Назначение |
| --- | --- |
| `Deployment` api | Роль `serve`. Порты `http` и `admin`. Пробы: `startupProbe` (`/healthz/startup`), `readinessProbe` (`/healthz/ready`), `livenessProbe` (`/healthz/live`) на порту admin |
| `Service` | Тип `ClusterIP`, порт `80` на порт `http` пода api. Порт admin в `Service` не входит |
| `Deployment` worker | Роль `worker`. Порт admin. Пробы `readinessProbe` и `livenessProbe` |
| `Job` migrate | Роль `migrate`. Хук `pre-install,pre-upgrade`, политика удаления `before-hook-creation,hook-succeeded`, `backoffLimit: 2`, `restartPolicy: Never`. Отключается значением `migrate.enabled` |
| `Ingress` | Создаётся при `ingress.enabled: true`. Путь `/` с `pathType: Prefix` на `Service` |

Все поды запускаются с `runAsNonRoot: true`, профилем seccomp `RuntimeDefault`, `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true` и `capabilities.drop: [ALL]`. Для `/tmp` подключён `emptyDir`. Переменные окружения поды получают из секрета `existingSecret` целиком (`envFrom`), а `CRANE_CACHE` и `CRANE_BLOBS` дополнительно задают значения `config.cache` и `config.blobs`.

## Секрет с настройками {#secret}

Секрет создаётся вне чарта: вручную, через external-secrets или sealed-secrets. Чарт не монтирует файлы секретов, поэтому в секрете используются переменные без суффикса `_FILE`.

| Ключ | Обязателен | Назначение |
| --- | --- | --- |
| `CRANE_DATABASE_URL` | да | Адрес каталога `postgres://…` |
| `CRANE_BLOBS` | да, если пусто `config.blobs` | Хранилище blob, например `s3://<bucket>?region=<region>` |
| `CRANE_PUBLIC_URL` | да | Внешний адрес, `http://` или `https://` |
| `CRANE_TOKEN` | да | Статический токен доступа к протоколам |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | нет | Статический ключ S3; без него ключи берутся из ролей и метаданных |
| `CRANE_TOKEN_PRINCIPAL` | нет | Имя владельца токена (по умолчанию `crane`) |
| `CRANE_TRUSTED_PROXIES` | нет | Доверенные прокси: [Ingress и доверенные прокси](#ingress) |
| `CRANE_CARGO_PROXY_REPOS`, `CRANE_NPM_REPOS`, `CRANE_NPM_PROXY_REPOS`, `CRANE_NAMESPACES` | нет | Репозитории и резервирование {{< term "namespace" >}}; формат как в {{< xref "deploy/docker-compose" >}} |

Адрес Valkey задаёт значение `config.cache`, а не ключ секрета.

> [!WARNING]
> Адрес Valkey в `config.cache` попадает в манифест `Deployment` как обычная переменная окружения. Если адрес содержит пароль, он виден всем, кто читает манифест или выполняет `helm get values`. Чарт всегда задаёт `CRANE_CACHE` из `config.cache`, и значение `env` побеждает значение из `envFrom`, поэтому ключ `CRANE_CACHE` в секрете не действует.

Схемы адреса: {{< xref "deploy/valkey-cache#schemes" >}}.

## Значения {#values}

| Значение | По умолчанию | Назначение |
| --- | --- | --- |
| `existingSecret` | пусто | Имя секрета с настройками; обязательно, без него шаблон не рендерится |
| `image.repository` | `crane/crane` | Репозиторий образа |
| `image.tag` | пусто | Тег; пустое значение даёт `appVersion` чарта |
| `image.digest` | пусто | {{< term "digest" >}} индекса образа (`sha256:…`); если задан, образ ссылается как `repository:tag@digest` и выбирается по дайджесту |
| `image.pullPolicy` | `IfNotPresent` | Политика загрузки образа |
| `imagePullSecrets` | `[]` | Секреты для приватного реестра |
| `config.cache` | `memory` | Значение `CRANE_CACHE` |
| `config.blobs` | пусто | Значение `CRANE_BLOBS`; пустое значение не задаёт переменную |
| `ports.http` | `8080` | Порт контейнера `http` |
| `ports.admin` | `9464` | Порт контейнера `admin` и порт проб |
| `api.replicas` | `2` | Число реплик api |
| `api.resources` | запрос `500m` CPU и `512Mi`, предел памяти `1Gi` | Ресурсы api |
| `worker.replicas` | `2` | Число реплик worker |
| `worker.resources` | запрос `500m` CPU и `512Mi`, предел памяти `1Gi` | Ресурсы worker |
| `migrate.enabled` | `true` | Запускать `Job` миграций хуком |
| `service.type`, `service.port` | `ClusterIP`, `80` | Тип и порт `Service` |
| `ingress.enabled` | `false` | Создавать `Ingress` |
| `ingress.className`, `ingress.annotations` | пусто | Класс и аннотации `Ingress` |
| `ingress.host` | `crane.example.com` | Имя хоста |
| `ingress.tls` | `[]` | Блок `tls` `Ingress` |
| `podAnnotations`, `nodeSelector`, `tolerations`, `affinity` | пусто | Передаются подам api и worker |

Чарт не передаёт значения `ports` серверу. Порты сервера задают `CRANE_HTTP_PORT` и `CRANE_ADMIN_PORT`, по умолчанию те же `8080` и `9464`. При изменении `ports` задайте те же значения в секрете.

## Ingress и доверенные прокси {#ingress}

Чарт не задаёт `CRANE_TRUSTED_PROXIES`. Поэтому сервер игнорирует `X-Request-Id` и `X-Forwarded-For` от ingress, а адрес клиента в событиях равен адресу ingress-контроллера.

Если ingress-контроллер включён в `CRANE_TRUSTED_PROXIES` (ключ секрета; значение — IP-адреса и CIDR через запятую), он обязан перезаписывать или удалять присланный клиентом `X-Request-Id` и дописывать адрес своего пира в конец `X-Forwarded-For`. Сервер разбирает `X-Forwarded-For` справа налево, поэтому левые записи клиента не влияют на результат. Без этого клиент подставит собственный идентификатор запроса и адрес.

## Расхождения чарта и сервера {#limitations}

Сервер принимает ровно одну роль: `serve`, `all`, `migrate` или `healthcheck`. Любой другой аргумент даёт сообщение `использование: crane <serve|all|migrate|healthcheck>` и код завершения `2`. Роль `all` сейчас равна роли `serve`: отдельных фоновых задач у сервера нет.

- **Роль `worker`.** Шаблон `templates/worker.yaml` запускает контейнер с аргументом `worker`. Бинарник завершается с кодом `2`, и поды worker не становятся готовыми.
- **Проба запуска api.** Порт admin отдаёт только `/healthz/live` и `/healthz/ready`, остальные пути получают `404`. Проба `startupProbe` запрашивает `/healthz/startup` до 30 раз с интервалом 2 с, после чего Kubernetes перезапускает контейнер. Поды api не доходят до состояния `Ready`.
- **Кэш.** Комментарий в `values.yaml` называет `CRANE_CACHE` ключом секрета, но шаблон всегда задаёт `CRANE_CACHE` из `config.cache` (см. предупреждение выше).

Миграции от этих расхождений не зависят: `Job` migrate запускает роль `migrate`, которую бинарник принимает.

## Что дальше {#next}

- {{< xref "deploy/requirements" >}}
- {{< xref "configure/cache" >}}
- {{< xref "operations/upgrades-and-migrations" >}}
- {{< xref "reference/environment-variables" >}}
