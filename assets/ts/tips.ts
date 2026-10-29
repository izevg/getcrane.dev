import { $, $$, ready } from "./lib/dom";
import { t } from "./lib/strings";
import { isGone, place } from "./tips/position";
import { initCodeGroups } from "./tips/envcode";
import { CLOSE_DELAY_MS, GROUP_TIMEOUT_MS, OPEN_DELAY_MS } from "./tips/timing";

/** Состояние открытого слоя: от наведения, от фокуса с клавиатуры или закреплённый кликом. */
type State = "hover" | "focus" | "pinned";

/** Поведение триггера задаёт разметка: data-tip-mode (tips/layer.html и шаблоны триггеров). Каждому режиму — свои правила, таблица одна. */
type TipMode = "hover" | "pin" | "toggle";

interface ModeRules {
  /** Триггер ведёт себя как кнопка: role, aria-haspopup, aria-expanded, Пробел. */
  button: boolean;
  /** Фокус с клавиатуры открывает слой. */
  focusShows: boolean;
  /** Esc закрывает слой сам скрипт (у toggle слой popover="auto", Esc закрывает браузер). */
  escCloses: boolean;
}

const MODES: Record<TipMode, ModeRules> = {
  // term, xref, чипы версий: наведение и фокус показывают, первый тап на касании открывает слой с явной ссылкой.
  hover: { button: false, focusShows: true, escCloses: true },
  // env: ещё и клик закрепляет слой с кнопками.
  pin: { button: true, focusShows: true, escCloses: true },
  // источники: клик открывает и закрывает popover="auto".
  toggle: { button: true, focusShows: false, escCloses: false },
};

interface Open {
  trigger: HTMLElement;
  tip: HTMLElement;
  state: State;
}

let current: Open | undefined;
let openTimer = 0;
let closeTimer = 0;
let suppressed: HTMLElement | undefined;
let lastClosedAt = -Infinity;
let lastPointer = "";
let frame = 0;
const groupOf = new Map<HTMLElement, number>();

const modeOf = (el: HTMLElement): TipMode => {
  const mode = el.dataset.tipMode;
  return mode === "pin" || mode === "toggle" ? mode : "hover";
};
const rulesOf = (el: HTMLElement): ModeRules => MODES[modeOf(el)];
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

function show(trigger: HTMLElement, state: State, instant = false): void {
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
  current = { trigger, tip, state };
  // Кнопки слоя недоступны, пока он открыт только фокусом: Tab идёт дальше по странице, а не в слой (закрепление — Enter).
  setActionsInert(tip, state === "focus");
  const hint = $("[data-env-group]", tip);
  if (hint) {
    const size = groupOf.get(trigger) ?? 0;
    hint.hidden = size < 2;
    hint.textContent = size > 1 ? t("env.group") : "";
  }
  if (rulesOf(trigger).button) {
    trigger.setAttribute("aria-expanded", String(state === "pinned"));
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
  if (rulesOf(trigger).button) {
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
  if (current && current.state !== "pinned") {
    closeTimer = window.setTimeout(() => close(), CLOSE_DELAY_MS);
  }
}

function pin(trigger: HTMLElement, focusAction: boolean): void {
  if (current?.trigger === trigger && current.state === "pinned") {
    close();
    return;
  }
  show(trigger, "pinned", true);
  if (focusAction && current) {
    $<HTMLElement>("[data-env-actions] button", current.tip)?.focus();
  }
}

function bindTrigger(trigger: HTMLElement): void {
  const mode = modeOf(trigger);
  const rules = MODES[mode];
  const tip = tipOf(trigger);
  if (!tip) {
    return;
  }
  if (rules.button) {
    trigger.setAttribute("role", "button");
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", tip.id);
  }
  if (mode === "toggle") {
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
    if (suppressed !== trigger && rules.focusShows && trigger.matches(":focus-visible")) {
      show(trigger, "focus", true);
    }
  });
  trigger.addEventListener("blur", () => {
    if (suppressed === trigger) {
      suppressed = undefined;
    }
    if (current?.state === "focus" && current.trigger === trigger) {
      close(true);
    }
  });
  trigger.addEventListener("click", (event) => {
    const touch = lastPointer === "touch";
    const keyboard = event.detail === 0 && lastPointer === "";
    lastPointer = "";
    const modified = event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0;
    if (mode === "toggle") {
      event.preventDefault();
      tip.togglePopover();
      return;
    }
    if (mode === "pin") {
      if (modified) {
        return;
      }
      event.preventDefault();
      pin(trigger, keyboard);
      return;
    }
    // hover (term, xref, чипы): первый тап открывает слой с явной ссылкой, второй — переход.
    if (touch && current?.trigger !== trigger) {
      event.preventDefault();
      show(trigger, "pinned", true);
    }
  });
  if (rules.button) {
    trigger.addEventListener("keydown", (event) => {
      if (event.key === " ") {
        event.preventDefault();
        trigger.click();
      }
    });
  }
  if (mode === "toggle") {
    bindToggleFocus(trigger, tip);
  }
}

/**
 * Слой источника лежит в конце страницы, а не рядом с триггером, поэтому порядок Tab ведём вручную: из триггера в слой, из конца слоя — к следующему
 * элементу после триггера, из начала — обратно на триггер. Без этого ссылки слоя были бы недостижимы с клавиатуры (WCAG 2.1.1).
 */
function bindToggleFocus(trigger: HTMLElement, tip: HTMLElement): void {
  const items = (): HTMLElement[] => $$<HTMLElement>("a[href]", tip);
  trigger.addEventListener("keydown", (event) => {
    const first = items()[0];
    if (event.key === "Tab" && !event.shiftKey && tip.matches(":popover-open") && first) {
      event.preventDefault();
      first.focus();
    }
  });
  tip.addEventListener("keydown", (event) => {
    const list = items();
    if (event.key !== "Tab" || !tip.matches(":popover-open")) {
      return;
    }
    if (!event.shiftKey && document.activeElement === list[list.length - 1]) {
      event.preventDefault();
      tip.hidePopover();
      focusAfter(trigger);
    } else if (event.shiftKey && document.activeElement === list[0]) {
      event.preventDefault();
      trigger.focus();
    }
  });
}

function bindTip(tip: HTMLElement): void {
  tip.addEventListener("keydown", (event) => {
    if (!current || current.tip !== tip || current.state !== "pinned") {
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

/**
 * Переход по якорю на сам триггер (например, из «Где упоминается») переносит на него фокус браузера. Это не намерение читателя открыть слой:
 * подсказка закрыла бы оглавление, куда он пришёл. Такой триггер считается подавленным до ухода фокуса (blur) или нового наведения.
 */
function suppressFragmentFocus(): void {
  const id = decodeURIComponent(location.hash.slice(1));
  const target = id ? document.getElementById(id) : null;
  if (target?.dataset.tip) {
    suppressed = target;
  }
}

ready(() => {
  suppressFragmentFocus();
  window.addEventListener("hashchange", suppressFragmentFocus);
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
    if (event.key === "Escape" && current && rulesOf(current.trigger).escCloses) {
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
    if (current && current.state !== "hover" && !current.tip.contains(event.target as Node) && !current.trigger.contains(event.target as Node)) {
      close();
    }
  });
});
