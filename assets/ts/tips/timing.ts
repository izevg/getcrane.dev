/** Тайминги подсказок. Единственный источник: CSS получает значения через переменные, которые выставляет applyTiming(). */
export const OPEN_DELAY_MS = 120;
export const CLOSE_DELAY_MS = 150;
/** Появление: 150 мс ease-out; закрытие быстрее появления. */
export const ENTER_MS = 150;
export const EXIT_MS = 90;

export function applyTiming(): void {
  const style = document.documentElement.style;
  style.setProperty("--tip-enter", `${ENTER_MS}ms`);
  style.setProperty("--tip-exit", `${EXIT_MS}ms`);
}
