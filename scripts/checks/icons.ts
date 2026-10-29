import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Report } from "../lib/content.ts";
import { ROOT, walk } from "../lib/content.ts";
import { readManifest } from "../sync-icons.ts";

/**
 * Иконки в островах TypeScript: имя из icon("…") должно быть в assets/icons/manifest.json, иначе в спрайте нет символа и иконка пуста.
 * Иконки шаблонов Hugo проверяет сама сборка (ui/icon.html ломается на неизвестном имени), сверку файлов с манифестом делает icons:check.
 */
export function checkIcons(report: Report): void {
  const have = new Set(readManifest().icons);
  for (const file of walk(join(ROOT, "assets", "ts"), ".ts")) {
    for (const m of readFileSync(file, "utf8").matchAll(/\bicon\(\s*"([a-z0-9-]+)"/g)) {
      if (!have.has(m[1] ?? "")) {
        report.error(file.replace(`${ROOT}/`, ""), `иконка «${m[1]}» не найдена в assets/icons/manifest.json`);
      }
    }
  }
}
