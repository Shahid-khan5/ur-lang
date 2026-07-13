// Phase-2 language surface: ternary, template strings, destructuring,
// spread/rest, optional chaining, optional/default params, module surface,
// numeric for-loops, har over strings/objects.
import { describe, expect, it } from "vitest";
import { compile } from "../src/compiler.js";
import { parse } from "../src/parser.js";
import { check } from "../src/checker.js";

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

describe("ternary (? :)", () => {
  it("compiles and runs", () => {
    expect(run('rakho umar = 20; bolo umar >= 18 ? "bara" : "chota";')).toEqual([["bara"]]);
  });

  it("condition must be bool", () => {
    expect(errors('bolo 5 ? "a" : "b";')).toHaveLength(1);
  });

  it("result type is the union of the branches", () => {
    expect(errors('rakho x: lafz | adad = sach ? "a" : 1;')).toEqual([]);
    expect(errors('rakho x: lafz = sach ? "a" : 1;')).toHaveLength(1);
  });

  it("nests right-associatively", () => {
    expect(run('rakho n = 5; bolo n < 3 ? "chota" : n < 7 ? "beech" : "bara";')).toEqual([["beech"]]);
  });
});

describe("template strings", () => {
  it("interpolates expressions", () => {
    expect(run('pakka naam = "duniya"; bolo `salam ${naam}!`;')).toEqual([["salam duniya!"]]);
  });

  it("supports multiple and nested expressions", () => {
    expect(run("bolo `jama: ${1 + 2}, zarab: ${2 * 3}`;")).toEqual([["jama: 3, zarab: 6"]]);
  });

  it("plain templates with no substitution", () => {
    expect(run("bolo `seedha text`;")).toEqual([["seedha text"]]);
  });

  it("has type lafz", () => {
    expect(errors("rakho s: lafz = `x ${1}`;")).toEqual([]);
    expect(errors("rakho n: adad = `x`;")).toHaveLength(1);
  });

  it("escapes backticks and ${ in output", () => {
    expect(run("bolo `a\\`b`;")).toEqual([["a`b"]]);
  });

  it("expressions inside templates are type-checked", () => {
    expect(errors("bolo `x ${anjaan}`;")).toHaveLength(1);
  });
});

describe("destructuring", () => {
  it("object destructuring with types", () => {
    expect(
      run(`
        pakka shakhs = { naam: "ali", umar: 20 };
        pakka { naam, umar } = shakhs;
        bolo naam, umar;
      `)
    ).toEqual([["ali", 20]]);
  });

  it("destructured names carry property types", () => {
    expect(
      errors(`
        pakka s = { naam: "ali" };
        pakka { naam } = s;
        rakho n: adad = naam;
      `)
    ).toHaveLength(1);
  });

  it("destructuring a missing property is an error", () => {
    expect(errors('pakka s = { naam: "ali" }; pakka { ghaib } = s;')).toHaveLength(1);
  });

  it("array destructuring", () => {
    expect(
      run(`
        pakka jorra = [10, 20];
        pakka [pehla, doosra] = jorra;
        bolo pehla + doosra;
      `)
    ).toEqual([[30]]);
  });

  it("array destructured names get the element type", () => {
    expect(errors("pakka [a] = [1, 2]; rakho s: lafz = a;")).toHaveLength(1);
  });
});

describe("spread and rest", () => {
  it("array spread", () => {
    expect(run("pakka a = [1, 2]; pakka b = [0, ...a, 3]; bolo b;")).toEqual([[[0, 1, 2, 3]]]);
  });

  it("array spread element types must match annotations", () => {
    expect(errors('rakho xs: adad[] = [1, ...["a"]];')).toHaveLength(1);
    expect(errors("rakho xs: adad[] = [1, ...[2, 3]];")).toEqual([]);
  });

  it("object spread merges properties", () => {
    expect(
      run(`
        pakka asli = { naam: "ali", umar: 20 };
        pakka badla = { ...asli, umar: 21 };
        bolo badla.naam, badla.umar;
      `)
    ).toEqual([["ali", 21]]);
  });

  it("call spread", () => {
    expect(run("pakka xs = [3, 7]; bolo Math.max(...xs);")).toEqual([[7]]);
  });

  it("rest parameters collect into a typed array", () => {
    expect(
      run(`
        kaam jama(...hindse: adad[]): adad {
          rakho kul = 0;
          har n hindse mein { kul += n; }
          wapas kul;
        }
        bolo jama(1, 2, 3, 4);
      `)
    ).toEqual([[10]]);
    expect(
      errors(`
        kaam jama(...hindse: adad[]): adad { wapas 0; }
        jama(1, "do");
      `)
    ).toHaveLength(1);
  });
});

describe("optional chaining and optional/default params", () => {
  it("?. compiles and short-circuits", () => {
    expect(
      run(`
        qisim Shakhs = { naam: lafz };
        rakho s: Shakhs | khaali = khaali;
        bolo s?.naam;
        s = { naam: "ali" };
        bolo s?.naam;
      `)
    ).toEqual([[undefined], ["ali"]]);
  });

  it("plain member access on possibly-khaali still errors; ?. does not", () => {
    expect(errors("rakho s: { naam: lafz } | khaali = khaali; bolo s.naam;")).toHaveLength(1);
    expect(errors("rakho s: { naam: lafz } | khaali = khaali; bolo s?.naam;")).toEqual([]);
  });

  it("optional parameters relax arity", () => {
    expect(
      run(`
        kaam salaam(naam: lafz, laqab?: lafz): lafz {
          wapas laqab == khaali ? naam : \`\${naam} \${laqab}\`;
        }
        bolo salaam("ali");
        bolo salaam("ali", "khan");
      `)
    ).toEqual([["ali"], ["ali khan"]]);
    expect(errors("kaam f(a: adad, b?: adad): adad { wapas a; } f();")).toHaveLength(1);
  });

  it("default parameter values", () => {
    expect(
      run(`
        kaam taaqat(asaas: adad, quwwat: adad = 2): adad {
          rakho natija = 1;
          har i 1 se quwwat tak { natija *= asaas; }
          wapas natija;
        }
        bolo taaqat(3);
        bolo taaqat(2, 3);
      `)
    ).toEqual([[9], [8]]);
  });
});

describe("module surface: default, namespace, re-export", () => {
  it("bhejo asal emits export default", () => {
    expect(js("bhejo asal kaam chalao(): kuchnahi { bolo 1; }")).toContain("export default function chalao()");
    expect(js('pakka x = 5;\nbhejo asal x;')).toContain("export default x;");
  });

  it("lao asal imports the default", () => {
    expect(js('lao asal config "./config.ur" se;\nbolo config;')).toContain(
      'import config from "./config.ur";'
    );
  });

  it("lao sab imports a namespace", () => {
    expect(js('lao sab math "./math.ur" se;\nbolo math;')).toContain(
      'import * as math from "./math.ur";'
    );
  });

  it("bhejo { } ... se re-exports", () => {
    expect(js('bhejo { jama, zarab } "./math.ur" se;')).toContain(
      'export { jama, zarab } from "./math.ur";'
    );
  });
});

describe("har loops: numeric range, strings, objects", () => {
  it("har i 1 se 5 tak counts inclusively", () => {
    expect(run("rakho kul = 0; har i 1 se 5 tak { kul += i; } bolo kul;")).toEqual([[15]]);
  });

  it("range loop variable is adad and scoped", () => {
    expect(errors("har i 1 se 3 tak { rakho s: lafz = i; }")).toHaveLength(1);
    expect(errors("har i 1 se 3 tak { bolo i; } bolo i;")).toHaveLength(1);
  });

  it("range bounds must be adad", () => {
    expect(errors('har i "a" se 3 tak { bolo i; }')).toHaveLength(1);
  });

  it("har over a string iterates characters (lafz)", () => {
    expect(run('rakho s = ""; har ch "abc" mein { s += ch + "-"; } bolo s;')).toEqual([["a-b-c-"]]);
    expect(errors('har ch "abc" mein { rakho n: adad = ch; }')).toHaveLength(1);
  });

  it("har over a typed object iterates keys", () => {
    expect(
      run(`
        pakka scores = { ali: 10, sara: 20 };
        rakho naam = "";
        har k scores mein { naam += k + ","; }
        bolo naam;
      `)
    ).toEqual([["ali,sara,"]]);
  });
});
