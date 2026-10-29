// Внутренние ссылки собранного сайта (без сети): файл существует, якорь есть на целевой странице.
import { existsSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { ROOT, Report, SITE, walk } from "./lib/content.ts";

const PUBLIC = SITE;
const report = new Report();
const idCache = new Map<string, Set<string>>();

function ids(file: string): Set<string> {
  let set = idCache.get(file);
  if (!set) {
    set = new Set([...readFileSync(file, "utf8").matchAll(/\sid="([^"]+)"/g)].map((m) => m[1] ?? ""));
    idCache.set(file, set);
  }
  return set;
}

function resolveTarget(fromFile: string, path: string): string | undefined {
  const url = path.startsWith("/") ? path : posix.join("/", posix.dirname(fromFile.slice(PUBLIC.length)), path);
  const clean = decodeURIComponent(url);
  const candidates = clean.endsWith("/") ? [join(PUBLIC, clean, "index.html")] : [join(PUBLIC, clean), join(PUBLIC, clean, "index.html")];
  return candidates.find((c) => existsSync(c) && !c.endsWith("/"));
}

for (const file of walk(PUBLIC, ".html")) {
  if (file.includes(`${join(PUBLIC, "pagefind")}`)) {
    continue;
  }
  const html = readFileSync(file, "utf8").replace(/<template[\s\S]*?<\/template>/g, "");
  for (const m of html.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
    const ref = m[1] ?? "";
    if (!ref || /^(?:[a-z][a-z0-9+.-]*:|\/\/|data:)/i.test(ref) || ref.startsWith("/pagefind/")) {
      continue;
    }
    const [path = "", hash = ""] = ref.split("#");
    const target = path === "" ? file : resolveTarget(file, path);
    const where = file.slice(ROOT.length + 1);
    if (!target) {
      report.error(where, `битая внутренняя ссылка ${ref}`);
    } else if (hash && target.endsWith(".html") && !ids(target).has(decodeURIComponent(hash))) {
      report.error(where, `нет якоря #${hash} в ${target.slice(PUBLIC.length)} (ссылка ${ref})`);
    }
  }
}
report.finish("check-links");
