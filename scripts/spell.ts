// Орфография RU и EN (cspell, лицензия MIT; словарь русского — @cspell/dict-ru_ru).
// Исключения: термины из data/glossary.yaml (генерируются в .cache/) и scripts/spell-extra.txt.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, readYaml } from "./lib/content.ts";

interface Entry {
  ru?: { term?: string };
  en?: { term?: string };
}
const glossary = readYaml<Record<string, Entry>>(join(ROOT, "data", "glossary.yaml"));
const words = new Set<string>();
for (const [id, e] of Object.entries(glossary)) {
  for (const w of [id, e.ru?.term ?? "", e.en?.term ?? ""].join(" ").split(/[\s-]+/)) {
    if (w.length > 1) {
      words.add(w);
    }
  }
}
mkdirSync(join(ROOT, ".cache"), { recursive: true });
writeFileSync(join(ROOT, ".cache", "glossary-words.txt"), [...words].sort().join("\n") + "\n");
const run = spawnSync("npx", ["--no-install", "cspell", "--no-progress", "--config", "cspell.json"], { cwd: ROOT, stdio: "inherit" });
process.exit(run.status ?? 1);
