import { describe, expect, it } from "vitest";
import { compile } from "../src/compiler.js";

/** Compiles a snippet, asserts it type-checks, and returns the generated JS. */
function js(src: string): string {
  const result = compile(src);
  expect(result.diagnostics.map((d) => d.message)).toEqual([]);
  return result.code!;
}

/** Compiles and executes a snippet, returning everything it printed via bolo. */
function run(src: string): unknown[][] {
  const code = js(src);
  const logs: unknown[][] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args);
  };
  try {
    new Function(code)();
  } finally {
    console.log = original;
  }
  return logs;
}

describe("codegen: output shape", () => {
  it("emits let/const for rakho/pakka", () => {
    expect(js("rakho x = 5;")).toContain("let x = 5;");
    expect(js("pakka y = 2;")).toContain("const y = 2;");
  });

  it("emits console.log for bolo", () => {
    expect(js('bolo "salam", 5;')).toContain('console.log("salam", 5);');
  });

  it("compiles == to strict equality", () => {
    const code = js("rakho b = 1 == 2; rakho c = 1 != 2;");
    expect(code).toContain("1 === 2");
    expect(code).toContain("1 !== 2");
  });

  it("emits export for bhejo", () => {
    expect(js("bhejo pakka PI = 3.14;")).toContain("export const PI = 3.14;");
    expect(js("bhejo kaam f() { wapas; }")).toContain("export function f()");
  });

  it("emits import for lao ... se", () => {
    expect(js('lao { add } "./math.ur" se;')).toContain('import { add } from');
  });

  it("rewrites .ur import specifiers to .js when asked", () => {
    const result = compile('lao { add } "./math.ur" se;', { rewriteUrImports: true });
    expect(result.code).toContain('"./math.js"');
  });

  it("emits nothing for bahar declarations", () => {
    expect(js("bahar fetch; bolo 1;")).not.toContain("fetch");
  });

  it("escapes strings safely", () => {
    expect(js('bolo "line\\n\\"quote\\"";')).toContain(String.raw`"line\n\"quote\""`);
  });
});

describe("codegen: behavior (compile + execute)", () => {
  it("runs hello world", () => {
    expect(run('bolo "Salam Duniya";')).toEqual([["Salam Duniya"]]);
  });

  it("respects operator precedence and grouping", () => {
    expect(run("bolo 1 + 2 * 3; bolo (1 + 2) * 3;")).toEqual([[7], [9]]);
  });

  it("runs while loops with bas and agla", () => {
    const out = run(`
      rakho a = 0;
      jab tak (a < 10) {
        a += 1;
        agar (a == 3) { agla; }
        agar (a == 6) { bas; }
        bolo a;
      }
    `);
    expect(out).toEqual([[1], [2], [4], [5]]);
  });

  it("runs if / warna agar / warna chains", () => {
    const out = run(`
      rakho a = 15;
      agar (a < 10) { bolo "chota"; }
      warna agar (a < 20) { bolo "beech"; }
      warna { bolo "bara"; }
    `);
    expect(out).toEqual([["beech"]]);
  });

  it("runs recursive functions (fibonacci)", () => {
    const out = run(`
      kaam fib(n: adad): adad {
        agar (n < 2) { wapas n; }
        wapas fib(n - 1) + fib(n - 2);
      }
      bolo fib(10);
    `);
    expect(out).toEqual([[55]]);
  });

  it("supports closures", () => {
    const out = run(`
      kaam banaao(shuru: adad): koi {
        kaam aage(): adad {
          shuru += 1;
          wapas shuru;
        }
        wapas aage;
      }
      pakka counter = banaao(10);
      bolo counter();
      bolo counter();
    `);
    expect(out).toEqual([[11], [12]]);
  });

  it("works with arrays and indexing", () => {
    const out = run(`
      rakho xs: adad[] = [10, 20, 30];
      xs[1] = 25;
      bolo xs[0] + xs[1] + xs[2];
      bolo xs.length;
    `);
    expect(out).toEqual([[65], [3]]);
  });

  it("works with objects and member access", () => {
    const out = run(`
      pakka shakhs = { naam: "ali", umar: 20 };
      bolo shakhs.naam;
      shakhs.umar = 21;
      bolo shakhs.umar;
    `);
    expect(out).toEqual([["ali"], [21]]);
  });

  it("string concatenation with +", () => {
    expect(run('bolo "salam " + "duniya " + 123;')).toEqual([["salam duniya 123"]]);
  });

  it("calls JS globals (Math)", () => {
    expect(run("bolo Math.max(3, 7);")).toEqual([[7]]);
  });

  it("sach/jhoot/khaali map to true/false/null", () => {
    expect(run("bolo sach, jhoot, khaali;")).toEqual([[true, false, null]]);
  });

  it("preserves unary/logical semantics", () => {
    expect(run("bolo !jhoot && sach; bolo -(2 + 3);")).toEqual([[true], [-5]]);
  });
});

describe("compile(): diagnostics", () => {
  it("returns syntax errors as diagnostics instead of throwing", () => {
    const result = compile("rakho x = ;");
    expect(result.code).toBeNull();
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it("returns type errors and produces no code", () => {
    const result = compile('rakho x: adad = "nahi";');
    expect(result.code).toBeNull();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.line).toBe(1);
  });
});
