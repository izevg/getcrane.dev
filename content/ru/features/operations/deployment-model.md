---
title: "Модель развёртывания"
description: "CRANE — один бинарник и один образ с ролями процесса, PostgreSQL как единственный источник истины и две равноправные топологии: Docker Compose и Kubernetes."
audience: [platform]
genre: explanation
state: target
status: available
weight: 10
terms: [quarantine, cas, blob, upstream, fail-closed, dependency-confusion, typosquatting]
---

CRANE устроен как модульный монолит: один бинарник и один образ запускаются в разных ролях процесса. Состояние хранится в PostgreSQL, а Valkey и S3-кэш proxy можно потерять без потери данных. Один и тот же образ, одна конфигурация и одни миграции работают в Docker Compose на одном узле и в Kubernetes; различаются только топология и число реплик.

Безопасность определяет границы этой модели. Если каталог PostgreSQL недоступен, CRANE не отдаёт пакеты ни из кэша, ни из {{< term "upstream" >}}, а отвечает `503`. Без каталога нельзя проверить резервации, экстренные блокировки и {{< term "quarantine" >}}.

## Один образ, несколько ролей {#roles}

Роль выбирается аргументом запуска. Роли дают то же независимое масштабирование, что и отдельные сервисы, но без распределённых транзакций и десятка деплойментов.

| Роль | Что делает | Масштабирование |
| --- | --- | --- |
| `serve` | API: протоколы пяти форматов, REST API, раздача SPA, аутентификация и авторизация, горячий путь скачивания. Не хранит состояние | Реплики по числу запросов и CPU |
| `worker` | Фоновые задачи из очереди в PostgreSQL: синхронизация фидов уязвимостей, экспорт в SIEM, сканы, индексация, GC, retention, webhooks, rescan, прогрев кэша, импорт из Nexus | Реплики по длине очереди |
| `all` | `serve` и `worker` в одном процессе; роль single node | Один контейнер |
| `migrate` | Одноразовое применение миграций схемы. Блокировка исключает параллельный запуск двух миграций | Один запуск за обновление |
| `analyze` | Изолированная песочница: распаковка недоверенных архивов с лимитами, извлечение metadata и license-файлов, генерация SBOM. Без сети, кроме Trivy; read-only файловая система | Пул, по очереди |
| `healthcheck` | Проба готовности для контейнера: образу не нужен `curl` | Не применяется |

## Модульный монолит {#monolith}

Домен реестра компактный, а горячий путь «авторизация, кэш, отдача файла» выигрывает от отсутствия сетевых переходов. Поэтому CRANE работает одним процессом с жёсткими границами модулей. Крейты соответствуют слоям гексагональной архитектуры, а bounded context — модулям внутри слоёв. Модули общаются через трейты и доменные события.

Ядро зависит только от интерфейсов хранилища, кэша, очереди задач и сканера. Форматы пакетов, хранилища и интеграции встроены в бинарник как их реализации. Динамической загрузки кода и API для сторонних расширений нет: так меньше поверхность атаки и поддержки.

## PostgreSQL как единственный источник истины {#source-of-truth}

PostgreSQL 17+ с расширениями pgvector и pg_trgm хранит metadata, политики, аудит, outbox для внешней доставки и очередь задач. Транзакции обеспечивают атомарную публикацию, а полнотекстовый и векторный поиск не требуют отдельного поискового кластера.

Очередь задач и outbox живут в PostgreSQL, поэтому минимальный профиль не нуждается в брокере сообщений.

Байты пакетов ({{< term "blob" >}}) лежат в {{< term "cas" >}} под SHA-256 и не меняются. Valkey (кэш metadata, координация выборок, ограничение частоты, инвалидации) и кэш proxy в S3 теряются без потери данных: содержимое восстанавливается из upstream.

- **Отказ Valkey.** CRANE переходит на кэш в памяти процесса. Нагрузка смещается на upstream, а не на PostgreSQL. Межрепликовая координация выборок пропадает, остаётся объединение выборок внутри процесса.
- **Отказ S3.** Скачивание того, что есть в кэше процесса или CDN, продолжается. Остальные запросы получают `503 Retry-After`, публикация недоступна.
- **Отказ каталога.** Все протокольные запросы, включая чтения из кэша и proxy, получают `503 Retry-After`, выборок из upstream нет. Это {{< term "fail-closed" >}}: отдать имя из upstream или кэша без проверки резерваций значит открыть {{< term "dependency-confusion" >}} и {{< term "typosquatting" >}}. Подробнее: {{< xref "features/security/fail-closed" >}}.

## Профили S, M и L {#profiles}

Один образ покрывает профили от одной небольшой ВМ до кластера. В профиле S все внешние зависимости, кроме PostgreSQL, необязательны.

Цифры в таблице — ориентиры для планирования. Это не гарантии и не минимальные требования. Текущие пределы по умолчанию описаны в {{< xref "deploy/requirements#resources" >}}.

| Компонент | S · один узел | M · один узел или Kubernetes | L · Kubernetes, 3 зоны |
| --- | --- | --- | --- |
| CRANE api | 1 контейнер: 1–2 vCPU, 0,5–1 ГБ | 2 × (2 vCPU, 1 ГБ) | 6–12 × (4 vCPU, 2–4 ГБ) |
| CRANE worker | в роли `all` | 2 × (1 vCPU, 1 ГБ) | 4–8 × (2 vCPU, 2 ГБ) |
| Analyzer и Trivy | необязательно: 1 vCPU, 2 ГБ | 2 × (2 vCPU, 4 ГБ) | 4–8 × (2 vCPU, 4 ГБ) |
| PostgreSQL | 1 vCPU, 1 ГБ | 4 vCPU, 16 ГБ и реплика | 3 × (16 vCPU, 64 ГБ), NVMe |
| Valkey | не обязателен | 1 × 2 ГБ | 3 × (2 vCPU, 8 ГБ) |
| Хранилище blob | локальный диск, 50–200 ГБ | S3, 2–10 ТБ | S3 с erasure coding, 100–500 ТБ |
| Итого вычислений | 2 vCPU / 4 ГБ | около 16 vCPU / 48 ГБ | около 120–180 vCPU / около 350 ГБ |

В профиле L основная доля CPU приходится на PostgreSQL, сканирование и хранилище. Сами API-реплики занимают 24–48 vCPU.

## Две равноправные топологии {#topologies}

Docker Compose и Kubernetes поддерживаются одинаково. Общие у них образ, конфигурация (файл TOML и переменные окружения) и миграции.

### Docker Compose на одном узле {#compose}

```mermaid {caption="Рисунок 1. Топология single node: минимальный вариант состоит из caddy, crane, PostgreSQL и локального тома."}
flowchart LR
  clients["Клиенты, CI"]
  subgraph host["Хост: Docker Compose"]
    caddy["caddy<br>TLS, ACME или собственный сертификат"]
    crane["crane<br>роль all: serve + worker"]
    analyzer["crane-analyzer<br>роль analyze, без сети"]
    pg[("PostgreSQL 17+<br>с pgvector")]
    valkey[("valkey<br>необязателен в профиле S")]
    blobs[("SeaweedFS, RustFS<br>или том /data/blobs")]
    trivy["Trivy server<br>необязателен"]
  end
  clients --> caddy --> crane
  crane --> pg
  crane --> valkey
  crane --> blobs
  crane --> analyzer
  analyzer --> trivy
```

Caddy принимает TLS и передаёт запросы `crane` по общей сети, адрес которой входит в список доверенных прокси. Секреты лежат в файлах, а не в переменных окружения. Valkey требует аутентификации и находится в сети без выхода наружу, где кроме него только `crane`. Анализатор работает в отдельной сети, где достижим только Trivy.

### Kubernetes {#kubernetes}

```mermaid {caption="Рисунок 2. Топология Kubernetes: все компоненты с состоянием могут быть внешними управляемыми сервисами организации."}
flowchart TB
  gateway["Gateway API<br>Envoy Gateway, Traefik, Cilium"]
  subgraph namespace["namespace crane"]
    api["Deployment api<br>3..N реплик, HPA по RPS и CPU<br>topology spread по зонам, PDB"]
    worker["Deployment worker<br>2..N, KEDA или HPA по длине очереди"]
    analyzer["Deployment analyzer<br>restricted PSS, NetworkPolicy deny-all кроме Trivy"]
    migrate["Job migrate<br>pre-upgrade hook"]
    pgbouncer["PgBouncer"]
  end
  subgraph data["Данные"]
    pg[("PostgreSQL<br>Percona или CloudNativePG<br>1 primary и 2 sync-реплики")]
    valkey[("Valkey<br>Sentinel из 3 узлов или Cluster")]
    s3[("S3<br>SeaweedFS, RustFS, Ceph, облако")]
  end
  observability["VictoriaMetrics, VictoriaLogs, Jaeger,<br>Perses или существующий стек"]
  gateway --> api
  api --> pgbouncer --> pg
  worker --> pgbouncer
  api --> valkey
  worker --> valkey
  api --> s3
  worker --> s3
  worker --> analyzer
  api -.-> observability
  worker -.-> observability
```

Реплики api не хранят состояние и масштабируются по числу запросов и CPU, реплики worker — по длине очереди. Миграции выполняет `Job` с хуком `pre-upgrade`. Valkey изолирован политиками NetworkPolicy и защищён паролем из `Secret`.

Если ingress-контроллер включён в список доверенных прокси, он перезаписывает или удаляет присланный клиентом `X-Request-Id` и дописывает адрес своего пира в конец `X-Forwarded-For`. Иначе клиент подставил бы собственный идентификатор запроса и адрес.

## Обновления без простоя {#upgrades}

Миграции схемы идут по схеме expand, migrate, contract: новая версия приложения работает и со старой, и с новой схемой. Поэтому rolling update не требует простоя. Миграции выполняет отдельная роль `migrate`: хук `pre-upgrade` в Kubernetes и одноразовый сервис в Compose.

## Связанные страницы {#related}

- {{< xref "deploy/docker-compose" >}}
- {{< xref "deploy/kubernetes-helm" >}}
- {{< xref "features/operations/availability" >}}
- {{< xref "features/operations/upgrades" >}}
