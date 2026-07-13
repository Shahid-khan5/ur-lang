// npm package type resolution: finds a package's own TypeScript declarations
// in node_modules (types/typings/exports fields, @types fallback) and returns
// them as an UrLang module surface. A subset of tsc's resolution — anything
// unresolvable returns null and imports degrade to koi.
import * as fs from "node:fs";
import * as path from "node:path";
import { loadDtsExports } from "./dts.js";
import type { ModuleExports } from "./checker.js";

function parseSpecifier(specifier: string): { pkg: string; subpath: string } | null {
  if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("node:")) return null;
  const parts = specifier.split("/");
  const pkg = specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
  const subpath = specifier.slice(pkg.length).replace(/^\//, "");
  return { pkg, subpath };
}

function findPackageDir(pkg: string, importerPath: string): string | null {
  let dir = path.dirname(path.resolve(importerPath));
  for (;;) {
    const candidate = path.join(dir, "node_modules", ...pkg.split("/"));
    if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Extracts a types path from an `exports` entry (string or conditions object). */
function typesFromExportsEntry(entry: unknown): string | null {
  if (typeof entry === "string") {
    return entry.endsWith(".d.ts") ? entry : null;
  }
  if (entry !== null && typeof entry === "object") {
    const record = entry as Record<string, unknown>;
    for (const key of ["types", "import", "default"]) {
      const found = typesFromExportsEntry(record[key]);
      if (found !== null) return found;
    }
  }
  return null;
}

function findTypesFile(pkgDir: string, subpath: string): string | null {
  let pkgJson: Record<string, unknown>;
  try {
    pkgJson = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
  const exportsField = pkgJson.exports as Record<string, unknown> | undefined;
  const key = subpath === "" ? "." : `./${subpath}`;
  if (exportsField !== undefined && typeof exportsField === "object") {
    const fromExports = typesFromExportsEntry(exportsField[key]);
    if (fromExports !== null) {
      const p = path.join(pkgDir, fromExports);
      if (fs.existsSync(p)) return p;
    }
  }
  const candidates: string[] = [];
  if (subpath === "") {
    for (const field of ["types", "typings"]) {
      const v = pkgJson[field];
      if (typeof v === "string") candidates.push(v);
    }
    candidates.push("index.d.ts");
    const main = pkgJson.main;
    if (typeof main === "string") candidates.push(main.replace(/\.(c|m)?js$/, ".d.ts"));
  } else {
    candidates.push(`${subpath}.d.ts`, `${subpath}/index.d.ts`, `dist/${subpath}.d.ts`, `types/${subpath}.d.ts`);
  }
  for (const c of candidates) {
    const p = path.join(pkgDir, c);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Resolves an npm specifier to its package's declared types, or null.
 * Checks the package itself first, then DefinitelyTyped (@types/...).
 */
export function resolveNpmTypes(specifier: string, importerPath: string): ModuleExports | null {
  const parsed = parseSpecifier(specifier);
  if (parsed === null) return null;

  let typesFile: string | null = null;
  const pkgDir = findPackageDir(parsed.pkg, importerPath);
  if (pkgDir !== null) typesFile = findTypesFile(pkgDir, parsed.subpath);

  if (typesFile === null) {
    // @types fallback: lodash → @types/lodash; @scope/pkg → @types/scope__pkg
    const mangled = parsed.pkg.startsWith("@")
      ? parsed.pkg.slice(1).replace("/", "__")
      : parsed.pkg;
    const typesPkgDir = findPackageDir(`@types/${mangled}`, importerPath);
    if (typesPkgDir !== null) typesFile = findTypesFile(typesPkgDir, parsed.subpath);
  }
  if (typesFile === null) return null;

  try {
    return loadDtsExports(fs.readFileSync(typesFile, "utf8"));
  } catch {
    return null;
  }
}

/** Memoizing resolver suitable for CompileOptions.resolveTypes. */
export function makeNpmTypesResolver(): (specifier: string, importerPath: string) => ModuleExports | null {
  const cache = new Map<string, ModuleExports | null>();
  return (specifier, importerPath) => {
    const key = `${path.dirname(path.resolve(importerPath))}|${specifier}`;
    if (!cache.has(key)) {
      cache.set(key, resolveNpmTypes(specifier, importerPath));
    }
    return cache.get(key)!;
  };
}
