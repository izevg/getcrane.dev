// Общее для render-mermaid.ts (локальный рендер) и check-mermaid.ts (проверка в CI без рендера): исходники диаграмм и отпечаток темы.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, loadPages } from "./content.ts";
import { tokensFor } from "./mermaid-theme.ts";

export const HASH_LEN = 16;
export const DIAGRAMS_DIR = join(ROOT, "assets", "diagrams");
export const MANIFEST = join(DIAGRAMS_DIR, "manifest.json");
const FENCE = /^([ \t]*)(`{3,})mermaid([^\n]*)\n([\s\S]*?)^\1\2[ \t]*$/gm;
const CAPTION = /caption="([^"]*)"/;

export interface Entry {
  caption: Record<string, string>;
  pages: string[];
}
export interface Manifest {
  theme: string;
  diagrams: Record<string, Entry>;
}

function dedent(code: string, indent: string): string {
  return code
    .split("\n")
    .map((l) => (l.startsWith(indent) ? l.slice(indent.length) : l))
    .join("\n");
}

/** Хэш исходника — тот же расчёт, что в layouts/_markup/render-codeblock-mermaid.html. */
export const hashOf = (code: string): string => createHash("sha256").update(code).digest("hex").slice(0, HASH_LEN);

/** Исходники диаграмм всех страниц: хэш → код, хэш → подписи и места. */
export function collectDiagrams(): { sources: Map<string, string>; entries: Map<string, Entry> } {
  const sources = new Map<string, string>();
  const entries = new Map<string, Entry>();
  for (const p of loadPages()) {
    for (const m of p.body.matchAll(FENCE)) {
      const code = dedent(m[4] ?? "", m[1] ?? "").trim();
      const hash = hashOf(code);
      sources.set(hash, code);
      const entry = entries.get(hash) ?? { caption: {}, pages: [] };
      const caption = CAPTION.exec(m[3] ?? "")?.[1];
      if (caption) {
        entry.caption[p.lang] = caption;
      }
      entry.pages.push(`${p.file}:${p.bodyLine + p.body.slice(0, m.index).split("\n").length - 1}`);
      entries.set(hash, entry);
    }
  }
  return { sources, entries };
}

/**
 * Отпечаток темы: значения токенов, из которых строится тема mermaid, плюс текст самой темы.
 * Комментарии и служебные строки console.css в отпечаток не входят: смена коммита-источника SVG не устаревает.
 */
export function themeStamp(): string {
  return createHash("sha256")
    .update(JSON.stringify(tokensFor()))
    .update(readFileSync(join(ROOT, "scripts", "lib", "mermaid-theme.ts")))
    .digest("hex");
}
