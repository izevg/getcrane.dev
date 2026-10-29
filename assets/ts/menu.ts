import { $, icon } from "./lib/dom";
import { t } from "./lib/strings";

/**
 * Меню на узких экранах: дерево разделов переезжает в <dialog> и возвращается на место при закрытии.
 * Без JS кнопка «Меню» — ссылка на #site-nav, и дерево показывается :target.
 */
export function initMenu(): void {
  const link = $<HTMLAnchorElement>("[data-menu-open]");
  const host = $("#site-nav");
  const nav = host?.querySelector("nav");
  if (!link || !host || !nav) {
    return;
  }
  const dialog = document.createElement("dialog");
  dialog.className = "menu-dialog";
  dialog.setAttribute("aria-label", t("menu"));
  const head = document.createElement("div");
  head.className = "menu-dialog-head";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "btn-icon";
  close.setAttribute("aria-label", t("menu.close"));
  close.append(icon("x", "i-20"));
  head.append(close);
  dialog.append(head);
  document.body.append(dialog);

  const button = document.createElement("button");
  button.type = "button";
  button.className = link.className;
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  button.append(...Array.from(link.childNodes).map((n) => n.cloneNode(true)));
  link.replaceWith(button);

  const open = (): void => {
    dialog.append(nav);
    dialog.showModal();
    button.setAttribute("aria-expanded", "true");
  };
  const restore = (): void => {
    host.append(nav);
    button.setAttribute("aria-expanded", "false");
  };
  button.addEventListener("click", open);
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", restore);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  });
  dialog.addEventListener("click", (event) => {
    if ((event.target as Element).closest("a")) {
      dialog.close();
    }
  });
  matchMedia("(min-width: 64rem)").addEventListener("change", (event) => {
    if (event.matches && dialog.open) {
      dialog.close();
    }
  });
}
