// Снимок токенов веб-консоли CRANE: assets/css/tokens/console.css.
//   node scripts/sync-tokens.ts [--source <tokens.css>]   записать снимок
//   node scripts/sync-tokens.ts --check [--source …]      сверить (для CI основного репозитория CRANE)
// Источник по умолчанию: ../CRANE/web/src/shared/styles/tokens.css или $CRANE_TOKENS_SOURCE.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ROOT } from "./lib/content.ts";

const OUT = join(ROOT, "assets", "css", "tokens", "console.css");
const args = process.argv.slice(2);
const check = args.includes("--check");
const srcArg = args.indexOf("--source");
const source = resolve(srcArg >= 0 ? (args[srcArg + 1] ?? "") : (process.env.CRANE_TOKENS_SOURCE ?? join(ROOT, "..", "CRANE", "web", "src", "shared", "styles", "tokens.css")));

function indent(text: string, n: number): string {
  return text
    .split("\n")
    .map((l) => (l.trim() ? " ".repeat(n) + l : l))
    .join("\n");
}

export function render(css: string, commit: string): string {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  const dark = /(:root\[data-theme="dark"\] \{)([\s\S]*)\}\s*$/.exec(src);
  if (!dark || dark.index === undefined) {
    throw new Error("в источнике нет блока :root[data-theme=\"dark\"]");
  }
  const darkBody = dark[2] ?? "";
  const light = src.slice(0, dark.index).trimEnd() + "\n";
  return `/*
 * Снимок семантических токенов веб-консоли CRANE.
 * Источник: web/src/shared/styles/tokens.css, коммит CRANE ${commit}.
 * Файл генерируется скриптом scripts/sync-tokens.ts и руками не правится.
 * Сверку со свежей консолью выполняет CI основного репозитория: npm run tokens:check.
 * Без JS и без data-theme тёмная палитра включается по prefers-color-scheme.
 */
@layer semantic {
${indent(light, 2)}
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {${indent(darkBody.trimEnd() + "\n", 4).trimEnd()}
    }
  }

  :root[data-theme="dark"] {${indent(darkBody.trimEnd() + "\n", 2).trimEnd()}
  }
}
`;
}

/** Строка с коммитом не участвует в сверке: сверяются значения токенов. */
const body = (text: string): string => text.replace(/коммит CRANE [0-9a-f]+/, "коммит CRANE <sha>");

if (!existsSync(source)) {
  process.stderr.write(`tokens: нет файла источника ${source}\n`);
  process.exit(1);
}
const commit = execFileSync("git", ["-C", dirname(source), "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
const next = render(readFileSync(source, "utf8"), commit);
if (check) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (body(current) !== body(next)) {
    process.stderr.write("tokens: снимок расходится с консолью; выполните npm run tokens:sync в репозитории сайта\n");
    process.exit(1);
  }
  process.stdout.write("tokens: снимок совпадает с консолью\n");
} else {
  writeFileSync(OUT, next);
  process.stdout.write(`tokens: записан ${OUT} (коммит CRANE ${commit})\n`);
}
