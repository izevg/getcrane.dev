import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page, Report } from "../lib/content.ts";
import { LANGS, ROOT, readYaml, walk } from "../lib/content.ts";

interface VersionEntry {
  id?: unknown;
  status?: unknown;
  path?: unknown;
  label?: unknown;
  labelKey?: unknown;
  date?: unknown;
}
const STATUSES = ["current", "next", "previous"];
const KEYS = ["since", "until", "changed"] as const;
/** Номер вида v0.x вне белого списка; тот же шаблон, что в checks/words.ts. */
const VERSION = /(?<![\p{L}\p{N}_/.:-])v0\.\d+(?:\.\d+)?(?![\p{L}\p{N}_])/gu;
const LEGACY_BADGE = /class="badge badge-current"[^>]*>(?:\s*<svg[\s\S]*?<\/svg>)?\s*(?:Текущая версия|Current release)/;
/** Элементы, где номер версии разрешён: селектор, чипы, баннеры, таблица версий и метки (атрибут data-ver, versions-spec ACCEPTANCE 12). */
const WHITELISTED = /<(a|span|li|table|dl|nav|section|div)\b[^>]*\bdata-ver\b[^>]*>[\s\S]*?<\/\1>/g;

/** data/versions.yaml: схема записей; front matter since/until/changed: паритет RU/EN (остальные проверки делает сборка Hugo). */
export function checkVersions(pages: Page[], report: Report): void {
  const raw = readYaml<unknown>(join(ROOT, "data", "versions.yaml"));
  const list = (Array.isArray(raw) ? raw : []) as VersionEntry[];
  const ids = new Set<string>();
  if (!list.length) {
    report.error("data/versions.yaml", "нет ни одной версии");
  }
  list.forEach((v, i) => {
    const where = `data/versions.yaml[${i}]`;
    if (!v.id || !v.status || !v.path || !(v.label || v.labelKey)) {
      report.error(where, "нужны id, status, path и label или labelKey");
    }
    if (!STATUSES.includes(String(v.status))) {
      report.error(where, `status должен быть одним из ${STATUSES.join(", ")}`);
    }
    if (!/^\/(?:.*\/)?$/.test(String(v.path))) {
      report.error(where, "path начинается и заканчивается косой чертой");
    }
    if (ids.has(String(v.id))) {
      report.error(where, `повторяется id ${String(v.id)}`);
    }
    ids.add(String(v.id));
  });
  if (list.filter((v) => v.status === "current").length !== 1) {
    report.error("data/versions.yaml", "нужна ровно одна запись со статусом current");
  }
  const byRel = new Map<string, Page>();
  for (const p of pages) {
    byRel.set(`${p.lang}:${p.rel}`, p);
  }
  for (const p of pages) {
    if (p.lang !== "en") {
      continue;
    }
    const twin = byRel.get(`ru:${p.rel}`);
    for (const key of KEYS) {
      if (twin && JSON.stringify(p.front[key] ?? null) !== JSON.stringify(twin.front[key] ?? null)) {
        report.error(p.file, `${key} различается у RU и EN (${twin.file})`);
      }
    }
  }
}

/** Страницы без номеров версий по правилу владельца; белый список — страницы versions и roadmap (layout: versions, layout: roadmap). */
export function isVersionsPage(p: Page): boolean {
  return p.front.layout === "versions" || p.front.layout === "roadmap";
}

/** Собранный сайт: номера версий и устаревшая подпись бейджа только там, где разрешено. Каталог — аргумент --public. */
export function checkVersionsOutput(dir: string, report: Report): void {
  if (!existsSync(dir)) {
    report.error(dir, "нет собранного сайта для проверки номеров версий");
    return;
  }
  for (const file of walk(dir, ".html")) {
    const html = readFileSync(file, "utf8");
    const text = html
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/g, " ")
      .replace(WHITELISTED, " ")
      .replace(/<[^>]*>/g, " ");
    const rel = file.replace(`${dir}/`, "");
    for (const m of text.matchAll(VERSION)) {
      report.error(rel, `номер версии «${m[0]}» вне селектора, чипов, баннеров и таблицы версий`);
    }
    if (LEGACY_BADGE.test(html) && LANGS.some((l) => rel.startsWith(`${l}/`))) {
      report.error(rel, "подпись бейджа состояния «Текущая версия» / «Current release» заменена на «Текущее состояние» / «Current state»");
    }
  }
}
