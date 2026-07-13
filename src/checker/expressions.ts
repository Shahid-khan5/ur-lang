// Expression checking: types every expression form, contextual typing, control
// flow narrowing, and JSX. Statements live one layer up (./checker.ts).
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
import { CheckerBase } from "./base.js";

export abstract class ExpressionChecker extends CheckerBase {
  protected condition(expr: Expr): void {
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
  protected narrowCondition(cond: Expr): { thenMap: Map<string, Type>; elseMap: Map<string, Type> } {
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
  protected equalityFact(lhs: Expr, rhs: Expr): [string, Type, Type] | null {
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


  protected exprWithContext(expr: Expr, expected: Type): Type {
    // A lambda handed to a known function slot gets its parameter types from
    // that slot: `xs.map(kaam (n) { … })` sees `n` as the element type, with no
    // annotation. (An explicit annotation always wins.)
    if (expr.kind === "FunctionExpr" && expected.kind === "function") {
      return this.functionExprWithContext(expr, expected);
    }
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

  protected expr(expr: Expr): Type {
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
        if (expr.op === "??") {
          // The left falls back to the right when it is khaali, so the result is
          // (left minus khaali) unified with right — `n ?? 0` on `adad | khaali`
          // is plain `adad`.
          const leftType = this.expr(expr.left);
          const rightType = this.expr(expr.right);
          const present = this.narrowExclude(leftType, KHAALI);
          if (present.kind === "khaali" || present.kind === "kuchnahi") return rightType;
          return unify(present, rightType);
        }
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
          // Generic call: type the arguments *in context* first (a lambda needs
          // its parameter types — `xs.map(kaam (n) { … })` must see n: T, whose
          // T is already concrete even though the result type U is not), then
          // infer the type arguments from what came back.
          const argTypes = expr.args.map((a, i) => {
            if (a.kind === "Spread") return this.expr(a.argument);
            const declared = i < calleeType.params.length ? calleeType.params[i]! : calleeType.restParam;
            // Only a lambda gets context here, and only when the parameter types
            // it would inherit are already concrete. Checking, say, `[1, 2, 3]`
            // against an uninstantiated `T[]` would reject perfectly good code.
            const usable =
              declared !== null &&
              a.kind === "FunctionExpr" &&
              declared.kind === "function" &&
              !declared.params.some((p) => mentionsTypeParam(p, calleeType.typeParams));
            return usable ? this.exprWithContext(a, declared) : this.expr(a);
          });
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
      case "FunctionExpr":
        return this.functionExprType(expr);
      case "JsxElement":
        return this.jsxElement(expr);
      case "JsxFragment":
        for (const child of expr.children) this.jsxChild(child);
        return KOI;
    }
    return KOI;
  }

  // ---------- JSX ----------

  protected jsxChild(child: JsxChild): void {
    if (child.kind === "JsxText") return;
    if (child.kind === "JsxExprContainer") this.expr(child.expr);
    else this.expr(child);
  }

  /** Resolves a (possibly dotted) capitalized tag name as a value. */
  protected jsxComponentType(tagName: string, span: Span): Type | null {
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
  protected jsxElement(expr: JsxElement): Type {
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

  /** A lambda handed to a known function slot: its params come from that slot. */
  protected functionExprWithContext(expr: FunctionExpr, expected: Extract<Type, { kind: "function" }>): Type {
    return this.functionExprType(expr, expected.params);
  }

  /**
   * Types a `kaam (…) { … }` expression. Without a return annotation the type
   * comes from what the body actually returns — that is what lets
   * `xs.map(kaam (n) { wapas n * 2; })` come back as adad[] rather than koi[].
   */
  protected functionExprType(expr: FunctionExpr, contextParams?: Type[]): Type {
    const info = this.silently(() => this.paramInfo(expr.params, contextParams));
    const declared = expr.returnType !== null ? this.silently(() => this.resolveType(expr.returnType!)) : null;
    const observed = this.checkFunctionBody(
      [],
      expr.params,
      expr.returnType,
      expr.body,
      expr.isAsync,
      contextParams
    );
    let returnType = declared ?? observed;
    if (expr.isAsync && returnType.kind !== "wada") returnType = wadaOf(returnType);
    return {
      kind: "function",
      typeParams: [],
      params: info.types,
      requiredParams: info.required,
      restParam: info.rest,
      returnType,
    };
  }


  protected assignTarget(target: Expr): Type | null {
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
