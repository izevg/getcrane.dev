// Диаграммы mermaid → два статических SVG (светлый и тёмный) в assets/diagrams/<хэш>.{light,dark}.svg.
// Хэш — первые 16 знаков SHA-256 от исходника без краевых пробелов; тот же расчёт в layouts/_markup/render-codeblock-mermaid.html.
// Локально шаг пропускается: CRANE_SKIP_MERMAID=1. У читателя JS для диаграмм нет.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT, loadPages } from "./lib/content.ts";
import { themeConfig, type Theme } from "./lib/mermaid-theme.ts";

if (process.env.CRANE_SKIP_MERMAID) {
  process.stdout.write("mermaid: пропущено (CRANE_SKIP_MERMAID)\n");
  process.exit(0);
}

const OUT = join(ROOT, "assets", "diagrams");
const STAMP = join(OUT, ".stamp");
const FENCE = /^([ \t]*)(`{3,})mermaid[^\n]*\n([\s\S]*?)^\1\2[ \t]*$/gm;

function dedent(code: string, indent: string): string {
  return code
    .split("\n")
    .map((l) => (l.startsWith(indent) ? l.slice(indent.length) : l))
    .join("\n");
}

const sources = new Map<string, string>();
for (const p of loadPages()) {
  for (const m of p.body.matchAll(FENCE)) {
    const code = dedent(m[3] ?? "", m[1] ?? "").trim();
    sources.set(createHash("sha256").update(code).digest("hex").slice(0, 16), code);
  }
}

mkdirSync(OUT, { recursive: true });
const tokensFile = readFileSync(join(ROOT, "assets", "css", "tokens", "console.css"), "utf8");
const stamp = createHash("sha256").update(tokensFile).update(readFileSync(join(ROOT, "scripts", "lib", "mermaid-theme.ts"))).digest("hex");
const fresh = existsSync(STAMP) && readFileSync(STAMP, "utf8") === stamp;

const work = mkdtempSync(join(tmpdir(), "crane-mermaid-"));
const fonts = ["onest-latin-wght-normal", "onest-cyrillic-wght-normal"]
  .map((f) => `@font-face{font-family:"Onest Variable";font-weight:100 900;src:url("file://${join(ROOT, "static", "fonts", `${f}.woff2`)}") format("woff2-variations");}`)
  .join("\n");
writeFileSync(join(work, "fonts.css"), fonts);

/** Мермейд кладёт в корень role и aria-*: роль и подпись выставляет обёртка figure в шаблоне Hugo. */
function normalize(svg: string): string {
  return svg
    .replace(/<svg\b[^>]*>/, (tag) => tag.replace(/\s(?:role|aria-roledescription|aria-labelledby|aria-describedby)="[^"]*"/g, ""))
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>|<desc\b[^>]*>[\s\S]*?<\/desc>/g, "");
}

let failed = 0;
for (const [hash, code] of sources) {
  for (const theme of ["light", "dark"] as Theme[]) {
    const out = join(OUT, `${hash}.${theme}.svg`);
    if (fresh && existsSync(out)) {
      continue;
    }
    const input = join(work, `${hash}.mmd`);
    const config = join(work, `${theme}.json`);
    const raw = join(work, `${hash}.${theme}.svg`);
    writeFileSync(input, code);
    writeFileSync(config, JSON.stringify(themeConfig(theme)));
    const run = spawnSync(
      "npx",
      ["--no-install", "mmdc", "-i", input, "-o", raw, "-c", config, "-p", join(ROOT, "scripts", "puppeteer.json"), "-C", join(work, "fonts.css"), "-b", "transparent", "-I", `dg-${hash}-${theme}`, "-q"],
      { cwd: ROOT, stdio: "inherit" },
    );
    if (run.status !== 0 || !existsSync(raw)) {
      process.stderr.write(`mermaid: не удалось отрисовать ${hash} (${theme})\n`);
      failed += 1;
      continue;
    }
    writeFileSync(out, normalize(readFileSync(raw, "utf8")));
  }
}
if (failed) {
  process.exit(1);
}
writeFileSync(STAMP, stamp);
process.stdout.write(`mermaid: диаграмм ${sources.size}, SVG в assets/diagrams\n`);
