import { $, $$, iconHref, readStore, writeStore } from "./lib/dom";
import { t } from "./lib/strings";

const KEY = "crane.colorScheme";
type Mode = "light" | "dark" | "system";
const MODES: readonly Mode[] = ["light", "dark", "system"];
const ICONS: Record<Mode, string> = { light: "sun", dark: "moon", system: "monitor" };
const dark = matchMedia("(prefers-color-scheme: dark)");

function isMode(value: string | null): value is Mode {
  return MODES.includes(value as Mode);
}

function currentMode(): Mode {
  const stored = readStore(KEY);
  return isMode(stored) ? stored : "system";
}

/** Смена темы мгновенная: на один кадр выключаем транзиции. */
function apply(mode: Mode): void {
  const scheme = mode === "dark" || (mode === "system" && dark.matches) ? "dark" : "light";
  const style = document.createElement("style");
  style.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.append(style);
  document.documentElement.dataset.theme = scheme;
  document.documentElement.style.colorScheme = scheme;
  void getComputedStyle(document.body).opacity;
  requestAnimationFrame(() => style.remove());
}

function sync(mode: Mode): void {
  const button = $("[data-theme-btn]");
  button?.setAttribute("aria-label", t("theme.current", { mode: t(`theme.${mode}`) }));
  button?.querySelector("use")?.setAttribute("href", iconHref(ICONS[mode]));
  for (const input of $$<HTMLInputElement>('input[name="crane-theme"]')) {
    input.checked = input.value === mode;
  }
}

export function initTheme(): void {
  sync(currentMode());
  for (const input of $$<HTMLInputElement>('input[name="crane-theme"]')) {
    input.addEventListener("change", () => {
      const mode = input.value as Mode;
      writeStore(KEY, mode);
      apply(mode);
      sync(mode);
    });
  }
  dark.addEventListener("change", () => {
    if (currentMode() === "system") {
      apply("system");
    }
  });
  window.addEventListener("storage", (event) => {
    if (event.key === KEY) {
      apply(currentMode());
      sync(currentMode());
    }
  });
}
