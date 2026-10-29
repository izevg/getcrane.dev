import { $$ } from "../lib/dom";

/** Имена в блоке кода — одна группа с roving tabindex: ←/→ соседняя, Home/End крайние, один таб-стоп на блок. */
export function initCodeGroups(): HTMLElement[][] {
  const result: HTMLElement[][] = [];
  for (const pre of $$("pre")) {
    const items = $$<HTMLElement>("a.env", pre);
    if (!items.length) {
      continue;
    }
    result.push(items);
    items.forEach((el, i) => {
      el.tabIndex = i === 0 ? 0 : -1;
      el.addEventListener("focus", () => {
        for (const other of items) {
          other.tabIndex = other === el ? 0 : -1;
        }
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
      });
      el.addEventListener("keydown", (event) => {
        const last = items.length - 1;
        const map: Record<string, number> = { ArrowRight: Math.min(i + 1, last), ArrowLeft: Math.max(i - 1, 0), Home: 0, End: last };
        const next = map[event.key];
        if (next !== undefined) {
          event.preventDefault();
          items[next]?.focus();
        }
      });
    });
  }
  return result;
}
