import { $, $$, icon, ready, tick } from "./lib/dom";
import { copyFetched, feedback, writeText } from "./lib/clipboard";
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
    pair.append(icon("copy"), tick("check"));
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
      if (el.matches("[data-table]")) {
        check(el, () => el.querySelector("caption")?.textContent?.trim() ?? nearestHeading(el) ?? t("table.default"), true);
      } else {
        const lang = el.closest<HTMLElement>(".code")?.dataset.lang ?? "";
        check(el, () => t("code.label", { lang }), false);
      }
    }
  });
  for (const el of $$("[data-table], .code pre")) {
    observer.observe(el);
  }
}

/** Доля высоты окна, на которой «пересекается» заголовок активного раздела (верхняя треть). */
const SPY_LINE = 0.33;
const TOP_GAP = 8;

/**
 * Оглавление: активен раздел, заголовок которого пересёк линию в верхней трети окна; у конца страницы линия опускается к низу окна,
 * поэтому короткие последние разделы не пропускаются, а на самом конце активен последний. Клик по ссылке делает пункт активным сразу и
 * держит его, пока читатель сам не прокрутит (колесо, касание, клавиши). Активный пункт сам виден в прокручиваемом оглавлении.
 */
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
  if (!heads.length) {
    return;
  }
  const header = (): number => document.querySelector<HTMLElement>(".site-header")?.offsetHeight ?? 56;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let current = "";
  let locked = false;
  let frame = 0;

  const keepVisible = (a: HTMLElement): void => {
    const box = a.closest<HTMLElement>(".toc-col > nav");
    if (!box || box.scrollHeight <= box.clientHeight) {
      return;
    }
    // block: nearest без прокрутки страницы: двигаем только контейнер оглавления.
    const top = a.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    const bottom = top + a.offsetHeight;
    const pad = 8;
    let next = box.scrollTop;
    if (top - pad < box.scrollTop) {
      next = top - pad;
    } else if (bottom + pad > box.scrollTop + box.clientHeight) {
      next = bottom + pad - box.clientHeight;
    }
    if (next !== box.scrollTop) {
      box.scrollTo({ top: Math.max(0, next), behavior: reduced.matches ? "auto" : "smooth" });
    }
  };
  const activate = (id: string): void => {
    if (id === current) {
      return;
    }
    current = id;
    for (const a of links) {
      a.removeAttribute("aria-current");
    }
    for (const a of byId.get(id) ?? []) {
      a.setAttribute("aria-current", "true");
    }
    const col = byId.get(id)?.find((a) => a.closest(".toc-col"));
    if (col) {
      keepVisible(col);
    }
  };
  const pick = (): string => {
    const vh = window.innerHeight;
    const remaining = document.documentElement.scrollHeight - (window.scrollY + vh);
    const reach = vh * (1 - SPY_LINE);
    const base = Math.max(header() + TOP_GAP, vh * SPY_LINE);
    const line = remaining >= reach ? base : base + (vh - base) * (1 - Math.max(0, remaining) / reach);
    let id = "";
    for (const h of heads) {
      if (h.getBoundingClientRect().top <= line + 1) {
        id = h.id;
      } else {
        break;
      }
    }
    return id;
  };
  const update = (): void => {
    frame = 0;
    if (!locked) {
      activate(pick());
    }
  };
  const schedule = (): void => {
    if (!frame) {
      frame = requestAnimationFrame(update);
    }
  };
  const unlock = (): void => {
    locked = false;
    schedule();
  };
  for (const a of links) {
    a.addEventListener("click", () => {
      locked = true;
      activate(decodeURIComponent(a.hash.slice(1)));
    });
  }
  for (const type of ["wheel", "touchmove", "keydown", "pointerdown"] as const) {
    window.addEventListener(type, (e) => {
      if (type === "pointerdown" && (e.target as Element).closest?.(".toc")) {
        return;
      }
      if (locked) {
        unlock();
      }
    }, { passive: true });
  }
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  window.addEventListener("hashchange", () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (byId.has(id)) {
      locked = true;
      activate(id);
    }
  });
  if (location.hash && byId.has(decodeURIComponent(location.hash.slice(1)))) {
    locked = true;
    activate(decodeURIComponent(location.hash.slice(1)));
  } else {
    update();
  }
}

const BACK_KEY = "crane.envBack";

interface Origin {
  href: string;
  title: string;
}

function isOrigin(value: unknown): value is Origin {
  return typeof value === "object" && value !== null && typeof (value as Origin).href === "string" && typeof (value as Origin).title === "string";
}

/**
 * Запоминает страницу, с которой читатель ушёл в справочник переменных (ссылка на имя или «В справочнике» в слое): справочник покажет «← Назад к …».
 * Сеть не нужна: заголовок берётся у текущей страницы до перехода. Закреплённая кликом ссылка (клик отменён скриптом подсказок) никуда не ведёт.
 */
function rememberEnvOrigin(): void {
  document.addEventListener("click", (event) => {
    const link = (event.target as Element).closest("a[data-env], .tip-actions a");
    const modified = event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0;
    const title = $("h1")?.textContent?.trim();
    if (!link || event.defaultPrevented || modified || !title) {
      return;
    }
    try {
      sessionStorage.setItem(BACK_KEY, JSON.stringify({ href: location.pathname + location.search, title }));
    } catch {
      /* хранилище недоступно: ссылки «Назад» не будет */
    }
  });
}

function readEnvOrigin(): Origin | undefined {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(BACK_KEY) ?? "null");
    sessionStorage.removeItem(BACK_KEY);
    return isOrigin(parsed) && parsed.href !== location.pathname + location.search ? parsed : undefined;
  } catch {
    return undefined;
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
  const origin = readEnvOrigin();
  if (!origin) {
    return;
  }
  const p = document.createElement("p");
  p.className = "env-back";
  const a = document.createElement("a");
  a.href = origin.href;
  a.textContent = t("env.back", { title: origin.title });
  // Возврат по истории возвращает и положение прокрутки; ссылка остаётся рабочей без неё (новая вкладка, нет предыдущей записи).
  a.addEventListener("click", (event) => {
    if (!event.ctrlKey && !event.metaKey && !event.shiftKey && history.length > 1 && document.referrer.endsWith(origin.href)) {
      event.preventDefault();
      history.back();
    }
  });
  p.append(a);
  table.closest("[data-table]")?.before(p);
}

ready(() => {
  rememberEnvOrigin();
  initCodeCopy();
  initMarkdownCopy();
  initNameCopy();
  initRegions();
  initToc();
  initEnvReference();
});
