const MARGIN = 16;
const GAP = 8;

/** Позиция слоя: снизу от триггера (по первой строке многострочного), при нехватке места — сверху; по горизонтали в полях 16 px. */
export function place(trigger: Element, tip: HTMLElement): void {
  const rect = trigger.getClientRects()[0] ?? trigger.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  const left = Math.max(MARGIN, Math.min(rect.left, vw - w - MARGIN));
  let top = rect.bottom + GAP;
  if (top + h > vh - MARGIN && rect.top - GAP - h >= MARGIN) {
    top = rect.top - GAP - h;
  }
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

/** Триггер ушёл из вьюпорта (или за край прокручиваемого pre) — слой надо закрыть. */
export function isGone(trigger: Element): boolean {
  const r = trigger.getBoundingClientRect();
  if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > document.documentElement.clientWidth) {
    return true;
  }
  const pre = trigger.closest("pre");
  if (pre) {
    const p = pre.getBoundingClientRect();
    return r.right < p.left || r.left > p.right;
  }
  return false;
}
