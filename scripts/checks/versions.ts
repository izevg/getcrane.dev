import type { Page, Report } from "../lib/content.ts";

const KEYS = ["since", "until", "changed"] as const;

/**
 * Паритет front matter since / until / changed у RU и EN. Схему data/versions.yaml и диапазоны версий у страницы проверяет сборка Hugo
 * (partial util/versions.html и versions/validate.html), здесь остаётся только то, чего Hugo не видит: сравнение пары файлов.
 */
export function checkVersions(pages: Page[], report: Report): void {
  const byRel = new Map<string, Page>();
  for (const p of pages) {
    byRel.set(`${p.lang}:${p.rel}`, p);
  }
  for (const p of pages) {
    if (p.lang !== "en") {
      continue;
    }
    const twin = byRel.get(`ru:${p.rel}`);
    for (const key of KEYS) {
      if (twin && JSON.stringify(p.front[key] ?? null) !== JSON.stringify(twin.front[key] ?? null)) {
        report.error(p.file, `${key} различается у RU и EN (${twin.file})`);
      }
    }
  }
}

/** Страницы без номеров версий по правилу владельца; белый список — страницы versions и roadmap (layout: versions, layout: roadmap). */
export function isVersionsPage(p: Page): boolean {
  return p.front.layout === "versions" || p.front.layout === "roadmap";
}
