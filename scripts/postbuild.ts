// Доводка public/ после Hugo: GitHub Pages ждёт /404.html в корне, Hugo пишет страницу в каталог языка.
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SITE, walk } from "./lib/content.ts";

const pub = SITE;
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
