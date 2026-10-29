import { $, $$, ready } from "./lib/dom";

/** Один проход точки «пакет» по схеме: 2 с, ease-in-out консоли; галочки узлов включаются в момент прохода. Без JS и при reduced-motion — финальное состояние. */
const DURATION_MS = 2000;
const EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";

function run(root: HTMLElement): void {
  const line = $(".pkg-line", root);
  const dot = $(".pkg-dot", root);
  const nodes = $$<HTMLElement>(".pkg-node", root);
  if (!line || !dot || nodes.length < 2) {
    return;
  }
  const horizontal = getComputedStyle(root.querySelector(".pkg-path") as Element).display === "grid";
  const box = line.getBoundingClientRect();
  const axis = (r: DOMRect): number => (horizontal ? r.left + r.width / 2 : r.top + r.height / 2);
  const length = horizontal ? box.width : box.height;
  const start = horizontal ? box.left : box.top;
  const marks = nodes.map((n) => (axis(n.getBoundingClientRect()) - start) / length);
  root.dataset.anim = "run";
  const to = horizontal ? `translateX(${length}px)` : `translateY(${length}px)`;
  const animation = dot.animate([{ transform: "translate(0, 0)" }, { transform: to }], { duration: DURATION_MS, easing: EASE_IN_OUT, fill: "forwards" });
  const tick = (): void => {
    const progress = Number(animation.effect?.getComputedTiming().progress ?? 0);
    nodes.forEach((n, i) => n.classList.toggle("is-passed", progress >= (marks[i] ?? 1) - 0.02));
    if (animation.playState === "running") {
      requestAnimationFrame(tick);
    }
  };
  requestAnimationFrame(tick);
  void animation.finished.then(() => {
    for (const n of nodes) {
      n.classList.add("is-passed");
    }
    root.dataset.anim = "done";
  });
}

ready(() => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  const roots = $$<HTMLElement>("[data-pkg]");
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        observer.unobserve(entry.target);
        run(entry.target as HTMLElement);
      }
    }
  });
  for (const root of roots) {
    observer.observe(root);
  }
});
