// Проверки контента для CI: паритет RU/EN, мета, запрещённые слова, xref, каталог i18n, версии, дорожная карта, отступы только из токенов.
import { resolve } from "node:path";
import { checkRoadmap } from "../tools/check-roadmap.ts";
import { Report, SITE, loadPages } from "./lib/content.ts";
import { checkI18n } from "./checks/i18n.ts";
import { checkIcons } from "./checks/icons.ts";
import { checkMeta } from "./checks/meta.ts";
import { checkParity, checkXrefs } from "./checks/parity.ts";
import { checkSpacing } from "./checks/spacing.ts";
import { checkVersions, checkVersionsOutput } from "./checks/versions.ts";
import { checkWords } from "./checks/words.ts";

const report = new Report();
const pages = loadPages();
checkParity(pages, report);
checkXrefs(pages, report);
checkMeta(pages, report);
checkWords(pages, report);
checkVersions(pages, report);
checkRoadmap(pages, report);
checkSpacing(report);
checkI18n(report);
checkIcons(report);
// Сборка Hugo в каталоге из --public <каталог> или SITE_DIR: проверка, что номера версий стоят только в разрешённых элементах (data-ver).
const publicAt = process.argv.indexOf("--public");
if (publicAt >= 0 || process.env.SITE_DIR) {
  checkVersionsOutput(publicAt >= 0 ? resolve(process.argv[publicAt + 1] ?? "public") : SITE, report);
}
report.finish("check-content");
