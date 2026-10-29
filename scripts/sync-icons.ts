// Иконки Lucide: assets/icons/svg/<имя>.svg (дословные файлы пакета), LICENSE и manifest.json.
//   node scripts/sync-icons.ts --source <каталог распакованного пакета lucide-static> [--integrity <sha512-…>]   записать
//   node scripts/sync-icons.ts --check                                                                          сверить репозиторий
// Пакет скачивается один раз вручную: `npm pack lucide-static@<версия>` во временную папку вне репозитория
// и `tar -xzf … package/icons package/LICENSE package/package.json`. Список иконок ведётся в manifest.json (поле icons).
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ROOT } from "./lib/content.ts";

export const ICONS_DIR = join(ROOT, "assets", "icons");
const SVG_DIR = join(ICONS_DIR, "svg");
const MANIFEST = join(ICONS_DIR, "manifest.json");

export interface IconManifest {
  package: string;
  version: string;
  integrity: string;
  license: string;
  source: string;
  icons: string[];
}

export function readManifest(): IconManifest {
  return JSON.parse(readFileSync(MANIFEST, "utf8")) as IconManifest;
}

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function check(): number {
  const manifest = readManifest();
  let errors = 0;
  const fail = (message: string): void => {
    process.stderr.write(`icons: ${message}\n`);
    errors += 1;
  };
  const listed = new Set(manifest.icons);
  const files = new Set(readdirSync(SVG_DIR).filter((f) => f.endsWith(".svg")).map((f) => f.slice(0, -4)));
  for (const name of listed) {
    if (!files.has(name)) {
      fail(`иконки ${name} нет в assets/icons/svg`);
    } else if (!readFileSync(join(SVG_DIR, `${name}.svg`), "utf8").includes(`lucide-static v${manifest.version}`)) {
      fail(`${name}.svg не из lucide-static ${manifest.version}`);
    }
  }
  for (const name of files) {
    if (!listed.has(name)) {
      fail(`лишний файл assets/icons/svg/${name}.svg: его нет в manifest.json`);
    }
  }
  if (!existsSync(join(ICONS_DIR, "LICENSE"))) {
    fail("нет assets/icons/LICENSE");
  }
  if (!/^sha512-/.test(manifest.integrity)) {
    fail("в manifest.json нет integrity архива пакета");
  }
  return errors;
}

function write(): void {
  const source = resolve(flag("--source") ?? "");
  const pkg = JSON.parse(readFileSync(join(source, "package.json"), "utf8")) as { name: string; version: string; license: string };
  const manifest = readManifest();
  mkdirSync(SVG_DIR, { recursive: true });
  for (const f of readdirSync(SVG_DIR)) {
    rmSync(join(SVG_DIR, f));
  }
  for (const name of manifest.icons) {
    const from = join(source, "icons", `${name}.svg`);
    if (!existsSync(from)) {
      throw new Error(`в пакете нет иконки ${name}`);
    }
    copyFileSync(from, join(SVG_DIR, `${name}.svg`));
  }
  copyFileSync(join(source, "LICENSE"), join(ICONS_DIR, "LICENSE"));
  const next: IconManifest = {
    ...manifest,
    package: pkg.name,
    version: pkg.version,
    license: pkg.license,
    integrity: flag("--integrity") ?? manifest.integrity,
    icons: [...new Set(manifest.icons)].sort(),
  };
  writeFileSync(MANIFEST, `${JSON.stringify(next, null, 2)}\n`);
  process.stdout.write(`icons: ${next.icons.length} файлов из ${pkg.name}@${pkg.version}\n`);
}

if (import.meta.main) {
  if (process.argv.includes("--check")) {
    process.exit(check() ? 1 : 0);
  }
  write();
  process.exit(check() ? 1 : 0);
}
