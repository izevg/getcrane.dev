---
title: "Обновления без простоя"
description: "Как CRANE обновляется без простоя: миграции expand, migrate, contract, отдельная роль migrate с блокировкой от параллельного запуска и политика версий."
audience: [platform]
genre: explanation
state: target
status: available
weight: 50
terms: []
---

CRANE обновляется без простоя. Миграции схемы базы данных идут по схеме expand, migrate, contract: новая версия приложения работает и со старой, и с новой схемой, поэтому rolling update не требует остановки. Миграции выполняет отдельная роль процесса, а блокировка не даёт запустить две миграции сразу.

Страница объясняет, как устроено обновление, и описывает поддерживаемые пути обновления. Пошаговые инструкции текущего развёртывания находятся в разделах {{< xref "deploy/docker-compose" >}} и {{< xref "deploy/kubernetes-helm" >}}.

## Expand, migrate, contract {#expand-migrate-contract}

Схема делит изменение базы данных на три шага, между которыми система остаётся рабочей.

- **Expand.** Миграция добавляет новые структуры так, чтобы они не мешали текущей версии приложения.
- **Migrate.** Данные переносятся в новые структуры.
- **Contract.** Когда ни одна реплика больше не использует старые структуры, миграция удаляет их.

Новая версия приложения совместима со старой и с новой схемой. Поэтому во время rolling update старые и новые реплики работают одновременно. Реплики API не хранят состояния и заменяются постепенно, а в Kubernetes доступность части реплик сохраняет PodDisruptionBudget ({{< xref "features/operations/deployment-model#kubernetes" >}}).

## Отдельная роль migrate {#migrate-role}

Миграции выполняет отдельная роль процесса `migrate`, а не реплика API или воркер ({{< xref "features/operations/deployment-model#roles" >}}).

- В Kubernetes это `Job`, который запускается хуком `pre-upgrade`.
- В Docker Compose это одноразовый сервис.

Проба `startup` сообщает, что миграции применены и кэши прогреты ({{< xref "features/operations/observability#endpoints" >}}).

## Блокировка {#lock}

Роль `migrate` использует advisory-блокировку PostgreSQL. Пока блокировка занята, вторая миграция не запускается.

## Политика версий обновления {#version-policy}

- Поддерживается обновление через одну минорную версию.
- Мажорные версии имеют документированный путь обновления. CRANE проверяет его в CI на снимке реальной схемы.

## Связанные страницы {#related}

- {{< xref "features/operations/deployment-model" >}}
- {{< xref "features/operations/backup-restore" >}}
- {{< xref "deploy/kubernetes-helm" >}}
- {{< xref "deploy/docker-compose" >}}
