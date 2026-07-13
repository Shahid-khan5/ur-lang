// Destructuring parity with JS: renaming, defaults, rest, nesting, array holes,
// destructured parameters — plus computed object keys.
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

describe("object destructuring", () => {
  it("renames: { a: b }", () => {
    expect(run('pakka o = { naam: "Ali" };\npakka { naam: shakhs } = o;\nbolo shakhs;')).toEqual(["Ali"]);
  });

  it("types a renamed binding", () => {
    expect(errs('pakka o = { naam: "Ali" };\npakka { naam: shakhs } = o;\npakka n: adad = shakhs;').length)
      .toBeGreaterThan(0);
  });

  it("defaults: { a = 1 }", () => {
    expect(run("pakka o: { n?: adad } = {};\npakka { n = 7 } = o;\nbolo n;")).toEqual(["7"]);
    expect(run("pakka o: { n?: adad } = { n: 1 };\npakka { n = 7 } = o;\nbolo n;")).toEqual(["1"]);
  });

  it("a default removes khaali from the type", () => {
    expect(errs("pakka o: { n?: adad } = {};\npakka { n = 7 } = o;\npakka x: adad = n;")).toEqual([]);
  });

  it("checks the default's type", () => {
    expect(errs('pakka o: { n?: adad } = {};\npakka { n = "saat" } = o;').length).toBeGreaterThan(0);
  });

  it("rest: { a, ...baqi }", () => {
    expect(run("pakka o = { a: 1, b: 2, c: 3 };\npakka { a, ...baqi } = o;\nbolo a, JSON.stringify(baqi);")).toEqual([
      '1 {"b":2,"c":3}',
    ]);
  });

  it("the rest binding keeps the remaining properties' types", () => {
    expect(errs('pakka o = { a: 1, b: "x" };\npakka { a, ...baqi } = o;\npakka s: lafz = baqi.b;')).toEqual([]);
    expect(errs('pakka o = { a: 1, b: "x" };\npakka { a, ...baqi } = o;\nbolo baqi.a;').length).toBeGreaterThan(0);
  });

  it("nests: { a: { b } }", () => {
    expect(run('pakka o = { andar_ka: { naam: "Sara" } };\npakka { andar_ka: { naam } } = o;\nbolo naam;')).toEqual([
      "Sara",
    ]);
  });

  it("combines rename, default, and nesting", () => {
    const src = `
      qisim Conf = { server: { port?: adad } };
      pakka c: Conf = { server: {} };
      pakka { server: { port = 3000 } } = c;
      bolo port;
    `;
    expect(run(src)).toEqual(["3000"]);
  });

  it("rejects a key the type does not have", () => {
    expect(errs("pakka o = { a: 1 };\npakka { ghaib } = o;").length).toBeGreaterThan(0);
  });
});

describe("array destructuring", () => {
  it("binds by position and types elements", () => {
    expect(run("pakka xs = [1, 2];\npakka [a, b] = xs;\nbolo a + b;")).toEqual(["3"]);
    expect(errs('pakka xs = [1, 2];\npakka [a] = xs;\npakka s: lafz = a;').length).toBeGreaterThan(0);
  });

  it("supports defaults and rest", () => {
    expect(run("pakka xs = [1];\npakka [a, b = 9] = xs;\nbolo a, b;")).toEqual(["1 9"]);
    expect(run("pakka xs = [1, 2, 3];\npakka [a, ...baqi] = xs;\nbolo a, baqi.length;")).toEqual(["1 2"]);
  });

  it("the rest binding is an array of the element type", () => {
    expect(errs("pakka xs = [1, 2, 3];\npakka [a, ...baqi] = xs;\npakka n: adad = baqi[0];")).toEqual([]);
  });
});

describe("destructured parameters", () => {
  it("object patterns in a kaam's parameters", () => {
    const src = `
      qisim Shakhs = { naam: lafz, umar: adad };
      kaam salaam({ naam, umar }: Shakhs): lafz {
        wapas \`\${naam} (\${umar})\`;
      }
      bolo salaam({ naam: "Ali", umar: 30 });
    `;
    expect(run(src)).toEqual(["Ali (30)"]);
  });

  it("type-checks the destructured parameter's fields", () => {
    const src = `
      qisim Shakhs = { naam: lafz };
      kaam salaam({ naam }: Shakhs): adad { wapas naam; }
    `;
    expect(errs(src).length).toBeGreaterThan(0);
  });
});

describe("computed object keys", () => {
  it("{ [k]: v }", () => {
    expect(run('pakka k = "naam";\npakka o = { [k]: "Ali" };\nbolo JSON.stringify(o);')).toEqual(['{"naam":"Ali"}']);
  });

  it("the key must be a lafz or adad", () => {
    expect(errs("pakka k = sach;\npakka o = { [k]: 1 };").length).toBeGreaterThan(0);
  });
});
