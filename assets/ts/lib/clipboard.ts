import { t } from "./strings";

const FEEDBACK_MS = 2000;
const timers = new WeakMap<HTMLElement, number>();

/** Общая live-область страницы (одна на страницу, aria-live=polite). */
export function announce(message: string): void {
  const live = document.getElementById("live");
  if (!live) {
    return;
  }
  live.textContent = "";
  requestAnimationFrame(() => {
    live.textContent = message;
  });
}

export async function writeText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Копирует содержимое адреса на том же origin. Запись начинается синхронно в обработчике клика
 * (ClipboardItem с Promise): Safari теряет активацию пользователя после await fetch.
 */
export function copyFetched(url: string): Promise<boolean> {
  const load = fetch(url).then((r) => {
    if (!r.ok) {
      throw new Error(String(r.status));
    }
    return r.text();
  });
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    const blob = load.then((text) => new Blob([text], { type: "text/plain" }));
    return navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]).then(
      () => true,
      () => false,
    );
  }
  return load.then(writeText, () => false);
}

/** Состояние кнопки после копирования: «Скопировано» на 2 с, объявление в live-области, при ошибке — сообщение. */
export function feedback(button: HTMLElement, ok: boolean, okText: string, onError?: () => void): void {
  const label = button.querySelector<HTMLElement>(".copy-label, span");
  const original = button.dataset.label ?? label?.textContent ?? button.getAttribute("aria-label") ?? "";
  button.dataset.label = original;
  window.clearTimeout(timers.get(button));
  const message = ok ? okText : t("copy.error");
  button.dataset.state = ok ? "copied" : "error";
  if (label) {
    label.textContent = ok ? okText : message;
  } else {
    button.setAttribute("aria-label", message);
  }
  announce(message);
  if (!ok) {
    onError?.();
  }
  timers.set(
    button,
    window.setTimeout(() => {
      delete button.dataset.state;
      if (label) {
        label.textContent = original;
      } else {
        button.setAttribute("aria-label", original);
      }
    }, FEEDBACK_MS),
  );
}
