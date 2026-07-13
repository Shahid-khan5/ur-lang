import { describe, expect, it } from "vitest";
import { parse } from "../src/parser.js";
import { check } from "../src/checker.js";

/** Returns diagnostic messages for a source snippet (empty array = type-checks clean). */
function errors(src: string): string[] {
  return check(parse(src)).map((d) => d.message);
}

describe("checker: variables and scope", () => {
  it("accepts well-typed declarations", () => {
    expect(errors('rakho x: adad = 5; rakho s: lafz = "hi"; rakho b: bool = sach;')).toEqual([]);
  });

  it("rejects annotation/initializer mismatch", () => {
    expect(errors('rakho x: adad = "hello";')).toHaveLength(1);
  });

  it("infers types from initializers and enforces them on reassignment", () => {
    expect(errors('rakho x = 5; x = "str";')).toHaveLength(1);
    expect(errors("rakho x = 5; x = 6;")).toEqual([]);
  });

  it("rejects use of undeclared variables", () => {
    expect(errors("bolo y;")).toHaveLength(1);
  });

  it("rejects reassignment of pakka (const)", () => {
    expect(errors("pakka x = 5; x = 6;")).toHaveLength(1);
  });

  it("rejects redeclaration in the same scope but allows shadowing", () => {
    expect(errors("rakho x = 1; rakho x = 2;")).toHaveLength(1);
    expect(errors("rakho x = 1; { rakho x = 2; }")).toEqual([]);
  });

  it("scopes block variables (not visible outside)", () => {
    expect(errors("{ rakho x = 1; } bolo x;")).toHaveLength(1);
  });

  it("koi (any) is compatible with everything", () => {
    expect(errors('rakho x: koi = 5; x = "str"; rakho y: adad = x;')).toEqual([]);
  });
});

describe("checker: operators", () => {
  it("allows arithmetic on numbers only", () => {
    expect(errors("rakho x = 5 - 3;")).toEqual([]);
    expect(errors('rakho x = "a" - 3;')).toHaveLength(1);
    expect(errors('rakho x = "a" * "b";')).toHaveLength(1);
  });

  it("+ concatenates strings and adds numbers", () => {
    expect(errors('rakho s = "a" + "b"; rakho n = 1 + 2; rakho m = "a" + 1;')).toEqual([]);
    expect(errors("rakho x = sach + 1;")).toHaveLength(1);
  });

  it("comparisons require numbers", () => {
    expect(errors("rakho b = 1 < 2;")).toEqual([]);
    expect(errors('rakho b = "a" < 2;')).toHaveLength(1);
  });

  it("equality requires comparable operand types", () => {
    expect(errors("rakho b = 1 == 2;")).toEqual([]);
    expect(errors('rakho b = 1 == "1";')).toHaveLength(1);
  });

  it("logical operators require bool operands", () => {
    expect(errors("rakho b = sach && jhoot;")).toEqual([]);
    expect(errors("rakho b = 1 && sach;")).toHaveLength(1);
  });

  it("unary operators are typed", () => {
    expect(errors("rakho x = -5; rakho b = !sach;")).toEqual([]);
    expect(errors('rakho x = -"a";')).toHaveLength(1);
    expect(errors("rakho b = !5;")).toHaveLength(1);
  });
});

describe("checker: control flow", () => {
  it("conditions must be bool", () => {
    expect(errors("agar (sach) { bolo 1; }")).toEqual([]);
    expect(errors("agar (5) { bolo 1; }")).toHaveLength(1);
    expect(errors("jab tak (1 + 1) { bolo 1; }")).toHaveLength(1);
  });

  it("bas/agla only allowed inside loops", () => {
    expect(errors("bas;")).toHaveLength(1);
    expect(errors("agla;")).toHaveLength(1);
    expect(errors("jab tak (sach) { bas; }")).toEqual([]);
  });
});

describe("checker: functions", () => {
  it("checks call arity", () => {
    expect(errors("kaam f(a: adad) { bolo a; } f(1, 2);")).toHaveLength(1);
    expect(errors("kaam f(a: adad) { bolo a; } f();")).toHaveLength(1);
  });

  it("checks argument types", () => {
    expect(errors('kaam f(a: adad) { bolo a; } f("str");')).toHaveLength(1);
    expect(errors("kaam f(a: adad) { bolo a; } f(42);")).toEqual([]);
  });

  it("checks return type against annotation", () => {
    expect(errors('kaam f(): adad { wapas "str"; }')).toHaveLength(1);
    expect(errors("kaam f(): adad { wapas 42; }")).toEqual([]);
  });

  it("bare wapas only valid for kuchnahi (void) functions", () => {
    expect(errors("kaam f(): adad { wapas; }")).toHaveLength(1);
    expect(errors("kaam f() { wapas; }")).toEqual([]);
  });

  it("wapas outside a function is an error", () => {
    expect(errors("wapas 5;")).toHaveLength(1);
  });

  it("uses declared return type at call sites", () => {
    expect(errors("kaam f(): adad { wapas 1; } rakho x: lafz = f();")).toHaveLength(1);
    expect(errors("kaam f(): adad { wapas 1; } rakho x: adad = f();")).toEqual([]);
  });

  it("supports recursion and forward references at top level", () => {
    expect(errors("kaam fib(n: adad): adad { agar (n < 2) { wapas n; } wapas fib(n - 1) + fib(n - 2); }")).toEqual([]);
    expect(errors("kaam a(): adad { wapas b(); } kaam b(): adad { wapas 1; }")).toEqual([]);
  });

  it("rejects calling a non-function", () => {
    expect(errors("rakho x = 5; x();")).toHaveLength(1);
  });
});

describe("checker: arrays, objects, externals", () => {
  it("infers homogeneous array element types", () => {
    expect(errors("rakho xs = [1, 2, 3]; rakho x: adad = xs[0];")).toEqual([]);
    expect(errors('rakho xs = [1, 2]; xs[0] = "str";')).toHaveLength(1);
  });

  it("enforces annotated array types", () => {
    expect(errors('rakho xs: adad[] = [1, "two"];')).toHaveLength(1);
  });

  it("index must be a number", () => {
    expect(errors('rakho xs = [1]; bolo xs["a"];')).toHaveLength(1);
  });

  it("allows known JS globals like Math and console", () => {
    expect(errors("rakho x: adad = 5; bolo Math.floor(x);")).toEqual([]);
  });

  it("bahar declares external globals as koi", () => {
    expect(errors("meraGlobal(1);")).toHaveLength(1);
    expect(errors("bahar meraGlobal; meraGlobal(1);")).toEqual([]);
  });

  it("imported names are usable", () => {
    expect(errors('lao { add } "./math.ur" se; bolo add(1, 2);')).toEqual([]);
  });
});

describe("checker: multiple diagnostics", () => {
  it("collects all errors instead of stopping at the first", () => {
    const errs = errors('rakho a: adad = "x"; rakho b: lafz = 5; bolo undeclared;');
    expect(errs).toHaveLength(3);
  });
});
