import { parse } from "./parser.js";
import { checkProgram, ModuleExports } from "./checker.js";
import { generate } from "./codegen.js";
import { SourceMapBuilder, SourceMapJson } from "./sourcemap.js";
import { UrError } from "./errors.js";

export interface CompileOptions {
  /** Source file name, used in diagnostics and source maps. */
  fileName?: string;
  /** Emit a source map alongside the code. */
  sourceMap?: boolean;
  /** Rewrite `./x.ur` imports to `./x.js` (CLI file builds). Bundler plugins keep `.ur`. */
  rewriteUrImports?: boolean;
  /** Skip the type checker (not recommended; used by benchmarks to isolate stages). */
  typeCheck?: boolean;
  /**
   * Loads an imported module's source so imports get their real exported
   * types. Return null for unresolvable specifiers (npm packages etc.) —
   * those degrade to koi. `importerPath` is the file doing the importing.
   */
  loadModule?: (specifier: string, importerPath: string) => { source: string; path: string } | null;
  /**
   * Fallback type resolution for specifiers loadModule can't handle (npm
   * packages): returns the module's typed surface (e.g. from its .d.ts via
   * `makeNpmTypesResolver` in ur-lang's npm-types module), or null → koi.
   */
  resolveTypes?: (specifier: string, importerPath: string) => ModuleExports | null;
  /**
   * Ambient declaration surfaces (from `loadDtsExports` in ur-lang/dts, or
   * hand-built) whose values/types become typed globals. Kept as pre-loaded
   * objects so the core compiler never depends on the TypeScript package.
   */
  ambient?: ModuleExports[];
}

export interface CompileResult {
  /** Generated JavaScript, or null when there are diagnostics. */
  code: string | null;
  map: SourceMapJson | null;
  diagnostics: UrError[];
  /** The module's typed export surface (null if type checking was skipped or failed). */
  exports: ModuleExports | null;
}

/**
 * The full pipeline: tokenize → parse → type-check → generate.
 * Never throws — syntax and type errors are returned as diagnostics.
 */
/** Builds a memoized, cycle-safe module resolver over loadModule + resolveTypes. */
function makeModuleResolver(
  loadModule: CompileOptions["loadModule"],
  resolveTypes: CompileOptions["resolveTypes"],
  rootPath: string
): (specifier: string) => ModuleExports | null {
  const cache = new Map<string, ModuleExports | null>();
  const inProgress = new Set<string>();
  const resolveFrom = (specifier: string, importerPath: string): ModuleExports | null => {
    const loaded = loadModule?.(specifier, importerPath) ?? null;
    if (loaded === null) return resolveTypes?.(specifier, importerPath) ?? null;
    if (cache.has(loaded.path)) return cache.get(loaded.path)!;
    if (inProgress.has(loaded.path)) return null; // import cycle — degrade to koi
    inProgress.add(loaded.path);
    try {
      const program = parse(loaded.source);
      const result = checkProgram(program, {
        resolveModule: (s) => resolveFrom(s, loaded.path),
      });
      cache.set(loaded.path, result.exports);
      return result.exports;
    } catch {
      cache.set(loaded.path, null); // imported module has syntax errors; reported when it compiles
      return null;
    } finally {
      inProgress.delete(loaded.path);
    }
  };
  return (specifier) => resolveFrom(specifier, rootPath);
}

export function compile(source: string, options: CompileOptions = {}): CompileResult {
  const fileName = options.fileName ?? "<urlang>";
  try {
    const program = parse(source);
    let exports: ModuleExports | null = null;
    if (options.typeCheck !== false) {
      const resolveModule =
        options.loadModule || options.resolveTypes
          ? makeModuleResolver(options.loadModule, options.resolveTypes, fileName)
          : undefined;
      const result = checkProgram(program, {
        ...(resolveModule ? { resolveModule } : {}),
        ...(options.ambient ? { ambient: options.ambient } : {}),
      });
      if (result.diagnostics.length > 0) {
        return { code: null, map: null, diagnostics: result.diagnostics, exports: null };
      }
      exports = result.exports;
    }
    const mapBuilder = options.sourceMap
      ? new SourceMapBuilder(fileName, source, fileName.replace(/\.ur$/, ".js"))
      : null;
    const code = generate(program, {
      rewriteUrImports: options.rewriteUrImports ?? false,
      sourceMap: mapBuilder,
    });
    return { code, map: mapBuilder ? mapBuilder.toJSON() : null, diagnostics: [], exports };
  } catch (e) {
    if (e instanceof UrError) {
      return { code: null, map: null, diagnostics: [e], exports: null };
    }
    throw e;
  }
}

/** Formats diagnostics with source excerpts and carets, ready for the terminal. */
export function formatDiagnostics(diagnostics: UrError[], source: string, fileName = "<urlang>"): string {
  return diagnostics.map((d) => d.format(source, fileName)).join("\n\n");
}
