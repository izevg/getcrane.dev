// Проверка дорожной карты: data/roadmap.yaml (версии, функции, тексты ru/en, ссылки на страницы) и front matter planned у страниц.
// Подключена в scripts/check-content.ts (npm run check:content) и запускается отдельно: npm run check:roadmap.
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "../scripts/lib/content.ts";
import { LANGS, ROOT, Report, loadPages, readYaml } from "../scripts/lib/content.ts";

const TOPICS = ["security", "formats", "console", "operations", "access", "integrations"];
const STATUSES = ["shipped", "current", "planned"];
const VERSION_ID = /^\d+\.\d+$/;
const FEATURE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ROADMAP_PAGE = "project/roadmap";
const L = String.raw`(?<![\p{L}\p{N}_])`;
const R = String.raw`(?![\p{L}\p{N}_])`;
/** Запрещено в публичных текстах дорожной карты: даты, сроки, внутренние ссылки и единицы оценки. */
const FORBIDDEN: [RegExp, string][] = [
  [new RegExp(`${L}(?:19|20)\\d{2}${R}`, "u"), "год (ГГГГ)"],
  [new RegExp(`${L}(?:январ|феврал|апрел|июн|июл|август|сентябр|октябр|ноябр|декабр)\\p{L}*`, "iu"), "название месяца"],
  [new RegExp(`${L}(?:март(?:а|е|у|ом)?|мая|май|мае|маю|маем)${R}`, "iu"), "название месяца"],
  [new RegExp(`${L}(?:january|february|march|april|june|july|august|september|october|november|december)${R}`, "iu"), "название месяца"],
  [new RegExp(`${L}may\\s+\\d|\\d\\s+may${R}`, "iu"), "название месяца"],
  [new RegExp(`${L}(?:квартал\\p{L}*|quarter)${R}|${L}Q[1-4]${R}`, "iu"), "квартал"],
  [new RegExp(`${L}PRs?${R}`, "u"), "упоминание PR"],
  [/#\d+/u, "номер вида #123"],
  [new RegExp(`${L}агент-?\\s?ч\\p{L}*|${L}agent[- ]hours?${R}`, "iu"), "оценка в агент-часах"],
];

type Text = Record<string, unknown> | undefined;
interface Feature {
  id?: unknown;
  topic?: unknown;
  status?: unknown;
  href?: unknown;
  ru?: Text;
  en?: Text;
}
interface Version {
  id?: unknown;
  title?: Text;
  status?: unknown;
  features?: unknown;
}
interface Roadmap {
  versions?: unknown;
  directions?: unknown;
}

/** Якорь версии на странице дорожной карты: 0.5 → v0-5 (тот же расчёт в layouts/_partials/util/roadmap.html). */
export function versionAnchor(id: string): string {
  return `v${id.replaceAll(".", "-")}`;
}

/** Якоря страницы дорожной карты по data/roadmap.yaml: заголовков h2 {#id} в её тексте нет. */
export function roadmapAnchors(): string[] {
  const versions = readRoadmap().versions;
  return (Array.isArray(versions) ? (versions as Version[]) : []).map((v) => versionAnchor(String(v.id))).concat("directions");
}

function readRoadmap(): Roadmap {
  return readYaml<Roadmap>(join(ROOT, "data", "roadmap.yaml"));
}

const compare = (a: string, b: string): number => {
  const [am = 0, an = 0] = a.split(".").map(Number);
  const [bm = 0, bn = 0] = b.split(".").map(Number);
  return am - bm || an - bn;
};

function pageExists(lang: string, href: string): boolean {
  const base = join(ROOT, "content", lang, href);
  return existsSync(`${base}.md`) || existsSync(join(base, "_index.md"));
}

function checkText(where: string, text: unknown, report: Report): void {
  if (typeof text !== "string" || !text.trim()) {
    report.error(where, "текст не заполнен");
    return;
  }
  for (const [re, what] of FORBIDDEN) {
    const m = re.exec(text);
    if (m) {
      report.error(where, `${what} «${m[0]}» в тексте дорожной карты`);
    }
  }
}

function checkFeature(f: Feature, where: string, ids: Set<string>, versionStatus: string | undefined, report: Report): void {
  const id = typeof f.id === "string" ? f.id : "";
  if (!FEATURE_ID.test(id)) {
    report.error(where, `id функции «${String(f.id)}» не в kebab-case`);
  } else if (ids.has(id)) {
    report.error(where, `повторяется id функции ${id}`);
  }
  ids.add(id);
  const at = `${where} (${id || "?"})`;
  if (!TOPICS.includes(String(f.topic))) {
    report.error(at, `topic «${String(f.topic)}» не из ${TOPICS.join(", ")}`);
  }
  if (f.status !== undefined && !STATUSES.includes(String(f.status))) {
    report.error(at, `status «${String(f.status)}» не из ${STATUSES.join(", ")}`);
  }
  if (versionStatus === "shipped" && f.status !== undefined && f.status !== "shipped") {
    report.error(at, "в выпущенной версии функция не может быть невыпущенной");
  }
  if (versionStatus === "planned" && (f.status === "shipped" || f.status === "current")) {
    report.error(at, "в запланированной версии функция не может быть выпущенной или текущей");
  }
  if (typeof f.href !== "string" || !f.href || f.href.startsWith("/") || f.href.includes("#")) {
    report.error(at, "href — путь страницы от корня языка без начальной косой черты и якоря");
  } else {
    for (const lang of LANGS) {
      if (!pageExists(lang, f.href)) {
        report.error(at, `href «${f.href}»: нет страницы в content/${lang}`);
      }
    }
  }
  for (const lang of LANGS) {
    const t = f[lang];
    checkText(`${at}.${lang}.title`, t?.title, report);
    checkText(`${at}.${lang}.benefit`, t?.benefit, report);
  }
}

/** data/roadmap.yaml целиком. */
export function checkRoadmapData(report: Report): void {
  const file = "data/roadmap.yaml";
  const data = readRoadmap();
  const versions = Array.isArray(data.versions) ? (data.versions as Version[]) : [];
  if (!versions.length) {
    report.error(file, "нет ни одной версии (versions)");
  }
  const ids = new Set<string>();
  const featureIds = new Set<string>();
  const seen = new Set<string>();
  let previous: string | undefined;
  let rank = 0;
  versions.forEach((v, i) => {
    const where = `${file}: versions[${i}]`;
    const id = typeof v.id === "string" ? v.id : "";
    if (!VERSION_ID.test(id)) {
      report.error(where, `id версии «${String(v.id)}» должен быть строкой вида "0.5"`);
      return;
    }
    if (seen.has(id)) {
      report.error(where, `повторяется id версии ${id}`);
    }
    seen.add(id);
    if (previous !== undefined && compare(previous, id) >= 0) {
      report.error(where, `версия ${id} стоит после ${previous}: порядок должен возрастать`);
    }
    previous = id;
    if (!STATUSES.includes(String(v.status))) {
      report.error(where, `status «${String(v.status)}» не из ${STATUSES.join(", ")}`);
    }
    const order = STATUSES.indexOf(String(v.status));
    if (order < rank) {
      report.error(where, "порядок статусов: сначала shipped, затем current, затем planned");
    }
    rank = Math.max(rank, order);
    for (const lang of LANGS) {
      checkText(`${where}.title.${lang}`, v.title?.[lang], report);
    }
    if (!Array.isArray(v.features) || !v.features.length) {
      report.error(where, "у версии нет функций (features)");
      return;
    }
    for (const f of v.features as Feature[]) {
      checkFeature(f, `${file}: версия ${id}`, featureIds, String(v.status), report);
    }
    ids.add(id);
  });
  if (versions.filter((v) => v.status === "current").length > 1) {
    report.error(file, "текущая версия (current) может быть только одна");
  }
  const directions = Array.isArray(data.directions) ? (data.directions as Feature[]) : [];
  for (const d of directions) {
    checkFeature(d, `${file}: направление`, featureIds, undefined, report);
  }
}

/** Страницы: planned только при status: in-development, значение — версия из дорожной карты, не выпущенная; у RU и EN одинаково. Сами страницы дорожной карты. */
export function checkPlanned(pages: Page[], report: Report): void {
  const status = new Map<string, string>();
  for (const v of Array.isArray(readRoadmap().versions) ? (readRoadmap().versions as Version[]) : []) {
    status.set(String(v.id), String(v.status));
  }
  const byRel = new Map(pages.map((p) => [`${p.lang}:${p.rel}`, p]));
  for (const p of pages) {
    const planned = p.front.planned;
    if (planned === undefined) {
      continue;
    }
    if (typeof planned !== "string") {
      report.error(p.file, 'planned должен быть строкой в кавычках, например "0.5"');
    } else if (!status.has(planned)) {
      report.error(p.file, `planned «${planned}» не найден в data/roadmap.yaml`);
    } else if (status.get(planned) === "shipped") {
      report.error(p.file, `planned «${planned}»: версия уже выпущена`);
    }
    if (p.front.status !== "in-development") {
      report.error(p.file, "planned допустим только при status: in-development");
    }
    const twin = byRel.get(`${p.lang === "en" ? "ru" : "en"}:${p.rel}`);
    if (twin && JSON.stringify(twin.front.planned ?? null) !== JSON.stringify(planned)) {
      report.error(p.file, `planned различается у RU и EN (${twin.file})`);
    }
  }
  for (const lang of LANGS) {
    const page = byRel.get(`${lang}:${ROADMAP_PAGE}`);
    if (!page || page.front.layout !== "roadmap") {
      report.error(`content/${lang}/${ROADMAP_PAGE}.md`, "нет страницы дорожной карты с layout: roadmap");
    }
  }
}

export function checkRoadmap(pages: Page[], report: Report): void {
  checkRoadmapData(report);
  checkPlanned(pages, report);
}

if (import.meta.main) {
  const report = new Report();
  checkRoadmap(loadPages(), report);
  report.finish("check-roadmap");
}
