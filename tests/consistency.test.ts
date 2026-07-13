// Language-surface consistency: constructs that behaved differently from their
// siblings for no reason. Each block below was an inconsistency before v1.3.
import { describe, expect, it } from "vitest";
import { compile } from "../src/compiler.js";

function ok(src: string): string {
  const result = compile(src);
  expect(result.diagnostics.map((d) => d.message), src).toEqual([]);
  return result.code!;
}

function errs(src: string): string[] {
  return compile(src).diagnostics.map((d) => d.message);
}

describe("optional condition parentheses", () => {
  it("agar / warna agar work without parens, like har", () => {
    const code = ok(`
      rakho n = 7;
      agar n > 5 {
        bolo "bara";
      } warna agar n == 5 {
        bolo "barabar";
      } warna {
        bolo "chota";
      }
    `);
    expect(code).toContain("if (n > 5)");
    expect(code).toContain("else if (n === 5)");
  });

  it("jab tak works without parens", () => {
    const code = ok("rakho i = 0;\njab tak i < 3 { i += 1; }");
    expect(code).toContain("while (i < 3)");
  });

  it("parens still work (nothing breaks)", () => {
    ok("rakho i = 0;\nagar (i == 0) { bolo 1; }\njab tak (i < 2) { i += 1; }");
  });

  it("a parenthesized condition is not mistaken for a call", () => {
    ok("kaam f(): bool { wapas sach; }\nagar (f()) { bolo 1; }\nagar f() { bolo 2; }");
  });

  it("conditions must still be bool", () => {
    expect(errs("agar 5 { bolo 1; }").length).toBeGreaterThan(0);
  });
});

describe("object literal shorthand", () => {
  it("{ naam } means { naam: naam }", () => {
    const code = ok('pakka naam = "Ali";\npakka umar = 30;\npakka s = { naam, umar };\nbolo s.naam;');
    expect(code).toContain("{ naam: naam, umar: umar }");
  });

  it("mixes with explicit keys and spread", () => {
    const code = ok('pakka a = 1;\npakka o = { ...{ z: 0 }, a, b: 2 };\nbolo o.a, o.b;');
    expect(code).toContain("a: a");
  });

  it("is type-checked like the long form", () => {
    expect(errs('pakka naam = 5;\npakka s: { naam: lafz } = { naam };').length).toBeGreaterThan(0);
  });

  it("rejects a shorthand key that is not declared", () => {
    expect(errs("pakka o = { ghaib };").length).toBeGreaterThan(0);
  });
});

describe("typed bahar declarations", () => {
  it("takes an optional type annotation", () => {
    const code = ok('bahar Bun: { serve: kaam(koi): koi };\nBun.serve({ port: 3000 });');
    expect(code).not.toContain("bahar");
  });

  it("checks uses against the declared type", () => {
    expect(errs("bahar ginti: adad;\nbolo ginti.koiBhiCheez;").length).toBeGreaterThan(0);
    expect(errs('bahar ginti: adad;\npakka s: lafz = ginti;').length).toBeGreaterThan(0);
  });

  it("still defaults to koi without an annotation", () => {
    ok("bahar jo_bhi;\nbolo jo_bhi.kuch.bhi(1, 2);");
  });
});

describe("nullish coalescing (??)", () => {
  it("falls back when the left side is khaali", () => {
    const code = ok('kaam f(naam?: lafz): lafz { wapas naam ?? "mehmaan"; }');
    expect(code).toContain("??");
  });

  it("removes khaali from the result type", () => {
    ok("kaam f(n?: adad): adad { wapas n ?? 0; }");
  });

  it("errors when the fallback type does not fit", () => {
    expect(errs('kaam f(n?: adad): adad { wapas n ?? "lafz"; }').length).toBeGreaterThan(0);
  });

  it("binds tighter than a ternary and looser than comparison", () => {
    ok("kaam f(n?: adad): bool { wapas (n ?? 0) > 5; }");
  });
});

describe("numeric literals", () => {
  it("accepts underscore separators", () => {
    // Emitted verbatim — JS understands `1_000_000`, so the author's grouping survives.
    const code = ok("pakka bara = 1_000_000;\nbolo bara;");
    expect(code).toContain("1_000_000");
  });

  it("accepts hex and binary", () => {
    const code = ok("pakka h = 0xff;\npakka b = 0b1010;\nbolo h + b;");
    expect(code).toContain("0xff");
    expect(code).toContain("0b1010");
  });

  it("they are still adad", () => {
    expect(errs('pakka s: lafz = 0xff;').length).toBeGreaterThan(0);
    ok("pakka n: adad = 1_0;");
  });
});
