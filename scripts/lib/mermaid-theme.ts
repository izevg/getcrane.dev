import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./content.ts";

export type Theme = "light" | "dark";

/** Пары --имя: #hex из снимка токенов; блок тёмной темы переопределяет светлую. */
function tokens(): Record<Theme, Record<string, string>> {
  const css = readFileSync(join(ROOT, "assets", "css", "tokens", "console.css"), "utf8");
  const darkAt = css.indexOf(':root[data-theme="dark"]');
  const mediaAt = css.indexOf("@media (prefers-color-scheme: dark)");
  const pick = (text: string): Record<string, string> =>
    Object.fromEntries([...text.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)].map((m) => [m[1] ?? "", m[2] ?? ""]));
  const light = pick(css.slice(0, mediaAt));
  const dark = { ...light, ...pick(css.slice(darkAt)) };
  return { light, dark };
}

/** Переменные темы mermaid в hex токенов консоли (mermaid сам считает производные цвета и не понимает var()). */
export function themeConfig(theme: Theme): Record<string, unknown> {
  const t = tokens()[theme];
  const c = (name: string): string => {
    const v = t[name];
    if (!v) {
      throw new Error(`mermaid-theme: нет токена ${name} в снимке консоли`);
    }
    return v;
  };
  return {
    theme: "base",
    themeVariables: {
      background: c("--background"),
      fontFamily: '"Onest Variable", ui-sans-serif, system-ui, sans-serif',
      fontSize: "14px",
      primaryColor: c("--card"),
      primaryTextColor: c("--foreground"),
      primaryBorderColor: c("--input"),
      secondaryColor: c("--brand-container"),
      secondaryTextColor: c("--foreground"),
      secondaryBorderColor: c("--brand"),
      tertiaryColor: c("--muted"),
      tertiaryTextColor: c("--foreground"),
      tertiaryBorderColor: c("--border"),
      lineColor: c("--muted-foreground"),
      textColor: c("--foreground"),
      mainBkg: c("--card"),
      nodeBorder: c("--input"),
      nodeTextColor: c("--foreground"),
      clusterBkg: c("--muted"),
      clusterBorder: c("--border"),
      titleColor: c("--foreground"),
      edgeLabelBackground: c("--background"),
      noteBkgColor: c("--warning-bg"),
      noteTextColor: c("--foreground"),
      noteBorderColor: c("--warning-strong"),
      labelBackground: c("--background"),
      altBackground: c("--muted"),
    },
    flowchart: { htmlLabels: true, curve: "basis" },
  };
}
