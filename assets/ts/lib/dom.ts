/** Короткие помощники для работы с DOM. */
export function $<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(selector);
}

export function $$<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

/** Выполнить после разбора документа (модули отложены, но на случай раннего вызова). */
export function ready(fn: () => void): void {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fn, { once: true });
  } else {
    fn();
  }
}

let sprite: string | undefined;

/** Адрес символа Lucide в общем спрайте сайта (адрес с отпечатком лежит в meta crane-sprite). */
export function iconHref(name: string): string {
  sprite ??= document.querySelector<HTMLMetaElement>('meta[name="crane-sprite"]')?.content ?? "";
  return `${sprite}#i-${name}`;
}

/** Иконка Lucide из спрайта. */
export function icon(name: string, extra = ""): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", `i i-16 ${extra}`.trim());
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.dataset.icon = name;
  const use = document.createElementNS(ns, "use");
  use.setAttribute("href", iconHref(name));
  svg.append(use);
  return svg;
}

/** Чтение и запись localStorage не должны ронять страницу (приватный режим, заблокированные данные). */
export function readStore(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStore(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* хранилище недоступно: настройка живёт до конца сессии */
  }
}
