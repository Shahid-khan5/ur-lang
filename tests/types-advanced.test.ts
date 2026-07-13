// The remaining TypeScript-shaped gaps: enums (fehrist), casts (jaisa),
// the non-null assertion (!), and generic type aliases.
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

describe("fehrist (enum)", () => {
  it("numbers its members from zero", () => {
    expect(run("fehrist Rang { Laal, Hara, Neela }\nbolo Rang.Laal, Rang.Hara, Rang.Neela;")).toEqual(["0 1 2"]);
  });

  it("takes explicit values, including strings", () => {
    expect(
      run(`
        fehrist Halat { Rukka = "ruk", Chalta = "chal" }
        bolo Halat.Rukka, Halat.Chalta;
      `)
    ).toEqual(["ruk chal"]);
  });

  it("is a type, and only its own members satisfy it", () => {
    expect(errs("fehrist Rang { Laal, Hara }\npakka r: Rang = Rang.Laal;")).toEqual([]);
    expect(errs("fehrist Rang { Laal, Hara }\npakka r: Rang = 5;").length).toBeGreaterThan(0);
    expect(errs('fehrist Rang { Laal, Hara }\npakka r: Rang = "Laal";').length).toBeGreaterThan(0);
  });

  it("rejects an unknown member", () => {
    expect(errs("fehrist Rang { Laal }\nbolo Rang.Kala;").length).toBeGreaterThan(0);
  });

  it("is exportable", () => {
    const code = ok("bhejo fehrist Rang { Laal, Hara }");
    expect(code).toContain("export");
  });

  it("works as a chuno discriminant", () => {
    expect(
      run(`
        fehrist Rang { Laal, Hara }
        pakka r: Rang = Rang.Hara;
        chuno (r) {
          surat Rang.Laal: bolo "ruko"; bas;
          surat Rang.Hara: bolo "chalo"; bas;
        }
      `)
    ).toEqual(["chalo"]);
  });
});

describe("jaisa (as) — type assertion", () => {
  it("re-types a koi value", () => {
    expect(errs("bahar kuch;\npakka n: adad = kuch jaisa adad;")).toEqual([]);
  });

  it("narrows a union", () => {
    const src = `
      qisim Shakl = { qism: "daira", r: adad } | { qism: "murabba", side: adad };
      pakka s: Shakl = { qism: "daira", r: 2 };
      pakka d = s jaisa { qism: "daira", r: adad };
      bolo d.r;
    `;
    expect(run(src)).toEqual(["2"]);
  });

  it("erases at runtime", () => {
    const code = ok("bahar kuch;\npakka n: adad = kuch jaisa adad;");
    expect(code).not.toContain("jaisa");
    expect(code).toContain("const n = kuch;");
  });

  it("refuses unrelated types", () => {
    expect(errs('pakka n = 5;\npakka s = n jaisa lafz;').length).toBeGreaterThan(0);
  });
});

describe("non-null assertion (!)", () => {
  it("drops khaali from the type", () => {
    expect(errs("pakka o: { n?: adad } = { n: 1 };\npakka x: adad = o.n!;")).toEqual([]);
  });

  it("erases at runtime", () => {
    expect(run("pakka o: { n?: adad } = { n: 5 };\nbolo o.n!;")).toEqual(["5"]);
  });

  it("is still an error without it", () => {
    expect(errs("pakka o: { n?: adad } = { n: 1 };\npakka x: adad = o.n;").length).toBeGreaterThan(0);
  });
});

describe("generic type aliases", () => {
  it("qisim Jorra<T> = { pehla: T, doosra: T }", () => {
    const src = `
      qisim Jorra<T> = { pehla: T, doosra: T };
      pakka j: Jorra<adad> = { pehla: 1, doosra: 2 };
      bolo j.pehla + j.doosra;
    `;
    expect(run(src)).toEqual(["3"]);
  });

  it("checks the substituted type", () => {
    const src = `
      qisim Jorra<T> = { pehla: T, doosra: T };
      pakka j: Jorra<lafz> = { pehla: "a", doosra: 2 };
    `;
    expect(errs(src).length).toBeGreaterThan(0);
  });

  it("takes more than one parameter and nests", () => {
    const src = `
      qisim Natija<T, E> = { theek: bool, value: T, ghalti: E };
      pakka r: Natija<adad, lafz> = { theek: sach, value: 1, ghalti: "" };
      bolo r.value;
    `;
    expect(run(src)).toEqual(["1"]);
  });

  it("errors on the wrong number of type arguments", () => {
    expect(errs("qisim Jorra<T> = { a: T };\npakka j: Jorra = { a: 1 };").length).toBeGreaterThan(0);
    expect(errs("qisim Jorra<T> = { a: T };\npakka j: Jorra<adad, lafz> = { a: 1 };").length).toBeGreaterThan(0);
  });
});
