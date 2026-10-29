# getcrane.dev

Исходники публичного сайта и документации CRANE (Hugo, GitHub Pages, RU и EN).

Site and documentation sources for CRANE (Hugo, GitHub Pages, RU and EN).

## Для разработчиков

Контракт разметки — `design/authoring.md`, информационная архитектура — `design/ia.md`, спецификация интерфейса — `design/ui-spec.md`. Тексты (`content/`, `data/glossary.yaml`, `data/sources.yaml`, `data/env.yaml`, `data/home.yaml`) ведут писатели и руководитель документации; тема и механика — файлы ниже.

### Требования

- Hugo extended, версия из поля `hugo` в `package.json` (0.157.0).
- Node.js 24 (`.node-version`). Скрипты написаны на TypeScript и запускаются Node напрямую (`node scripts/<файл>.ts`, только стираемый синтаксис).
- Для локального рендера диаграмм (`npm run mermaid`): Chromium (его ставит `@mermaid-js/mermaid-cli`, либо `PUPPETEER_EXECUTABLE_PATH`). В CI рендера и Chromium нет: SVG лежат в репозитории, `npm run mermaid:check` проверяет их актуальность.

### Сборка и запуск

CI ставит зависимости только через `npm ci` и падает с пояснением, пока `package-lock.json` не закоммичен.

```bash
npm install            # первый раз (создаёт package-lock.json, его нужно закоммитить); дальше npm ci. Зависимости: pagefind, mermaid-cli, cspell, typescript, yaml
npm run build:local    # локальная сборка без mermaid и в режиме development: public/ + индекс поиска
npm run hugo:dev       # сервер Hugo с перезагрузкой (поиск работает после npm run pagefind)
npm run build          # сборка как в CI, без рендера диаграмм: hugo --minify → pagefind → postbuild
npm run mermaid        # локально (Chromium): перерисовать SVG диаграмм в assets/diagrams и закоммитить
npm run build:full     # mermaid + build
```

Локальные режимы:

- `CRANE_SKIP_MERMAID=1` пропускает рендер диаграмм. В режиме `HUGO_ENV=development` вместо картинки выводится исходник диаграммы; в production отсутствие SVG ломает сборку.
- `hugo server` хранит накопленные подсказки страницы между пересборками (`Page.Scratch`); если подсказки выглядят устаревшими, перезапустите сервер.
- Индекс поиска строится по готовому `public/`: после `hugo` выполните `npm run pagefind`.

### Проверки

| Команда | Что проверяет |
| --- | --- |
| `npm run mermaid:check` | для каждого ```mermaid есть свежая пара SVG и манифест (без рендера, для CI) |
| `npm run icons:check` | файлы иконок Lucide совпадают с `assets/icons/manifest.json` |
| `npm run typecheck` | TypeScript скриптов и островов JS (`strict`) |
| `npm run check:content` | паритет RU/EN (пути, якоря `{#…}`, шорткоды, поля front matter), допустимые значения полей, `title` до 60 и `description` до 160 знаков, запрещённые слова, голые URL, существование страниц и якорей `xref`, каталоги `i18n` |
| `npm run check:spell` | орфография RU и EN (cspell, MIT; словарь русского `@cspell/dict-ru_ru`), исключения — термины из `data/glossary.yaml` и `scripts/spell-extra.txt` |
| `npm run check:links` | внутренние ссылки и якоря собранного `public/`, без сети |
| `npm run check:external` | внешние ссылки (запускается по расписанию отдельным workflow) |
| `npm run tokens:check` | совпадение снимка токенов с консолью CRANE (запускает CI основного репозитория) |

Сборка Hugo сама ломается на неизвестном типе выноски, аудитории, жанре, термине, источнике, переменной окружения или пути `xref`, на `in-development` вместе с `state: target` и на голом внешнем URL.

### Устройство

- `hugo.yaml` — языки, выходные форматы (HTML, Markdown-версия страницы, `llms.txt`, `llms-full.txt`), Goldmark, Chroma с классами. Корень `/` — отдельный EN-лендинг (формат `RootHTML`), редиректа нет.
- `layouts/` — шаблоны. `_markup/` — render-хуки (выноски, заголовки, код, mermaid, ссылки, картинки, таблицы), `_shortcodes/` — `term`, `xref`, `cite`, `env`, `env-table`, `in-development`, `screenshot`, `threat` (+ `threat-what`, `threat-answer`), `cards`, `tabs`/`tab`, `_partials/` — части страницы.
- `assets/css/` — слои токенов primitive → semantic → component. `tokens/console.css` — снимок токенов консоли, генерируется `scripts/sync-tokens.ts`, руками не правится.
- `assets/ts/` — острова JS: `chrome` (тема, меню, язык, поиск), `article` (копирование, регионы прокрутки, оглавление), `tips` (подсказки term/xref/cite/env), `tabs`. Собираются `js.Build` внутри Hugo, без npm-зависимостей.
- `data/home.yaml` — тексты главной (заполняет руководитель документации), `data/screenshot-variants.yaml` — размеры вариантов снимков.
- `static/fonts/` — Onest и JetBrains Mono (SIL OFL 1.1) с текстами лицензий.
- `scripts/` — сборка и проверки (Node 24, TypeScript).
- `.github/workflows/` — `ci.yml` (PR), `deploy.yml` (GitHub Pages), `external-links.yml` (расписание). Действия закреплены по SHA.

### Снимки экрана

Файлы кладутся в `assets/screenshots/<story>/<variant>.light.webp` и `.dark.webp`. Пока файлов нет, шорткод `screenshot` выводит плейсхолдер; параметр `params.screenshotsRequired: true` в `hugo.yaml` делает отсутствие файла ошибкой сборки.

### Токены темы

```bash
node scripts/sync-tokens.ts --source ../CRANE/web/src/shared/styles/tokens.css   # обновить снимок
node scripts/sync-tokens.ts --check --source <путь к tokens.css консоли>          # сверить
```

В заголовке снимка записан коммит CRANE, с которого он снят.

### Иконки

Иконки — Lucide (`lucide-static` 1.62.0, ISC; часть — MIT от Feather). Дословные SVG лежат в `assets/icons/svg`, список, версия и `integrity` архива — в `assets/icons/manifest.json`, лицензия — `assets/icons/LICENSE` (публикуется как `/licenses/lucide.txt`, ссылка в подвале). Hugo собирает из них спрайт с отпечатком (`ui/sprite-url.html`). Смысловые имена (`note`, `developer`, …) раскрывает `data/icons.yaml`. Добавить иконку: имя в `manifest.json`, затем `npm pack lucide-static@1.62.0` во временную папку вне репозитория, распаковать `package/icons`, `LICENSE`, `package.json` и выполнить `node scripts/sync-icons.ts --source <папка>/package`.
