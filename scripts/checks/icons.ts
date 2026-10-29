import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Report } from "../lib/content.ts";
import { ROOT, readYaml, walk } from "../lib/content.ts";
import { readManifest } from "../sync-icons.ts";

/**
 * Иконки Lucide: каждое имя, которым пользуются шаблоны, острова и данные, есть в assets/icons/manifest.json,
 * и каждая вендоренная иконка где-то используется (набор «только нужные»). Смысловые имена раскрываются через data/icons.yaml.
 */
export function checkIcons(report: Report): void {
  const manifest = readManifest();
  const have = new Set(manifest.icons);
  const dict = readYaml<{ alias?: Record<string, string>; section?: Record<string, string> }>(join(ROOT, "data", "icons.yaml"));
  const alias = dict.alias ?? {};
  for (const [from, to] of [...Object.entries(alias), ...Object.entries(dict.section ?? {})]) {
    if (!have.has(to)) {
      report.error("data/icons.yaml", `«${from}» ведёт на несуществующую иконку ${to}`);
    }
  }
  const files = [...walk(join(ROOT, "layouts"), ".html"), ...walk(join(ROOT, "assets", "ts"), ".ts"), join(ROOT, "data", "home.yaml"), join(ROOT, "data", "icons.yaml")];
  const used = new Set<string>();
  for (const file of files) {
    const rel = file.replace(`${ROOT}/`, "");
    const text = readFileSync(file, "utf8");
    for (const word of text.match(/[a-z][a-z0-9]*(?:-[a-z0-9]+)*/g) ?? []) {
      if (have.has(word)) {
        used.add(word);
      }
    }
    for (const m of text.matchAll(/ui\/icon\.html"\s+(?:\(dict\s+"name"\s+)?"([a-z0-9-]+)"/g)) {
      const name = m[1] ?? "";
      if (!have.has(alias[name] ?? name)) {
        report.error(rel, `иконка «${name}» не найдена в assets/icons/manifest.json`);
      }
    }
    for (const m of text.matchAll(/\bicon\(\s*"([a-z0-9-]+)"/g)) {
      if (!have.has(m[1] ?? "")) {
        report.error(rel, `иконка «${m[1]}» не найдена в assets/icons/manifest.json`);
      }
    }
    if (file.endsWith("home.yaml")) {
      for (const m of text.matchAll(/\bicon:\s*([a-z0-9-]+)/g)) {
        if (!have.has(m[1] ?? "")) {
          report.error(rel, `иконка «${m[1]}» не найдена в assets/icons/manifest.json`);
        }
      }
    }
  }
  const aliased = new Set(Object.values(alias));
  for (const name of manifest.icons) {
    if (!used.has(name) && !aliased.has(name)) {
      report.error("assets/icons", `иконка ${name} не используется: уберите её из manifest.json и повторите npm run icons:sync`);
    }
  }
}
