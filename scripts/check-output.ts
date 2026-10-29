// Проверка собранного сайта (после hugo): номера версий стоят только в разрешённых элементах, устаревшей подписи бейджа нет, id на странице не повторяются.
// Каталог — SITE_DIR или public/. Запускается в CI и деплое после сборки; до сборки проверять нечего.
import { existsSync, readFileSync } from "node:fs";
import { LANGS, Report, SITE, VERSION, walk } from "./lib/content.ts";

const LEGACY_BADGE = /class="badge badge-current"[^>]*>(?:\s*<svg[\s\S]*?<\/svg>)?\s*(?:Текущая версия|Current release)/;
/** Элементы, где номер версии разрешён: селектор, чипы, баннеры, таблица версий и метки (атрибут data-ver, versions-spec ACCEPTANCE 12). */
const WHITELISTED = /<(a|span|li|table|dl|nav|section|div)\b[^>]*\bdata-ver\b[^>]*>[\s\S]*?<\/\1>/g;

const report = new Report();
if (!existsSync(SITE)) {
  report.error(SITE, "нет собранного сайта: сначала npm run build");
} else {
  for (const file of walk(SITE, ".html")) {
    const html = readFileSync(file, "utf8");
    const text = html
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/g, " ")
      .replace(WHITELISTED, " ")
      .replace(/<[^>]*>/g, " ");
    const rel = file.replace(`${SITE}/`, "");
    for (const m of text.matchAll(VERSION)) {
      report.error(rel, `номер версии «${m[0]}» вне селектора, чипов, баннеров и таблицы версий`);
    }
    const seen = new Set<string>();
    const repeated = new Set<string>();
    for (const m of html.matchAll(/<[a-zA-Z][^>]*?\sid=(?:"([^"]*)"|'([^']*)')/g)) {
      const id = m[1] ?? m[2] ?? "";
      (seen.has(id) ? repeated : seen).add(id);
    }
    if (repeated.size > 0) {
      report.error(rel, `повторяющиеся id: ${[...repeated].slice(0, 5).join(", ")}${repeated.size > 5 ? ` (всего ${repeated.size})` : ""}`);
    }
    if (LEGACY_BADGE.test(html) && LANGS.some((l) => rel.startsWith(`${l}/`))) {
      report.error(rel, "подпись бейджа состояния «Текущая версия» / «Current release» заменена на «Текущее состояние» / «Current state»");
    }
  }
}
report.finish("check-output");
