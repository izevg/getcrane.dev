import { $ } from "./lib/dom";
import { announce } from "./lib/clipboard";
import { t } from "./lib/strings";

const BUNDLE = "/pagefind/";
const GAP = 8;
const MARGIN = 16;
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
    watchQuery();
  });
  return loading;
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
  const rect = trigger.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  pop.style.top = `${Math.round(rect.bottom + GAP)}px`;
  pop.style.right = `${Math.max(MARGIN, Math.round(vw - rect.right))}px`;
  pop.togglePopover(true);
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
