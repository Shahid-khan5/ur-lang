// Statement checking and the public entry points. Expressions come from
// ./expressions.ts; the shared machinery from ./base.ts.
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
import type { CheckOptions, CheckResult, ModuleExports } from "./api.js";
import { ExpressionChecker } from "./expressions.js";

export class Checker extends ExpressionChecker {
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


  protected classType(decl: ClassDecl): Type {
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

  protected functionType(fn: FunctionDecl): Type {
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

  protected hoistDeclarations(body: Stmt[], scope: Scope): void {
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

  protected stmt(stmt: Stmt): void {
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
          this.recordReturn(this.expr(stmt.value));
          return;
        }
        if (expected.kind === "kuchnahi") {
          this.expr(stmt.value);
          this.error("Arre yaar, yeh kaam kuchnahi (void) hai — value wapas nahi kar sakte.", stmt.span);
          return;
        }
        const actual = this.exprWithContext(stmt.value, expected);
        this.recordReturn(actual);
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
      case "ExternDecl": {
        const declared = stmt.typeAnnotation !== null ? this.resolveType(stmt.typeAnnotation) : KOI;
        if (!this.declareValue(stmt.name, declared, true, stmt.span)) {
          this.error(`Arre yaar, '${stmt.name}' pehle se declared hai.`, stmt.span);
        }
        return;
      }
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

  /**
   * Checks a function body and reports what its `wapas` statements actually
   * returned — which is how an unannotated lambda gets a real return type
   * instead of koi. `contextParams` types unannotated parameters.
   */

  protected checkFunctionBody(
    typeParams: string[],
    params: FunctionDecl["params"],
    returnType: TypeNode | null,
    body: BlockStmt,
    isAsync: boolean,
    contextParams?: Type[]
  ): Type {
    const outerScope = this.scope;
    const outerLoopDepth = this.loopDepth;
    const fnScope = new Scope(outerScope);
    this.scope = fnScope;
    for (const tp of typeParams) fnScope.declareType(tp, typeParam(tp));
    const info = this.paramInfo(params, contextParams);
    for (const b of info.bindings) {
      if (!this.declareValue(b.name, b.type, true, b.span)) {
        this.error(`Arre yaar, parameter '${b.name}' do dafa likha hai.`, b.span);
      }
    }
    this.loopDepth = 0;
    this.returnTypes.push(this.internalReturnType(returnType, isAsync));
    this.observedReturns.push([]);
    this.hoistDeclarations(body.body, fnScope);
    for (const s of body.body) this.stmt(s);
    const observed = this.observedReturns.pop()!;
    this.returnTypes.pop();
    this.scope = outerScope;
    this.loopDepth = outerLoopDepth;
    if (observed.length === 0) return KUCHNAHI;
    return observed.reduce((a, b) => unify(a, b));
  }

  protected blockInNewScope(block: BlockStmt, narrowings?: Map<string, Type>): void {
    const outer = this.scope;
    this.scope = new Scope(outer);
    if (narrowings !== undefined) {
      for (const [name, t] of narrowings) this.scope.shadow(name, t);
    }
    this.hoistDeclarations(block.body, this.scope);
    for (const s of block.body) this.stmt(s);
    this.scope = outer;
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
