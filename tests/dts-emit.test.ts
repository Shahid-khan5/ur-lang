// .d.ts emission: compiled .ur modules publish real TypeScript declarations.
import { describe, expect, it } from "vitest";
import { compile } from "../src/compiler.js";
import { emitDts } from "../src/dts-emit.js";
import { loadDtsExports } from "../src/dts.js";
import { typeName } from "../src/types.js";

function dtsOf(src: string): string {
  const result = compile(src);
  expect(result.diagnostics.map((d) => d.message)).toEqual([]);
  return emitDts(result.exports!);
}

describe("emitDts", () => {
  it("emits function declarations with mapped types", () => {
    const dts = dtsOf("bhejo kaam jama(a: adad, b: adad): adad { wapas a + b; }");
    expect(dts).toContain("export declare function jama(arg0: number, arg1: number): number;");
  });

  it("emits consts, optional params, rest params, and Wada", () => {
    const dts = dtsOf(`
      bhejo pakka NAAM: lafz = "urlang";
      bhejo kaam sochh(sawal: lafz, gehrai?: adad): lafz { wapas sawal; }
      bhejo kaam jama(...hindse: adad[]): adad { wapas 0; }
      bhejo kaam laao(): adad { wapas intezar Promise.resolve(1); }
    `);
    expect(dts).toContain("export declare const NAAM: string;");
    expect(dts).toContain("sochh(arg0: string, arg1?: number): string;");
    expect(dts).toContain("jama(...rest: number[]): number;");
    expect(dts).toContain("laao(): Promise<number>;");
  });

  it("emits qisim aliases as type aliases", () => {
    const dts = dtsOf('bhejo qisim Shakhs = { naam: lafz, umar?: adad };');
    expect(dts).toContain("export type Shakhs = { naam: string; umar?: number };");
  });

  it("emits classes with constructor, fields, and methods", () => {
    const dts = dtsOf(`
      bhejo jamaat Ginti {
        qeemat: adad = 0;
        banao(shuru: adad) { yeh.qeemat = shuru; }
        barhao(kitna: adad): adad { yeh.qeemat += kitna; wapas yeh.qeemat; }
      }
    `);
    expect(dts).toContain("export declare class Ginti {");
    expect(dts).toContain("constructor(arg0: number);");
    expect(dts).toContain("qeemat: number;");
    expect(dts).toContain("barhao(arg0: number): number;");
  });

  it("emits default exports", () => {
    const dts = dtsOf("pakka x: adad = 5;\nbhejo asal x;");
    expect(dts).toContain("declare const _default: number;");
    expect(dts).toContain("export default _default;");
  });

  it("round-trips through the .d.ts reader", () => {
    const dts = dtsOf(`
      bhejo qisim Size = "chota" | "bara";
      bhejo kaam sajao(size: "chota" | "bara"): lafz { wapas size; }
    `);
    const back = loadDtsExports(dts);
    expect(typeName(back.types.get("Size")!)).toBe('"chota" | "bara"');
    expect(typeName(back.values.get("sajao")!)).toBe('kaam("chota" | "bara"): lafz');
  });
});
