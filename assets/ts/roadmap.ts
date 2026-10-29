import { $, ready } from "./lib/dom";

/** Раскрывает свёрнутую версию, на которую ведёт якорь (чип «Планируется в…», ссылка из шорткода): без этого ссылка на выпущенную версию остаётся закрытой. */
function openTarget(): void {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) {
    return;
  }
  const target = $<HTMLDetailsElement>(`details.rm-ver[id="${CSS.escape(id)}"]`);
  if (target && !target.open) {
    target.open = true;
    target.scrollIntoView();
  }
}

ready(() => {
  openTarget();
  window.addEventListener("hashchange", openTarget);
});
