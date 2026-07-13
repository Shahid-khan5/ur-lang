// Class parity with TS: static members, getters/setters, private (nijee)
// members, and generic classes.
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

describe("static members (sakit)", () => {
  it("static fields and methods live on the class", () => {
    expect(
      run(`
        jamaat Ginti {
          sakit kul: adad = 0;
          sakit barhao(): adad {
            Ginti.kul += 1;
            wapas Ginti.kul;
          }
        }
        Ginti.barhao();
        Ginti.barhao();
        bolo Ginti.kul;
      `)
    ).toEqual(["2"]);
  });

  it("types static access", () => {
    expect(errs("jamaat A { sakit n: adad = 1; }\npakka s: lafz = A.n;").length).toBeGreaterThan(0);
    expect(errs("jamaat A { sakit n: adad = 1; }\nbolo A.ghaib;").length).toBeGreaterThan(0);
  });

  it("statics are not on the instance, and instance members are not on the class", () => {
    expect(errs("jamaat A { sakit n: adad = 1; }\npakka a = naya A();\nbolo a.n;").length).toBeGreaterThan(0);
    expect(errs("jamaat A { n: adad = 1; }\nbolo A.n;").length).toBeGreaterThan(0);
  });
});

describe("getters and setters (hasil / lagao)", () => {
  it("a getter reads like a property", () => {
    expect(
      run(`
        jamaat Chowkor {
          side: adad;
          banao(side: adad) { yeh.side = side; }
          hasil raqba(): adad { wapas yeh.side * yeh.side; }
        }
        pakka c = naya Chowkor(3);
        bolo c.raqba;
      `)
    ).toEqual(["9"]);
  });

  it("a setter writes like a property", () => {
    expect(
      run(`
        jamaat Garam {
          celsius: adad = 0;
          hasil fahrenheit(): adad { wapas yeh.celsius * 9 / 5 + 32; }
          lagao fahrenheit(f: adad) { yeh.celsius = (f - 32) * 5 / 9; }
        }
        rakho g = naya Garam();
        g.fahrenheit = 212;
        bolo g.celsius;
      `)
    ).toEqual(["100"]);
  });

  it("the getter's type is what callers see", () => {
    const src = `
      jamaat A { hasil naam(): lafz { wapas "x"; } }
      pakka a = naya A();
      pakka n: adad = a.naam;
    `;
    expect(errs(src).length).toBeGreaterThan(0);
  });
});

describe("private members (nijee)", () => {
  it("are reachable inside the class", () => {
    expect(
      run(`
        jamaat Bank {
          nijee balance: adad = 0;
          jama(n: adad): adad {
            yeh.balance += n;
            wapas yeh.balance;
          }
        }
        pakka b = naya Bank();
        bolo b.jama(50);
      `)
    ).toEqual(["50"]);
  });

  it("are not reachable outside it", () => {
    const src = `
      jamaat Bank { nijee balance: adad = 0; }
      pakka b = naya Bank();
      bolo b.balance;
    `;
    expect(errs(src).some((m) => m.includes("nijee"))).toBe(true);
  });

  it("do not leak into the structural instance type", () => {
    // A private field must not be satisfiable from outside.
    const src = `
      jamaat Bank { nijee balance: adad = 0; }
      qisim Khula = { balance: adad };
      pakka k: Khula = naya Bank();
    `;
    expect(errs(src).length).toBeGreaterThan(0);
  });
});

describe("generic classes", () => {
  it("carry their type parameter through fields and methods", () => {
    expect(
      run(`
        jamaat Dabba<T> {
          cheez: T;
          banao(cheez: T) { yeh.cheez = cheez; }
          nikaalo(): T { wapas yeh.cheez; }
        }
        pakka d = naya Dabba<adad>(42);
        bolo d.nikaalo() + 1;
      `)
    ).toEqual(["43"]);
  });

  it("infer the type argument from the constructor", () => {
    const src = `
      jamaat Dabba<T> {
        cheez: T;
        banao(cheez: T) { yeh.cheez = cheez; }
      }
      pakka d = naya Dabba("salaam");
      pakka s: lafz = d.cheez;
    `;
    expect(errs(src)).toEqual([]);
  });

  it("catch a wrong type argument", () => {
    const src = `
      jamaat Dabba<T> {
        cheez: T;
        banao(cheez: T) { yeh.cheez = cheez; }
      }
      pakka d = naya Dabba<adad>("lafz");
    `;
    expect(errs(src).length).toBeGreaterThan(0);
  });

  it("a generic instance's method result is typed", () => {
    const src = `
      jamaat Dabba<T> {
        cheez: T;
        banao(cheez: T) { yeh.cheez = cheez; }
        nikaalo(): T { wapas yeh.cheez; }
      }
      pakka d = naya Dabba<lafz>("x");
      pakka n: adad = d.nikaalo();
    `;
    expect(errs(src).length).toBeGreaterThan(0);
  });
});
