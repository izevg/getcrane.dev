import { $$, icon, ready } from "./lib/dom";
import { t } from "./lib/strings";

/**
 * Лайтбокс для диаграмм и крупных снимков: клик или Enter/Space по рамке открывает нативный <dialog> (showModal).
 * Внутри: колесо — зум к курсору, щипок — зум, перетаскивание — сдвиг, клавиши + − 0 и стрелки, кнопки «+», «−», «По размеру».
 * Без внешних библиотек. Диалог создаётся при первом открытии вне основного текста (Pagefind его не видит: индекс строится по статике).
 */
const MIN_TEXT_PX = 11;
const BASE_TEXT_PX = 14;
const STEP = 1.25;
const MAX_ZOOM = 8;
const PAN_STEP = 48;
const TRIGGERS = ".diagram-frame, .window:has(picture)";

interface View {
  x: number;
  y: number;
  k: number;
}

let dialog: HTMLDialogElement | undefined;

/** Видимый вариант темы: среди светлого и тёмного берётся тот, у которого есть геометрия (не display:none у предка). */
function visibleMedia(frame: HTMLElement): HTMLElement | null {
  const candidates = $$<HTMLElement>(".diagram-svg svg, picture", frame);
  return candidates.find((n) => n.getClientRects().length > 0) ?? null;
}

function captionOf(frame: HTMLElement): string {
  const fig = frame.closest("figure");
  return fig?.querySelector("figcaption")?.textContent?.trim() ?? frame.querySelector("img")?.alt ?? "";
}

function naturalSize(node: Element): { w: number; h: number } {
  if (node instanceof SVGSVGElement) {
    const vb = node.viewBox.baseVal;
    return { w: vb.width || node.clientWidth, h: vb.height || node.clientHeight };
  }
  const img = node.querySelector("img");
  return { w: img?.naturalWidth || img?.width || 1440, h: img?.naturalHeight || img?.height || 900 };
}

function button(label: string, glyph: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn btn-secondary btn-icon btn-sm";
  b.setAttribute("aria-label", label);
  b.title = label;
  b.append(icon(glyph));
  b.addEventListener("click", onClick);
  return b;
}

function buildDialog(): HTMLDialogElement {
  const d = document.createElement("dialog");
  d.className = "zoom-dialog";
  d.setAttribute("data-pagefind-ignore", "");
  document.body.append(d);
  return d;
}

function open(frame: HTMLElement): void {
  const media = visibleMedia(frame);
  if (!media) {
    return;
  }
  dialog ??= buildDialog();
  const d = dialog;
  const caption = captionOf(frame);
  d.replaceChildren();
  d.setAttribute("aria-label", caption);
  const { w, h } = naturalSize(media);

  const stage = document.createElement("div");
  stage.className = "zoom-stage";
  stage.tabIndex = 0;
  stage.setAttribute("role", "group");
  stage.setAttribute("aria-label", caption);
  const canvas = document.createElement("div");
  canvas.className = "zoom-canvas";
  canvas.style.inlineSize = `${w}px`;
  canvas.style.blockSize = `${h}px`;
  const clone = media.cloneNode(true) as HTMLElement;
  // id у SVG mermaid оставлен: на нём держатся стили внутри файла (#dg-…-light { … }); пока диалог открыт, id повторяется — стили от этого не страдают.
  if (clone instanceof SVGSVGElement) {
    clone.removeAttribute("style");
    clone.setAttribute("width", String(w));
    clone.setAttribute("height", String(h));
    clone.setAttribute("aria-hidden", "true");
  } else {
    clone.className = "";
    const img = clone.querySelector("img");
    if (img) {
      img.removeAttribute("loading");
      img.removeAttribute("width");
      img.removeAttribute("height");
      img.style.inlineSize = "100%";
      img.style.blockSize = "100%";
      img.draggable = false;
    }
  }
  canvas.append(clone);
  stage.append(canvas);

  let view: View = { x: 0, y: 0, k: 1 };
  let fitK = 1;
  const apply = (animate = false): void => {
    canvas.classList.toggle("is-anim", animate && !matchMedia("(prefers-reduced-motion: reduce)").matches);
    canvas.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`;
  };
  const fit = (animate = false): void => {
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    fitK = Math.min(sw / w, sh / h);
    view = { k: fitK, x: (sw - w * fitK) / 2, y: (sh - h * fitK) / 2 };
    apply(animate);
  };
  const zoomAt = (factor: number, cx: number, cy: number, animate = false): void => {
    const k = Math.min(Math.max(view.k * factor, fitK * 0.5), fitK * MAX_ZOOM);
    const ratio = k / view.k;
    view = { k, x: cx - (cx - view.x) * ratio, y: cy - (cy - view.y) * ratio };
    apply(animate);
  };
  const center = (): [number, number] => [stage.clientWidth / 2, stage.clientHeight / 2];
  const pan = (dx: number, dy: number): void => {
    view = { ...view, x: view.x + dx, y: view.y + dy };
    apply();
  };

  const bar = document.createElement("div");
  bar.className = "zoom-bar";
  const title = document.createElement("p");
  title.className = "zoom-title";
  title.textContent = caption;
  const tools = document.createElement("div");
  tools.className = "zoom-tools";
  tools.append(
    button(t("zoom.in"), "plus", () => zoomAt(STEP, ...center(), true)),
    button(t("zoom.out"), "minus", () => zoomAt(1 / STEP, ...center(), true)),
    button(t("zoom.fit"), "scan", () => fit(true)),
    button(t("zoom.close"), "x", () => d.close()),
  );
  bar.append(title, tools);
  d.append(bar, stage);

  // Колесо: зум к курсору. Страница под модальным окном не прокручивается.
  stage.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    },
    { passive: false },
  );
  // Указатели: один — сдвиг, два — щипок.
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch = 0;
  stage.addEventListener("pointerdown", (e) => {
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch = pointers.size === 2 ? distance() : 0;
    stage.classList.add("is-drag");
  });
  const distance = (): number => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  stage.addEventListener("pointermove", (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) {
      return;
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const now = distance();
      const [a, b] = [...pointers.values()];
      const r = stage.getBoundingClientRect();
      if (pinch && now && a && b) {
        zoomAt(now / pinch, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      }
      pinch = now;
    } else {
      pan(e.clientX - prev.x, e.clientY - prev.y);
    }
  });
  const release = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
    pinch = 0;
    if (!pointers.size) {
      stage.classList.remove("is-drag");
    }
  };
  stage.addEventListener("pointerup", release);
  stage.addEventListener("pointercancel", release);
  stage.addEventListener("dblclick", () => fit(true));
  d.addEventListener("keydown", (e) => {
    const map: Record<string, () => void> = {
      "+": () => zoomAt(STEP, ...center(), true),
      "=": () => zoomAt(STEP, ...center(), true),
      "-": () => zoomAt(1 / STEP, ...center(), true),
      "0": () => fit(true),
      ArrowLeft: () => pan(PAN_STEP, 0),
      ArrowRight: () => pan(-PAN_STEP, 0),
      ArrowUp: () => pan(0, PAN_STEP),
      ArrowDown: () => pan(0, -PAN_STEP),
    };
    const action = map[e.key];
    if (action && !(e.target instanceof HTMLButtonElement && e.key.startsWith("Arrow"))) {
      e.preventDefault();
      action();
    }
  });
  // Клик по фону (сам dialog за пределами его рамки) закрывает.
  d.onclick = (e): void => {
    const r = d.getBoundingClientRect();
    if (e.target === d && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) {
      d.close();
    }
  };
  d.onclose = (): void => {
    d.replaceChildren();
    frame.focus({ preventScroll: true });
  };
  d.showModal();
  stage.focus();
  fit();
  new ResizeObserver(() => {
    if (d.open && Math.abs(view.k - fitK) < 1e-6) {
      fit();
    }
  }).observe(stage);
}

/** Мелкий текст диаграммы: при вписывании в колонку эквивалент 14 px падает ниже порога — рамка получает подсказку «Увеличить». */
function watchSmallText(frame: HTMLElement): void {
  const svgs = $$<SVGSVGElement>(".diagram-svg svg", frame);
  if (!svgs.length) {
    return;
  }
  const check = (): void => {
    const svg = svgs.find((s) => s.getBoundingClientRect().width > 0);
    const vb = svg?.viewBox.baseVal.width;
    if (svg && vb) {
      const px = (BASE_TEXT_PX * svg.getBoundingClientRect().width) / vb;
      frame.toggleAttribute("data-small", px < MIN_TEXT_PX);
    }
  };
  new ResizeObserver(check).observe(frame);
  check();
}

ready(() => {
  for (const frame of $$<HTMLElement>(TRIGGERS)) {
    const label = captionOf(frame);
    frame.tabIndex = 0;
    frame.setAttribute("role", "button");
    frame.setAttribute("aria-haspopup", "dialog");
    frame.setAttribute("aria-label", `${t("zoom.open")}: ${label}`);
    frame.dataset.zoom = "";
    const hint = document.createElement("span");
    hint.className = "zoom-hint";
    hint.setAttribute("aria-hidden", "true");
    hint.append(icon("maximize-2"), document.createTextNode(t("zoom.open")));
    frame.append(hint);
    if (frame.matches(".diagram-frame")) {
      const note = document.createElement("p");
      note.className = "zoom-note";
      note.textContent = t("zoom.small");
      frame.after(note);
      watchSmallText(frame);
    }
    frame.addEventListener("click", () => open(frame));
    frame.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open(frame);
      }
    });
  }
});
