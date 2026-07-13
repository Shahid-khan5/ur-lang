// Phase-1 semantic tests: structural objects, qisim aliases, literal types,
// unions + narrowing, generics, Wada/async typing, cross-module imports.
import { describe, expect, it } from "vitest";
import { parse } from "../src/parser.js";
import { check, checkProgram, ModuleExports } from "../src/checker.js";

function errors(src: string): string[] {
  return check(parse(src)).map((d) => d.message);
}

describe("structural object types", () => {
  it("accepts matching object literals", () => {
    expect(errors('rakho s: { naam: lafz, umar: adad } = { naam: "ali", umar: 20 };')).toEqual([]);
  });

  it("rejects missing required properties", () => {
    expect(errors('rakho s: { naam: lafz, umar: adad } = { naam: "ali" };')).toHaveLength(1);
  });

  it("allows omitting optional properties", () => {
    expect(errors('rakho s: { naam: lafz, laqab?: lafz } = { naam: "ali" };')).toEqual([]);
  });

  it("rejects mistyped properties", () => {
    expect(errors('rakho s: { umar: adad } = { umar: "bees" };')).toHaveLength(1);
  });

  it("excess-property check on fresh object literals", () => {
    expect(errors('rakho s: { naam: lafz } = { naam: "ali", faltu: 1 };')).toHaveLength(1);
  });

  it("width subtyping through variables (no freshness)", () => {
    expect(
      errors(`
        pakka bara = { naam: "ali", umar: 20 };
        rakho chota: { naam: lafz } = bara;
      `)
    ).toEqual([]);
  });

  it("typed member access", () => {
    expect(
      errors(`
        pakka s = { naam: "ali", umar: 20 };
        rakho n: lafz = s.naam;
        rakho u: adad = s.umar;
      `)
    ).toEqual([]);
    expect(
      errors(`
        pakka s = { naam: "ali" };
        rakho n: adad = s.naam;
      `)
    ).toHaveLength(1);
  });

  it("unknown property access is an error", () => {
    expect(errors('pakka s = { naam: "ali" }; bolo s.ghalat;')).toHaveLength(1);
  });

  it("member assignment respects property types", () => {
    expect(errors('pakka s = { umar: 20 }; s.umar = 21;')).toEqual([]);
    expect(errors('pakka s = { umar: 20 }; s.umar = "ikkis";')).toHaveLength(1);
  });

  it("nested object types check recursively", () => {
    expect(
      errors('rakho s: { pata: { sheher: lafz } } = { pata: { sheher: "khi" } };')
    ).toEqual([]);
    expect(
      errors("rakho s: { pata: { sheher: lafz } } = { pata: { sheher: 5 } };")
    ).toHaveLength(1);
  });
});

describe("qisim (type aliases)", () => {
  it("aliases are usable in annotations", () => {
    expect(
      errors(`
        qisim Shakhs = { naam: lafz, umar: adad };
        rakho s: Shakhs = { naam: "ali", umar: 20 };
        rakho n: lafz = s.naam;
      `)
    ).toEqual([]);
  });

  it("alias mismatches are caught", () => {
    expect(
      errors(`
        qisim Shakhs = { naam: lafz };
        rakho s: Shakhs = { naam: 5 };
      `)
    ).toHaveLength(1);
  });

  it("aliases can reference aliases", () => {
    expect(
      errors(`
        qisim Naam = lafz;
        qisim Fauj = Naam[];
        rakho f: Fauj = ["a", "b"];
      `)
    ).toEqual([]);
  });

  it("unknown type names are errors", () => {
    expect(errors("rakho x: Anokha = 1;")).toHaveLength(1);
  });

  it("duplicate alias names in the same scope are errors", () => {
    expect(errors("qisim X = lafz; qisim X = adad;")).toHaveLength(1);
  });
});

describe("literal types and widening", () => {
  it("literal unions gate option-style APIs", () => {
    expect(
      errors(`
        kaam sajao(size: "chota" | "bara"): lafz { wapas size; }
        bolo sajao("chota");
      `)
    ).toEqual([]);
    expect(
      errors(`
        kaam sajao(size: "chota" | "bara"): lafz { wapas size; }
        bolo sajao("darmiyana");
      `)
    ).toHaveLength(1);
  });

  it("pakka infers literal types; rakho widens", () => {
    // pakka keeps the literal, so it satisfies a literal-union param.
    expect(
      errors(`
        kaam sajao(size: "chota" | "bara"): lafz { wapas size; }
        pakka mera = "chota";
        bolo sajao(mera);
      `)
    ).toEqual([]);
    // rakho widens to lafz, which no longer fits.
    expect(
      errors(`
        kaam sajao(size: "chota" | "bara"): lafz { wapas size; }
        rakho mera = "chota";
        bolo sajao(mera);
      `)
    ).toHaveLength(1);
  });

  it("comparisons between widened-compatible literals stay legal", () => {
    expect(errors("rakho b = 1 == 2;")).toEqual([]);
    expect(errors('rakho b = 1 == "1";')).toHaveLength(1);
  });
});

describe("union types and narrowing", () => {
  it("union annotations accept each member", () => {
    expect(errors('rakho x: lafz | khaali = khaali; x = "ok";')).toEqual([]);
    expect(errors("rakho x: lafz | khaali = 5;")).toHaveLength(1);
  });

  it("using a possibly-khaali value where lafz is needed fails", () => {
    expect(
      errors(`
        kaam lambai(s: lafz): adad { wapas s.length; }
        rakho x: lafz | khaali = khaali;
        bolo lambai(x);
      `)
    ).toHaveLength(1);
  });

  it("agar (x != khaali) narrows inside the branch", () => {
    expect(
      errors(`
        kaam lambai(s: lafz): adad { wapas s.length; }
        rakho x: lafz | khaali = khaali;
        agar (x != khaali) {
          bolo lambai(x);
        }
      `)
    ).toEqual([]);
  });

  it("warna gets the complementary narrowing", () => {
    expect(
      errors(`
        kaam lambai(s: lafz): adad { wapas s.length; }
        rakho x: lafz | khaali = khaali;
        agar (x == khaali) {
          bolo "kuch nahi";
        } warna {
          bolo lambai(x);
        }
      `)
    ).toEqual([]);
  });

  it("literal equality narrows literal unions", () => {
    expect(
      errors(`
        kaam sirfChota(size: "chota"): lafz { wapas size; }
        rakho size: "chota" | "bara" = "bara";
        agar (size == "chota") {
          bolo sirfChota(size);
        }
      `)
    ).toEqual([]);
  });

  it("&& combines narrowings", () => {
    expect(
      errors(`
        kaam lambai(s: lafz): adad { wapas s.length; }
        rakho a: lafz | khaali = khaali;
        rakho b: lafz | khaali = khaali;
        agar (a != khaali && b != khaali) {
          bolo lambai(a) + lambai(b);
        }
      `)
    ).toEqual([]);
  });

  it("member access on a possibly-khaali union is an error", () => {
    expect(errors("rakho x: lafz | khaali = khaali; bolo x.length;")).toHaveLength(1);
  });
});

describe("generics", () => {
  it("infers T from arguments and types the result", () => {
    expect(
      errors(`
        kaam pehla<T>(xs: T[]): T { wapas xs[0]; }
        rakho n: adad = pehla([1, 2, 3]);
        rakho s: lafz = pehla(["a", "b"]);
      `)
    ).toEqual([]);
    expect(
      errors(`
        kaam pehla<T>(xs: T[]): T { wapas xs[0]; }
        rakho s: lafz = pehla([1, 2, 3]);
      `)
    ).toHaveLength(1);
  });

  it("multiple type params", () => {
    expect(
      errors(`
        kaam pehlaWala<A, B>(a: A, b: B): A { wapas a; }
        rakho n: adad = pehlaWala(1, "x");
      `)
    ).toEqual([]);
  });

  it("generic params are checked inside the body", () => {
    expect(
      errors(`
        kaam ghalat<T>(x: T): adad { wapas x * 2; }
      `)
    ).toHaveLength(1); // can't multiply a T
  });
});

describe("Wada<T> and async typing", () => {
  it("async kaam calls produce Wada of the annotated return", () => {
    expect(
      errors(`
        kaam leAo(): adad { wapas intezar Promise.resolve(5); }
        rakho p: Wada<adad> = leAo();
        rakho ghalat: adad = leAo();
      `)
    ).toHaveLength(1); // only the second line errors
  });

  it("intezar unwraps Wada<T>", () => {
    expect(
      errors(`
        kaam leAo(): adad { wapas intezar Promise.resolve(5); }
        kaam chalao(): kuchnahi {
          rakho n: adad = intezar leAo();
          bolo n;
        }
      `)
    ).toEqual([]);
  });

  it("annotating Wada<T> directly on an async kaam also works", () => {
    expect(
      errors(`
        kaam leAo(): Wada<adad> { wapas intezar Promise.resolve(5); }
        kaam chalao(): kuchnahi {
          rakho n: adad = intezar leAo();
        }
      `)
    ).toEqual([]);
  });
});

describe("cross-module type checking", () => {
  function moduleErrors(entry: string, modules: Record<string, string>): string[] {
    const resolve = (specifier: string): ModuleExports | null => {
      const src = modules[specifier];
      if (src === undefined) return null;
      const result = checkProgram(parse(src), { resolveModule: resolve });
      return result.exports;
    };
    return checkProgram(parse(entry), { resolveModule: resolve }).diagnostics.map((d) => d.message);
  }

  it("imported functions carry their real types", () => {
    const math = 'bhejo kaam jama(a: adad, b: adad): adad { wapas a + b; }';
    expect(
      moduleErrors('lao { jama } "./math.ur" se;\nrakho n: adad = jama(1, 2);', { "./math.ur": math })
    ).toEqual([]);
    expect(
      moduleErrors('lao { jama } "./math.ur" se;\njama("a", 2);', { "./math.ur": math })
    ).toHaveLength(1);
    expect(
      moduleErrors('lao { jama } "./math.ur" se;\nrakho s: lafz = jama(1, 2);', { "./math.ur": math })
    ).toHaveLength(1);
  });

  it("imported constants carry inferred types", () => {
    expect(
      moduleErrors('lao { PI } "./m.ur" se;\nrakho x: lafz = PI;', { "./m.ur": "bhejo pakka PI = 3.14;" })
    ).toHaveLength(1);
  });

  it("exported qisim aliases are importable", () => {
    const mod = "bhejo qisim Shakhs = { naam: lafz };";
    expect(
      moduleErrors(
        'lao { Shakhs } "./m.ur" se;\nrakho s: Shakhs = { naam: "ali" };',
        { "./m.ur": mod }
      )
    ).toEqual([]);
    expect(
      moduleErrors('lao { Shakhs } "./m.ur" se;\nrakho s: Shakhs = { naam: 5 };', { "./m.ur": mod })
    ).toHaveLength(1);
  });

  it("importing a name the module does not export is an error", () => {
    expect(
      moduleErrors('lao { ghaib } "./m.ur" se;', { "./m.ur": "bhejo pakka PI = 3.14;" })
    ).toHaveLength(1);
  });

  it("unresolvable modules degrade to koi without errors (npm interop)", () => {
    expect(moduleErrors('lao { kuchBhi } "some-npm-pkg" se;\nkuchBhi(1);', {})).toEqual([]);
  });
});
