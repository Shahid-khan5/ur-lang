// Shared checker machinery: scope, diagnostics, type resolution, parameter
// binding, narrowing primitives, and member lookup. The expression and
// statement layers build on this (see ./expressions.ts and ./checker.ts) —
// the three-way split is bookkeeping, not three independent checkers.
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
} from "../ast.js";
import { isIntrinsicTag, RESERVED_JSX_ATTRS } from "../jsx.js";
import { arrayMemberType, boolMemberType, numberMemberType, stringMemberType } from "../stdlib.js";
import { UrTypeError } from "../errors.js";
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
  functionOf,
  inferTypeArguments,
  isBool,
  isNumeric,
  isString,
  literal,
  mentionsTypeParam,
  substitute,
  typeName,
  typeParam,
  union,
  unwrapWada,
  unify,
  wadaOf,
  widen,
} from "../types.js";
import { BUILTIN_TYPES, Binding, KNOWN_GLOBALS, Scope } from "./scope.js";
import type { Pattern } from "../ast.js";
import type { CheckOptions, CheckResult, ModuleExports } from "./api.js";

/** One parameter's binding: a plain name, or a destructuring pattern. */
interface ParamBinding {
  name: string;
  pattern: Pattern | null;
  type: Type;
  span: Span;
}

export abstract class CheckerBase {
  readonly diagnostics: UrTypeError[] = [];
  readonly exports: ModuleExports = { values: new Map(), types: new Map(), defaultType: null };
  protected scope = new Scope(null);
  protected loopDepth = 0;
  /** Labels currently in scope, for `bas naam;` / `agla naam;`. */
  protected readonly labels: string[] = [];
  /** Stack of enclosing function return types; null entry = no annotation (inferred koi). */
  protected readonly returnTypes: (Type | null)[] = [];
  /** Types actually returned by the function being checked (for lambda inference). */
  protected readonly observedReturns: Type[][] = [];
  protected readonly options: CheckOptions;
  /** Set while checking a jamaat's methods. */
  protected currentClass: {
    className: string;
    instance: Type;
    parentClass: Extract<Type, { kind: "class" }> | null;
    inBanao: boolean;
  } | null = null;

  constructor(options: CheckOptions = {}) {
    this.options = options;
  }


  protected error(message: string, span: Span): void {
    this.diagnostics.push(new UrTypeError(message, span));
  }

  /** Runs fn discarding any diagnostics it produces (used to avoid double reports). */
  protected silently<T>(fn: () => T): T {
    const n = this.diagnostics.length;
    const result = fn();
    this.diagnostics.length = n;
    return result;
  }

  /** Declares a value binding in the current scope, feeding the symbol sink. */
  protected declareValue(name: string, type: Type, mutable: boolean, span: Span): boolean {
    const ok = this.scope.declare(name, { type, declaredType: type, mutable, declSpan: span });
    if (ok) this.options.symbols?.binding(name, span, type);
    return ok;
  }

  // ---------- type resolution ----------

  protected resolveType(node: TypeNode): Type {
    switch (node.kind) {
      case "FunctionType":
        return functionOf(
          node.params.map((p) => this.resolveType(p)),
          this.resolveType(node.returnType)
        );
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
  /**
   * `contextParams` supplies types for *unannotated* parameters — used when a
   * lambda flows into a known function slot (`xs.map(kaam (n) { … })`). An
   * explicit annotation always wins over the context.
   */
  protected paramInfo(params: Param[], contextParams?: Type[]): {
    types: Type[];
    required: number;
    rest: Type | null;
    bindings: ParamBinding[];
  } {
    const types: Type[] = [];
    const bindings: ParamBinding[] = [];
    let required = 0;
    let sawOptional = false;
    let rest: Type | null = null;
    for (const [index, p] of params.entries()) {
      const base = p.typeAnnotation
        ? this.resolveType(p.typeAnnotation)
        : contextParams?.[index] ?? KOI;
      if (p.rest) {
        if (base.kind === "array") {
          rest = base.element;
          bindings.push({ name: p.name, pattern: null, type: base, span: p.span });
        } else if (base.kind === "koi") {
          rest = KOI;
          bindings.push({ name: p.name, pattern: null, type: arrayOf(KOI), span: p.span });
        } else {
          this.error(
            `Arre yaar, rest parameter ka type array hona chahiye (jaise adad[]), '${typeName(base)}' nahi.`,
            p.span
          );
          rest = KOI;
          bindings.push({ name: p.name, pattern: null, type: arrayOf(KOI), span: p.span });
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
        // A destructured parameter binds a whole pattern, not one name.
        pattern: p.pattern,
        type: p.optional && p.defaultValue === null ? union([base, KHAALI]) : base,
        span: p.span,
      });
    }
    return { types, required, rest, bindings };
  }

  /** Builds a class's type: constructor signature + structural instance type. */

  protected internalReturnType(returnType: TypeNode | null, isAsync: boolean): Type | null {
    if (returnType === null) return null;
    const declared = this.resolveType(returnType);
    if (isAsync && declared.kind === "wada") return declared.value;
    return declared;
  }

  /** Pre-declares type aliases (in order) and function signatures in a scope. */

  protected narrowTo(current: Type, valueType: Type): Type {
    if (current.kind === "union") {
      const matching = current.members.filter((m) => assignable(m, valueType) || assignable(valueType, m));
      if (matching.length > 0) return union(matching.map((m) => (assignable(m, valueType) ? valueType : m)));
      return current;
    }
    if (assignable(current, valueType)) return valueType;
    return current;
  }

  /**
   * Declares every name in a destructuring pattern, typed from `sourceType`.
   * Handles renaming, defaults (which also drop `khaali` from the type), rest
   * (`...baqi` keeps the remaining properties / the tail of the array), and
   * nesting, all recursively.
   */
  protected bindPattern(pattern: Pattern, sourceType: Type, mutable: boolean, span: Span): void {
    if (pattern.kind === "IdentPattern") {
      if (!this.declareValue(pattern.name, sourceType, mutable, pattern.span)) {
        this.error(`Arre yaar, '${pattern.name}' pehle se declared hai isi scope mein.`, pattern.span);
      }
      return;
    }

    if (pattern.kind === "ObjectPattern") {
      if (sourceType.kind !== "object" && sourceType.kind !== "koi") {
        this.error(
          `Arre yaar, '{ }' destructuring object pe chalti hai, '${typeName(sourceType)}' pe nahi.`,
          span
        );
      }
      const taken = new Set<string>();
      for (const prop of pattern.props) {
        taken.add(prop.key);
        let propType: Type = KOI;
        if (sourceType.kind === "object") {
          const info = sourceType.props.get(prop.key);
          if (info === undefined) {
            this.error(
              `Arre yaar, '${typeName(sourceType)}' mein '${prop.key}' naam ki property nahi hai.`,
              prop.span
            );
          } else {
            propType = info.optional ? union([info.type, KHAALI]) : info.type;
          }
        }
        propType = this.applyPatternDefault(propType, prop.defaultValue, prop.span);
        this.bindPattern(prop.value, propType, mutable, prop.span);
      }
      if (pattern.rest !== null) {
        // `...baqi` keeps exactly the properties nobody else claimed.
        let restType: Type = KOI;
        if (sourceType.kind === "object") {
          const rest = new Map<string, PropInfo>();
          for (const [key, info] of sourceType.props) {
            if (!taken.has(key)) rest.set(key, info);
          }
          restType = { kind: "object", props: rest };
        }
        if (!this.declareValue(pattern.rest, restType, mutable, pattern.span)) {
          this.error(`Arre yaar, '${pattern.rest}' pehle se declared hai isi scope mein.`, pattern.span);
        }
      }
      return;
    }

    // ArrayPattern
    let element: Type = KOI;
    if (sourceType.kind === "array") {
      element = sourceType.element;
    } else if (sourceType.kind !== "koi") {
      this.error(
        `Arre yaar, '[ ]' destructuring array pe chalti hai, '${typeName(sourceType)}' pe nahi.`,
        span
      );
    }
    for (const el of pattern.elements) {
      const elType = this.applyPatternDefault(element, el.defaultValue, el.span);
      this.bindPattern(el.value, elType, mutable, el.span);
    }
    if (pattern.rest !== null) {
      const restType = sourceType.kind === "array" ? arrayOf(element) : KOI;
      if (!this.declareValue(pattern.rest, restType, mutable, pattern.span)) {
        this.error(`Arre yaar, '${pattern.rest}' pehle se declared hai isi scope mein.`, pattern.span);
      }
    }
  }

  /** A default fills in for an absent value, so it also removes khaali from the type. */
  private applyPatternDefault(type: Type, defaultValue: Expr | null, span: Span): Type {
    if (defaultValue === null) return type;
    const present = this.narrowExclude(type, KHAALI);
    const target = present.kind === "khaali" || present.kind === "kuchnahi" ? KOI : present;
    const defaultType = this.exprWithContext(defaultValue, target);
    if (target.kind !== "koi" && !assignable(target, defaultType)) {
      this.error(
        `Arre yaar, default value ka type '${typeName(target)}' hona chahiye, '${typeName(defaultType)}' nahi.`,
        span
      );
    }
    return target;
  }

  /** Notes what a `wapas` actually produced, so an unannotated lambda can infer it. */
  protected recordReturn(type: Type): void {
    this.observedReturns[this.observedReturns.length - 1]?.push(widen(type));
  }

  protected narrowExclude(current: Type, valueType: Type): Type {
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

  protected stringMember(property: string, span: Span): Type {
    const method = stringMemberType(property);
    if (method !== null) return method;
    this.error(`Arre yaar, 'lafz' pe '${property}' naam ka koi method nahi hai.`, span);
    return KOI;
  }

  protected memberType(objectType: Type, property: string, span: Span): Type {
    switch (objectType.kind) {
      case "koi":
        return KOI;
      case "array": {
        const method = arrayMemberType(objectType.element, property);
        if (method !== null) return method;
        this.error(
          `Arre yaar, '${typeName(objectType)}' pe '${property}' naam ka koi method nahi hai.`,
          span
        );
        return KOI;
      }
      case "literal":
        // A literal carries the methods of the type it is a literal of.
        if (typeof objectType.value === "string") return this.stringMember(property, span);
        return this.memberType(typeof objectType.value === "number" ? ADAD : BOOL, property, span);
      case "lafz":
        return this.stringMember(property, span);
      case "adad": {
        const method = numberMemberType(property);
        if (method !== null) return method;
        this.error(`Arre yaar, 'adad' pe '${property}' naam ka koi method nahi hai.`, span);
        return KOI;
      }
      case "bool": {
        const method = boolMemberType(property);
        if (method !== null) return method;
        this.error(`Arre yaar, 'bool' pe '${property}' naam ka koi method nahi hai.`, span);
        return KOI;
      }
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
        // A `nijee` member is only reachable from inside its own class.
        if (prop.privateOwner !== undefined && this.currentClass?.className !== prop.privateOwner) {
          this.error(
            `Arre yaar, '${property}' nijee hai — jamaat '${prop.privateOwner}' ke bahar nahi chalta.`,
            span
          );
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
      case "class": {
        // Reaching *through the class itself* sees the sakit (static) members.
        const stat = objectType.statics.get(property);
        if (stat === undefined) {
          this.error(
            `Arre yaar, jamaat '${objectType.name}' pe '${property}' naam ka koi sakit member nahi hai.`,
            span
          );
          return KOI;
        }
        if (stat.privateOwner !== undefined && this.currentClass?.className !== stat.privateOwner) {
          this.error(
            `Arre yaar, '${property}' nijee hai — jamaat '${stat.privateOwner}' ke bahar nahi chalta.`,
            span
          );
        }
        return stat.type;
      }
      case "function":
      case "typeParam":
        return KOI;
    }
  }

  /** One diagnostic per operation, even if both operands are bad. */
  protected expectNumericPair(left: Type, right: Type, op: string, span: Span): void {
    if (!isNumeric(left) || !isNumeric(right)) {
      const bad = !isNumeric(left) ? left : right;
      this.error(`Arre yaar, '${op}' sirf adad pe chalta hai, '${typeName(bad)}' pe nahi.`, span);
    }
  }

  /** Returns the target's declared type, or null if unresolvable (error already reported). */

  // Implemented by the layers above.
  protected abstract expr(expr: Expr): Type;
  protected abstract exprWithContext(expr: Expr, expected: Type): Type;
  protected abstract stmt(stmt: Stmt): void;
  protected abstract checkFunctionBody(
    typeParams: string[],
    params: FunctionDecl["params"],
    returnType: TypeNode | null,
    body: BlockStmt,
    isAsync: boolean,
    contextParams?: Type[]
  ): Type;
  protected abstract hoistDeclarations(body: Stmt[], scope: Scope): void;
}
