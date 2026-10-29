import { $, $$, readStore, ready, writeStore } from "./lib/dom";

const KEY = "crane.docs.client";
let uid = 0;

interface Group {
  root: HTMLElement;
  tabs: HTMLButtonElement[];
  panels: HTMLElement[];
}

const groups: Group[] = [];

function select(group: Group, index: number, focus: boolean): void {
  group.tabs.forEach((tab, i) => {
    const on = i === index;
    tab.setAttribute("aria-selected", String(on));
    tab.tabIndex = on ? 0 : -1;
    group.panels[i]!.hidden = !on;
  });
  const tab = group.tabs[index]!;
  if (focus) {
    tab.focus();
  }
  tab.scrollIntoView({ block: "nearest", inline: "nearest" });
}

/** Выбор клиента применяется ко всем группам страницы с тем же набором; позиция клика не прыгает. */
function selectKey(source: Group, key: string): void {
  const anchor = source.root;
  const before = anchor.getBoundingClientRect().top;
  for (const g of groups) {
    const i = g.panels.findIndex((p) => p.dataset.tab === key);
    if (i >= 0) {
      select(g, i, false);
    }
  }
  const delta = anchor.getBoundingClientRect().top - before;
  if (delta !== 0) {
    window.scrollBy(0, delta);
  }
  writeStore(KEY, key);
}

function build(root: HTMLElement): void {
  const panels = $$<HTMLElement>(":scope > .tab-panel", root);
  if (panels.length < 2) {
    return;
  }
  const id = ++uid;
  const list = document.createElement("div");
  list.className = "tablist";
  list.setAttribute("role", "tablist");
  list.setAttribute("aria-label", root.dataset.label ?? "");
  const tabs = panels.map((panel, i) => {
    const title = $(".tab-title", panel);
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "tab";
    tab.id = `tab-${id}-${i}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", `panel-${id}-${i}`);
    tab.textContent = title?.textContent ?? panel.dataset.tab ?? "";
    title?.remove();
    panel.id = `panel-${id}-${i}`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    list.append(tab);
    return tab;
  });
  root.prepend(list);
  const group: Group = { root, tabs, panels };
  groups.push(group);
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => selectKey(group, panels[i]!.dataset.tab ?? ""));
  });
  list.addEventListener("keydown", (event) => {
    const i = tabs.indexOf(document.activeElement as HTMLButtonElement);
    const last = tabs.length - 1;
    const keys: Record<string, number> = { ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last };
    const next = keys[event.key];
    if (i < 0 || next === undefined) {
      return;
    }
    event.preventDefault();
    select(group, next, true);
    selectKey(group, panels[next]!.dataset.tab ?? "");
    tabs[next]!.focus();
  });
  const saved = readStore(KEY);
  const start = Math.max(0, panels.findIndex((p) => p.dataset.tab === saved));
  select(group, start, false);
  root.dataset.ready = "";
}

ready(() => {
  for (const root of $$<HTMLElement>("[data-tabs]")) {
    build(root);
  }
});
