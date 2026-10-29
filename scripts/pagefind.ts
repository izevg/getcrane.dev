// Индекс Pagefind по каталогу public/. Индекс отдельный на язык (по <html lang>).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, SITE } from "./lib/content.ts";

// --dev: индекс пишется в static/pagefind (в .gitignore), чтобы его отдавал hugo server на :1313. Сайт для индексации берётся из public/.
const dev = process.argv.includes("--dev");
const site = SITE;
const outDir = dev ? join(ROOT, "static", "pagefind") : join(site, "pagefind");
if (!existsSync(join(site, "en", "index.html"))) {
  process.stderr.write(`pagefind: нет ${site}/en/index.html, сначала соберите сайт (hugo)\n`);
  process.exit(1);
}
const run = spawnSync("npx", ["--no-install", "pagefind", "--site", site, ...(dev ? ["--output-path", outDir] : ["--output-subdir", "pagefind"])], { cwd: ROOT, stdio: "inherit" });
if (run.status !== 0) {
  process.exit(run.status ?? 1);
}
if (!existsSync(join(outDir, "pagefind-entry.json"))) {
  process.stderr.write(`pagefind: не создан ${outDir}/pagefind-entry.json\n`);
  process.exit(1);
}
process.stdout.write(`pagefind: индекс записан в ${outDir}\n`);
