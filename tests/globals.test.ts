// Standard JS globals work without a `bahar` declaration — including with
// `naya`, which previously only looked at user-declared bindings.
import { describe, expect, it } from "vitest";
import { compile } from "../src/compiler.js";

function ok(src: string): void {
  expect(compile(src).diagnostics.map((d) => d.message), src).toEqual([]);
}

describe("known globals", () => {
  it("constructs built-ins with naya", () => {
    ok("pakka ab = naya Date();");
    ok('pakka u = naya URL("https://misal.com/raah");');
    ok("pakka m = naya Map();");
    ok('pakka e = naya Error("kuch ghalat");');
  });

  it("uses web/runtime globals as values", () => {
    ok('pakka p = naya URL("https://a.b/c").pathname;');
    ok('pakka r = Response.json({ a: 1 });');
    ok("pakka t = naya TextEncoder().encode(\"x\");");
    ok("structuredClone({ a: 1 });");
  });

  it("still rejects an undeclared name with naya", () => {
    const result = compile("pakka x = naya KoiAnjaaniShay();");
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("UR2035");
  });

  it("still rejects naya on a non-class value", () => {
    const result = compile("pakka n = 5;\npakka x = naya n();");
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});
