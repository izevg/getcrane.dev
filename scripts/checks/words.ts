import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page, Report } from "../lib/content.ts";
import { LANGS, ROOT, VERSION, lineOf, stripCode, walk } from "../lib/content.ts";
import { isVersionsPage } from "./versions.ts";

const L = String.raw`(?<![\p{L}\p{N}_])`;
const R = String.raw`(?![\p{L}\p{N}_])`;
const RU = new RegExp(`${L}(мы|нас|нам|нами|наш(?:а|е|и|у|ей|им|ем|его|ему|их|ими)?|я|мне|мной|оператор(?:а|у|ом|е|ы|ов|ам|ами|ах)?)${R}`, "giu");
const EN = new RegExp(`${L}(we|our|ours|ourselves|operators?)${R}`, "giu");
/** Имена агентов и инструментов разработки; список дополняется руководителем документации. */
const AGENTS = new RegExp(
  String.raw`(?<![\p{L}\p{N}_-])(Claude|Codex|Copilot|ChatGPT|Orca|techwriter|techwriting-overseer|be-lead|fe-lead|be-coder|fe-coder|team-lead|sec-lead|web-uix-lead|elegance-lead|devops-lead)(?![\p{L}\p{N}_-])`,
  "giu",
);
const TODO = /<!--\s*TODO-WRITER/;

function scan(where: string, text: string, lang: string, report: Report, line0 = 1, allowVersions = false): void {
  const rules: [RegExp, string][] = [
    [lang === "ru" ? RU : EN, "запрещённое слово"],
    [AGENTS, "имя агента или инструмента"],
  ];
  if (!allowVersions) {
    rules.splice(1, 0, [VERSION, "номер версии вида v0.x"]);
  }
  for (const [re, what] of rules) {
    for (const m of text.matchAll(re)) {
      report.error(`${where}:${line0 + lineOf(text, m.index ?? 0) - 1}`, `${what} «${m[0]}»`);
    }
  }
  if (TODO.test(text)) {
    report.error(where, "остался <!-- TODO-WRITER -->");
  }
}

export function checkWords(pages: Page[], report: Report): void {
  for (const p of pages) {
    const text = stripCode(p.body);
    scan(p.file, text, p.lang, report, p.bodyLine, isVersionsPage(p));
    for (const key of ["title", "description"]) {
      scan(`${p.file}#${key}`, String(p.front[key] ?? ""), p.lang, report, 1, isVersionsPage(p));
    }
  }
  for (const lang of LANGS) {
    const file = join(ROOT, "i18n", `${lang}.yaml`);
    const lines = readFileSync(file, "utf8").split("\n").map((l) => l.replace(/^[^:]+:\s*/, ""));
    scan(`i18n/${lang}.yaml`, lines.join("\n"), lang, report);
  }
  for (const file of walk(join(ROOT, "layouts"), ".html")) {
    const text = readFileSync(file, "utf8").replace(/\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g, "");
    if (/(?<![\p{L}])(мы|наш[а-я]*|оператор[а-я]*)(?![\p{L}])/iu.test(text.replace(/<[^>]*>|\{\{[\s\S]*?\}\}/g, " "))) {
      report.error(`layouts/${file.split("/layouts/")[1] ?? file}`, "запрещённое слово в шаблоне");
    }
  }
}
