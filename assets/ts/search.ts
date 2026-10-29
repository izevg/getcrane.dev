import { $, $$ } from "./lib/dom";
import { announce } from "./lib/clipboard";
import { plural, t } from "./lib/strings";
import { place } from "./tips/position";

const BUNDLE = "/pagefind/";
const LOADING_MS = 300;

let loading: Promise<void> | undefined;

/** Pagefind Component UI грузится только по намерению пользователя: клик, Ctrl/⌘ K, наведение. */
function load(): Promise<void> {
  loading ??= new Promise<void>((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = `${BUNDLE}pagefind-component-ui.css`;
    document.head.append(css);
    const script = document.createElement("script");
    script.type = "module";
    script.src = `${BUNDLE}pagefind-component-ui.js`;
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("pagefind")));
    document.head.append(script);
  }).then(async () => {
    const tpl = $<HTMLTemplateElement>("#search-tpl");
    if (tpl) {
      document.body.append(tpl.content.cloneNode(true));
    }
    await customElements.whenDefined("pagefind-modal");
    const modal = $("pagefind-modal");
    if (modal) {
      translateInstance(modal);
    }
    watchQuery();
  });
  return loading;
}

/** Часть API экземпляра Pagefind Component UI, которая нужна для перевода строк (экземпляр лежит на каждом компоненте). */
interface PagefindInstance {
  translate: (key: string, vars?: Record<string, unknown>) => string;
}

const COUNT_WITH_TERM = new Set(["one_result", "many_results"]);
const COUNT_TOTAL = new Set(["total_one_result", "total_many_results"]);

/**
 * Строки Pagefind, которых нет в его каталоге ru или которые склоняют неверно: у Pagefind только формы «один» и «много» («21 результатов»),
 * а кнопки очистки он при первой отрисовке пишет по-английски. Перехватываем translate экземпляра: формы числа берутся из Intl.PluralRules и каталога
 * сайта (ключи search.count.*), очистка — из search.clear. Это заодно исправляет объявление результатов в live-области.
 */
function translateInstance(modal: HTMLElement): void {
  const holder = $<HTMLElement & { instance?: PagefindInstance }>("pagefind-input", modal);
  const instance = holder?.instance;
  if (!instance) {
    return;
  }
  const original = instance.translate.bind(instance);
  instance.translate = (key, vars) => {
    const count = vars?.COUNT;
    if (typeof count === "number" && (COUNT_WITH_TERM.has(key) || COUNT_TOTAL.has(key))) {
      const text = plural("search.count", count);
      return COUNT_WITH_TERM.has(key) ? t("search.summary", { count: text, q: String(vars?.SEARCH_TERM ?? "") }) : text;
    }
    return key === "clear_search" ? t("search.clear") : original(key, vars);
  };
  // Кнопки очистки отрисованы до подмены translate, поэтому правим их подписи один раз. Повторная отрисовка через setTranslations дублирует диалог.
  const clear = t("search.clear");
  for (const button of $$(".pf-input-clear", modal)) {
    button.textContent = clear;
  }
  for (const button of $$(".pf-dropdown-clear", modal)) {
    const label = button.parentElement?.querySelector(".pf-dropdown-trigger-label")?.textContent ?? "";
    button.textContent = clear;
    button.setAttribute("aria-label", `${clear} ${label}`.trim());
  }
}

/** Ряд фильтров показывается после первого запроса: до ввода значений у фильтров нет, пустые списки только шумят. */
function watchQuery(): void {
  const modal = $("pagefind-modal");
  if (!modal) {
    return;
  }
  const sync = (): void => {
    const value = $<HTMLInputElement>("input", modal)?.value ?? "";
    modal.toggleAttribute("data-q", value.trim() !== "");
  };
  modal.addEventListener("input", sync);
  modal.addEventListener("close", () => modal.removeAttribute("data-q"), { capture: true });
}

/** Видимая ошибка у триггера: popover с текстом и ссылкой на документацию; live-регион остаётся. */
function showError(trigger: HTMLElement): void {
  let pop = $("#search-error");
  if (!pop) {
    pop = document.createElement("div");
    pop.id = "search-error";
    pop.className = "pop search-error";
    pop.setAttribute("popover", "auto");
    pop.setAttribute("role", "alert");
    const text = document.createElement("p");
    text.textContent = t("search.error");
    pop.append(text);
    const href = trigger.dataset.docsHref;
    if (href) {
      const link = document.createElement("a");
      link.href = href;
      link.textContent = t("search.error.docs");
      pop.append(link);
    }
    document.body.append(pop);
  }
  pop.togglePopover(true);
  place(trigger, pop);
}

async function open(trigger: HTMLElement): Promise<void> {
  const slow = window.setTimeout(() => announce(t("search.loading")), LOADING_MS);
  try {
    await load();
    const modal = $<HTMLElement & { open?: () => void }>("pagefind-modal");
    modal?.open?.();
    modal?.addEventListener("close", () => trigger.focus(), { capture: true, once: true });
  } catch {
    loading = undefined;
    announce(t("search.error"));
    showError(trigger);
  } finally {
    window.clearTimeout(slow);
  }
}

export function initSearch(): void {
  const trigger = $("[data-search-open]");
  if (!trigger) {
    return;
  }
  const apple = /Mac|iPhone|iPad/.test(navigator.platform);
  // Сочетание объявляется только то, что реально работает на этой платформе (⌘ K на Apple, Ctrl K на остальных).
  trigger.setAttribute("aria-keyshortcuts", apple ? "Meta+K" : "Control+K");
  const hint = $("[data-kbd]", trigger);
  if (hint) {
    hint.textContent = apple ? "⌘ K" : "Ctrl K";
  }
  trigger.addEventListener("click", () => void open(trigger));
  trigger.addEventListener("pointerenter", () => void load().catch(() => undefined), { once: true });
  document.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "k" && (apple ? event.metaKey : event.ctrlKey) && !event.altKey) {
      event.preventDefault();
      void open(trigger);
    }
  });
}
