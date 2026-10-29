import { $, $$, icon, ready } from "./lib/dom";
import { announce, copyFetched, feedback, writeText } from "./lib/clipboard";
import { t } from "./lib/strings";

/** Исходник блока без приглашения `$ ` и строк вывода (Chroma: .gp, .go); обёртки env текста не добавляют. */
function codeText(code: Element): string {
  const clone = code.cloneNode(true) as Element;
  for (const n of $$(".gp, .go", clone)) {
    n.remove();
  }
  return (clone.textContent ?? "").replace(/\n$/, "");
}

function selectAll(node: Element): void {
  const selection = getSelection();
  if (selection) {
    selection.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.addRange(range);
  }
}

function initCodeCopy(): void {
  for (const block of $$(".code:not([data-output])")) {
    const slot = $(".code-actions", block);
    const code = $("pre code", block);
    if (!slot || !code) {
      continue;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-ghost btn-icon btn-sm copy-btn";
    button.setAttribute("aria-label", t("copy.code"));
    const pair = document.createElement("span");
    pair.className = "copy-ico";
    pair.append(icon("copy"), icon("check"));
    button.append(pair);
    button.addEventListener("click", () => {
      void writeText(codeText(code)).then((ok) => feedback(button, ok, t("copied"), () => selectAll(code)));
    });
    slot.append(button);
  }
}

function initMarkdownCopy(): void {
  for (const button of $$("[data-copy-md]")) {
    const url = button.dataset.copyMd;
    if (!url) {
      continue;
    }
    button.addEventListener("click", () => {
      void copyFetched(url).then((ok) => feedback(button, ok, t("copied.md")));
    });
  }
}

/** Кнопки «Копировать имя» (подсказки env и справочник): копируется ровно имя. */
function initNameCopy(): void {
  document.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLElement>("[data-copy-name]");
    const name = button?.dataset.copyName;
    if (!button || !name) {
      return;
    }
    void writeText(name).then((ok) => {
      feedback(button, ok, t("env.copied", { name }));
      if (!ok) {
        const node = button.closest("tr, .tip")?.querySelector("code");
        if (node) {
          selectAll(node);
        }
      }
    });
  });
}

function nearestHeading(node: Element): string | null {
  let el: Element | null = node.previousElementSibling;
  while (el) {
    if (/^H[2-4]$/.test(el.tagName)) {
      return el.textContent?.replace(/#$/, "").trim() ?? null;
    }
    el = el.previousElementSibling;
  }
  return null;
}

/** Регион с прокруткой получает tabindex и имя только при реальном переполнении (WCAG 2.1.1, 1.4.10). */
function initRegions(): void {
  const check = (el: HTMLElement, name: () => string, region: boolean): void => {
    if (el.scrollWidth > el.clientWidth + 1) {
      el.tabIndex = 0;
      el.setAttribute("aria-label", name());
      if (region) {
        el.setAttribute("role", "region");
      }
    } else {
      el.removeAttribute("tabindex");
      el.removeAttribute("aria-label");
      if (region) {
        el.removeAttribute("role");
      }
    }
  };
  const observer = new ResizeObserver((entries) => {
    for (const { target } of entries) {
      const el = target as HTMLElement;
      if (el.matches("[data-scroll]")) {
        const caption = document.getElementById(el.dataset.scrollLabel ?? "")?.textContent?.trim();
        check(el, () => caption ?? t("table.default"), true);
      } else if (el.matches("[data-table]")) {
        check(el, () => el.querySelector("caption")?.textContent?.trim() ?? nearestHeading(el) ?? t("table.default"), true);
      } else {
        const lang = el.closest<HTMLElement>(".code")?.dataset.lang ?? "";
        check(el, () => t("code.label", { lang }), false);
      }
    }
  });
  for (const el of $$("[data-table], [data-scroll], .code pre")) {
    observer.observe(el);
  }
}

/** Оглавление: подсветка текущего раздела без смены фокуса и без объявлений. */
function initToc(): void {
  const links = $$<HTMLAnchorElement>(".toc a[href^='#']");
  if (!links.length) {
    return;
  }
  const byId = new Map<string, HTMLAnchorElement[]>();
  for (const a of links) {
    const id = decodeURIComponent(a.hash.slice(1));
    byId.set(id, [...(byId.get(id) ?? []), a]);
  }
  const heads = [...byId.keys()].map((id) => document.getElementById(id)).filter((n): n is HTMLElement => !!n);
  const visible = new Set<HTMLElement>();
  let current: HTMLElement | undefined;
  const mark = (): void => {
    const next = heads.find((h) => visible.has(h)) ?? current;
    if (next === current && current) {
      return;
    }
    current = next;
    for (const a of links) {
      a.removeAttribute("aria-current");
    }
    for (const a of byId.get(current?.id ?? "") ?? []) {
      a.setAttribute("aria-current", "true");
    }
  };
  const header = document.querySelector<HTMLElement>(".site-header")?.offsetHeight ?? 56;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          visible.add(e.target as HTMLElement);
        } else {
          visible.delete(e.target as HTMLElement);
        }
      }
      mark();
    },
    { rootMargin: `-${header + 8}px 0px -70% 0px` },
  );
  for (const h of heads) {
    observer.observe(h);
  }
}

/** Справочник переменных: фокус на ссылке строки-цели и возврат на страницу, откуда пришли. */
function initEnvReference(): void {
  const table = $(".env-table");
  if (!table) {
    return;
  }
  const focusRow = (): void => {
    const row = location.hash ? table.querySelector<HTMLElement>(`tr[id="${CSS.escape(location.hash.slice(1))}"]`) : null;
    row?.querySelector<HTMLElement>("th a")?.focus({ preventScroll: true });
  };
  focusRow();
  window.addEventListener("hashchange", focusRow);
  if (document.referrer.startsWith(location.origin) && new URL(document.referrer).pathname !== location.pathname) {
    const back = document.referrer;
    void fetch(back)
      .then((r) => r.text())
      .then((html) => {
        const title = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1]?.replace(/<[^>]+>/g, "").trim();
        if (!title) {
          return;
        }
        const p = document.createElement("p");
        p.className = "env-back";
        const a = document.createElement("a");
        a.href = back;
        a.textContent = t("env.back", { title });
        p.append(a);
        table.closest("[data-table]")?.before(p);
      })
      .catch(() => announce(""));
  }
}

ready(() => {
  initCodeCopy();
  initMarkdownCopy();
  initNameCopy();
  initRegions();
  initToc();
  initEnvReference();
});
