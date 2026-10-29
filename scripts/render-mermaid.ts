// Диаграммы mermaid → два статических SVG (светлый и тёмный) в assets/diagrams/<хэш>.{light,dark}.svg. SVG лежат в репозитории.
// Хэш — первые 16 знаков SHA-256 от исходника без краевых пробелов; тот же расчёт в layouts/_markup/render-codeblock-mermaid.html.
// Локальный тяжёлый шаг (Chromium): в CI рендера нет, там scripts/check-mermaid.ts проверяет готовые SVG.
// Перерисовываются только диаграммы без SVG; при смене токенов или темы (отпечаток в manifest.json) — все. Лишние SVG удаляются.
// Браузер: переменная PUPPETEER_EXECUTABLE_PATH (headless Chromium/Chrome); без неё puppeteer берёт свой кэш.
// У читателя JS для диаграмм нет.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT } from "./lib/content.ts";
import { themeConfig, type Theme } from "./lib/mermaid-theme.ts";
import { DIAGRAMS_DIR, MANIFEST, collectDiagrams, themeStamp, type Manifest } from "./lib/mermaid-sources.ts";

if (process.env.CRANE_SKIP_MERMAID) {
  process.stdout.write("mermaid: пропущено (CRANE_SKIP_MERMAID)\n");
  process.exit(0);
}

const OUT = DIAGRAMS_DIR;
const { sources, entries } = collectDiagrams();

mkdirSync(OUT, { recursive: true });
const stamp = themeStamp();
const previous: Manifest | undefined = existsSync(MANIFEST) ? (JSON.parse(readFileSync(MANIFEST, "utf8")) as Manifest) : undefined;
const fresh = previous?.theme === stamp;

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
    process.stdout.write(`mermaid: ${hash} (${theme}) ${entries.get(hash)?.pages[0] ?? ""}\n`);
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
for (const name of readdirSync(OUT)) {
  const hash = /^([0-9a-f]+)\.(?:light|dark)\.svg$/.exec(name)?.[1];
  if (hash && !sources.has(hash)) {
    rmSync(join(OUT, name));
  }
}
const manifest: Manifest = { theme: stamp, diagrams: Object.fromEntries([...entries].sort(([x], [y]) => x.localeCompare(y))) };
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
rmSync(work, { recursive: true, force: true });
process.stdout.write(`mermaid: диаграмм ${sources.size}, SVG и manifest.json в assets/diagrams\n`);
