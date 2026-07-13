// File-level compilation driver shared by the CLI. Kept separate so it can be
// unit-tested without spawning a process.
import * as fs from "node:fs";
import * as path from "node:path";
import { compile, CompileOptions } from "./compiler.js";
import { emitDts } from "./dts-emit.js";
import { parse } from "./parser.js";
import { UrError } from "./errors.js";
import type { ModuleExports } from "./checker.js";

/** Loads relative .ur imports from disk so the checker sees real exported types. */
export const fsModuleLoader: NonNullable<CompileOptions["loadModule"]> = (specifier, importerPath) => {
  if (!specifier.startsWith(".") || !specifier.endsWith(".ur")) return null;
  const resolved = path.resolve(path.dirname(importerPath), specifier);
  try {
    return { source: fs.readFileSync(resolved, "utf8"), path: resolved };
  } catch {
    return null;
  }
};

export interface BuildFileResult {
  inputPath: string;
  outputPath: string | null;
  diagnostics: UrError[];
  source: string;
}

export interface BuildOptions {
  outDir: string;
  sourceMap?: boolean;
  /** Emit .d.ts declarations next to the .js output (default true). */
  declarations?: boolean;
  /** Ambient .d.ts surfaces (typed globals) for the checker. */
  ambient?: ModuleExports[];
  /** npm-package type resolution (see makeNpmTypesResolver). */
  resolveTypes?: CompileOptions["resolveTypes"];
}

/** Compiles one .ur file to .js (+ .js.map + .d.ts). Does not follow imports. */
export function buildFile(inputPath: string, options: BuildOptions): BuildFileResult {
  const source = fs.readFileSync(inputPath, "utf8");
  const fileName = path.basename(inputPath);
  const sourceMap = options.sourceMap ?? true;
  const result = compile(source, {
    fileName,
    sourceMap,
    rewriteUrImports: true,
    loadModule: (spec, importer) =>
      fsModuleLoader(spec, importer === fileName ? path.resolve(inputPath) : importer),
    ...(options.ambient ? { ambient: options.ambient } : {}),
    ...(options.resolveTypes
      ? {
          resolveTypes: (spec, importer) =>
            options.resolveTypes!(spec, importer === fileName ? path.resolve(inputPath) : importer),
        }
      : {}),
  });
  if (result.code === null) {
    return { inputPath, outputPath: null, diagnostics: result.diagnostics, source };
  }
  fs.mkdirSync(options.outDir, { recursive: true });
  const outName = fileName.replace(/\.ur$/, ".js");
  const outputPath = path.join(options.outDir, outName);
  let code = result.code;
  if (sourceMap && result.map !== null) {
    fs.writeFileSync(outputPath + ".map", JSON.stringify(result.map));
    code += `\n//# sourceMappingURL=${outName}.map\n`;
  }
  fs.writeFileSync(outputPath, code);
  if (options.declarations !== false && result.exports !== null) {
    fs.writeFileSync(path.join(options.outDir, fileName.replace(/\.ur$/, ".d.ts")), emitDts(result.exports));
  }
  return { inputPath, outputPath, diagnostics: [], source };
}

/**
 * Compiles a file and everything it imports (transitively) into outDir.
 * Import specifiers stay relative, so the emitted graph runs directly in Node.
 */
export function buildGraph(entryPath: string, options: BuildOptions): BuildFileResult[] {
  const results: BuildFileResult[] = [];
  const seen = new Set<string>();
  const queue = [path.resolve(entryPath)];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const result = buildFile(file, options);
    results.push(result);
    if (result.diagnostics.length > 0) continue;
    for (const dep of urImportsOf(result.source)) {
      if (dep.startsWith(".")) {
        queue.push(path.resolve(path.dirname(file), dep));
      }
    }
  }
  return results;
}

/** Extracts the `.ur` import specifiers from a source file. */
function urImportsOf(source: string): string[] {
  try {
    const program = parse(source);
    const deps: string[] = [];
    for (const stmt of program.body) {
      if (stmt.kind === "ImportStmt" && stmt.source.endsWith(".ur")) {
        deps.push(stmt.source);
      }
    }
    return deps;
  } catch {
    return []; // parse errors are reported by buildFile
  }
}

/** Type-checks a file without emitting anything. */
export function checkFile(
  inputPath: string,
  ambient?: ModuleExports[],
  resolveTypes?: CompileOptions["resolveTypes"]
): { diagnostics: UrError[]; source: string } {
  const source = fs.readFileSync(inputPath, "utf8");
  const fileName = path.basename(inputPath);
  const result = compile(source, {
    fileName,
    loadModule: (spec, importer) =>
      fsModuleLoader(spec, importer === fileName ? path.resolve(inputPath) : importer),
    ...(ambient ? { ambient } : {}),
    ...(resolveTypes
      ? {
          resolveTypes: (spec, importer) =>
            resolveTypes(spec, importer === fileName ? path.resolve(inputPath) : importer),
        }
      : {}),
  });
  return { diagnostics: result.diagnostics, source };
}
