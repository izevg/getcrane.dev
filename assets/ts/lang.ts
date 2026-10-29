import { $$ } from "./lib/dom";

/** Переключатель языка сохраняет якорь: якоря одинаковы в RU и EN (контракт authoring.md). */
export function initLang(): void {
  const update = (): void => {
    for (const link of $$<HTMLAnchorElement>("[data-lang-link]")) {
      const url = new URL(link.href, location.href);
      url.hash = location.hash;
      link.href = url.href;
    }
  };
  update();
  window.addEventListener("hashchange", update);
}
