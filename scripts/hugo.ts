// Обёртка над hugo для сборок: пропущенный ключ перевода (i18n|MISSING_TRANSLATION) ломает сборку, остальной вывод проходит как есть.
import { spawnSync } from "node:child_process";
import { ROOT } from "./lib/content.ts";

const run = spawnSync("hugo", ["--printI18nWarnings", ...process.argv.slice(2)], { cwd: ROOT, encoding: "utf8" });
process.stdout.write(run.stdout);
process.stderr.write(run.stderr);
const missing = (run.stdout + run.stderr).split("\n").filter((l) => l.includes("MISSING_TRANSLATION"));
if (missing.length > 0) {
  process.stderr.write(`hugo: нет перевода для ключей i18n (${missing.length}), добавьте их в i18n/ru.yaml и i18n/en.yaml\n`);
  process.exit(1);
}
process.exit(run.status ?? 1);
