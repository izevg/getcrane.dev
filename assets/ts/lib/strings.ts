/** Строки интерфейса из каталога языка: JSON в #ui-strings, плейсхолдеры вида {name}. */
let table: Record<string, string> | undefined;

function load(): Record<string, string> {
  if (table) {
    return table;
  }
  table = {};
  const node = document.getElementById("ui-strings");
  if (node?.textContent) {
    try {
      table = JSON.parse(node.textContent) as Record<string, string>;
    } catch {
      table = {};
    }
  }
  return table;
}

export function t(key: string, vars: Record<string, string | number> = {}): string {
  let text = load()[key] ?? key;
  for (const [name, value] of Object.entries(vars)) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}

/** Строка во множественной форме по правилам языка страницы (Intl.PluralRules): ключи <base>.one|few|many|other, запасной — other. */
export function plural(base: string, n: number, vars: Record<string, string | number> = {}): string {
  const category = new Intl.PluralRules(document.documentElement.lang || "en").select(n);
  const key = `${base}.${category}`;
  const form = load()[key] === undefined ? `${base}.other` : key;
  return t(form, { n: new Intl.NumberFormat(document.documentElement.lang || "en").format(n), ...vars });
}
