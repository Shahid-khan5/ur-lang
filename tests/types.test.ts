// Unit tests for the type algebra: assignability, widening, unions,
// structural objects, generics substitution/inference, Wada<T>.
import { describe, expect, it } from "vitest";
import {
  ADAD,
  BOOL,
  KHAALI,
  KOI,
  LAFZ,
  Type,
  arrayOf,
  assignable,
  literal,
  objectType,
  typeName,
  typeParam,
  union,
  unwrapWada,
  wadaOf,
  widen,
  inferTypeArguments,
  substitute,
  unify,
} from "../src/types.js";

function fn(params: Type[], returnType: Type, typeParams: string[] = []): Type {
  return { kind: "function", typeParams, params, requiredParams: params.length, restParam: null, returnType };
}

describe("assignability: primitives and koi", () => {
  it("same primitives are assignable", () => {
    expect(assignable(ADAD, ADAD)).toBe(true);
    expect(assignable(LAFZ, ADAD)).toBe(false);
  });

  it("koi is assignable both ways", () => {
    expect(assignable(KOI, LAFZ)).toBe(true);
    expect(assignable(ADAD, KOI)).toBe(true);
  });
});

describe("literal types", () => {
  it("a literal is assignable to its base primitive but not vice versa", () => {
    expect(assignable(LAFZ, literal("chota"))).toBe(true);
    expect(assignable(literal("chota"), LAFZ)).toBe(false);
    expect(assignable(ADAD, literal(5))).toBe(true);
    expect(assignable(BOOL, literal(true))).toBe(true);
  });

  it("distinct literals are not assignable to each other", () => {
    expect(assignable(literal("chota"), literal("bara"))).toBe(false);
    expect(assignable(literal("chota"), literal("chota"))).toBe(true);
  });

  it("widen turns literals into their base type", () => {
    expect(widen(literal("x"))).toEqual(LAFZ);
    expect(widen(literal(5))).toEqual(ADAD);
    expect(widen(literal(false))).toEqual(BOOL);
    expect(widen(ADAD)).toEqual(ADAD);
  });
});

describe("union types", () => {
  it("a member is assignable to the union", () => {
    const u = union([LAFZ, KHAALI]);
    expect(assignable(u, LAFZ)).toBe(true);
    expect(assignable(u, KHAALI)).toBe(true);
    expect(assignable(u, ADAD)).toBe(false);
  });

  it("a union is assignable to a target only if every member is", () => {
    const u = union([LAFZ, KHAALI]);
    expect(assignable(LAFZ, u)).toBe(false);
    expect(assignable(union([LAFZ, KHAALI, ADAD]), u)).toBe(true);
  });

  it("union construction flattens, dedupes, and collapses singletons", () => {
    expect(union([LAFZ, LAFZ])).toEqual(LAFZ);
    const nested = union([LAFZ, union([ADAD, KHAALI])]);
    expect(typeName(nested)).toBe("lafz | adad | khaali");
  });

  it("literals of a union work for option-style APIs", () => {
    const options = union([literal("chota"), literal("bara")]);
    expect(assignable(options, literal("chota"))).toBe(true);
    expect(assignable(options, LAFZ)).toBe(false);
  });
});

describe("structural object types", () => {
  const shakhs = objectType([
    ["naam", LAFZ, false],
    ["umar", ADAD, false],
  ]);

  it("width subtyping: extra source props are fine", () => {
    const bara = objectType([
      ["naam", LAFZ, false],
      ["umar", ADAD, false],
      ["sheher", LAFZ, false],
    ]);
    expect(assignable(shakhs, bara)).toBe(true);
    expect(assignable(bara, shakhs)).toBe(false); // missing sheher
  });

  it("missing or mistyped props fail", () => {
    expect(assignable(shakhs, objectType([["naam", LAFZ, false]]))).toBe(false);
    expect(
      assignable(shakhs, objectType([["naam", LAFZ, false], ["umar", LAFZ, false]]))
    ).toBe(false);
  });

  it("optional props may be absent", () => {
    const withOpt = objectType([
      ["naam", LAFZ, false],
      ["laqab", LAFZ, true],
    ]);
    expect(assignable(withOpt, objectType([["naam", LAFZ, false]]))).toBe(true);
  });

  it("typeName prints object types readably", () => {
    expect(typeName(shakhs)).toBe("{ naam: lafz, umar: adad }");
  });
});

describe("arrays and Wada (covariant like TS)", () => {
  it("array covariance", () => {
    expect(assignable(arrayOf(LAFZ), arrayOf(literal("a")))).toBe(true);
    expect(assignable(arrayOf(literal("a")), arrayOf(LAFZ))).toBe(false);
  });

  it("wada covariance and unwrap", () => {
    expect(assignable(wadaOf(ADAD), wadaOf(literal(5)))).toBe(true);
    expect(unwrapWada(wadaOf(ADAD))).toEqual(ADAD);
    expect(unwrapWada(ADAD)).toEqual(ADAD); // awaiting a non-promise is the value itself
    expect(unwrapWada(KOI)).toEqual(KOI);
  });
});

describe("unify (inference join)", () => {
  it("identical types unify to themselves", () => {
    expect(unify(ADAD, ADAD)).toEqual(ADAD);
  });

  it("different types unify to a union (TS-style)", () => {
    expect(typeName(unify(ADAD, LAFZ))).toBe("adad | lafz");
  });

  it("literals unify with their base into the base", () => {
    expect(unify(LAFZ, literal("a"))).toEqual(LAFZ);
  });
});

describe("generics: substitution and inference", () => {
  const T = typeParam("T");

  it("substitute replaces type params", () => {
    expect(substitute(arrayOf(T), new Map([["T", ADAD]]))).toEqual(arrayOf(ADAD));
    expect(substitute(wadaOf(T), new Map([["T", LAFZ]]))).toEqual(wadaOf(LAFZ));
  });

  it("infers type arguments from call arguments", () => {
    // kaam pehla<T>(xs: T[]): T — called with adad[]
    const subst = inferTypeArguments(["T"], [arrayOf(T)], [arrayOf(ADAD)]);
    expect(subst.get("T")).toEqual(ADAD);
  });

  it("infers through wada and objects", () => {
    const subst = inferTypeArguments(["T"], [wadaOf(T)], [wadaOf(LAFZ)]);
    expect(subst.get("T")).toEqual(LAFZ);
    const subst2 = inferTypeArguments(
      ["T"],
      [objectType([["qeemat", T, false]])],
      [objectType([["qeemat", ADAD, false]])]
    );
    expect(subst2.get("T")).toEqual(ADAD);
  });

  it("uninferred params fall back to koi", () => {
    const subst = inferTypeArguments(["T"], [ADAD], [ADAD]);
    expect(subst.get("T")).toEqual(KOI);
  });

  it("widens literal inferences", () => {
    const subst = inferTypeArguments(["T"], [typeParam("T")], [literal(5)]);
    expect(subst.get("T")).toEqual(ADAD);
  });

  it("function types check param/return compatibility", () => {
    expect(assignable(fn([ADAD], LAFZ), fn([ADAD], literal("x")))).toBe(true);
    expect(assignable(fn([ADAD], LAFZ), fn([LAFZ], LAFZ))).toBe(false);
  });
});
