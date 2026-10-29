import { $, $$, ready } from "./lib/dom";
import { t } from "./lib/strings";
import { isGone, place } from "./tips/position";
import { initCodeGroups } from "./tips/envcode";
import { CLOSE_DELAY_MS, GROUP_TIMEOUT_MS, OPEN_DELAY_MS } from "./tips/timing";

type Mode = "hover" | "focus" | "pinned";

interface Open {
  trigger: HTMLElement;
  tip: HTMLElement;
  mode: Mode;
}

let current: Open | undefined;
let openTimer = 0;
let closeTimer = 0;
let suppressed: HTMLElement | undefined;
let lastClosedAt = -Infinity;
let lastPointer = "";
let frame = 0;
const groupOf = new Map<HTMLElement, number>();

const isEnv = (el: HTMLElement): boolean => el.matches(".env, .env-inline");
const isCite = (el: HTMLElement): boolean => el.matches(".cite");
const tipOf = (el: HTMLElement): HTMLElement | null => document.getElementById(el.dataset.tip ?? "");

function setActionsInert(tip: HTMLElement, inert: boolean): void {
  const actions = $("[data-env-actions]", tip);
  if (actions) {
    actions.inert = inert;
  }
}

function reposition(): void {
  if (!current) {
    return;
  }
  if (isGone(current.trigger)) {
    close();
    return;
  }
  place(current.trigger, current.tip);
}

function onScroll(): void {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(reposition);
}

function show(trigger: HTMLElement, mode: Mode, instant = false): void {
  window.clearTimeout(openTimer);
  window.clearTimeout(closeTimer);
  const tip = tipOf(trigger);
  if (!tip) {
    return;
  }
  if (current && current.tip !== tip) {
    close(true);
  }
  if (!current) {
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onScroll);
  }
  if (!tip.matches(":popover-open")) {
    tip.classList.toggle("no-anim", instant);
    tip.showPopover();
  }
  current = { trigger, tip, mode };
  if (isEnv(trigger)) {
    setActionsInert(tip, mode === "focus");
    const hint = $("[data-env-group]", tip);
    const size = groupOf.get(trigger) ?? 0;
    if (hint) {
      hint.hidden = size < 2;
      hint.textContent = size > 1 ? t("env.group") : "";
    }
    trigger.setAttribute("aria-expanded", String(mode === "pinned"));
  }
  trigger.classList.add("is-open");
  place(trigger, tip);
}

function close(instant = false): void {
  window.clearTimeout(openTimer);
  window.clearTimeout(closeTimer);
  if (!current) {
    return;
  }
  const { trigger, tip } = current;
  current = undefined;
  lastClosedAt = performance.now();
  tip.classList.toggle("no-anim", instant);
  if (tip.matches(":popover-open")) {
    tip.hidePopover();
  }
  trigger.classList.remove("is-open");
  if (isEnv(trigger)) {
    trigger.setAttribute("aria-expanded", "false");
  }
  window.removeEventListener("scroll", onScroll, true);
  window.removeEventListener("resize", onScroll);
}

function scheduleOpen(trigger: HTMLElement): void {
  window.clearTimeout(closeTimer);
  if (current?.tip === tipOf(trigger)) {
    return;
  }
  window.clearTimeout(openTimer);
  // Пока открыт слой соседнего триггера или он закрыт меньше GROUP_TIMEOUT_MS назад, переход мгновенный и без анимации входа.
  const grouped = current !== undefined || performance.now() - lastClosedAt < GROUP_TIMEOUT_MS;
  const delay = grouped ? 0 : OPEN_DELAY_MS;
  openTimer = window.setTimeout(() => show(trigger, "hover", delay === 0), delay);
}

function scheduleClose(): void {
  window.clearTimeout(openTimer);
  window.clearTimeout(closeTimer);
  if (current && current.mode !== "pinned") {
    closeTimer = window.setTimeout(() => close(), CLOSE_DELAY_MS);
  }
}

function pin(trigger: HTMLElement, focusAction: boolean): void {
  if (current?.trigger === trigger && current.mode === "pinned") {
    close();
    return;
  }
  show(trigger, "pinned", true);
  if (focusAction && current) {
    $<HTMLElement>("[data-env-actions] button", current.tip)?.focus();
  }
}

function bindTrigger(trigger: HTMLElement): void {
  const env = isEnv(trigger);
  const cite = isCite(trigger);
  const tip = tipOf(trigger);
  if (!tip) {
    return;
  }
  if (env || cite) {
    trigger.setAttribute("role", "button");
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", tip.id);
  }
  if (cite) {
    tip.addEventListener("toggle", (event) => {
      const open = (event as ToggleEvent).newState === "open";
      trigger.setAttribute("aria-expanded", String(open));
      if (open) {
        place(trigger, tip);
      }
    });
  }
  trigger.addEventListener("pointerdown", (event) => {
    lastPointer = event.pointerType;
  });
  trigger.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "touch") {
      return;
    }
    // Новое наведение — новое намерение: после Esc слой снова открывается, пока указатель не вошёл заново.
    if (suppressed === trigger) {
      suppressed = undefined;
    }
    scheduleOpen(trigger);
  });
  trigger.addEventListener("pointerleave", (event) => {
    if (suppressed === trigger) {
      suppressed = undefined;
    }
    if (event.pointerType !== "touch") {
      scheduleClose();
    }
  });
  tip.addEventListener("pointerenter", () => window.clearTimeout(closeTimer));
  tip.addEventListener("pointerleave", (event) => {
    if (event.pointerType !== "touch") {
      scheduleClose();
    }
  });
  trigger.addEventListener("focus", () => {
    // После Esc фокус возвращается на триггер без повторного показа слоя (WCAG 1.4.13).
    if (suppressed !== trigger && !cite && trigger.matches(":focus-visible")) {
      show(trigger, "focus", true);
    }
  });
  trigger.addEventListener("blur", () => {
    if (suppressed === trigger) {
      suppressed = undefined;
    }
    if (current?.mode === "focus" && current.trigger === trigger) {
      close(true);
    }
  });
  trigger.addEventListener("click", (event) => {
    const touch = lastPointer === "touch";
    const keyboard = event.detail === 0 && lastPointer === "";
    lastPointer = "";
    const modified = event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0;
    if (cite) {
      event.preventDefault();
      tip.togglePopover();
      return;
    }
    if (env) {
      if (modified) {
        return;
      }
      event.preventDefault();
      pin(trigger, keyboard);
      return;
    }
    // term и xref: первый тап открывает слой с явной ссылкой, второй — переход.
    if (touch && current?.trigger !== trigger) {
      event.preventDefault();
      show(trigger, "pinned", true);
    }
  });
  if (env || cite) {
    trigger.addEventListener("keydown", (event) => {
      if (event.key === " ") {
        event.preventDefault();
        trigger.click();
      }
    });
  }
}

function bindTip(tip: HTMLElement): void {
  tip.addEventListener("keydown", (event) => {
    if (!current || current.tip !== tip || current.mode !== "pinned") {
      return;
    }
    const actions = $$<HTMLElement>("button, a[href]", $("[data-env-actions]", tip) ?? tip);
    const first = actions[0];
    const last = actions[actions.length - 1];
    if (event.key === "Tab" && !event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      const trigger = current.trigger;
      close(true);
      focusAfter(trigger);
    } else if (event.key === "Tab" && event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      const trigger = current.trigger;
      close(true);
      trigger.focus();
    }
  });
}

/** Следующий фокусируемый элемент после триггера в порядке документа. */
function focusAfter(trigger: HTMLElement): void {
  const all = $$<HTMLElement>("a[href], button:not([disabled]), input, select, textarea, summary, [tabindex]:not([tabindex='-1'])").filter(
    (el) => !el.closest("[popover]") && !el.closest("[inert]"),
  );
  const next = all.find((el) => trigger.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING && !trigger.contains(el));
  next?.focus();
}

ready(() => {
  const triggers = $$("[data-tip]");
  const groups = initCodeGroups();
  for (const group of groups) {
    for (const el of group) {
      groupOf.set(el, group.length);
    }
  }
  for (const trigger of triggers) {
    bindTrigger(trigger);
  }
  for (const tip of $$(".tip")) {
    bindTip(tip);
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && current && !isCite(current.trigger)) {
      const { trigger, tip } = current;
      const inside = tip.contains(document.activeElement);
      suppressed = trigger;
      close(true);
      if (inside) {
        trigger.focus();
      }
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (current && current.mode !== "hover" && !current.tip.contains(event.target as Node) && !current.trigger.contains(event.target as Node)) {
      close();
    }
  });
});
