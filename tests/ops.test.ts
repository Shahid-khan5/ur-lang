// Operator parity with JS/TS: increments, exponent, bitwise, typeof/instanceof/
// in/delete, regex literals, and optional call/index.
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

/** Compiles and runs, returning everything `bolo` printed. */
function run(src: string): string[] {
  const code = ok(src);
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  try {
    new Function(code)();
  } finally {
    console.log = original;
  }
  return lines;
}

describe("increment and decrement", () => {
  it("postfix and prefix on a mutable adad", () => {
    expect(run("rakho i = 0;\ni++;\n++i;\nbolo i;\ni--;\nbolo i;")).toEqual(["2", "1"]);
  });

  it("are expressions with JS semantics", () => {
    expect(run("rakho i = 5;\nbolo i++;\nbolo i;\nbolo ++i;")).toEqual(["5", "6", "7"]);
  });

  it("work on members and indexes", () => {
    expect(run("rakho o = { n: 1 };\no.n++;\nrakho xs = [0];\nxs[0]++;\nbolo o.n, xs[0];")).toEqual(["2 1"]);
  });

  it("reject pakka and non-adad targets", () => {
    expect(errs("pakka i = 0;\ni++;").length).toBeGreaterThan(0);
    expect(errs('rakho s = "a";\ns++;').length).toBeGreaterThan(0);
    expect(errs("5++;").length).toBeGreaterThan(0);
  });
});

describe("exponent", () => {
  it("computes and is right-associative", () => {
    expect(run("bolo 2 ** 8;\nbolo 2 ** 3 ** 2;")).toEqual(["256", "512"]);
  });

  it("binds tighter than multiplication", () => {
    expect(run("bolo 2 * 3 ** 2;")).toEqual(["18"]);
  });

  it("is adad only", () => {
    expect(errs('bolo "a" ** 2;').length).toBeGreaterThan(0);
  });
});

describe("bitwise operators", () => {
  it("and, or, xor, not, shifts", () => {
    expect(run("bolo 6 & 3;\nbolo 6 | 3;\nbolo 6 ^ 3;\nbolo ~6;\nbolo 1 << 3;\nbolo 16 >> 2;\nbolo -16 >>> 28;")).toEqual(
      ["2", "7", "5", "-7", "8", "4", "15"]
    );
  });

  it("compound bitwise assignment", () => {
    expect(run("rakho x = 6;\nx &= 3;\nbolo x;\nx |= 8;\nbolo x;\nx ^= 1;\nbolo x;\nx <<= 2;\nbolo x;\nx >>= 1;\nbolo x;")).toEqual(
      ["2", "10", "11", "44", "22"]
    );
  });

  it("precedence matches JS: & above ^ above |", () => {
    expect(run("bolo 1 | 2 ^ 3 & 4;")).toEqual([String(1 | 2 ^ 3 & 4)]);
  });

  it("are adad only", () => {
    expect(errs('bolo "a" & 1;').length).toBeGreaterThan(0);
    expect(errs("bolo ~sach;").length).toBeGreaterThan(0);
  });
});

describe("noeyat (typeof), hai (instanceof), andar (in), mitao (delete)", () => {
  it("noeyat returns a lafz", () => {
    expect(run('bolo noeyat 5;\nbolo noeyat "x";')).toEqual(["number", "string"]);
    ok('pakka t: lafz = noeyat 5;');
  });

  it("hai checks an instance and returns bool", () => {
    expect(
      run(`
        jamaat Shakhs { naam: lafz; banao(naam: lafz) { yeh.naam = naam; } }
        pakka s = naya Shakhs("Ali");
        bolo s hai Shakhs;
      `)
    ).toEqual(["true"]);
    expect(errs("jamaat A {}\npakka b: bool = naya A() hai A;")).toEqual([]);
  });

  it("hai needs a jamaat on the right", () => {
    expect(errs("pakka n = 5;\nbolo n hai n;").length).toBeGreaterThan(0);
  });

  it("andar tests a key and returns bool", () => {
    expect(run('pakka o = { a: 1 };\nbolo "a" andar o;\nbolo "b" andar o;')).toEqual(["true", "false"]);
  });

  it("mitao removes a property", () => {
    expect(run("rakho o = { a: 1, b: 2 };\nmitao o.a;\nbolo JSON.stringify(o);")).toEqual(['{"b":2}']);
  });

  it("mitao needs a member or index target", () => {
    expect(errs("rakho x = 1;\nmitao x;").length).toBeGreaterThan(0);
  });
});

describe("regex literals", () => {
  it("lex in operand position and keep division working", () => {
    expect(run('pakka re = /^a+b$/;\nbolo re.test("aab");\nbolo 10 / 2;')).toEqual(["true", "5"]);
  });

  it("support flags and escapes", () => {
    expect(run('pakka re = /a\\/b/i;\nbolo re.test("A/B");')).toEqual(["true"]);
    expect(run('bolo "a-b-c".replace(/-/g, "+");')).toEqual(["a+b+c"]);
  });

  it("a regex is a value, not a division", () => {
    const code = ok("pakka a = 4;\npakka b = 2;\npakka c = a / b;\npakka re = /x/;");
    expect(code).toContain("a / b");
    expect(code).toContain("/x/");
  });
});

describe("optional call and index", () => {
  it("?.() and ?.[]", () => {
    // An absent optional property: `?.()` skips the call instead of throwing.
    expect(run("pakka o: { f?: kaam(): adad } = {};\nbolo o.f?.();")).toEqual(["undefined"]);
    expect(run("pakka o: { xs?: adad[] } = {};\nbolo o.xs?.[0];")).toEqual(["undefined"]);
    // And when it is present, the call happens.
    expect(run("pakka o: { f?: kaam(): adad } = { f: kaam (): adad { wapas 7; } };\nbolo o.f?.();")).toEqual(["7"]);
  });

  it("chains keep working", () => {
    expect(run('pakka o: { a?: { b: lafz } } = { a: { b: "x" } };\nbolo o.a?.b;')).toEqual(["x"]);
  });
});
