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
