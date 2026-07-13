// Classes: jamaat (class), banao (constructor), yeh (this), naya (new),
// waris (extends), buzurg (super). Compiled to native ES classes.
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

const SHAKHS = `
  jamaat Shakhs {
    naam: lafz;
    umar: adad = 0;

    banao(naam: lafz, umar: adad) {
      yeh.naam = naam;
      yeh.umar = umar;
    }

    salaam(): lafz {
      wapas "salam, " + yeh.naam;
    }

    saalBarhao(): kuchnahi {
      yeh.umar += 1;
    }
  }
`;

describe("classes: basics", () => {
  it("compiles to a native ES class", () => {
    const code = js(SHAKHS);
    expect(code).toContain("class Shakhs {");
    expect(code).toContain("constructor(naam, umar) {");
    expect(code).toContain("this.naam = naam;");
    expect(code).toContain("salaam() {");
    expect(code).toContain("umar = 0;"); // field initializer
  });

  it("instantiates with naya and calls methods", () => {
    const out = run(`
      ${SHAKHS}
      pakka s = naya Shakhs("ali", 20);
      bolo s.salaam();
      s.saalBarhao();
      bolo s.umar;
    `);
    expect(out).toEqual([["salam, ali"], [21]]);
  });

  it("field and method types are enforced on instances", () => {
    expect(errors(`${SHAKHS} pakka s = naya Shakhs("ali", 20); rakho n: adad = s.naam;`)).toHaveLength(1);
    expect(errors(`${SHAKHS} pakka s = naya Shakhs("ali", 20); rakho g: lafz = s.salaam();`)).toEqual([]);
    expect(errors(`${SHAKHS} pakka s = naya Shakhs("ali", 20); s.umar = "bees";`)).toHaveLength(1);
  });

  it("constructor arity and argument types are checked", () => {
    expect(errors(`${SHAKHS} pakka s = naya Shakhs("ali");`)).toHaveLength(1);
    expect(errors(`${SHAKHS} pakka s = naya Shakhs("ali", "bees");`)).toHaveLength(1);
  });

  it("yeh is typed inside methods", () => {
    expect(
      errors(`
        jamaat Ginti {
          qeemat: adad = 0;
          barhao(): kuchnahi { yeh.qeemat += "ek"; }
        }
      `)
    ).toHaveLength(1);
    expect(
      errors(`
        jamaat Ginti {
          qeemat: adad = 0;
          barhao(): kuchnahi { yeh.ghalatNaam += 1; }
        }
      `)
    ).toHaveLength(1);
  });

  it("yeh outside a class is an error", () => {
    expect(errors("bolo yeh.naam;")).toHaveLength(1);
  });

  it("naya on a non-class is an error", () => {
    expect(errors("rakho x = 5; rakho y = naya x();")).toHaveLength(1);
  });

  it("classes without banao get a default constructor", () => {
    const out = run(`
      jamaat Ginti {
        qeemat: adad = 10;
      }
      pakka g = naya Ginti();
      bolo g.qeemat;
    `);
    expect(out).toEqual([[10]]);
  });

  it("a class instance satisfies a matching qisim structurally", () => {
    expect(
      errors(`
        ${SHAKHS}
        qisim NaamWala = { naam: lafz };
        kaam naamBolo(n: NaamWala): lafz { wapas n.naam; }
        bolo naamBolo(naya Shakhs("ali", 20));
      `)
    ).toEqual([]);
  });
});

describe("classes: inheritance", () => {
  const TALIB = `
    ${SHAKHS}
    jamaat Talib waris Shakhs {
      madrasa: lafz;

      banao(naam: lafz, madrasa: lafz) {
        buzurg(naam, 18);
        yeh.madrasa = madrasa;
      }

      salaam(): lafz {
        wapas buzurg.salaam() + " (" + yeh.madrasa + " se)";
      }
    }
  `;

  it("compiles extends and super", () => {
    const code = js(TALIB);
    expect(code).toContain("class Talib extends Shakhs {");
    expect(code).toContain("super(naam, 18);");
    expect(code).toContain("super.salaam()");
  });

  it("inherits fields and methods, supports override + super calls", () => {
    const out = run(`
      ${TALIB}
      pakka t = naya Talib("sara", "karachi");
      bolo t.salaam();
      bolo t.umar;
      t.saalBarhao();
      bolo t.umar;
    `);
    expect(out).toEqual([["salam, sara (karachi se)"], [18], [19]]);
  });

  it("subclass instances are assignable where the parent shape is expected", () => {
    expect(
      errors(`
        ${TALIB}
        kaam salaamKaro(s: { naam: lafz }): lafz { wapas s.naam; }
        bolo salaamKaro(naya Talib("sara", "khi"));
      `)
    ).toEqual([]);
  });

  it("buzurg constructor call is arity-checked against the parent", () => {
    expect(
      errors(`
        ${SHAKHS}
        jamaat Ghalat waris Shakhs {
          banao() { buzurg("bas-naam"); }
        }
      `)
    ).toHaveLength(1);
  });

  it("buzurg outside a subclass is an error", () => {
    expect(errors("kaam f(): kuchnahi { buzurg(); }")).toHaveLength(1);
    expect(
      errors(`
        jamaat BeWaris {
          banao() { buzurg(); }
        }
      `)
    ).toHaveLength(1);
  });

  it("extending an unknown class is an error", () => {
    expect(errors("jamaat X waris Anjaan { }")).toHaveLength(1);
  });
});

describe("classes: modules and misc", () => {
  it("bhejo jamaat exports the class", () => {
    expect(js("bhejo jamaat Cheez { naam: lafz = \"x\"; }")).toContain("export class Cheez {");
  });

  it("field without initializer or constructor assignment still parses", () => {
    expect(() => parse("jamaat X { naam: lafz; }")).not.toThrow();
  });

  it("methods requiring semicolons after fields", () => {
    expect(() => parse("jamaat X { naam: lafz }")).toThrow(UrSyntaxError);
  });

  it("async methods via intezar", () => {
    const code = js(`
      jamaat Loader {
        uthao(): adad { wapas intezar Promise.resolve(5); }
      }
    `);
    expect(code).toContain("async uthao() {");
  });
});
