// Проверка готовых диаграмм для CI: рендера и Chromium нет. Для каждого исходника ```mermaid в content/ есть пара SVG
// (assets/diagrams/<хэш>.{light,dark}.svg), манифест перечисляет ровно эти диаграммы, а его отпечаток темы совпадает с текущими токенами
// и scripts/lib/mermaid-theme.ts. Любое расхождение — падение с командой, которую нужно выполнить локально: npm run mermaid.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DIAGRAMS_DIR, MANIFEST, collectDiagrams, themeStamp, type Manifest } from "./lib/mermaid-sources.ts";

const { sources, entries } = collectDiagrams();
const errors: string[] = [];
const where = (hash: string): string => entries.get(hash)?.pages[0] ?? hash;

for (const hash of sources.keys()) {
  for (const theme of ["light", "dark"]) {
    if (!existsSync(join(DIAGRAMS_DIR, `${hash}.${theme}.svg`))) {
      errors.push(`нет ${hash}.${theme}.svg для диаграммы ${where(hash)} (исходник изменён или добавлен)`);
    }
  }
}
for (const name of existsSync(DIAGRAMS_DIR) ? readdirSync(DIAGRAMS_DIR) : []) {
  const hash = /^([0-9a-f]+)\.(?:light|dark)\.svg$/.exec(name)?.[1];
  if (hash && !sources.has(hash)) {
    errors.push(`лишний файл ${name}: такой диаграммы в content/ больше нет`);
  }
}
if (!existsSync(MANIFEST)) {
  errors.push("нет assets/diagrams/manifest.json");
} else {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as Manifest;
  if (manifest.theme !== themeStamp()) {
    errors.push("отпечаток темы в manifest.json устарел: токены консоли или scripts/lib/mermaid-theme.ts изменились после рендера");
  }
  const listed = Object.keys(manifest.diagrams).sort().join(",");
  const actual = [...sources.keys()].sort().join(",");
  if (listed !== actual) {
    errors.push("список диаграмм в manifest.json не совпадает с исходниками в content/");
  }
}
if (errors.length > 0) {
  for (const e of errors) {
    process.stderr.write(`mermaid:check: ${e}\n`);
  }
  process.stderr.write("mermaid:check: выполните локально `npm run mermaid` (нужен Chromium) и закоммитьте assets/diagrams.\n");
  process.exit(1);
}
process.stdout.write(`mermaid:check: диаграмм ${sources.size}, SVG и манифест актуальны\n`);
