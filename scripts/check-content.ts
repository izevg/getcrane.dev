// Проверки контента для CI: паритет RU/EN, мета, запрещённые слова, xref, каталог i18n.
import { Report, loadPages } from "./lib/content.ts";
import { checkI18n } from "./checks/i18n.ts";
import { checkMeta } from "./checks/meta.ts";
import { checkParity, checkXrefs } from "./checks/parity.ts";
import { checkWords } from "./checks/words.ts";

const report = new Report();
const pages = loadPages();
checkParity(pages, report);
checkXrefs(pages, report);
checkMeta(pages, report);
checkWords(pages, report);
checkI18n(report);
report.finish("check-content");
