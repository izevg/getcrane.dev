import type { Page, Report } from "../lib/content.ts";

const AUDIENCE = ["developer", "platform", "security", "auditor"];
const GENRE = ["tutorial", "how-to", "reference", "explanation"];
const STATE = ["target", "current"];
const STATUS = ["available", "in-development"];
const MAX_TITLE = 60;
const MAX_DESCRIPTION = 160;
/** Длина считается в символах (кодовых точках), не в байтах. */
const len = (s: string): number => [...s].length;

export function checkMeta(pages: Page[], report: Report): void {
  for (const p of pages) {
    const f = p.front;
    const title = typeof f.title === "string" ? f.title : "";
    const description = typeof f.description === "string" ? f.description : "";
    if (!title) {
      report.error(p.file, "нет title");
    } else if (len(title) > MAX_TITLE) {
      report.error(p.file, `title ${len(title)} знаков, допустимо ${MAX_TITLE}`);
    }
    if (!description) {
      report.error(p.file, "нет description");
    } else if (len(description) > MAX_DESCRIPTION) {
      report.error(p.file, `description ${len(description)} знаков, допустимо ${MAX_DESCRIPTION}`);
    }
    const audience = f.audience;
    if (!Array.isArray(audience) || !audience.length || audience.some((a) => !AUDIENCE.includes(String(a)))) {
      report.error(p.file, `audience должен быть непустым подмножеством ${AUDIENCE.join(", ")}`);
    }
    if (!GENRE.includes(String(f.genre))) {
      report.error(p.file, `genre должен быть одним из ${GENRE.join(", ")}`);
    }
    if (!STATE.includes(String(f.state))) {
      report.error(p.file, `state должен быть одним из ${STATE.join(", ")}`);
    }
    if (!STATUS.includes(String(f.status))) {
      report.error(p.file, `status должен быть одним из ${STATUS.join(", ")}`);
    }
    if (f.status === "in-development" && f.state !== "current") {
      report.error(p.file, "in-development допустим только для state: current");
    }
    if (!Number.isInteger(f.weight)) {
      report.error(p.file, "weight должен быть целым числом");
    }
    if (f.terms !== undefined && !Array.isArray(f.terms)) {
      report.error(p.file, "terms должен быть списком id");
    }
  }
}
