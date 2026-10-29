// Индекс Pagefind по каталогу public/. Индекс отдельный на язык (по <html lang>).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib/content.ts";

const site = join(ROOT, "public");
if (!existsSync(join(site, "en", "index.html"))) {
  process.stderr.write("pagefind: нет public/en/index.html, сначала соберите сайт (hugo)\n");
  process.exit(1);
}
const run = spawnSync("npx", ["--no-install", "pagefind", "--site", "public", "--output-subdir", "pagefind"], { cwd: ROOT, stdio: "inherit" });
if (run.status !== 0) {
  process.exit(run.status ?? 1);
}
if (!existsSync(join(site, "pagefind", "pagefind-entry.json"))) {
  process.stderr.write("pagefind: не создан public/pagefind/pagefind-entry.json\n");
  process.exit(1);
}
process.stdout.write("pagefind: индекс записан в public/pagefind\n");
