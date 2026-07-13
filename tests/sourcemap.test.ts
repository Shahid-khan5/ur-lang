import { describe, expect, it } from "vitest";
import { compile } from "../src/compiler.js";

// Minimal VLQ decoder used only to verify our encoder against the spec.
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function decodeVlqSegment(s: string): number[] {
  const out: number[] = [];
  let value = 0;
  let shift = 0;
  for (const ch of s) {
    const digit = B64.indexOf(ch);
    value += (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
    } else {
      out.push(value & 1 ? -(value >>> 1) : value >>> 1);
      value = 0;
      shift = 0;
    }
  }
  return out;
}

interface Mapping { genLine: number; genCol: number; srcLine: number; srcCol: number }

function decodeMappings(mappings: string): Mapping[] {
  const result: Mapping[] = [];
  let srcLine = 0;
  let srcCol = 0;
  mappings.split(";").forEach((lineStr, genLine) => {
    let genCol = 0;
    if (lineStr === "") return;
    for (const seg of lineStr.split(",")) {
      const fields = decodeVlqSegment(seg);
      genCol += fields[0]!;
      if (fields.length >= 4) {
        srcLine += fields[2]!;
        srcCol += fields[3]!;
        result.push({ genLine, genCol, srcLine, srcCol });
      }
    }
  });
  return result;
}

describe("source maps", () => {
  it("produces a valid v3 source map when requested", () => {
    const result = compile("rakho x = 1;\nbolo x;", { sourceMap: true, fileName: "test.ur" });
    expect(result.map).not.toBeNull();
    expect(result.map!.version).toBe(3);
    expect(result.map!.sources).toEqual(["test.ur"]);
    expect(result.map!.sourcesContent).toEqual(["rakho x = 1;\nbolo x;"]);
    expect(result.map!.mappings.length).toBeGreaterThan(0);
  });

  it("maps generated statements back to their source lines", () => {
    const src = "rakho x = 1;\n\n\nbolo x;"; // bolo is on source line 4 (index 3)
    const result = compile(src, { sourceMap: true });
    const mappings = decodeMappings(result.map!.mappings);
    // Some mapping must point at source line index 3 (the bolo statement).
    expect(mappings.some((m) => m.srcLine === 3)).toBe(true);
    // And the first mapping should point at the first source line.
    expect(mappings[0]!.srcLine).toBe(0);
  });

  it("omits the map when not requested", () => {
    expect(compile("bolo 1;").map).toBeNull();
  });
});
