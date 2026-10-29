// Доводка public/ после Hugo: GitHub Pages ждёт /404.html в корне, Hugo пишет страницу в каталог языка.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { LANGS, SITE, walk } from "./lib/content.ts";

const pub = SITE;

/**
 * llms-full.txt языка: все страницы из llms.txt в порядке навигации, каждая — заголовок, адрес, описание и тело готовой Markdown-версии.
 * Hugo не может собрать его сам: шорткоды страницы он разворачивает в формате самой страницы (HTML), а Markdown-шаблоны шорткодов
 * применяются только при выводе .md-версии. Поэтому текст берётся из уже собранных .md, а не из шаблона главной.
 */
function writeLlmsFull(lang: string): void {
  const index = join(pub, lang, "llms.txt");
  if (!existsSync(index)) {
    return;
  }
  const FRONT = "---\n";
  const sections: string[] = [];
  for (const line of readFileSync(index, "utf8").split("\n")) {
    const href = line.startsWith("- [") ? line.slice(line.indexOf("](") + 2, line.indexOf(")", line.indexOf("]("))) : "";
    const file = href.endsWith(".md") ? join(pub, new URL(href).pathname) : "";
    if (!file || !existsSync(file)) {
      continue;
    }
    const text = readFileSync(file, "utf8");
    const end = text.indexOf(`\n${FRONT}`, FRONT.length);
    const front = parse(text.slice(FRONT.length, end)) as { title: string; description?: string; url: string };
    // Первая строка после front matter — «# Заголовок»: в llms-full заголовок уже стоит выше, повторять его не нужно.
    const afterFront = text.slice(end + FRONT.length + 1).trimStart();
    const body = afterFront.slice(afterFront.indexOf("\n") + 1).trim();
    const description = front.description ? `Description: ${front.description}\n` : "";
    sections.push(`# ${front.title}\nURL: ${front.url}\n${description}\n${body}\n`);
  }
  writeFileSync(join(pub, lang, "llms-full.txt"), `${sections.join("\n---\n\n")}\n`);
  process.stdout.write(`postbuild: ${lang}/llms-full.txt, страниц: ${sections.length}\n`);
}
for (const lang of LANGS) {
  writeLlmsFull(lang);
}

const src = join(pub, "en", "404.html");
if (!existsSync(join(pub, "404.html")) && existsSync(src)) {
  copyFileSync(src, join(pub, "404.html"));
  process.stdout.write("postbuild: public/404.html создан из public/en/404.html\n");
}
for (const must of ["index.html", "llms.txt", "sitemap.xml", "robots.txt"]) {
  if (!existsSync(join(pub, must))) {
    process.stderr.write(`postbuild: нет public/${must}\n`);
    process.exitCode = 1;
  }
}

// Утечки шаблонизатора: сломанный printf (%!s(MISSING)), пустое значение (<no value>) в собранных html, md, txt и json.
const LEAKS = /%!|\(MISSING\)|<no value>/;
for (const ext of [".html", ".md", ".txt", ".json"]) {
  for (const file of walk(pub, ext)) {
    if (file.includes("/pagefind/")) {
      continue;
    }
    const m = LEAKS.exec(readFileSync(file, "utf8"));
    if (m) {
      process.stderr.write(`postbuild: «${m[0]}» в ${file.slice(pub.length + 1)}\n`);
      process.exitCode = 1;
    }
  }
}
