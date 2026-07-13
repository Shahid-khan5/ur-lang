// Features real apps need: for-each, try/catch/throw, async/await, and
// anonymous function expressions (callbacks).
import { describe, expect, it } from "vitest";
import { compile } from "../src/compiler.js";
import { parse } from "../src/parser.js";
import { check } from "../src/checker.js";
import { UrSyntaxError } from "../src/errors.js";

function js(src: string): string {
  const result = compile(src);
  expect(result.diagnostics.map((d) => d.message)).toEqual([]);
  return result.code!;
}

function errors(src: string): string[] {
  return check(parse(src)).map((d) => d.message);
}

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

async function runAsync(src: string): Promise<unknown[][]> {
  const code = js(src);
  const logs: unknown[][] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args);
  };
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
      body: string
    ) => () => Promise<void>;
    await new AsyncFunction(code)();
  } finally {
    console.log = original;
  }
  return logs;
}

describe("har ... mein (for-each)", () => {
  it("compiles to for...of", () => {
    expect(js("har n [1, 2, 3] mein { bolo n; }")).toContain("for (const n of [1, 2, 3])");
  });

  it("iterates arrays with the element type bound to the loop variable", () => {
    const out = run(`
      rakho jama = 0;
      har n [10, 20, 30] mein { jama += n; }
      bolo jama;
    `);
    expect(out).toEqual([[60]]);
  });

  it("type-checks the loop variable as the element type", () => {
    expect(errors('har n [1, 2] mein { rakho x: lafz = n; }')).toHaveLength(1);
    expect(errors("har n [1, 2] mein { rakho x: adad = n; }")).toEqual([]);
  });

  it("supports bas and agla inside har", () => {
    const out = run(`
      har n [1, 2, 3, 4, 5] mein {
        agar (n == 2) { agla; }
        agar (n == 4) { bas; }
        bolo n;
      }
    `);
    expect(out).toEqual([[1], [3]]);
  });

  it("rejects iterating a non-array", () => {
    expect(errors("har n 5 mein { bolo n; }")).toHaveLength(1);
  });

  it("requires 'mein' after the iterable", () => {
    expect(() => parse("har n [1] { bolo n; }")).toThrow(UrSyntaxError);
  });
});

describe("koshish / pakro / akhir / phenko (try/catch/finally/throw)", () => {
  it("compiles to try/catch/finally", () => {
    const code = js('koshish { bolo 1; } pakro (e) { bolo e; } akhir { bolo "done"; }');
    expect(code).toContain("try {");
    expect(code).toContain("} catch (e) {");
    expect(code).toContain("} finally {");
  });

  it("catches thrown values", () => {
    const out = run(`
      koshish {
        phenko "gadbad ho gayi";
        bolo "kabhi nahi";
      } pakro (e) {
        bolo "pakra:", e;
      }
    `);
    expect(out).toEqual([["pakra:", "gadbad ho gayi"]]);
  });

  it("runs akhir (finally) always", () => {
    const out = run(`
      koshish { phenko 1; } pakro (e) { bolo "catch"; } akhir { bolo "akhir"; }
      koshish { bolo "theek"; } pakro (e) { bolo "nahi"; } akhir { bolo "akhir2"; }
    `);
    expect(out).toEqual([["catch"], ["akhir"], ["theek"], ["akhir2"]]);
  });

  it("allows koshish with only akhir", () => {
    expect(run('koshish { bolo "a"; } akhir { bolo "b"; }')).toEqual([["a"], ["b"]]);
  });

  it("requires pakro or akhir", () => {
    expect(() => parse("koshish { bolo 1; }")).toThrow(UrSyntaxError);
  });

  it("phenko outside koshish still compiles (uncaught throw is valid JS)", () => {
    expect(js('phenko "seedha error";')).toContain('throw "seedha error";');
  });

  it("scopes the pakro parameter to the catch block", () => {
    expect(errors("koshish { bolo 1; } pakro (e) { bolo e; } bolo e;")).toHaveLength(1);
  });
});

describe("intezar (await) and async kaam", () => {
  it("marks functions containing intezar as async automatically", () => {
    const code = js(`
      kaam le_ao(): koi {
        rakho x = intezar Promise.resolve(5);
        wapas x;
      }
    `);
    expect(code).toContain("async function le_ao()");
    expect(code).toContain("await Promise.resolve(5)");
  });

  it("does not mark functions async when only nested functions await", () => {
    const code = js(`
      kaam bahar_wala(): koi {
        kaam andar_wala(): koi { wapas intezar Promise.resolve(1); }
        wapas andar_wala;
      }
    `);
    expect(code).toContain("async function andar_wala()");
    expect(code).not.toContain("async function bahar_wala()");
  });

  it("awaits real promises end to end", async () => {
    const out = await runAsync(`
      kaam dugna(n: adad): koi {
        wapas intezar Promise.resolve(n * 2);
      }
      bolo intezar dugna(21);
    `);
    expect(out).toEqual([[42]]);
  });

  it("async + koshish/pakro work together", async () => {
    const out = await runAsync(`
      kaam girao(): koi {
        wapas intezar Promise.reject("network gir gaya");
      }
      koshish {
        intezar girao();
      } pakro (e) {
        bolo "pakra:", e;
      }
    `);
    expect(out).toEqual([["pakra:", "network gir gaya"]]);
  });
});

describe("kaam expressions (anonymous functions / callbacks)", () => {
  it("parses kaam without a name in expression position", () => {
    const code = js("pakka dugna = kaam (n: adad): adad { wapas n * 2; };");
    expect(code).toContain("const dugna = ((n) => {");
  });

  it("calls stored function expressions", () => {
    const out = run(`
      pakka dugna = kaam (n: adad): adad { wapas n * 2; };
      bolo dugna(21);
    `);
    expect(out).toEqual([[42]]);
  });

  it("works as a callback argument", () => {
    const out = run(`
      rakho xs: adad[] = [1, 2, 3];
      pakka dugne = xs.map(kaam (n: adad): adad { wapas n * 2; });
      bolo dugne;
    `);
    expect(out).toEqual([[[2, 4, 6]]]);
  });

  it("type-checks the function expression's type at call sites", () => {
    expect(errors('pakka f = kaam (n: adad): adad { wapas n; }; f("str");')).toHaveLength(1);
    expect(errors("pakka f = kaam (n: adad): adad { wapas n; }; f(1);")).toEqual([]);
  });

  it("checks returns inside function expressions", () => {
    expect(errors('pakka f = kaam (): adad { wapas "str"; };')).toHaveLength(1);
  });

  it("async function expressions", async () => {
    const out = await runAsync(`
      pakka lao_data = kaam (): koi { wapas intezar Promise.resolve("mila"); };
      bolo intezar lao_data();
    `);
    expect(out).toEqual([["mila"]]);
  });
});

describe("member typing niceties", () => {
  it("array.length and string.length are adad", () => {
    expect(errors('rakho xs = [1, 2]; rakho n: adad = xs.length;')).toEqual([]);
    expect(errors('rakho s = "abc"; rakho n: adad = s.length;')).toEqual([]);
    expect(errors('rakho xs = [1]; rakho bad: lafz = xs.length;')).toHaveLength(1);
  });
});
