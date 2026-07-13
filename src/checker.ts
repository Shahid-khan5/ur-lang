import type {
  BlockStmt,
  ClassDecl,
  Expr,
  FunctionDecl,
  FunctionExpr,
  JsxChild,
  JsxElement,
  Param,
  Program,
  Span,
  Stmt,
  TypeNode,
} from "./ast.js";
import { isIntrinsicTag, RESERVED_JSX_ATTRS } from "./jsx.js";
import { UrTypeError } from "./errors.js";
import {
  ADAD,
  BOOL,
  KHAALI,
  KOI,
  KUCHNAHI,
  LAFZ,
  PropInfo,
  Type,
  arrayOf,
  assignable,
  inferTypeArguments,
  isBool,
  isNumeric,
  isString,
  literal,
  substitute,
  typeName,
  typeParam,
  union,
  unwrapWada,
  unify,
  wadaOf,
  widen,
} from "./types.js";

interface Binding {
  /** Current (possibly narrowed) type used for reads. */
  type: Type;
  /** Declared type used when checking assignments. */
  declaredType: Type;
  mutable: boolean;
  /** Where the binding was declared (for go-to-definition). */
  declSpan?: Span;
}

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

/**
 * JS globals UrLang programs may reference without a `bahar` declaration, both
 * as values and with `naya`. Typed koi. Runtime-specific globals (`Bun`,
 * `process`, `Deno`) stay out — declare those with `bahar` so the code says
 * which runtime it assumes.
 */
const KNOWN_GLOBALS = new Set([
  "console", "Math", "JSON", "Date", "String", "Number", "Boolean", "Array", "Object",
  "parseInt", "parseFloat", "isNaN", "isFinite", "globalThis", "window", "document",
  "setTimeout", "setInterval", "clearTimeout", "clearInterval", "Promise", "Error", "fetch",
  "Map", "Set", "WeakMap", "WeakSet", "RegExp", "Symbol", "BigInt",
  "URL", "URLSearchParams", "Request", "Response", "Headers", "AbortController",
  "TextEncoder", "TextDecoder", "structuredClone", "queueMicrotask", "crypto",
]);

class Scope {
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

const BUILTIN_TYPES: ReadonlyMap<string, Type> = new Map([
  ["adad", ADAD],
  ["lafz", LAFZ],
  ["bool", BOOL],
  ["koi", KOI],
  ["khaali", KHAALI],
  ["kuchnahi", KUCHNAHI],
]);

class Checker {
  readonly diagnostics: UrTypeError[] = [];
  readonly exports: ModuleExports = { values: new Map(), types: new Map(), defaultType: null };
  private scope = new Scope(null);
  private loopDepth = 0;
  /** Stack of enclosing function return types; null entry = no annotation (inferred koi). */
  private readonly returnTypes: (Type | null)[] = [];
  private readonly options: CheckOptions;
  /** Set while checking a jamaat's methods. */
  private currentClass: {
    instance: Type;
    parentClass: Extract<Type, { kind: "class" }> | null;
    inBanao: boolean;
  } | null = null;

  constructor(options: CheckOptions = {}) {
    this.options = options;
  }

  check(program: Program): void {
    for (const ambient of this.options.ambient ?? []) {
      for (const [name, type] of ambient.values) {
        this.scope.declare(name, { type, declaredType: type, mutable: false });
      }
      for (const [name, type] of ambient.types) {
        this.scope.declareType(name, type);
      }
    }
    this.hoistDeclarations(program.body, this.scope);
    for (const stmt of program.body) this.stmt(stmt);
  }

  private error(message: string, span: Span): void {
    this.diagnostics.push(new UrTypeError(message, span));
  }

  /** Runs fn discarding any diagnostics it produces (used to avoid double reports). */
  private silently<T>(fn: () => T): T {
    const n = this.diagnostics.length;
    const result = fn();
    this.diagnostics.length = n;
    return result;
  }

  /** Declares a value binding in the current scope, feeding the symbol sink. */
  private declareValue(name: string, type: Type, mutable: boolean, span: Span): boolean {
    const ok = this.scope.declare(name, { type, declaredType: type, mutable, declSpan: span });
    if (ok) this.options.symbols?.binding(name, span, type);
    return ok;
  }

  // ---------- type resolution ----------

  private resolveType(node: TypeNode): Type {
    switch (node.kind) {
      case "ArrayType":
        return arrayOf(this.resolveType(node.element));
      case "UnionType":
        return union(node.members.map((m) => this.resolveType(m)));
      case "LiteralType":
        return literal(node.value);
      case "ObjectType": {
        const props = new Map<string, PropInfo>();
        for (const p of node.props) {
          props.set(p.key, { type: this.resolveType(p.type), optional: p.optional });
        }
        return { kind: "object", props };
      }
      case "NamedType": {
        if (node.name === "Wada") {
          if (node.typeArgs.length !== 1) {
            this.error("Arre yaar, Wada ko ek type argument chahiye: Wada<adad>.", node.span);
            return wadaOf(KOI);
          }
          return wadaOf(this.resolveType(node.typeArgs[0]!));
        }
        const builtin = BUILTIN_TYPES.get(node.name);
        if (builtin !== undefined) {
          if (node.typeArgs.length > 0) {
            this.error(`Arre yaar, '${node.name}' type arguments nahi leta.`, node.span);
          }
          return builtin;
        }
        const named = this.scope.lookupType(node.name);
        if (named !== null) {
          if (node.typeArgs.length > 0) {
            this.error(`Arre yaar, '${node.name}' type arguments nahi leta.`, node.span);
          }
          return named;
        }
        this.error(
          `Arre yaar, '${node.name}' naam ki koi type nahi hai. (qisim se banao ya import karo.)`,
          node.span
        );
        return KOI;
      }
    }
  }

  /**
   * Resolves a parameter list into call-site types, the required-arg count,
   * a rest element type, and the types parameters bind to inside the body
   * (optional params without defaults bind as `T | khaali`).
   */
  private paramInfo(params: Param[]): {
    types: Type[];
    required: number;
    rest: Type | null;
    bindings: { name: string; type: Type; span: Span }[];
  } {
    const types: Type[] = [];
    const bindings: { name: string; type: Type; span: Span }[] = [];
    let required = 0;
    let sawOptional = false;
    let rest: Type | null = null;
    for (const p of params) {
      const base = p.typeAnnotation ? this.resolveType(p.typeAnnotation) : KOI;
      if (p.rest) {
        if (base.kind === "array") {
          rest = base.element;
          bindings.push({ name: p.name, type: base, span: p.span });
        } else if (base.kind === "koi") {
          rest = KOI;
          bindings.push({ name: p.name, type: arrayOf(KOI), span: p.span });
        } else {
          this.error(
            `Arre yaar, rest parameter ka type array hona chahiye (jaise adad[]), '${typeName(base)}' nahi.`,
            p.span
          );
          rest = KOI;
          bindings.push({ name: p.name, type: arrayOf(KOI), span: p.span });
        }
        continue;
      }
      const isOptional = p.optional || p.defaultValue !== null;
      if (isOptional) {
        sawOptional = true;
      } else {
        if (sawOptional) {
          this.error("Arre yaar, zaroori parameter optional walon ke baad nahi aa sakta.", p.span);
        }
        required++;
      }
      if (p.defaultValue !== null) {
        const defType = this.exprWithContext(p.defaultValue, base);
        if (!assignable(base, defType)) {
          this.error(
            `Arre yaar, default value ka type '${typeName(base)}' hona chahiye, '${typeName(defType)}' nahi.`,
            p.span
          );
        }
      }
      types.push(base);
      bindings.push({
        name: p.name,
        type: p.optional && p.defaultValue === null ? union([base, KHAALI]) : base,
        span: p.span,
      });
    }
    return { types, required, rest, bindings };
  }

  /** Builds a class's type: constructor signature + structural instance type. */
  private classType(decl: ClassDecl): Type {
    let parentClass: Extract<Type, { kind: "class" }> | null = null;
    if (decl.parent !== null) {
      const parentBinding = this.scope.lookup(decl.parent);
      if (parentBinding === null || parentBinding.type.kind !== "class") {
        this.error(`Arre yaar, '${decl.parent}' naam ki koi jamaat nahi hai (pehle define karo).`, decl.span);
      } else {
        parentClass = parentBinding.type;
      }
    }
    const props = new Map<string, PropInfo>();
    if (parentClass !== null && parentClass.instance.kind === "object") {
      for (const [k, p] of parentClass.instance.props) props.set(k, p);
    }
    for (const f of decl.fields) {
      props.set(f.name, { type: this.silently(() => this.resolveType(f.typeAnnotation)), optional: false });
    }
    let ctorParams: Type[] = parentClass?.ctorParams ?? [];
    let ctorRequired = parentClass?.ctorRequired ?? 0;
    for (const m of decl.methods) {
      const info = this.silently(() => this.paramInfo(m.params));
      if (m.name === "banao") {
        ctorParams = info.types;
        ctorRequired = info.required;
        continue;
      }
      const declaredReturn = this.silently(() => (m.returnType ? this.resolveType(m.returnType) : KOI));
      const returnType = m.isAsync && declaredReturn.kind !== "wada" ? wadaOf(declaredReturn) : declaredReturn;
      props.set(m.name, {
        type: {
          kind: "function",
          typeParams: [],
          params: info.types,
          requiredParams: info.required,
          restParam: info.rest,
          returnType,
        },
        optional: false,
      });
    }
    return {
      kind: "class",
      name: decl.name,
      parent: decl.parent,
      ctorParams,
      ctorRequired,
      instance: { kind: "object", props },
    };
  }

  private functionType(fn: FunctionDecl): Type {
    // Resolve the signature with type params visible. Diagnostics are
    // suppressed here — the body check reports them exactly once.
    const outer = this.scope;
    this.scope = new Scope(outer);
    for (const tp of fn.typeParams) this.scope.declareType(tp, typeParam(tp));
    const info = this.silently(() => this.paramInfo(fn.params));
    const declaredReturn = this.silently(() => (fn.returnType ? this.resolveType(fn.returnType) : KOI));
    this.scope = outer;
    const externalReturn = fn.isAsync && declaredReturn.kind !== "wada" ? wadaOf(declaredReturn) : declaredReturn;
    return {
      kind: "function",
      typeParams: fn.typeParams,
      params: info.types,
      requiredParams: info.required,
      restParam: info.rest,
      returnType: externalReturn,
    };
  }

  /** The return type `wapas` statements check against inside the body. */
  private internalReturnType(returnType: TypeNode | null, isAsync: boolean): Type | null {
    if (returnType === null) return null;
    const declared = this.resolveType(returnType);
    if (isAsync && declared.kind === "wada") return declared.value;
    return declared;
  }

  /** Pre-declares type aliases (in order) and function signatures in a scope. */
  private hoistDeclarations(body: Stmt[], scope: Scope): void {
    const outer = this.scope;
    this.scope = scope;
    for (const stmt of body) {
      if (stmt.kind === "TypeAliasDecl") {
        const resolved = this.resolveType(stmt.type);
        if (!scope.declareType(stmt.name, resolved)) {
          this.error(`Arre yaar, qisim '${stmt.name}' pehle se defined hai.`, stmt.span);
        } else if (stmt.exported && scope.parent === null) {
          this.exports.types.set(stmt.name, resolved);
        }
      }
    }
    for (const stmt of body) {
      if (stmt.kind === "ClassDecl") {
        const classType = this.classType(stmt);
        if (!this.declareValue(stmt.name, classType, false, stmt.span)) {
          this.error(`Arre yaar, '${stmt.name}' pehle se declared hai isi scope mein.`, stmt.span);
          continue;
        }
        // The class name is also usable as a type (its instance shape).
        scope.declareType(stmt.name, classType.kind === "class" ? classType.instance : KOI);
        if (stmt.exported && scope.parent === null && classType.kind === "class") {
          this.exports.values.set(stmt.name, classType);
          this.exports.types.set(stmt.name, classType.instance);
        }
        continue;
      }
      if (stmt.kind === "FunctionDecl") {
        const type = this.functionType(stmt);
        if (!this.declareValue(stmt.name, type, false, stmt.span)) {
          this.error(`Arre yaar, '${stmt.name}' pehle se declared hai isi scope mein.`, stmt.span);
        } else if (stmt.exported && scope.parent === null) {
          this.exports.values.set(stmt.name, type);
        } else if (stmt.exportDefault && scope.parent === null) {
          this.exports.defaultType = type;
        }
      }
    }
    this.scope = outer;
  }

  // ---------- statements ----------

  private stmt(stmt: Stmt): void {
    switch (stmt.kind) {
      case "VarDecl": {
        let declared: Type;
        if (stmt.typeAnnotation !== null) {
          declared = this.resolveType(stmt.typeAnnotation);
          const initType = this.exprWithContext(stmt.init, declared);
          if (!assignable(declared, initType)) {
            this.error(
              `Arre yaar, '${stmt.name}' ka type '${typeName(declared)}' hai, lekin value '${typeName(initType)}' de rahe ho.`,
              stmt.span
            );
          }
        } else {
          const initType = this.expr(stmt.init);
          if (initType.kind === "khaali") {
            declared = KOI;
          } else if (stmt.mutable) {
            declared = widen(initType);
          } else {
            declared = initType; // pakka keeps literal types, like TS const
          }
        }
        if (!this.declareValue(stmt.name, declared, stmt.mutable, stmt.span)) {
          this.error(`Arre yaar, '${stmt.name}' pehle se declared hai isi scope mein.`, stmt.span);
        } else if (stmt.exported && this.scope.parent === null) {
          this.exports.values.set(stmt.name, declared);
        }
        return;
      }
      case "PrintStmt":
        for (const arg of stmt.args) this.expr(arg);
        return;
      case "IfStmt": {
        this.condition(stmt.condition);
        const { thenMap, elseMap } = this.narrowCondition(stmt.condition);
        this.blockInNewScope(stmt.consequent, thenMap);
        if (stmt.alternate !== null) {
          if (stmt.alternate.kind === "IfStmt") {
            const outer = this.scope;
            this.scope = new Scope(outer);
            for (const [name, t] of elseMap) this.scope.shadow(name, t);
            this.stmt(stmt.alternate);
            this.scope = outer;
          } else {
            this.blockInNewScope(stmt.alternate, elseMap);
          }
        }
        return;
      }
      case "WhileStmt": {
        this.condition(stmt.condition);
        const { thenMap } = this.narrowCondition(stmt.condition);
        this.loopDepth++;
        this.blockInNewScope(stmt.body, thenMap);
        this.loopDepth--;
        return;
      }
      case "BreakStmt":
        if (this.loopDepth === 0) this.error("Arre yaar, 'bas' sirf loop ke andar chalta hai.", stmt.span);
        return;
      case "ContinueStmt":
        if (this.loopDepth === 0) this.error("Arre yaar, 'agla' sirf loop ke andar chalta hai.", stmt.span);
        return;
      case "BlockStmt":
        this.blockInNewScope(stmt);
        return;
      case "ExprStmt":
        this.expr(stmt.expr);
        return;
      case "FunctionDecl": {
        this.checkFunctionBody(stmt.typeParams, stmt.params, stmt.returnType, stmt.body, stmt.isAsync);
        return;
      }
      case "ReturnStmt": {
        if (this.returnTypes.length === 0) {
          this.error("Arre yaar, 'wapas' sirf kaam (function) ke andar chalta hai.", stmt.span);
          if (stmt.value !== null) this.expr(stmt.value);
          return;
        }
        const expected = this.returnTypes[this.returnTypes.length - 1]!;
        if (stmt.value === null) {
          if (expected !== null && expected.kind !== "kuchnahi" && expected.kind !== "koi") {
            this.error(
              `Arre yaar, is kaam ko '${typeName(expected)}' wapas karna hai — khaali 'wapas;' nahi chalega.`,
              stmt.span
            );
          }
          return;
        }
        if (expected === null) {
          this.expr(stmt.value);
          return;
        }
        if (expected.kind === "kuchnahi") {
          this.expr(stmt.value);
          this.error("Arre yaar, yeh kaam kuchnahi (void) hai — value wapas nahi kar sakte.", stmt.span);
          return;
        }
        const actual = this.exprWithContext(stmt.value, expected);
        if (!assignable(expected, actual)) {
          this.error(
            `Arre yaar, kaam ko '${typeName(expected)}' wapas karna hai, lekin '${typeName(actual)}' de rahe ho.`,
            stmt.span
          );
        }
        return;
      }
      case "ImportStmt": {
        const resolved = this.options.resolveModule?.(stmt.source) ?? null;
        if (stmt.defaultName !== null) {
          const t = resolved?.defaultType ?? KOI;
          if (!this.declareValue(stmt.defaultName, t, false, stmt.span)) {
            this.error(`Arre yaar, '${stmt.defaultName}' pehle se declared hai.`, stmt.span);
          }
        }
        if (stmt.namespaceName !== null) {
          let nsType: Type = KOI;
          // A partial surface would reject valid members it simply didn't see.
          if (resolved !== null && resolved.partial !== true) {
            const props = new Map<string, PropInfo>();
            for (const [k, t] of resolved.values) props.set(k, { type: t, optional: false });
            nsType = { kind: "object", props };
          }
          if (!this.declareValue(stmt.namespaceName, nsType, false, stmt.span)) {
            this.error(`Arre yaar, '${stmt.namespaceName}' pehle se declared hai.`, stmt.span);
          }
        }
        for (const name of stmt.names) {
          if (resolved === null) {
            // Unknown module (npm package etc.) — degrade to koi values.
            if (!this.declareValue(name, KOI, false, stmt.span)) {
              this.error(`Arre yaar, '${name}' pehle se declared hai.`, stmt.span);
            }
            continue;
          }
          // A name may be a value, a type, or (for classes) both.
          const valueType = resolved.values.get(name);
          const aliasType = resolved.types.get(name);
          if (valueType === undefined && aliasType === undefined) {
            if (resolved.partial === true) {
              // We couldn't fully read this package's .d.ts — assume the name
              // exists and type it koi rather than reporting a false error.
              if (!this.declareValue(name, KOI, false, stmt.span)) {
                this.error(`Arre yaar, '${name}' pehle se declared hai.`, stmt.span);
              }
              continue;
            }
            this.error(`Arre yaar, '${stmt.source}' mein '${name}' naam ka koi export nahi hai.`, stmt.span);
            continue;
          }
          if (valueType !== undefined) {
            if (!this.declareValue(name, valueType, false, stmt.span)) {
              this.error(`Arre yaar, '${name}' pehle se declared hai.`, stmt.span);
            }
          }
          if (aliasType !== undefined) {
            if (!this.scope.declareType(name, aliasType) && valueType === undefined) {
              this.error(`Arre yaar, qisim '${name}' pehle se defined hai.`, stmt.span);
            }
          }
        }
        return;
      }
      case "ExternDecl":
        if (!this.declareValue(stmt.name, KOI, true, stmt.span)) {
          this.error(`Arre yaar, '${stmt.name}' pehle se declared hai.`, stmt.span);
        }
        return;
      case "TypeAliasDecl":
        // Handled during hoisting.
        return;
      case "DestructureDecl": {
        const initType = this.expr(stmt.init);
        if (stmt.pattern.type === "object") {
          for (const name of stmt.pattern.names) {
            let t: Type = KOI;
            if (initType.kind === "object") {
              const prop = initType.props.get(name);
              if (prop === undefined) {
                this.error(
                  `Arre yaar, '${typeName(initType)}' mein '${name}' naam ki property nahi hai.`,
                  stmt.span
                );
              } else {
                t = prop.type;
              }
            } else if (initType.kind !== "koi") {
              this.error(
                `Arre yaar, '{ }' destructuring object pe chalti hai, '${typeName(initType)}' pe nahi.`,
                stmt.init.span
              );
            }
            if (!this.declareValue(name, t, stmt.mutable, stmt.span)) {
              this.error(`Arre yaar, '${name}' pehle se declared hai isi scope mein.`, stmt.span);
            }
          }
        } else {
          let element: Type = KOI;
          if (initType.kind === "array") {
            element = initType.element;
          } else if (initType.kind !== "koi") {
            this.error(
              `Arre yaar, '[ ]' destructuring array pe chalti hai, '${typeName(initType)}' pe nahi.`,
              stmt.init.span
            );
          }
          for (const name of stmt.pattern.names) {
            if (!this.declareValue(name, element, stmt.mutable, stmt.span)) {
              this.error(`Arre yaar, '${name}' pehle se declared hai isi scope mein.`, stmt.span);
            }
          }
        }
        return;
      }
      case "DefaultExportStmt": {
        const t = this.expr(stmt.expr);
        if (this.scope.parent === null) this.exports.defaultType = t;
        return;
      }
      case "ReExportStmt": {
        const resolved = this.options.resolveModule?.(stmt.source) ?? null;
        for (const name of stmt.names) {
          if (resolved === null) {
            this.exports.values.set(name, KOI);
            continue;
          }
          const valueType = resolved.values.get(name);
          if (valueType !== undefined) {
            this.exports.values.set(name, valueType);
            continue;
          }
          const aliasType = resolved.types.get(name);
          if (aliasType !== undefined) {
            this.exports.types.set(name, aliasType);
            continue;
          }
          if (resolved.partial === true) {
            this.exports.values.set(name, KOI); // see ModuleExports.partial
            continue;
          }
          this.error(`Arre yaar, '${stmt.source}' mein '${name}' naam ka koi export nahi hai.`, stmt.span);
        }
        return;
      }
      case "ClassDecl": {
        const binding = this.scope.lookup(stmt.name);
        const classType = binding !== null && binding.type.kind === "class" ? binding.type : null;
        const instance = classType?.instance ?? KOI;
        let parentClass: Extract<Type, { kind: "class" }> | null = null;
        if (stmt.parent !== null) {
          const parentBinding = this.scope.lookup(stmt.parent);
          if (parentBinding !== null && parentBinding.type.kind === "class") {
            parentClass = parentBinding.type;
          }
        }
        // Field initializers.
        for (const f of stmt.fields) {
          const fieldType = this.resolveType(f.typeAnnotation);
          if (f.init !== null) {
            const initType = this.exprWithContext(f.init, fieldType);
            if (!assignable(fieldType, initType)) {
              this.error(
                `Arre yaar, '${f.name}' ka type '${typeName(fieldType)}' hai, lekin value '${typeName(initType)}' de rahe ho.`,
                f.span
              );
            }
          }
        }
        // Methods (banao included), with yeh bound to the instance type.
        const outerClass = this.currentClass;
        for (const m of stmt.methods) {
          this.currentClass = { instance, parentClass, inBanao: m.name === "banao" };
          this.checkFunctionBody([], m.params, m.name === "banao" ? null : m.returnType, m.body, m.isAsync);
        }
        this.currentClass = outerClass;
        return;
      }
      case "ForRangeStmt": {
        const fromType = this.expr(stmt.from);
        const toType = this.expr(stmt.to);
        if (!isNumeric(fromType) || !isNumeric(toType)) {
          const bad = !isNumeric(fromType) ? fromType : toType;
          this.error(
            `Arre yaar, range loop ki hadein adad honi chahiye, '${typeName(bad)}' nahi.`,
            (!isNumeric(fromType) ? stmt.from : stmt.to).span
          );
        }
        const outer = this.scope;
        this.scope = new Scope(outer);
        this.declareValue(stmt.varName, ADAD, false, stmt.span);
        this.loopDepth++;
        this.hoistDeclarations(stmt.body.body, this.scope);
        for (const s of stmt.body.body) this.stmt(s);
        this.loopDepth--;
        this.scope = outer;
        return;
      }
      case "ForEachStmt": {
        const iterableType = this.expr(stmt.iterable);
        let elementType: Type = KOI;
        stmt.iterMode = "of";
        if (iterableType.kind === "array") {
          elementType = iterableType.element;
        } else if (
          iterableType.kind === "lafz" ||
          (iterableType.kind === "literal" && typeof iterableType.value === "string")
        ) {
          elementType = LAFZ; // characters
        } else if (iterableType.kind === "object") {
          elementType = LAFZ; // keys
          stmt.iterMode = "keys";
        } else if (iterableType.kind !== "koi") {
          this.error(
            `Arre yaar, 'har ... mein' array, lafz ya object pe chalta hai, '${typeName(iterableType)}' pe nahi.`,
            stmt.iterable.span
          );
        }
        const outer = this.scope;
        this.scope = new Scope(outer);
        this.declareValue(stmt.varName, elementType, false, stmt.span);
        this.loopDepth++;
        this.hoistDeclarations(stmt.body.body, this.scope);
        for (const s of stmt.body.body) this.stmt(s);
        this.loopDepth--;
        this.scope = outer;
        return;
      }
      case "TryStmt": {
        this.blockInNewScope(stmt.block);
        if (stmt.catchBlock !== null) {
          const outer = this.scope;
          this.scope = new Scope(outer);
          if (stmt.catchParam !== null) {
            this.declareValue(stmt.catchParam, KOI, false, stmt.span);
          }
          this.hoistDeclarations(stmt.catchBlock.body, this.scope);
          for (const s of stmt.catchBlock.body) this.stmt(s);
          this.scope = outer;
        }
        if (stmt.finallyBlock !== null) this.blockInNewScope(stmt.finallyBlock);
        return;
      }
      case "ThrowStmt":
        this.expr(stmt.value);
        return;
    }
  }

  private checkFunctionBody(
    typeParams: string[],
    params: FunctionDecl["params"],
    returnType: TypeNode | null,
    body: BlockStmt,
    isAsync: boolean
  ): void {
    const outerScope = this.scope;
    const outerLoopDepth = this.loopDepth;
    const fnScope = new Scope(outerScope);
    this.scope = fnScope;
    for (const tp of typeParams) fnScope.declareType(tp, typeParam(tp));
    const info = this.paramInfo(params);
    for (const b of info.bindings) {
      if (!this.declareValue(b.name, b.type, true, b.span)) {
        this.error(`Arre yaar, parameter '${b.name}' do dafa likha hai.`, b.span);
      }
    }
    this.loopDepth = 0;
    this.returnTypes.push(this.internalReturnType(returnType, isAsync));
    this.hoistDeclarations(body.body, fnScope);
    for (const s of body.body) this.stmt(s);
    this.returnTypes.pop();
    this.scope = outerScope;
    this.loopDepth = outerLoopDepth;
  }

  private blockInNewScope(block: BlockStmt, narrowings?: Map<string, Type>): void {
    const outer = this.scope;
    this.scope = new Scope(outer);
    if (narrowings !== undefined) {
      for (const [name, t] of narrowings) this.scope.shadow(name, t);
    }
    this.hoistDeclarations(block.body, this.scope);
    for (const s of block.body) this.stmt(s);
    this.scope = outer;
  }

  private condition(expr: Expr): void {
    const t = this.expr(expr);
    if (!isBool(t)) {
      this.error(
        `Arre yaar, condition bool honi chahiye (sach/jhoot), '${typeName(t)}' nahi.`,
        expr.span
      );
    }
  }

  // ---------- narrowing ----------

  /**
   * Extracts flow-narrowing facts from a condition: which variables can be
   * assumed narrower in the then/else branches. Handles `x == khaali`,
   * `x != khaali`, literal equality, `!`, `&&`, and `||`.
   */
  private narrowCondition(cond: Expr): { thenMap: Map<string, Type>; elseMap: Map<string, Type> } {
    const empty = (): Map<string, Type> => new Map();
    if (cond.kind === "Unary" && cond.op === "!") {
      const inner = this.narrowCondition(cond.operand);
      return { thenMap: inner.elseMap, elseMap: inner.thenMap };
    }
    if (cond.kind === "Logical") {
      const left = this.narrowCondition(cond.left);
      const right = this.narrowCondition(cond.right);
      if (cond.op === "&&") {
        const thenMap = new Map([...left.thenMap, ...right.thenMap]);
        return { thenMap, elseMap: empty() };
      }
      const elseMap = new Map([...left.elseMap, ...right.elseMap]);
      return { thenMap: empty(), elseMap };
    }
    if (cond.kind === "Binary" && (cond.op === "==" || cond.op === "!=")) {
      const fact = this.equalityFact(cond.left, cond.right) ?? this.equalityFact(cond.right, cond.left);
      if (fact !== null) {
        const [name, current, valueType] = fact;
        const matches = this.narrowTo(current, valueType);
        const excludes = this.narrowExclude(current, valueType);
        if (cond.op === "==") {
          return { thenMap: new Map([[name, matches]]), elseMap: new Map([[name, excludes]]) };
        }
        return { thenMap: new Map([[name, excludes]]), elseMap: new Map([[name, matches]]) };
      }
    }
    return { thenMap: empty(), elseMap: empty() };
  }

  /** If `lhs` is a variable and `rhs` a literal/khaali, returns [name, currentType, comparedType]. */
  private equalityFact(lhs: Expr, rhs: Expr): [string, Type, Type] | null {
    if (lhs.kind !== "Identifier") return null;
    const binding = this.scope.lookup(lhs.name);
    if (binding === null) return null;
    let valueType: Type;
    switch (rhs.kind) {
      case "NullLiteral": valueType = KHAALI; break;
      case "StringLiteral": valueType = literal(rhs.value); break;
      case "NumberLiteral": valueType = literal(rhs.value); break;
      case "BooleanLiteral": valueType = literal(rhs.value); break;
      default: return null;
    }
    return [lhs.name, binding.type, valueType];
  }

  private narrowTo(current: Type, valueType: Type): Type {
    if (current.kind === "union") {
      const matching = current.members.filter((m) => assignable(m, valueType) || assignable(valueType, m));
      if (matching.length > 0) return union(matching.map((m) => (assignable(m, valueType) ? valueType : m)));
      return current;
    }
    if (assignable(current, valueType)) return valueType;
    return current;
  }

  private narrowExclude(current: Type, valueType: Type): Type {
    if (current.kind !== "union") return current;
    const rest = current.members.filter(
      (m) => !(assignable(m, valueType) && assignable(valueType, m))
    );
    if (rest.length === 0) return current;
    return union(rest);
  }

  // ---------- expressions ----------

  /**
   * Contextual typing: array and object literals flowing into a known slot are
   * checked element-by-element / property-by-property, with excess-property
   * errors for fresh object literals (TS-style).
   */
  private exprWithContext(expr: Expr, expected: Type): Type {
    if (expected.kind === "union") {
      // Pick the sole object/array member as context if unambiguous.
      if (expr.kind === "ObjectLiteral") {
        const objects = expected.members.filter((m) => m.kind === "object");
        if (objects.length === 1) return this.exprWithContext(expr, objects[0]!);
      }
      if (expr.kind === "ArrayLiteral") {
        const arrays = expected.members.filter((m) => m.kind === "array");
        if (arrays.length === 1) return this.exprWithContext(expr, arrays[0]!);
      }
      return this.expr(expr);
    }
    if (expr.kind === "ArrayLiteral" && expected.kind === "array") {
      for (const el of expr.elements) {
        if (el.kind === "Spread") {
          const spreadType = this.expr(el.argument);
          if (!assignable(expected, spreadType)) {
            this.error(
              `Arre yaar, '...' wali value '${typeName(expected)}' honi chahiye, '${typeName(spreadType)}' nahi.`,
              el.span
            );
          }
          continue;
        }
        const elType = this.exprWithContext(el, expected.element);
        if (!assignable(expected.element, elType)) {
          this.error(
            `Arre yaar, is array mein '${typeName(expected.element)}' aane chahiye, '${typeName(elType)}' nahi.`,
            el.span
          );
        }
      }
      return expected;
    }
    if (expr.kind === "ObjectLiteral" && expected.kind === "object") {
      const seen = new Set<string>();
      let hasSpread = false;
      for (const p of expr.properties) {
        if (p.kind === "spread") {
          hasSpread = true;
          this.expr(p.argument);
          continue;
        }
        seen.add(p.key);
        const expectedProp = expected.props.get(p.key);
        if (expectedProp === undefined) {
          this.error(
            `Arre yaar, '${p.key}' is type mein hai hi nahi: '${typeName(expected)}'.`,
            p.span
          );
          this.expr(p.value);
          continue;
        }
        const valueType = this.exprWithContext(p.value, expectedProp.type);
        if (!assignable(expectedProp.type, valueType)) {
          this.error(
            `Arre yaar, '${p.key}' ka type '${typeName(expectedProp.type)}' hai, '${typeName(valueType)}' nahi.`,
            p.span
          );
        }
      }
      if (!hasSpread) {
        for (const [key, prop] of expected.props) {
          if (!prop.optional && !seen.has(key)) {
            this.error(`Arre yaar, '${key}' property dena zaroori hai ('${typeName(prop.type)}').`, expr.span);
          }
        }
      }
      return expected;
    }
    return this.expr(expr);
  }

  private expr(expr: Expr): Type {
    switch (expr.kind) {
      case "NumberLiteral": return literal(expr.value);
      case "StringLiteral": return literal(expr.value);
      case "BooleanLiteral": return literal(expr.value);
      case "NullLiteral": return KHAALI;
      case "Identifier": {
        const binding = this.scope.lookup(expr.name);
        if (binding !== null) {
          this.options.symbols?.reference(expr.name, expr.span, binding.type, binding.declSpan ?? null);
          return binding.type;
        }
        if (KNOWN_GLOBALS.has(expr.name)) {
          this.options.symbols?.reference(expr.name, expr.span, KOI, null);
          return KOI;
        }
        this.error(
          `Arre yaar, '${expr.name}' declare hi nahi kiya. (JS global hai to 'bahar ${expr.name};' likho.)`,
          expr.span
        );
        return KOI;
      }
      case "ArrayLiteral": {
        if (expr.elements.length === 0) return arrayOf(KOI);
        let element: Type | null = null;
        for (const el of expr.elements) {
          let elType: Type;
          if (el.kind === "Spread") {
            const spreadType = this.expr(el.argument);
            if (spreadType.kind === "array") {
              elType = spreadType.element;
            } else if (spreadType.kind === "koi") {
              elType = KOI;
            } else {
              this.error(
                `Arre yaar, '...' ke saath array hona chahiye, '${typeName(spreadType)}' nahi.`,
                el.span
              );
              elType = KOI;
            }
          } else {
            elType = widen(this.expr(el));
          }
          element = element === null ? elType : unify(element, elType);
        }
        return arrayOf(element ?? KOI);
      }
      case "ObjectLiteral": {
        const props = new Map<string, PropInfo>();
        let unknownSpread = false;
        for (const p of expr.properties) {
          if (p.kind === "spread") {
            const spreadType = this.expr(p.argument);
            if (spreadType.kind === "object") {
              for (const [k, info] of spreadType.props) props.set(k, info);
            } else if (spreadType.kind === "koi") {
              unknownSpread = true;
            } else {
              this.error(
                `Arre yaar, object mein '...' ke saath object hona chahiye, '${typeName(spreadType)}' nahi.`,
                p.span
              );
            }
            continue;
          }
          props.set(p.key, { type: widen(this.expr(p.value)), optional: false });
        }
        if (unknownSpread) return KOI; // spreading koi makes the shape unknowable
        return { kind: "object", props };
      }
      case "Unary": {
        const t = this.expr(expr.operand);
        if (expr.op === "-") {
          if (!isNumeric(t)) {
            this.error(`Arre yaar, '-' sirf adad pe chalta hai, '${typeName(t)}' pe nahi.`, expr.span);
          }
          return ADAD;
        }
        if (!isBool(t)) {
          this.error(`Arre yaar, '!' sirf bool pe chalta hai, '${typeName(t)}' pe nahi.`, expr.span);
        }
        return BOOL;
      }
      case "Binary": {
        const left = this.expr(expr.left);
        const right = this.expr(expr.right);
        switch (expr.op) {
          case "+": {
            const leftOk = isNumeric(left) || isString(left);
            const rightOk = isNumeric(right) || isString(right);
            if (!leftOk || !rightOk) {
              this.error(
                `Arre yaar, '+' adad ya lafz pe chalta hai — '${typeName(left)}' + '${typeName(right)}' nahi ho sakta.`,
                expr.span
              );
              return KOI;
            }
            if (isString(left) && left.kind !== "koi") return LAFZ;
            if (isString(right) && right.kind !== "koi") return LAFZ;
            if (left.kind === "koi" || right.kind === "koi") return KOI;
            return ADAD;
          }
          case "-":
          case "*":
          case "/":
          case "%":
            this.expectNumericPair(left, right, expr.op, expr.span);
            return ADAD;
          case "<":
          case ">":
          case "<=":
          case ">=":
            this.expectNumericPair(left, right, expr.op, expr.span);
            return BOOL;
          case "==":
          case "!=": {
            const wl = widen(left);
            const wr = widen(right);
            if (!assignable(wl, wr) && !assignable(wr, wl)) {
              this.error(
                `Arre yaar, '${typeName(left)}' aur '${typeName(right)}' kabhi barabar nahi ho sakte — yeh comparison bekaar hai.`,
                expr.span
              );
            }
            return BOOL;
          }
        }
        break;
      }
      case "Logical": {
        const left = this.expr(expr.left);
        const right = this.expr(expr.right);
        for (const [t, node] of [[left, expr.left], [right, expr.right]] as const) {
          if (!isBool(t)) {
            this.error(
              `Arre yaar, '${expr.op}' ke dono taraf bool hona chahiye, '${typeName(t)}' nahi.`,
              node.span
            );
          }
        }
        return BOOL;
      }
      case "Assignment": {
        const targetType = this.assignTarget(expr.target);
        if (targetType === null) {
          this.expr(expr.value);
          return KOI;
        }
        if (expr.op === "=") {
          const valueType = this.exprWithContext(expr.value, targetType);
          if (!assignable(targetType, valueType)) {
            this.error(
              `Arre yaar, '${typeName(targetType)}' wali jagah '${typeName(valueType)}' nahi rakh sakte.`,
              expr.span
            );
          }
          return targetType;
        }
        const valueType = this.expr(expr.value);
        if (expr.op === "+=") {
          const stringConcat = isString(targetType) && (isString(valueType) || isNumeric(valueType));
          const numericAdd = isNumeric(targetType) && isNumeric(valueType);
          if (!stringConcat && !numericAdd) {
            this.error(
              `Arre yaar, '+=' yahan nahi chalega: '${typeName(targetType)}' += '${typeName(valueType)}'.`,
              expr.span
            );
          }
        } else {
          this.expectNumericPair(targetType, valueType, expr.op, expr.span);
        }
        return targetType;
      }
      case "Call": {
        const calleeType = this.expr(expr.callee);
        const checkArgsLoosely = (): void => {
          for (const a of expr.args) {
            if (a.kind === "Spread") this.expr(a.argument);
            else this.expr(a);
          }
        };
        if (calleeType.kind === "koi") {
          checkArgsLoosely();
          return KOI;
        }
        if (calleeType.kind !== "function") {
          checkArgsLoosely();
          this.error(`Arre yaar, '${typeName(calleeType)}' ko call nahi kar sakte — yeh kaam nahi hai.`, expr.span);
          return KOI;
        }
        const hasSpread = expr.args.some((a) => a.kind === "Spread");
        if (!hasSpread) {
          const min = calleeType.requiredParams;
          const max = calleeType.restParam !== null ? Infinity : calleeType.params.length;
          if (expr.args.length < min || expr.args.length > max) {
            for (const a of expr.args) this.expr(a);
            const want =
              min === max ? `${min}` : max === Infinity ? `kam az kam ${min}` : `${min} se ${max}`;
            this.error(
              `Arre yaar, is kaam ko ${want} argument chahiye, ${expr.args.length} diye.`,
              expr.span
            );
            return calleeType.returnType;
          }
        }
        if (calleeType.typeParams.length > 0) {
          // Generic call: infer type arguments, then check against substituted params.
          const argTypes = expr.args.map((a) => (a.kind === "Spread" ? this.expr(a.argument) : this.expr(a)));
          const subst = inferTypeArguments(calleeType.typeParams, calleeType.params, argTypes);
          for (let i = 0; i < argTypes.length; i++) {
            if (expr.args[i]!.kind === "Spread") continue;
            const declared = i < calleeType.params.length ? calleeType.params[i]! : calleeType.restParam;
            if (declared === null) continue;
            const paramType = substitute(declared, subst);
            if (!assignable(paramType, argTypes[i]!)) {
              this.error(
                `Arre yaar, argument ${i + 1} ka type '${typeName(paramType)}' hona chahiye, '${typeName(argTypes[i]!)}' nahi.`,
                expr.args[i]!.span
              );
            }
          }
          return substitute(calleeType.returnType, subst);
        }
        for (let i = 0; i < expr.args.length; i++) {
          const arg = expr.args[i]!;
          if (arg.kind === "Spread") {
            const spreadType = this.expr(arg.argument);
            if (spreadType.kind !== "array" && spreadType.kind !== "koi") {
              this.error(
                `Arre yaar, '...' ke saath array hona chahiye, '${typeName(spreadType)}' nahi.`,
                arg.span
              );
            }
            continue;
          }
          const paramType = i < calleeType.params.length ? calleeType.params[i]! : calleeType.restParam;
          if (paramType === null) {
            this.expr(arg);
            continue;
          }
          const argType = this.exprWithContext(arg, paramType);
          if (!assignable(paramType, argType)) {
            this.error(
              `Arre yaar, argument ${i + 1} ka type '${typeName(paramType)}' hona chahiye, '${typeName(argType)}' nahi.`,
              arg.span
            );
          }
        }
        return calleeType.returnType;
      }
      case "Member": {
        const objectType = this.expr(expr.object);
        if (expr.optional) {
          // ?. — strip khaali/kuchnahi from the type, access the rest, add khaali back.
          if (objectType.kind === "khaali" || objectType.kind === "kuchnahi") return KHAALI;
          if (objectType.kind === "union") {
            const nonNull = objectType.members.filter((m) => m.kind !== "khaali" && m.kind !== "kuchnahi");
            if (nonNull.length === 0) return KHAALI;
            const accessed = this.memberType(union(nonNull), expr.property, expr.span);
            return union([accessed, KHAALI]);
          }
          return union([this.memberType(objectType, expr.property, expr.span), KHAALI]);
        }
        return this.memberType(objectType, expr.property, expr.span);
      }
      case "Index": {
        const objectType = this.expr(expr.object);
        const indexType = this.expr(expr.index);
        if (objectType.kind === "array") {
          if (!isNumeric(indexType)) {
            this.error(`Arre yaar, array ka index adad hona chahiye, '${typeName(indexType)}' nahi.`, expr.index.span);
          }
          return objectType.element;
        }
        if (objectType.kind === "lafz" || (objectType.kind === "literal" && typeof objectType.value === "string")) {
          return LAFZ;
        }
        return KOI;
      }
      case "Await":
        return unwrapWada(this.expr(expr.operand));
      case "Conditional": {
        this.condition(expr.condition);
        const { thenMap, elseMap } = this.narrowCondition(expr.condition);
        const outer = this.scope;
        this.scope = new Scope(outer);
        for (const [name, t] of thenMap) this.scope.shadow(name, t);
        const consequent = this.expr(expr.consequent);
        this.scope = new Scope(outer);
        for (const [name, t] of elseMap) this.scope.shadow(name, t);
        const alternate = this.expr(expr.alternate);
        this.scope = outer;
        return unify(consequent, alternate);
      }
      case "TemplateLiteral":
        for (const e of expr.expressions) this.expr(e); // any type stringifies
        return LAFZ;
      case "Spread":
        // Only valid inside array/object literals and calls; those handle it directly.
        this.error("Arre yaar, '...' yahan nahi chal sakta.", expr.span);
        return this.expr(expr.argument);
      case "ThisExpr":
        if (this.currentClass === null) {
          this.error("Arre yaar, 'yeh' sirf jamaat ke method ke andar chalta hai.", expr.span);
          return KOI;
        }
        return this.currentClass.instance;
      case "NewExpr": {
        const binding = this.scope.lookup(expr.className);
        const argTypes = expr.args.map((a) => (a.kind === "Spread" ? this.expr(a.argument) : this.expr(a)));
        if (binding === null) {
          // Built-in constructors (`naya Date()`, `naya URL(...)`) are koi, like
          // every other reference to a known global.
          if (KNOWN_GLOBALS.has(expr.className)) return KOI;
          this.error(`Arre yaar, '${expr.className}' naam ki koi jamaat nahi hai.`, expr.span);
          return KOI;
        }
        if (binding.type.kind !== "class") {
          if (binding.type.kind === "koi") return KOI; // JS class via bahar/import
          this.error(`Arre yaar, '${expr.className}' jamaat nahi hai — 'naya' sirf jamaat pe chalta hai.`, expr.span);
          return KOI;
        }
        const cls = binding.type;
        const hasSpread = expr.args.some((a) => a.kind === "Spread");
        if (!hasSpread) {
          if (expr.args.length < cls.ctorRequired || expr.args.length > cls.ctorParams.length) {
            const want =
              cls.ctorRequired === cls.ctorParams.length
                ? `${cls.ctorParams.length}`
                : `${cls.ctorRequired} se ${cls.ctorParams.length}`;
            this.error(`Arre yaar, '${cls.name}' ke banao ko ${want} argument chahiye, ${expr.args.length} diye.`, expr.span);
          } else {
            for (let i = 0; i < argTypes.length; i++) {
              if (!assignable(cls.ctorParams[i]!, argTypes[i]!)) {
                this.error(
                  `Arre yaar, argument ${i + 1} ka type '${typeName(cls.ctorParams[i]!)}' hona chahiye, '${typeName(argTypes[i]!)}' nahi.`,
                  expr.args[i]!.span
                );
              }
            }
          }
        }
        return cls.instance;
      }
      case "SuperCall": {
        const argTypes = expr.args.map((a) => this.expr(a));
        const ctx = this.currentClass;
        if (ctx === null || ctx.parentClass === null) {
          this.error("Arre yaar, 'buzurg(...)' sirf waris jamaat ke banao mein chalta hai.", expr.span);
          return KUCHNAHI;
        }
        const parent = ctx.parentClass;
        if (argTypes.length < parent.ctorRequired || argTypes.length > parent.ctorParams.length) {
          this.error(
            `Arre yaar, '${parent.name}' ke banao ko ${parent.ctorParams.length} argument chahiye, ${argTypes.length} diye.`,
            expr.span
          );
        } else {
          for (let i = 0; i < argTypes.length; i++) {
            if (!assignable(parent.ctorParams[i]!, argTypes[i]!)) {
              this.error(
                `Arre yaar, argument ${i + 1} ka type '${typeName(parent.ctorParams[i]!)}' hona chahiye, '${typeName(argTypes[i]!)}' nahi.`,
                expr.args[i]!.span
              );
            }
          }
        }
        return KUCHNAHI;
      }
      case "SuperMember": {
        const ctx = this.currentClass;
        if (ctx === null || ctx.parentClass === null) {
          this.error("Arre yaar, 'buzurg.' sirf waris jamaat ke method mein chalta hai.", expr.span);
          return KOI;
        }
        return this.memberType(ctx.parentClass.instance, expr.property, expr.span);
      }
      case "FunctionExpr": {
        const info = this.silently(() => this.paramInfo(expr.params));
        const fnType: Type = {
          kind: "function",
          typeParams: [],
          params: info.types,
          requiredParams: info.required,
          restParam: info.rest,
          returnType: this.silently(() => this.functionExprReturn(expr)),
        };
        this.checkFunctionBody([], expr.params, expr.returnType, expr.body, expr.isAsync);
        return fnType;
      }
      case "JsxElement":
        return this.jsxElement(expr);
      case "JsxFragment":
        for (const child of expr.children) this.jsxChild(child);
        return KOI;
    }
    return KOI;
  }

  // ---------- JSX ----------

  private jsxChild(child: JsxChild): void {
    if (child.kind === "JsxText") return;
    if (child.kind === "JsxExprContainer") this.expr(child.expr);
    else this.expr(child);
  }

  /** Resolves a (possibly dotted) capitalized tag name as a value. */
  private jsxComponentType(tagName: string, span: Span): Type | null {
    const parts = tagName.split(".");
    const binding = this.scope.lookup(parts[0]!);
    if (binding === null) {
      this.error(`Arre yaar, '<${parts[0]}>' component declare hi nahi kiya.`, span);
      return null;
    }
    this.options.symbols?.reference(parts[0]!, span, binding.type, binding.declSpan ?? null);
    let t = binding.type;
    for (let i = 1; i < parts.length; i++) t = this.memberType(t, parts[i]!, span);
    return t;
  }

  /**
   * Intrinsic tags (`<div>`) accept any attribute but each value expression is
   * checked. Component tags (`<App>`) are checked like TSX: props must match
   * the component's first parameter — wrong types, unknown props, and missing
   * required props are all errors. A spread attr makes the set open-ended, so
   * only the named attrs' types are checked. JSX children satisfy `children`.
   */
  private jsxElement(expr: JsxElement): Type {
    for (const child of expr.children) this.jsxChild(child);
    const intrinsic = isIntrinsicTag(expr.tagName);

    let hasSpread = false;
    for (const attr of expr.attributes) {
      if (attr.kind === "JsxSpreadAttribute") {
        hasSpread = true;
        this.expr(attr.argument);
      }
    }

    let expectedProps: ReadonlyMap<string, PropInfo> | null = null;
    if (!intrinsic) {
      const componentType = this.jsxComponentType(expr.tagName, expr.span);
      if (componentType !== null) {
        if (componentType.kind === "function") {
          const propsParam = componentType.params[0];
          if (propsParam === undefined) expectedProps = new Map();
          else if (propsParam.kind === "object") expectedProps = propsParam.props;
          // Non-object props param (koi etc.) — attrs stay loosely checked.
        } else if (componentType.kind !== "koi" && componentType.kind !== "class") {
          this.error(
            `Arre yaar, '<${expr.tagName}>' component nahi hai — yeh '${typeName(componentType)}' hai.`,
            expr.span
          );
        }
      }
    }

    const provided = new Set<string>();
    for (const attr of expr.attributes) {
      if (attr.kind !== "JsxAttribute") continue;
      provided.add(attr.name);
      if (RESERVED_JSX_ATTRS.has(attr.name)) {
        // `key` belongs to the runtime, not to props: it is neither an unknown
        // prop nor type-checked against one. Its expression is still checked.
        if (attr.value !== null) this.expr(attr.value);
        continue;
      }
      const expected = expectedProps?.get(attr.name);
      const valueType =
        attr.value === null
          ? literal(true)
          : expected !== undefined
            ? this.exprWithContext(attr.value, expected.type)
            : this.expr(attr.value);
      if (expected === undefined) {
        if (expectedProps !== null && !hasSpread) {
          this.error(`Arre yaar, '<${expr.tagName}>' ka '${attr.name}' naam ka koi prop nahi hai.`, attr.span);
        }
        continue;
      }
      if (!assignable(expected.type, valueType)) {
        this.error(
          `Arre yaar, prop '${attr.name}' ka type '${typeName(expected.type)}' hona chahiye, '${typeName(valueType)}' nahi.`,
          attr.span
        );
      }
    }

    if (expectedProps !== null && !hasSpread) {
      const hasChildren = expr.children.length > 0;
      for (const [key, prop] of expectedProps) {
        if (prop.optional || provided.has(key)) continue;
        if (key === "children" && hasChildren) continue;
        this.error(
          `Arre yaar, '<${expr.tagName}>' ko '${key}' prop dena zaroori hai ('${typeName(prop.type)}').`,
          expr.span
        );
      }
    }
    return KOI;
  }

  private functionExprReturn(expr: FunctionExpr): Type {
    const declared = expr.returnType ? this.resolveType(expr.returnType) : KOI;
    if (expr.isAsync && declared.kind !== "wada") return wadaOf(declared);
    return declared;
  }

  private memberType(objectType: Type, property: string, span: Span): Type {
    switch (objectType.kind) {
      case "koi":
        return KOI;
      case "array":
        return property === "length" ? ADAD : KOI; // array methods stay koi for now
      case "lafz":
        return property === "length" ? ADAD : KOI; // string methods stay koi for now
      case "literal":
        if (typeof objectType.value === "string") {
          return property === "length" ? ADAD : KOI;
        }
        return KOI;
      case "adad":
      case "bool":
        return KOI; // .toFixed() etc.
      case "khaali":
        this.error(`Arre yaar, khaali pe '.${property}' nahi chal sakta.`, span);
        return KOI;
      case "kuchnahi":
        this.error(`Arre yaar, kuchnahi pe '.${property}' nahi chal sakta.`, span);
        return KOI;
      case "object": {
        const prop = objectType.props.get(property);
        if (prop === undefined) {
          this.error(`Arre yaar, '${typeName(objectType)}' mein '${property}' naam ki property nahi hai.`, span);
          return KOI;
        }
        // Optional properties may be absent — they read as T | khaali.
        return prop.optional ? union([prop.type, KHAALI]) : prop.type;
      }
      case "union": {
        const results: Type[] = [];
        for (const m of objectType.members) {
          if (m.kind === "khaali" || m.kind === "kuchnahi") {
            this.error(
              `Arre yaar, yeh value khaali ho sakti hai — pehle 'agar (x != khaali)' se check karo, phir '.${property}' use karo.`,
              span
            );
            return KOI;
          }
          results.push(this.memberType(m, property, span));
        }
        return union(results);
      }
      case "wada":
        return KOI; // .then etc. — intezar is the typed path
      case "function":
      case "typeParam":
      case "class":
        return KOI; // statics are untyped for now
    }
  }

  /** One diagnostic per operation, even if both operands are bad. */
  private expectNumericPair(left: Type, right: Type, op: string, span: Span): void {
    if (!isNumeric(left) || !isNumeric(right)) {
      const bad = !isNumeric(left) ? left : right;
      this.error(`Arre yaar, '${op}' sirf adad pe chalta hai, '${typeName(bad)}' pe nahi.`, span);
    }
  }

  /** Returns the target's declared type, or null if unresolvable (error already reported). */
  private assignTarget(target: Expr): Type | null {
    if (target.kind === "Identifier") {
      const binding = this.scope.lookup(target.name);
      if (binding !== null) {
        this.options.symbols?.reference(target.name, target.span, binding.type, binding.declSpan ?? null);
      }
      if (binding === null) {
        if (KNOWN_GLOBALS.has(target.name)) return KOI;
        this.error(
          `Arre yaar, '${target.name}' declare hi nahi kiya — pehle 'rakho ${target.name} = ...;' likho.`,
          target.span
        );
        return null;
      }
      if (!binding.mutable) {
        this.error(`Arre yaar, '${target.name}' pakka hai — isse badla nahi ja sakta.`, target.span);
        return null;
      }
      return binding.declaredType;
    }
    if (target.kind === "Index") {
      const objectType = this.expr(target.object);
      const indexType = this.expr(target.index);
      if (objectType.kind === "array") {
        if (!isNumeric(indexType)) {
          this.error(`Arre yaar, array ka index adad hona chahiye.`, target.index.span);
        }
        return objectType.element;
      }
      return KOI;
    }
    if (target.kind === "Member") {
      const objectType = this.expr(target.object);
      if (objectType.kind === "object") {
        const prop = objectType.props.get(target.property);
        if (prop === undefined) {
          this.error(
            `Arre yaar, '${typeName(objectType)}' mein '${target.property}' naam ki property nahi hai.`,
            target.span
          );
          return null;
        }
        return prop.type;
      }
      return KOI;
    }
    this.expr(target);
    return KOI;
  }
}

/** Type-checks a program with full options; returns diagnostics and the module's export surface. */
export function checkProgram(program: Program, options: CheckOptions = {}): CheckResult {
  const checker = new Checker(options);
  checker.check(program);
  return { diagnostics: checker.diagnostics, exports: checker.exports };
}

/** Type-checks a program; returns all diagnostics (empty array = clean). */
export function check(program: Program): UrTypeError[] {
  return checkProgram(program).diagnostics;
}
