// Внешние ссылки: data/sources.yaml и ссылки в собранном сайте. Отдельная задача (по расписанию), а не гейт PR.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, Report, SITE, readYaml, walk } from "./lib/content.ts";

const urls = new Set<string>();
for (const s of Object.values(readYaml<Record<string, { url?: string }>>(join(ROOT, "data", "sources.yaml")))) {
  if (s.url) {
    urls.add(s.url);
  }
}
for (const file of walk(SITE, ".html")) {
  for (const m of readFileSync(file, "utf8").matchAll(/\shref="(https?:\/\/(?!getcrane\.dev)[^"#]+)/g)) {
    urls.add(m[1] ?? "");
  }
}
const report = new Report();
const queue = [...urls];
const worker = async (): Promise<void> => {
  for (let u = queue.pop(); u; u = queue.pop()) {
    try {
      let r = await fetch(u, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(20000) });
      if (r.status === 405 || r.status === 403) {
        r = await fetch(u, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(20000) });
      }
      if (!r.ok) {
        report.error(u, `HTTP ${r.status}`);
      }
    } catch (e) {
      report.error(u, String(e));
    }
  }
};
await Promise.all(Array.from({ length: 4 }, worker));
report.finish("check-external");
