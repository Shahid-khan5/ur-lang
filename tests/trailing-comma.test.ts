// Trailing commas are allowed everywhere a comma-separated list is closed by a
// bracket — the way JS/TS allow them. Formatters and multi-line code depend on it.
import { describe, expect, it } from "vitest";
import { compile } from "../src/compiler.js";

function ok(src: string, fileName = "t.ur"): void {
  const result = compile(src, { fileName });
  expect(result.diagnostics.map((d) => d.message), src).toEqual([]);
}

describe("trailing commas", () => {
  it("object literals", () => {
    ok('pakka o = { a: 1, b: 2, };');
  });

  it("nested object literals across lines", () => {
    ok(`pakka conf = {
  port: 3000,
  fetch: kaam (req: koi): koi { wapas req; },
};`);
  });

  it("array literals", () => {
    ok("pakka xs = [1, 2, 3,];");
  });

  it("call arguments", () => {
    ok("kaam f(a: adad, b: adad): adad { wapas a + b; }\npakka n = f(1, 2,);");
  });

  it("parameter lists", () => {
    ok("kaam f(a: adad, b: adad,): adad { wapas a + b; }");
  });

  it("constructor calls and class declarations", () => {
    ok(`jamaat Shakhs {
  naam: lafz;
  banao(naam: lafz,) {
    yeh.naam = naam;
  }
}
pakka s = naya Shakhs("Ali",);`);
  });

  it("import and export lists", () => {
    ok('lao { a, b, } "kahin" se;');
  });

  it("object type annotations", () => {
    ok("qisim T = { a: adad, b: lafz, };\npakka t: T = { a: 1, b: \"x\" };");
  });

  it("generic type arguments and type parameters", () => {
    ok("kaam pehla<T,>(xs: T[]): T { wapas xs[0]; }");
  });

  it("spread elements with a trailing comma", () => {
    ok("pakka xs = [1, 2];\npakka ys = [...xs, 3,];\npakka o = { ...{ a: 1 }, b: 2, };");
  });

  it("jsx attributes and children are unaffected", () => {
    ok('bhejo kaam App(): koi { wapas <div a="1" b="2"/>; }', "t.urx");
  });

  it("still rejects a leading or doubled comma", () => {
    expect(compile("pakka xs = [1,, 2];").diagnostics.length).toBeGreaterThan(0);
    expect(compile("pakka o = { , a: 1 };").diagnostics.length).toBeGreaterThan(0);
    expect(compile("pakka xs = [,];").diagnostics.length).toBeGreaterThan(0);
  });
});
