# Информационная архитектура getcrane.dev

Карта сайта, аудитории и страниц. Ведёт руководитель документации; правила текста и разметки — `design/authoring.md`.

## Принципы

1. CRANE в первую очередь про безопасность цепочки поставки, затем про управление реестром. Этот порядок держат главная страница, раздел Features и навигация: «Безопасность прежде всего» идёт первым подразделом Features.
2. Diátaxis: каждая страница одного жанра. Объяснения (почему) живут в Features и концепциях, how-to — в Развёртывании, Настройке, Форматах и Эксплуатации, точные факты — в Справочниках.
3. Целевое и текущее состояние не смешиваются на одной странице. Features (`state: target`) описывает, как CRANE устроен; разделы Развёртывание, Настройка, Форматы, Справочники, Эксплуатация (`state: current`) — что есть сейчас. Отсутствующее — страница `in-development`.
4. RU и EN 1:1: одинаковые пути, якоря, шорткоды.

## Языки и URL

- `https://getcrane.dev/ru/…` и `https://getcrane.dev/en/…`, слаги английские в обоих языках.
- Корень `/` — лендинг EN с заметной ссылкой на RU. Редиректа по языку нет (на статике он возможен только клиентским JS); `hreflang` на обе версии и `x-default` на EN.

## Аудитории

| id | Кто | Что ищет | Вход |
| --- | --- | --- | --- |
| `developer` | Разработчик: публикует и устанавливает пакеты | Подключить клиент, опубликовать, понять отказ | Начало работы → Форматы пакетов |
| `platform` | Инженер платформы, администратор развёртывания | Развернуть, настроить, обслуживать, масштабировать | Развёртывание → Настройка → Эксплуатация |
| `security` | Специалист по безопасности (AppSec, SecOps) | Какие угрозы закрыты, где границы, что видно в журнале ИБ и SIEM | Features: Безопасность прежде всего → Безопасность |
| `auditor` | Аудитор, специалист по соответствию | Что регистрируется, кто имеет доступ к журналу, как проверить целостность | Features: журнал ИБ → Безопасность → Справочники |

## Разделы

| Раздел | Путь | Жанры | Состояние | Аудитории |
| --- | --- | --- | --- | --- |
| Главная | `/` | лендинг | target | все |
| Начало работы | `start/` | tutorial, explanation, how-to | смешанное по страницам | developer, platform |
| Features | `features/` | explanation | target | все |
| Развёртывание | `deploy/` | how-to, reference | current | platform |
| Настройка | `configure/` | how-to | current | platform, security |
| Форматы пакетов | `formats/` | how-to | current | developer, platform |
| Безопасность | `security/` | how-to, reference | current | security, auditor, platform |
| Справочники | `reference/` | reference | current | platform, developer |
| Эксплуатация | `operations/` | how-to | current | platform |
| Глоссарий | `glossary/` | reference | — | все |

## Страницы

Исполнитель: `W1`–`W3` — писатели первой партии, `B2`, `B3` — следующие партии (назначаются после приёмки первой), `ED` — руководитель документации. Источники — пути в репозитории CRANE; код и тесты главнее текста.

### Начало работы `start/`

| Путь | Заголовок RU | Жанр | Состояние | Аудитории | Источники | Исп. |
| --- | --- | --- | --- | --- | --- | --- |
| `start/_index` | Что такое CRANE | explanation | target | developer, platform, security | `docs/product/01`, `02`, `05`, `README.md` | W3 |
| `start/quickstart` | Первый запуск | tutorial | current | platform, developer | `deploy/compose/*`, `.env.dist`, `deploy/docker/Dockerfile`, `Taskfile.yml`, `crates/entry/server/src` | W3 |
| `start/concepts` | Основные понятия | explanation | target | developer, platform | `docs/product/09` (жизненный цикл версии), `10.1–10.3`, `99` | W3 |
| `start/first-run` | Мастер первого запуска | how-to | current, in-development | platform | `docs/product/20.4–20.5`, `crates/core/domain/src/onboarding` | W3 |

### Features `features/`

Подразделы в порядке навигации: Безопасность прежде всего, Управление реестром, Развёртывание и обслуживание.

| Путь | Заголовок RU | Аудитории | Источники | Исп. |
| --- | --- | --- | --- | --- |
| `features/_index` | Возможности CRANE | все | `docs/product/01`, `02`, `14` | ED |
| **Безопасность прежде всего** | | | | |
| `features/security/_index` | Безопасность прежде всего | security, platform, auditor | `14.1–14.3`, `02` P3–P5, решения 17, 46 раздела 19 | W1 |
| `features/security/supply-chain-threats` | Угрозы цепочки поставки | security | `14.2`, `11.5` | W1 |
| `features/security/immutable-versions` | Неизменяемые версии | security, platform, developer | `09` (жизненный цикл, семантика по форматам), `10.1`, решения 50–51 | W1 |
| `features/security/digest-verification` | Проверка дайджестов | security, platform | `09` (blob), `10.1`, `10.2`, `10.6.1`, `16.1` (остаточный риск Valkey), решение 52 | W1 |
| `features/security/namespace-reservation` | Резервирование namespace | security, platform, developer | `10.3`, решения 28, 42, 43 | W1 |
| `features/security/upstream-quarantine` | Карантин новых версий upstream | security, platform | `10.2` (видимость proxy), `14.2`, `21.7`, решения 27, 62 | W1 |
| `features/security/egress-guard` | Контроль исходящих запросов (SSRF) | security, platform | `14.2`, `14.3`, `10.2`, `crates/adapters/external/upstream/src/guard.rs` | W1 |
| `features/security/fail-closed` | Отказ в закрытую сторону | security, platform | решение 46, `04` | B2 |
| `features/security/untrusted-content` | Отдача недоверенного содержимого | security | `14.3`, `15`, решение 21 | B2 |
| `features/security/secrets` | Шифрование секретов и токены | security, platform | `14.3`, `20.2` (шифрование), `13` (токены) | B2 |
| `features/security/access-control` | Доступ и разделение обязанностей | security, auditor | `13`, `14.12`, `14.15`, решения 22, 26, 44 | B2 |
| `features/security/security-journal` | Журнал ИБ и SIEM | security, auditor | `14.9–14.11`, `14.13–14.14`, решение 17 | B2 |
| `features/security/vulnerability-flow` | Поток уязвимостей | security | `14.4–14.8`, `10.7`, `21`, решения 20, 25 | B2 |
| `features/security/evidence-and-scanning` | Evidence, SBOM и сканирование | security | `21.4–21.7`, `14.3` (песочница) | B2 |
| `features/security/licenses` | Политика лицензий | security, auditor | `10.8`, `21.8` | B2 |
| `features/security/ai-boundaries` | Границы AI | security | `13` (AI-контур), `14.3` | B3 |
| `features/security/compliance` | Соответствие требованиям | auditor | `14.13` (ФСТЭК № 21), решения 13, 17, 18 | B3 |
| **Управление реестром** | | | | |
| `features/registry/_index` | Управление реестром | developer, platform | `01`, `02` | B2 |
| `features/registry/hosted` | Hosted-репозитории и публикация | developer, platform | `10.1`, `09` | B2 |
| `features/registry/proxy-cache` | Proxy и кэш upstream | platform | `10.2`, `11.1`, `10.14` | B2 |
| `features/registry/formats` | Пять экосистем | developer | `13`, `09` (семантика по форматам) | B2 |
| `features/registry/teams-and-ownership` | Команды и владение | platform, security | `14.15` | B3 |
| `features/registry/search` | Поиск пакетов | developer | `10.10`, `11.4` | B3 |
| `features/registry/console` | Веб-консоль и рабочие столы ролей | developer, security | `15`, `docs/ui/screens.md` | B3 |
| `features/registry/cli` | CLI `cctl` | developer | `13`, решения 12, 39 | B3 |
| `features/registry/integrations` | API, webhooks и CI | platform, developer | `13`, `docs/api/*` | B3 |
| `features/registry/migration-from-nexus` | Миграция из Nexus | platform | `10.15`, решение 9 | B3 |
| **Развёртывание и обслуживание** | | | | |
| `features/operations/_index` | Развёртывание и обслуживание | platform | `16` | B2 |
| `features/operations/deployment-model` | Модель развёртывания | platform | `01`, `02` P1, P5, `06`, `16.1–16.3` | W2 |
| `features/operations/availability` | Доступность и деградация | platform, security | `04`, решения 46, 48 | B2 |
| `features/operations/observability` | Наблюдаемость | platform | `16.6` | B2 |
| `features/operations/backup-restore` | Резервное копирование и восстановление | platform | `16.5` | B2 |
| `features/operations/upgrades` | Обновления без простоя | platform | `16.4` | B2 |

### Развёртывание `deploy/`

| Путь | Заголовок RU | Жанр | Источники | Исп. |
| --- | --- | --- | --- | --- |
| `deploy/_index` | Развёртывание | how-to (выбор пути) | `16`, `deploy/` | W2 |
| `deploy/requirements` | Требования | reference | `16.1` (PostgreSQL), `16.3`, `.env.dist` | W2 |
| `deploy/docker-compose` | Docker Compose на одном узле | how-to | `deploy/compose/docker-compose.yaml`, `deploy/caddy/Caddyfile`, `.env.dist`, `Taskfile.yml` (`secrets:init`) | W2 |
| `deploy/s3-storage` | Хранилище S3 | how-to | `deploy/compose/docker-compose.s3.yaml`, `16.1` (S3-режим), `crates/adapters/persistence/objstore` | W2 |
| `deploy/valkey-cache` | Кэш Valkey | how-to | `deploy/compose/docker-compose.cache.yaml`, `16.1` (Valkey), `crates/adapters/persistence/valkey` | W2 |
| `deploy/kubernetes-helm` | Kubernetes и Helm | how-to | `deploy/helm/crane/*`, `16.2` | W2 |
| `deploy/tls-reverse-proxy` | TLS и обратный прокси | how-to | `deploy/caddy/Caddyfile`, `16.1` (`CRANE_TRUSTED_PROXIES`) | B2 |
| `deploy/production-checklist` | Чек-лист перед вводом в работу | reference | `16.8`, `14.3` | B2 |

### Настройка `configure/`

| Путь | Заголовок RU | Источники | Исп. |
| --- | --- | --- | --- |
| `configure/_index` | Как CRANE читает настройки | `crates/entry/server/src/config`, `20.1` | B2 |
| `configure/repositories` | Репозитории | `config/repos`, `config/proxy` | B2 |
| `configure/namespaces` | Резервирование namespace | `config/namespaces`, `10.3` | B2 |
| `configure/access-token` | Токен доступа | `config/token` | B2 |
| `configure/storage` | Хранилище blob | `config/storage` | B2 |
| `configure/cache` | Кэш | `crates/entry/server/src/cache` | B2 |
| `configure/network` | Адреса, порты и доверенные прокси | `config/network` | B2 |
| `configure/limits` | Пределы размеров | `config` | B2 |
| `configure/settings-encryption` | Ключ шифрования настроек | `CRANE_SETTINGS_KEY`, `20.2` | B2 |
| `configure/identity` | Вход через OIDC | `13` | B2 (in-development) |
| `configure/upstream-quarantine` | Карантин upstream | `21.9` | B2 (in-development, если нет в коде) |
| `configure/vulnerability-feeds` | Фиды уязвимостей | `21.9` | B2 (in-development, если нет в коде) |

### Форматы пакетов `formats/`

`_index`, `cargo`, `npm`, `pypi`, `maven`, `nuget`. Для каждого формата: подключение клиента, публикация, установка через proxy, семантика удаления и скрытия. Статус каждой страницы определяется по коду на момент написания. Исполнитель B2.

### Безопасность `security/`

| Путь | Заголовок RU | Жанр | Источники | Исп. |
| --- | --- | --- | --- | --- |
| `security/_index` | Безопасность развёртывания | explanation (границы доверия) | `14.2–14.3`, `16.1` | B2 |
| `security/hardening` | Усиление развёртывания | how-to | `deploy/compose/*` (read_only, cap_drop, сети, секреты), `16.1`, `16.8` | B2 |
| `security/security-events` | События журнала ИБ | reference | `crates/entry/server/src/main.rs` (`SECURITY_TARGETS`), `crates/adapters/external/siem`, `14.9` | B2 |
| `security/vulnerability-disclosure` | Сообщить об уязвимости | how-to | `.github/SECURITY.md` | B2 |
| `security/release-verification` | Проверка подлинности выпусков | how-to | `14.3` | B2 (in-development) |

### Справочники `reference/`

`environment-variables`, `server-cli` (роли `crane`), `ports-and-health`, `cctl` (in-development), `http-api`, `protocol-endpoints`, `errors`, `metrics`. Исполнители B2 и B3.

### Эксплуатация `operations/`

`_index`, `health-checks`, `logs`, `upgrades-and-migrations`, `outages` (поведение при отказе PostgreSQL, Valkey, S3), `backup-restore`, `troubleshooting`. Исполнитель B3.

### Глоссарий `glossary/`

Одна страница, генерируется из `data/glossary.yaml`. Исполнитель ED.

## Шорткоды и разметка

Полное поведение — `design/authoring.md`, раздел «Шорткоды и разметка». Реализует исполнитель вёрстки по спеке `design/ui-spec.md`. Технические приёмы (выноски из GitHub-alerts, чипы аудитории в атрибуте заголовка, сворачиваемые блоки, всплывающие подсказки источников, вывод `llms.txt`, Markdown-версии страниц, Pagefind) переносятся как приём, переписанный под CRANE.

## SEO и `llms`

- `title` и `description` каждой страницы самодостаточны; первые два абзаца отвечают «что и зачем».
- `<link rel="alternate" hreflang>` на пару RU/EN и `x-default`, `canonical`, `sitemap.xml` с языковыми альтернативами, `robots.txt`.
- JSON-LD: `SoftwareApplication` на главной, `TechArticle` на страницах, `BreadcrumbList`, `DefinedTermSet` на глоссарии.
- Open Graph: изображение генерируется при сборке из токенов темы, без внешних сервисов.
- `/llms.txt` по llmstxt.org: описание продукта, разделы и страницы EN с `description`, ссылка на RU-оглавление `/ru/llms.txt`.
- `/en/llms-full.txt` и `/ru/llms-full.txt`: все опубликованные страницы языка в порядке навигации, сырой markdown без раскрытия шорткодов `in-development` в пустоту (фраза выводится текстом).
- Markdown-версия каждой страницы рядом с HTML (`<страница>.md`), `<link rel="alternate" type="text/markdown">`.
- На каждой странице кнопка «Копировать как Markdown» (буфер обмена, без сети). Кнопки «Открыть в ассистенте» нет: она передавала бы данные третьим лицам.
- Страницы `in-development` индексируются Pagefind с фильтром статуса и не попадают в `sitemap.xml`.

## Технические требования к сайту

- Hugo (extended), многоязычность через `contentDir` на язык, GitHub Pages, домен getcrane.dev, без Cloudflare.
- Поиск Pagefind, индекс на язык, фильтры по разделу, аудитории и жанру.
- Тема на токенах CRANE (светлая и тёмная), WCAG 2.2 AA, `prefers-reduced-motion`, `forced-colors`.
- Сборка без внешних CDN: шрифты (OFL, с кириллицей) и Pagefind — локально. Mermaid рендерится при сборке в CI в статические SVG (светлый и тёмный), у читателя JS для диаграмм нет; локально шаг пропускается переменной окружения.
- Токены темы: в репозитории сайта лежит снимок токенов консоли с версией источника; сверку снимка с консолью выполняет CI основного репозитория CRANE.
- Бейджи состояния: `target` — «Целевое состояние» / «Design», `current` — «Текущая версия» / «Current».
- CI: проверка ссылок (внутренних и внешних), орфографии RU и EN, паритета RU/EN (пути, якоря, шорткоды, поля front matter), запрещённых слов («мы», «наш», «оператор», имена агентов), длины `description`.
