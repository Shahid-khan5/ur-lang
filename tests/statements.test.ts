// Statement parity with JS: switch (chuno/surat), do-while (karo … jab tak),
// C-style for, and labelled break/continue.
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

describe("chuno / surat (switch / case)", () => {
  it("dispatches on a value, with warna as default", () => {
    const program = (n: string) => `
      pakka rang = ${n};
      chuno (rang) {
        surat "laal": bolo "ruko"; bas;
        surat "hara": bolo "chalo"; bas;
        warna: bolo "pata nahi";
      }
    `;
    expect(run(program('"laal"'))).toEqual(["ruko"]);
    expect(run(program('"hara"'))).toEqual(["chalo"]);
    expect(run(program('"neela"'))).toEqual(["pata nahi"]);
  });

  it("falls through without bas, like JS", () => {
    expect(
      run(`
        pakka n = 1;
        chuno (n) {
          surat 1: bolo "ek";
          surat 2: bolo "do"; bas;
          surat 3: bolo "teen"; bas;
        }
      `)
    ).toEqual(["ek", "do"]);
  });

  it("groups cases that share a body", () => {
    expect(
      run(`
        pakka n = 2;
        chuno (n) {
          surat 1:
          surat 2: bolo "chota"; bas;
          warna: bolo "bara";
        }
      `)
    ).toEqual(["chota"]);
  });

  it("checks that the case types can match the discriminant", () => {
    expect(errs('pakka n = 1;\nchuno (n) { surat "lafz": bolo 1; bas; }').length).toBeGreaterThan(0);
  });

  it("narrows a union discriminant inside each case", () => {
    expect(
      run(`
        qisim Shakl = { qism: "daira", r: adad } | { qism: "murabba", side: adad };
        pakka s: Shakl = { qism: "daira", r: 2 };
        chuno (s.qism) {
          surat "daira": bolo "daira"; bas;
          warna: bolo "aur";
        }
      `)
    ).toEqual(["daira"]);
  });
});

describe("karo … jab tak (do-while)", () => {
  it("runs the body at least once", () => {
    expect(run("rakho i = 10;\nkaro { bolo i; i += 1; } jab tak (i < 3);")).toEqual(["10"]);
  });

  it("loops while the condition holds", () => {
    expect(run("rakho i = 0;\nkaro { i += 1; } jab tak (i < 3);\nbolo i;")).toEqual(["3"]);
  });

  it("bas and agla work inside it", () => {
    expect(run("rakho i = 0;\nkaro { i += 1; agar (i == 2) { bas; } } jab tak (i < 5);\nbolo i;")).toEqual(["2"]);
  });

  it("the condition must be bool", () => {
    expect(errs("karo { bolo 1; } jab tak (5);").length).toBeGreaterThan(0);
  });
});

describe("C-style har (for)", () => {
  it("runs init, condition, and step", () => {
    expect(run("har (rakho i = 0; i < 3; i++) { bolo i; }")).toEqual(["0", "1", "2"]);
  });

  it("counts down and steps by more than one", () => {
    expect(run("har (rakho i = 6; i > 0; i -= 2) { bolo i; }")).toEqual(["6", "4", "2"]);
  });

  it("scopes the loop variable to the loop", () => {
    expect(errs("har (rakho i = 0; i < 3; i++) { bolo i; }\nbolo i;").length).toBeGreaterThan(0);
  });

  it("still supports the range and for-of forms", () => {
    expect(run("har i 1 se 3 tak { bolo i; }")).toEqual(["1", "2", "3"]);
    expect(run('har x [1, 2] mein { bolo x; }')).toEqual(["1", "2"]);
  });

  it("the condition must be bool", () => {
    expect(errs("har (rakho i = 0; i; i++) { bolo i; }").length).toBeGreaterThan(0);
  });
});

describe("labelled bas / agla", () => {
  it("breaks out of an outer loop", () => {
    expect(
      run(`
        bahar_wala: har i 1 se 3 tak {
          har j 1 se 3 tak {
            agar (j == 2) { bas bahar_wala; }
            bolo i, j;
          }
        }
      `)
    ).toEqual(["1 1"]);
  });

  it("continues an outer loop", () => {
    expect(
      run(`
        bahar_wala: har i 1 se 2 tak {
          har j 1 se 3 tak {
            agar (j == 2) { agla bahar_wala; }
            bolo i, j;
          }
        }
      `)
    ).toEqual(["1 1", "2 1"]);
  });

  it("rejects an unknown label", () => {
    expect(errs("har i 1 se 2 tak { bas ghaib; }").length).toBeGreaterThan(0);
  });
});
