// .d.ts consumption: TypeScript declarations become typed UrLang globals.
import { describe, expect, it } from "vitest";
import { loadDtsExports, tsTypeToUr } from "../src/dts.js";
import { compile } from "../src/compiler.js";
import { typeName } from "../src/types.js";

const TAURI_DTS = `
declare function invoke(cmd: string, args?: unknown): Promise<unknown>;
export declare function greet(name: string): string;
export declare const VERSION: string;
export interface City {
  name: string;
  population: number;
  capital?: boolean;
}
export type Size = "chota" | "bara";
export declare function getCities(country: string): Promise<City[]>;
`;

describe("loadDtsExports", () => {
  const exports = loadDtsExports(TAURI_DTS);

  it("maps primitive types", () => {
    expect(typeName(exports.values.get("greet")!)).toBe("kaam(lafz): lafz");
    expect(typeName(exports.values.get("VERSION")!)).toBe("lafz");
  });

  it("declare (non-export) functions are included as ambient values", () => {
    const invoke = exports.values.get("invoke")!;
    expect(typeName(invoke)).toContain("Wada<koi>");
  });

  it("maps interfaces to structural object types with optional props", () => {
    const city = exports.types.get("City")!;
    expect(typeName(city)).toBe("{ name: lafz, population: adad, capital?: bool }");
  });

  it("maps type aliases including literal unions", () => {
    expect(typeName(exports.types.get("Size")!)).toBe('"chota" | "bara"');
  });

  it("maps Promise<T[]> with named element types", () => {
    const fn = exports.values.get("getCities")!;
    expect(typeName(fn)).toBe("kaam(lafz): Wada<{ name: lafz, population: adad, capital?: bool }[]>");
  });

  it("optional params relax arity", () => {
    const invoke = exports.values.get("invoke")!;
    expect(invoke.kind).toBe("function");
    if (invoke.kind === "function") {
      expect(invoke.requiredParams).toBe(1);
      expect(invoke.params).toHaveLength(2);
    }
  });

  it("unmappable constructs degrade to koi instead of failing", () => {
    const weird = loadDtsExports(`
      export declare function f<T extends keyof typeof globalThis>(x: T): T;
      export declare const g: unique symbol;
    `);
    expect(weird.values.has("f")).toBe(true);
    expect(weird.values.has("g")).toBe(true);
  });
});

describe("tsTypeToUr edge cases", () => {
  it("maps common types", () => {
    expect(typeName(tsTypeToUr("string"))).toBe("lafz");
    expect(typeName(tsTypeToUr("number[]"))).toBe("adad[]");
    expect(typeName(tsTypeToUr("string | null"))).toBe("lafz | khaali");
    expect(typeName(tsTypeToUr("void"))).toBe("kuchnahi");
    expect(typeName(tsTypeToUr("Promise<number>"))).toBe("Wada<adad>");
  });
});

describe("ambient declarations in compile()", () => {
  it("gives bahar-free typed access to declared globals", () => {
    const result = compile(
      `
        rakho g: lafz = greet("ali");
        bolo g;
      `,
      { ambient: [loadDtsExports(TAURI_DTS)] }
    );
    expect(result.diagnostics.map((d) => d.message)).toEqual([]);
  });

  it("enforces the declared types (this is the whole point)", () => {
    const bad = compile(`rakho n: adad = greet("ali");`, { ambient: [loadDtsExports(TAURI_DTS)] });
    expect(bad.diagnostics).toHaveLength(1);
    const badArg = compile(`greet(42);`, { ambient: [loadDtsExports(TAURI_DTS)] });
    expect(badArg.diagnostics).toHaveLength(1);
  });

  it("types the Tauri invoke pattern end to end", () => {
    const result = compile(
      `
        kaam chalao(): kuchnahi {
          pakka jawab = intezar invoke("meri_command");
          bolo jawab;
        }
      `,
      { ambient: [loadDtsExports(TAURI_DTS)] }
    );
    expect(result.diagnostics.map((d) => d.message)).toEqual([]);
  });

  it("declared interfaces are usable as type annotations", () => {
    const result = compile(
      `
        kaam chalao(): kuchnahi {
          pakka sheher: City[] = intezar getCities("pk");
          har s sheher mein { bolo s.name, s.population; }
        }
      `,
      { ambient: [loadDtsExports(TAURI_DTS)] }
    );
    expect(result.diagnostics.map((d) => d.message)).toEqual([]);
    // And typos inside those types are caught:
    const bad = compile(
      `
        kaam chalao(): kuchnahi {
          pakka sheher: City[] = intezar getCities("pk");
          har s sheher mein { bolo s.ghalatNaam; }
        }
      `,
      { ambient: [loadDtsExports(TAURI_DTS)] }
    );
    expect(bad.diagnostics).toHaveLength(1);
  });
});
