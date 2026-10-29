import { $ } from "./lib/dom";
import { announce } from "./lib/clipboard";
import { t } from "./lib/strings";

const BUNDLE = "/pagefind/";

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
  });
  return loading;
}

async function open(trigger: HTMLElement): Promise<void> {
  try {
    await load();
    const modal = $<HTMLElement & { open?: () => void }>("pagefind-modal");
    modal?.open?.();
    modal?.addEventListener("close", () => trigger.focus(), { capture: true, once: true });
  } catch {
    loading = undefined;
    announce(t("search.error"));
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
