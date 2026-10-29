import { roadmapAnchors } from "../../tools/check-roadmap.ts";
import type { Page } from "../lib/content.ts";
import { lineOf, stripCode, type Report } from "../lib/content.ts";

const SHORTCODE = /\{\{[<%]\s*(\/?)([a-z-]+)((?:\s+(?:"[^"]*"|[\w-]+="[^"]*"))*)\s*[>%]\}\}/g;
const EXPLICIT_ANCHOR = /^(#{2,3})\s+.*\{#([a-z0-9][a-z0-9-]*)(?:\s[^}]*)?\}\s*$/;
const HEADING = /^(#{2,3})\s+(.*)$/;

function shortcodes(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(SHORTCODE)) {
    if (m[1] === "/") {
      continue;
    }
    const first = /"([^"]*)"/.exec(m[3] ?? "")?.[1] ?? "";
    out.push(`${m[2]}:${m[2] === "term" || m[2] === "xref" || m[2] === "cite" || m[2] === "env" || m[2] === "tab" ? first : ""}`);
  }
  return out.sort();
}

export function anchors(page: Page, report?: Report): string[] {
  const out: string[] = [];
  const lines = stripCode(page.body).split("\n");
  lines.forEach((line, i) => {
    const h = HEADING.exec(line);
    if (!h) {
      return;
    }
    const a = EXPLICIT_ANCHOR.exec(line);
    if (a?.[2]) {
      out.push(a[2]);
    } else {
      report?.error(`${page.file}:${page.bodyLine + i}`, "у заголовка h2/h3 нет явного якоря {#id}");
    }
  });
  return out;
}

const FIELDS = ["audience", "genre", "state", "status", "weight", "terms"] as const;

export function checkParity(pages: Page[], report: Report): void {
  const by = (lang: string) => new Map(pages.filter((p) => p.lang === lang).map((p) => [p.rel, p]));
  const en = by("en");
  const ru = by("ru");
  for (const [rel, p] of en) {
    if (!ru.has(rel)) {
      report.error(p.file, `нет RU-пары content/ru/${rel}.md`);
    }
  }
  for (const [rel, p] of ru) {
    if (!en.has(rel)) {
      report.error(p.file, `нет EN-пары content/en/${rel}.md`);
    }
  }
  for (const [rel, a] of en) {
    const b = ru.get(rel);
    if (!b) {
      continue;
    }
    for (const f of FIELDS) {
      if (JSON.stringify(a.front[f] ?? null) !== JSON.stringify(b.front[f] ?? null)) {
        report.error(a.file, `поле ${f} отличается от ${b.file}`);
      }
    }
    if (a.front.layout !== b.front.layout) {
      report.error(a.file, `поле layout отличается от ${b.file}`);
    }
    const aa = anchors(a, report).sort();
    const ba = anchors(b, report).sort();
    if (JSON.stringify(aa) !== JSON.stringify(ba)) {
      report.error(a.file, `якоря {#…} отличаются от ${b.file}: EN [${aa.join(", ")}] и RU [${ba.join(", ")}]`);
    }
    const sa = shortcodes(a.body);
    const sb = shortcodes(b.body);
    if (JSON.stringify(sa) !== JSON.stringify(sb)) {
      report.error(a.file, `набор шорткодов отличается от ${b.file}`);
    }
  }
}

export function checkXrefs(pages: Page[], report: Report): void {
  const index = new Map(pages.map((p) => [`${p.lang}:${p.rel}`, p]));
  // У страницы дорожной карты якоря версий строит шаблон из data/roadmap.yaml, в тексте заголовков нет.
  const anchorsOf = new Map(pages.map((p) => [`${p.lang}:${p.rel}`, new Set(p.front.layout === "roadmap" ? roadmapAnchors() : anchors(p))]));
  for (const p of pages) {
    const body = stripCode(p.body);
    for (const m of body.matchAll(/\{\{<\s*xref\s+"([^"#]+)(?:#([^"]+))?"/g)) {
      const path = (m[1] ?? "").replace(/^\/|\/$/g, "");
      const target = index.get(`${p.lang}:${path}`) ?? index.get(`${p.lang}:${path}/_index`);
      const where = `${p.file}:${p.bodyLine + lineOf(body, m.index ?? 0) - 1}`;
      if (!target) {
        report.error(where, `xref: страница ${path} не найдена`);
      } else if (m[2] && !anchorsOf.get(`${target.lang}:${target.rel}`)?.has(m[2])) {
        report.error(where, `xref: в ${target.file} нет якоря #${m[2]}`);
      }
    }
  }
}
