// UrLang's static type system: primitives, literals, unions, structural
// objects, arrays, Wada<T> (Promise), functions, and generic type parameters.

export interface PropInfo {
  type: Type;
  optional: boolean;
  /**
   * Set for a `nijee` class member: the class that owns it. The property stays
   * in the type (the class's own code needs it) but is unreachable from
   * outside, and it makes the type unassignable to a plain object type that
   * merely happens to declare the same name.
   */
  privateOwner?: string;
}

export type Type =
  | { kind: "adad" } // number
  | { kind: "lafz" } // string
  | { kind: "bool" }
  | { kind: "koi" } // any
  | { kind: "khaali" } // null
  | { kind: "kuchnahi" } // void
  | { kind: "literal"; value: string | number | boolean }
  | { kind: "array"; element: Type }
  | { kind: "object"; props: Map<string, PropInfo> }
  | { kind: "union"; members: Type[] }
  | { kind: "wada"; value: Type } // Promise<T>
  | {
      kind: "function";
      typeParams: string[];
      params: Type[];
      /** How many leading params are required (rest excluded from params). */
      requiredParams: number;
      /** Element type of a trailing rest param, or null. */
      restParam: Type | null;
      returnType: Type;
    }
  | { kind: "typeParam"; name: string }
  | {
      kind: "class";
      name: string;
      /** Parent class name for buzurg resolution, or null. */
      parent: string | null;
      ctorParams: Type[];
      ctorRequired: number;
      /** The structural type of instances (fields + methods, incl. inherited). */
      instance: Type;
      /** `sakit` members, reached through the class itself (`Ginti.kul`). */
      statics: Map<string, PropInfo>;
      /** `nijee` member names — present on the instance, but only from inside. */
      privates: ReadonlySet<string>;
      /** `jamaat Dabba<T>` — resolved at `naya Dabba<adad>(…)`. */
      typeParams: string[];
    };

export function functionOf(
  params: Type[],
  returnType: Type,
  opts: { typeParams?: string[]; requiredParams?: number; restParam?: Type | null } = {}
): Type {
  return {
    kind: "function",
    typeParams: opts.typeParams ?? [],
    params,
    requiredParams: opts.requiredParams ?? params.length,
    restParam: opts.restParam ?? null,
    returnType,
  };
}

export const ADAD: Type = { kind: "adad" };
export const LAFZ: Type = { kind: "lafz" };
export const BOOL: Type = { kind: "bool" };
export const KOI: Type = { kind: "koi" };
export const KHAALI: Type = { kind: "khaali" };
export const KUCHNAHI: Type = { kind: "kuchnahi" };

export function arrayOf(element: Type): Type {
  return { kind: "array", element };
}

export function wadaOf(value: Type): Type {
  return { kind: "wada", value };
}

export function literal(value: string | number | boolean): Type {
  return { kind: "literal", value };
}

export function typeParam(name: string): Type {
  return { kind: "typeParam", name };
}

export function objectType(props: [string, Type, boolean][]): Type {
  return { kind: "object", props: new Map(props.map(([k, t, o]) => [k, { type: t, optional: o }])) };
}

/** Builds a union: flattens nested unions, dedupes, collapses singletons. */
export function union(members: Type[]): Type {
  const flat: Type[] = [];
  const add = (t: Type): void => {
    if (t.kind === "union") {
      for (const m of t.members) add(m);
      return;
    }
    if (!flat.some((f) => typesIdentical(f, t))) flat.push(t);
  };
  for (const m of members) add(m);
  if (flat.length === 1) return flat[0]!;
  return { kind: "union", members: flat };
}

function typesIdentical(a: Type, b: Type): boolean {
  return assignable(a, b) && assignable(b, a) && a.kind === b.kind;
}

/** Literal types widen to their base primitive; everything else is unchanged. */
export function widen(t: Type): Type {
  if (t.kind === "literal") {
    switch (typeof t.value) {
      case "string": return LAFZ;
      case "number": return ADAD;
      case "boolean": return BOOL;
    }
  }
  if (t.kind === "union") return union(t.members.map(widen));
  return t;
}

/** The base kind a literal belongs to. */
export function literalBase(t: Type): "adad" | "lafz" | "bool" | null {
  if (t.kind !== "literal") return null;
  switch (typeof t.value) {
    case "string": return "lafz";
    case "number": return "adad";
    default: return "bool";
  }
}

export function isNumeric(t: Type): boolean {
  return t.kind === "adad" || t.kind === "koi" || literalBase(t) === "adad";
}

export function isString(t: Type): boolean {
  return t.kind === "lafz" || t.kind === "koi" || literalBase(t) === "lafz";
}

export function isBool(t: Type): boolean {
  return t.kind === "bool" || t.kind === "koi" || literalBase(t) === "bool";
}

/** `intezar x` — unwraps Wada<T> to T; awaiting a non-promise yields the value. */
export function unwrapWada(t: Type): Type {
  if (t.kind === "wada") return t.value;
  if (t.kind === "union") return union(t.members.map(unwrapWada));
  return t;
}

export function typeName(t: Type): string {
  switch (t.kind) {
    case "literal":
      return typeof t.value === "string" ? JSON.stringify(t.value) : String(t.value);
    case "array": {
      const inner = typeName(t.element);
      return t.element.kind === "union" || t.element.kind === "function" ? `(${inner})[]` : `${inner}[]`;
    }
    case "object": {
      const parts: string[] = [];
      for (const [k, p] of t.props) parts.push(`${k}${p.optional ? "?" : ""}: ${typeName(p.type)}`);
      return parts.length === 0 ? "{}" : `{ ${parts.join(", ")} }`;
    }
    case "union":
      return t.members.map((m) => (m.kind === "function" ? `(${typeName(m)})` : typeName(m))).join(" | ");
    case "wada":
      return `Wada<${typeName(t.value)}>`;
    case "function": {
      const tp = t.typeParams.length > 0 ? `<${t.typeParams.join(", ")}>` : "";
      const params = t.params.map((p, i) => `${typeName(p)}${i >= t.requiredParams ? "?" : ""}`);
      if (t.restParam !== null) params.push(`...${typeName(t.restParam)}[]`);
      return `kaam${tp}(${params.join(", ")}): ${typeName(t.returnType)}`;
    }
    case "typeParam":
      return t.name;
    case "class":
      return `jamaat ${t.name}`;
    default:
      return t.kind;
  }
}

/** Can a value of type `source` be assigned to a slot of type `target`? */
export function assignable(target: Type, source: Type): boolean {
  if (target.kind === "koi" || source.kind === "koi") return true;
  if (target === source) return true;

  // A union source fits only if every member fits.
  if (source.kind === "union") return source.members.every((m) => assignable(target, m));
  // A union target admits any member match.
  if (target.kind === "union") return target.members.some((m) => assignable(m, source));

  if (source.kind === "literal") {
    if (target.kind === "literal") return target.value === source.value;
    return target.kind === literalBase(source);
  }

  switch (target.kind) {
    case "adad":
    case "lafz":
    case "bool":
    case "khaali":
    case "kuchnahi":
      return source.kind === target.kind;
    case "array":
      return source.kind === "array" && assignable(target.element, source.element);
    case "wada":
      return source.kind === "wada" && assignable(target.value, source.value);
    case "object": {
      if (source.kind !== "object") return false;
      for (const [key, targetProp] of target.props) {
        const sourceProp = source.props.get(key);
        if (sourceProp === undefined) {
          if (!targetProp.optional) return false;
          continue;
        }
        // A `nijee` member only satisfies the same class's own member — a plain
        // object type declaring the same name must not be able to stand in.
        if (sourceProp.privateOwner !== targetProp.privateOwner) return false;
        if (!assignable(targetProp.type, sourceProp.type)) return false;
      }
      return true;
    }
    case "function": {
      if (source.kind !== "function") return false;
      // A function may ignore trailing parameters — `xs.map(kaam (n) { … })`
      // satisfies a `(T, adad) => U` slot. It may not demand *more* than it is
      // given. Parameters are contravariant, the return type covariant.
      if (source.params.length > target.params.length) return false;
      return (
        source.params.every((p, i) => assignable(p, target.params[i]!)) &&
        assignable(target.returnType, source.returnType)
      );
    }
    case "typeParam":
      return source.kind === "typeParam" && source.name === target.name;
    case "class":
      return source.kind === "class" && source.name === target.name;
    case "literal":
      return false; // handled above via source.kind === "literal"
  }
}

/** Least upper bound for inference: identical → that type, else a union (TS-style). */
export function unify(a: Type, b: Type): Type {
  if (assignable(a, b) && assignable(b, a)) return a.kind === "koi" ? b : a;
  if (assignable(a, b)) return a; // b is a literal of a, etc.
  if (assignable(b, a)) return b;
  return union([a, b]);
}

/** True when any of `names` appears anywhere inside `t`. */
export function mentionsTypeParam(t: Type, names: readonly string[]): boolean {
  switch (t.kind) {
    case "typeParam":
      return names.includes(t.name);
    case "array":
      return mentionsTypeParam(t.element, names);
    case "wada":
      return mentionsTypeParam(t.value, names);
    case "union":
      return t.members.some((m) => mentionsTypeParam(m, names));
    case "object":
      return [...t.props.values()].some((p) => mentionsTypeParam(p.type, names));
    case "function":
      return (
        t.params.some((p) => mentionsTypeParam(p, names)) ||
        (t.restParam !== null && mentionsTypeParam(t.restParam, names)) ||
        mentionsTypeParam(t.returnType, names)
      );
    default:
      return false;
  }
}

/** Replaces type parameters by name throughout a type. */
export function substitute(t: Type, subst: ReadonlyMap<string, Type>): Type {
  switch (t.kind) {
    case "typeParam":
      return subst.get(t.name) ?? t;
    case "array":
      return arrayOf(substitute(t.element, subst));
    case "wada":
      return wadaOf(substitute(t.value, subst));
    case "union":
      return union(t.members.map((m) => substitute(m, subst)));
    case "object": {
      const props = new Map<string, PropInfo>();
      for (const [k, p] of t.props) props.set(k, { type: substitute(p.type, subst), optional: p.optional });
      return { kind: "object", props };
    }
    case "function":
      return {
        kind: "function",
        typeParams: t.typeParams.filter((name) => !subst.has(name)),
        params: t.params.map((p) => substitute(p, subst)),
        requiredParams: t.requiredParams,
        restParam: t.restParam === null ? null : substitute(t.restParam, subst),
        returnType: substitute(t.returnType, subst),
      };
    case "class": {
      // `naya Dabba<adad>(…)` — push the argument through the whole class type.
      const statics = new Map<string, PropInfo>();
      for (const [k, p] of t.statics) statics.set(k, { type: substitute(p.type, subst), optional: p.optional });
      return {
        ...t,
        typeParams: t.typeParams.filter((name) => !subst.has(name)),
        ctorParams: t.ctorParams.map((p) => substitute(p, subst)),
        instance: substitute(t.instance, subst),
        statics,
      };
    }
    default:
      return t;
  }
}

/**
 * Infers generic type arguments by structurally matching declared parameter
 * types against argument types. Uninferrable params become koi; literal
 * inferences widen (matching TS's default behavior for mutable positions).
 */
export function inferTypeArguments(
  typeParams: string[],
  paramTypes: Type[],
  argTypes: Type[]
): Map<string, Type> {
  const subst = new Map<string, Type>();
  const match = (param: Type, arg: Type): void => {
    switch (param.kind) {
      case "typeParam":
        if (typeParams.includes(param.name) && !subst.has(param.name)) {
          subst.set(param.name, widen(arg));
        }
        return;
      case "array":
        if (arg.kind === "array") match(param.element, arg.element);
        return;
      case "wada":
        if (arg.kind === "wada") match(param.value, arg.value);
        return;
      case "object":
        if (arg.kind === "object") {
          for (const [k, p] of param.props) {
            const ap = arg.props.get(k);
            if (ap !== undefined) match(p.type, ap.type);
          }
        }
        return;
      case "union":
        for (const m of param.members) match(m, arg);
        return;
      case "function":
        if (arg.kind === "function") {
          param.params.forEach((p, i) => {
            if (arg.params[i] !== undefined) match(p, arg.params[i]!);
          });
          match(param.returnType, arg.returnType);
        }
        return;
      default:
        return;
    }
  };
  paramTypes.forEach((p, i) => {
    if (argTypes[i] !== undefined) match(p, argTypes[i]!);
  });
  for (const name of typeParams) {
    if (!subst.has(name)) subst.set(name, KOI);
  }
  return subst;
}
