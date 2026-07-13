// Lexical scope: the value and type namespaces, plus the globals and builtin
// type names that sit outside every program.
import type { Span } from "../ast.js";
import { ADAD, BOOL, KHAALI, KOI, KUCHNAHI, LAFZ, Type } from "../types.js";

export interface Binding {
  /** Current (possibly narrowed) type used for reads. */
  type: Type;
  /** Declared type used when checking assignments. */
  declaredType: Type;
  mutable: boolean;
  /** Where the binding was declared (for go-to-definition). */
  declSpan?: Span;
}

/**
 * JS globals UrLang programs may reference without a `bahar` declaration, both
 * as values and with `naya`. Typed koi. Runtime-specific globals (`Bun`,
 * `process`, `Deno`) stay out — declare those with `bahar` so the code says
 * which runtime it assumes.
 */
export const KNOWN_GLOBALS: ReadonlySet<string> = new Set([
  "console", "Math", "JSON", "Date", "String", "Number", "Boolean", "Array", "Object",
  "parseInt", "parseFloat", "isNaN", "isFinite", "globalThis", "window", "document",
  "setTimeout", "setInterval", "clearTimeout", "clearInterval", "Promise", "Error", "fetch",
  "Map", "Set", "WeakMap", "WeakSet", "RegExp", "Symbol", "BigInt",
  "URL", "URLSearchParams", "Request", "Response", "Headers", "AbortController",
  "TextEncoder", "TextDecoder", "structuredClone", "queueMicrotask", "crypto",
]);

export const BUILTIN_TYPES: ReadonlyMap<string, Type> = new Map([
  ["adad", ADAD],
  ["lafz", LAFZ],
  ["bool", BOOL],
  ["koi", KOI],
  ["khaali", KHAALI],
  ["kuchnahi", KUCHNAHI],
]);

/** One lexical scope: values and types, chained to the enclosing scope. */
export class Scope {
  private readonly bindings = new Map<string, Binding>();
  private readonly types = new Map<string, Type>();
  constructor(readonly parent: Scope | null) {}

  declare(name: string, binding: Binding): boolean {
    if (this.bindings.has(name)) return false;
    this.bindings.set(name, binding);
    return true;
  }

  /** Shadows a binding with a narrowed type (keeps mutability + declared type). */
  shadow(name: string, narrowedType: Type): void {
    const original = this.lookup(name);
    if (original === null) return;
    this.bindings.set(name, {
      type: narrowedType,
      declaredType: original.declaredType,
      mutable: original.mutable,
    });
  }

  lookup(name: string): Binding | null {
    let s: Scope | null = this;
    while (s !== null) {
      const b = s.bindings.get(name);
      if (b !== undefined) return b;
      s = s.parent;
    }
    return null;
  }

  declaredLocally(name: string): boolean {
    return this.bindings.has(name);
  }

  declareType(name: string, type: Type): boolean {
    if (this.types.has(name)) return false;
    this.types.set(name, type);
    return true;
  }

  lookupType(name: string): Type | null {
    let s: Scope | null = this;
    while (s !== null) {
      const t = s.types.get(name);
      if (t !== undefined) return t;
      s = s.parent;
    }
    return null;
  }
}
