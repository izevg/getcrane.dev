import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { Report } from "../lib/content.ts";
import { ROOT, walk } from "../lib/content.ts";

/**
 * Отступы только из токенов (assets/css/tokens/semantic.css): margin, padding, gap, inset, scroll-margin, top/right/bottom/left
 * не принимают литералы с единицей длины (px, rem, em, ch, vh, vw…). Разрешены 0, ±1px (рамки и вынос на толщину рамки), проценты
 * (геометрия позиционирования) и строки с пометкой `spacing-ok: причина` в комментарии. Файлы tokens/ — источник токенов, не проверяются.
 */
const PROPERTY = /(?<![\w-])(margin|padding|gap|row-gap|column-gap|inset|scroll-margin|scroll-padding|top|right|bottom|left)(?:-[a-z]+)*\s*:\s*([^;{}]+)/g;
const LITERAL = /(?<![\w-])-?\d*\.?\d+(?:px|rem|em|ch|vh|vw|vmin|vmax|svh|dvh|lvh)(?![\w-])/g;
const ALLOWED = /^-?1px$/;

export function checkSpacing(report: Report): void {
  const dir = join(ROOT, "assets", "css");
  for (const file of walk(dir, ".css")) {
    const rel = relative(ROOT, file);
    if (rel.includes("/tokens/")) {
      continue;
    }
    const lines = readFileSync(file, "utf8").split("\n");
    let inComment = false;
    lines.forEach((raw, i) => {
      if (raw.includes("spacing-ok")) {
        return;
      }
      // Комментарии (в том числе многострочные) не содержат деклараций.
      let line = raw;
      if (inComment) {
        const end = line.indexOf("*/");
        if (end < 0) {
          return;
        }
        line = line.slice(end + 2);
        inComment = false;
      }
      line = line.replace(/\/\*.*?\*\//g, "");
      const open = line.indexOf("/*");
      if (open >= 0) {
        line = line.slice(0, open);
        inComment = true;
      }
      for (const m of line.matchAll(PROPERTY)) {
        const value = m[2] ?? "";
        for (const lit of value.matchAll(LITERAL)) {
          if (!ALLOWED.test(lit[0])) {
            report.error(`${rel}:${i + 1}`, `литерал отступа ${lit[0]} в «${m[0].trim()}»: возьмите токен --space-*, --pad-*, --gap-*, --indent-* или --rhythm-* либо пометьте строку spacing-ok`);
          }
        }
      }
    });
  }
}
