// Доводка public/ после Hugo: GitHub Pages ждёт /404.html в корне, Hugo пишет страницу в каталог языка.
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib/content.ts";

const pub = join(ROOT, "public");
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
