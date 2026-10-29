---
title: "Развёртывание"
description: "Какие способы запустить CRANE есть сейчас: Docker Compose на одном узле с режимами S3 и Valkey и Helm-чарт для Kubernetes, и как выбрать между ними."
audience: [platform]
genre: how-to
state: current
status: available
weight: 30
terms: [blob]
---

CRANE запускается двумя способами: через Docker Compose на одном узле и через Helm-чарт в Kubernetes. Оба способа используют один образ и одну конфигурацию: переменные окружения и необязательный файл TOML. Образ CRANE сейчас собирается локально из `deploy/docker/Dockerfile` и в реестре не публикуется.

Доступ к протоколам защищён статическим токеном `CRANE_TOKEN`. Порт проб (admin) не публикуется ни в Compose-файле, ни в `Service` чарта: наружу выходит только порт API.

## Способы развёртывания {#options}

| Способ | Когда подходит | Что входит | Страница |
| --- | --- | --- | --- |
| Docker Compose на одном узле | Один хост; PostgreSQL, Caddy и `crane` в одном проекте; {{< term "blob" >}} лежат в локальном томе | `caddy`, `migrate`, `crane`, `postgres` | {{< xref "deploy/docker-compose" >}} |
| Режим S3 (override) | Blob хранятся в S3; в поставке SeaweedFS | `docker-compose.s3.yaml`: `seaweedfs`, `seaweedfs-init` | {{< xref "deploy/s3-storage" >}} |
| Режим Valkey (override) | Общий кэш с обязательной аутентификацией в изолированной сети | `docker-compose.cache.yaml`: `valkey` | {{< xref "deploy/valkey-cache" >}} |
| Kubernetes и Helm | Есть кластер; PostgreSQL, Valkey и S3 предоставляет организация | `Deployment` api и worker, `Job` migrate, `Service`, `Ingress` | {{< xref "deploy/kubernetes-helm" >}} |

Режимы S3 и Valkey оформлены override-файлами, а не профилями Compose: они меняют настройку самого `crane` (ключи, сети, зависимости), а профиль так не умеет. Файлы подключаются к базовому `docker-compose.yaml`.

## Перед началом {#prerequisites}

- Проверьте версии PostgreSQL и расширений, образов и инструментов: {{< xref "deploy/requirements" >}}.
- Определите, где будут лежать blob: локальный том, SeaweedFS из поставки или внешний S3.
- Определите, сколько реплик `crane` работает одновременно и нужен ли им общий кэш.

## Шаги {#steps}

1. Нужен один хост с минимумом зависимостей: разверните Docker Compose на одном узле. Кэш по умолчанию лежит в памяти процесса, blob в локальном томе.
2. Blob должны храниться в S3: добавьте override `docker-compose.s3.yaml`.
3. Репликам `crane` нужен общий кэш: добавьте override `docker-compose.cache.yaml`. В Compose-файле `crane` — один контейнер, поэтому там Valkey не обязателен.
4. В организации уже есть Kubernetes, PostgreSQL, Valkey и S3: используйте Helm-чарт. Прочитайте ограничения чарта в начале страницы {{< xref "deploy/kubernetes-helm" >}}.

## Проверка {#verify}

Сервер готов, когда `/healthz/ready` на порту admin (по умолчанию `9464`) отвечает `200`. Проба проверяет PostgreSQL и хранилище blob. В Compose её выполняет команда `crane healthcheck`. Подробности: {{< xref "operations/health-checks" >}}.

## Что дальше {#next}

- {{< xref "deploy/requirements" >}}
- {{< xref "deploy/docker-compose" >}}
- {{< xref "deploy/kubernetes-helm" >}}
- {{< xref "reference/environment-variables" >}}
