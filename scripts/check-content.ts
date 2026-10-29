// Проверки исходников для CI (до сборки): паритет RU/EN, мета, запрещённые слова, каталог i18n, паритет версий, дорожная карта, отступы только из токенов.
// Ссылки, якоря, схемы данных и иконки шаблонов проверяет сама сборка и scripts/check-links.ts; собранный сайт — scripts/check-output.ts.
import { checkRoadmap } from "../tools/check-roadmap.ts";
import { Report, loadPages } from "./lib/content.ts";
import { checkI18n } from "./checks/i18n.ts";
import { checkIcons } from "./checks/icons.ts";
import { checkMeta } from "./checks/meta.ts";
import { checkParity } from "./checks/parity.ts";
import { checkSpacing } from "./checks/spacing.ts";
import { checkVersions } from "./checks/versions.ts";
import { checkWords } from "./checks/words.ts";

const report = new Report();
const pages = loadPages();
checkParity(pages, report);
checkMeta(pages, report);
checkWords(pages, report);
checkVersions(pages, report);
checkRoadmap(pages, report);
checkSpacing(report);
checkI18n(report);
checkIcons(report);
report.finish("check-content");
