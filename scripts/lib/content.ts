import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parse } from "yaml";

export const ROOT = join(import.meta.dirname, "..", "..");
/** Каталог собранного сайта: public по умолчанию; SITE_DIR=<путь> собирает и проверяет рядом, не трогая public (например при работающем hugo server). */
export const SITE = process.env.SITE_DIR ? resolve(process.env.SITE_DIR) : join(ROOT, "public");
export const LANGS = ["en", "ru"] as const;
export type Lang = (typeof LANGS)[number];

export interface Page {
  lang: Lang;
  /** Путь от корня языка без расширения: features/security/_index. */
  rel: string;
  file: string;
  front: Record<string, unknown>;
  body: string;
  /** Номер первой строки тела в файле (для сообщений). */
  bodyLine: number;
}

export function walk(dir: string, ext: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full, ext));
    } else if (entry.name.endsWith(ext)) {
      out.push(full);
    }
  }
  return out.sort();
}

export function readYaml<T = Record<string, unknown>>(path: string): T {
  return (parse(readFileSync(path, "utf8")) ?? {}) as T;
}

export function loadPages(): Page[] {
  const pages: Page[] = [];
  for (const lang of LANGS) {
    const base = join(ROOT, "content", lang);
    for (const file of walk(base, ".md")) {
      const text = readFileSync(file, "utf8");
      const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
      const front = m ? ((parse(m[1] ?? "") ?? {}) as Record<string, unknown>) : {};
      const body = m ? text.slice(m[0].length) : text;
      const bodyLine = m ? m[0].split("\n").length : 1;
      pages.push({ lang, rel: relative(base, file).replace(/\.md$/, ""), file: relative(ROOT, file), front, body, bodyLine });
    }
  }
  return pages;
}

/** Тело без блоков кода и встроенного кода: для проверок текста. Номера строк сохраняются. */
export function stripCode(body: string): string {
  const noFences = body.replace(/^([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\2[^\n]*$/gm, (m) => m.replace(/[^\n]/g, " "));
  return noFences.replace(/`[^`\n]*`/g, (m) => " ".repeat(m.length));
}

export function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

export class Report {
  readonly errors: string[] = [];
  error(where: string, message: string): void {
    this.errors.push(`${where}: ${message}`);
  }
  finish(name: string): never {
    if (this.errors.length) {
      process.stderr.write(`${name}: ${this.errors.length} ошибок\n${this.errors.join("\n")}\n`);
      process.exit(1);
    }
    process.stdout.write(`${name}: без ошибок\n`);
    process.exit(0);
  }
}
