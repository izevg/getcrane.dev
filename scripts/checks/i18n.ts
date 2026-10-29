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
  const exposed = new Set(
    [...readFileSync(join(ROOT, "layouts", "_partials", "head", "strings.html"), "utf8").matchAll(/"([a-z0-9.-]+)"/g)].map((m) => m[1] ?? ""),
  );
  const hasPrefix = (prefix: string): boolean => Object.keys(en).some((k) => k.startsWith(prefix));
  for (const file of [...walk(join(ROOT, "layouts"), ".html"), ...walk(join(ROOT, "assets", "ts"), ".ts")]) {
    const rel = file.replace(`${ROOT}/`, "");
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/(?:i18n\s+|"k"\s+|\bt\()"([a-z0-9.-]+)"/g)) {
      const key = m[1] ?? "";
      if (!(key in en)) {
        report.error(rel, `ключ i18n «${key}» не найден в каталоге`);
      }
    }
    // Ключ острова должен попасть в JSON #ui-strings (layouts/_partials/head/strings.html), иначе на странице останется сырой ключ.
    if (file.endsWith(".ts")) {
      for (const m of text.matchAll(/\bt\(\s*(?:"([a-z0-9.-]+)"|`([a-z0-9.-]*)\$\{)/g)) {
        const key = m[1];
        const prefix = m[2];
        if (key && !exposed.has(key)) {
          report.error(rel, `ключ «${key}» используется островом, но не перечислен в head/strings.html`);
        }
        if (prefix !== undefined && ![...exposed].some((k) => k.startsWith(prefix))) {
          report.error(rel, `динамический ключ «${prefix}…» острова не перечислен в head/strings.html`);
        }
      }
    } else {
      for (const m of text.matchAll(/i18n\s+\(printf\s+"([a-z0-9.-]*)%s"/g)) {
        if (!hasPrefix(m[1] ?? "")) {
          report.error(rel, `динамический ключ i18n «${m[1]}…» не имеет ни одного значения в каталоге`);
        }
      }
    }
  }
}
