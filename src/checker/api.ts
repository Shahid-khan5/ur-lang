// The checker's public surface: what a module exports, what the checker is
// given, and what it hands back. Kept apart from the checking machinery so
// tooling (LSP, dts, bundler plugins) can depend on these types without
// pulling in the checker itself.
import type { Span } from "../ast.js";
import type { Type } from "../types.js";
import type { UrTypeError } from "../errors.js";

/** Optional instrumentation used by the language server. */
export interface SymbolSink {
  /** A name was declared at span with this type. */
  binding(name: string, span: Span, type: Type): void;
  /** A name was referenced at span; declSpan points at its declaration. */
  reference(name: string, span: Span, type: Type, declSpan: Span | null): void;
}

/** What a module makes available to importers. */
export interface ModuleExports {
  values: Map<string, Type>;
  types: Map<string, Type>;
  defaultType: Type | null;
  /**
   * True when this surface is known to be incomplete — it came from a `.d.ts`
   * whose declarations we only partially understand (our TS support is a
   * subset: `export =`, namespaces, and overloads don't all survive). Names we
   * didn't capture degrade to `koi` instead of being reported as missing —
   * a false "no such export" is far worse than a missing type. Surfaces from
   * real .ur/.urx modules are complete, so unknown names there stay an error.
   */
  partial?: boolean;
}

export interface CheckOptions {
  /** Resolves an import specifier to the exporting module's surface, or null if unknown. */
  resolveModule?: (specifier: string) => ModuleExports | null;
  /** Ambient declarations (e.g. from .d.ts files) available as typed globals. */
  ambient?: ModuleExports[];
  /** Symbol instrumentation for editor tooling (hover/definition/completion). */
  symbols?: SymbolSink;
}

export interface CheckResult {
  diagnostics: UrTypeError[];
  exports: ModuleExports;
}
