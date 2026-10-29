import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Report } from "../lib/content.ts";
import { ROOT, readYaml, walk } from "../lib/content.ts";

const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? "").sort();

/** Каталоги en/ru: одинаковые ключи и плейсхолдеры; ключи, использованные в шаблонах литералом, существуют. */
export function checkI18n(report: Report): void {
  const en = readYaml<Record<string, string>>(join(ROOT, "i18n", "en.yaml"));
  const ru = readYaml<Record<string, string>>(join(ROOT, "i18n", "ru.yaml"));
  for (const key of new Set([...Object.keys(en), ...Object.keys(ru)])) {
    if (!(key in en) || !(key in ru)) {
      report.error("i18n", `ключ ${key} есть не в обоих языках`);
      continue;
    }
    if (JSON.stringify(placeholders(String(en[key]))) !== JSON.stringify(placeholders(String(ru[key])))) {
      report.error("i18n", `плейсхолдеры ключа ${key} различаются`);
    }
  }
  for (const file of [...walk(join(ROOT, "layouts"), ".html"), ...walk(join(ROOT, "assets", "ts"), ".ts")]) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/(?:i18n\s+|"k"\s+|\bt\()"([a-z0-9.-]+)"/g)) {
      const key = m[1] ?? "";
      if (!(key in en)) {
        report.error(file.replace(`${ROOT}/`, ""), `ключ i18n «${key}» не найден в каталоге`);
      }
    }
  }
}
