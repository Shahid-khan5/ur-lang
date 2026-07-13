// Every diagnostic carries a stable URxxxx code, documented in docs/errors.md.
import { describe, expect, it } from "vitest";
import { compile } from "../src/compiler.js";
import { DIAGNOSTIC_CATALOG } from "../src/diagnostics.js";

function codeOf(src: string): string {
  const result = compile(src);
  expect(result.diagnostics.length).toBeGreaterThan(0);
  return result.diagnostics[0]!.code;
}

describe("diagnostic codes", () => {
  it("catalog codes are unique", () => {
    const codes = DIAGNOSTIC_CATALOG.map((d) => d.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("syntax errors get UR1xxx codes", () => {
    expect(codeOf('rakho x = "open;')).toBe("UR1002");
    expect(codeOf("rakho x = 1")).toBe("UR1010");
    expect(codeOf("rakho x;")).toBe("UR1012");
    expect(codeOf("1 = 2;")).toBe("UR1013");
    expect(codeOf("jab (x) {}")).toBe("UR1014");
    expect(codeOf("agar (sach) { bolo 1;")).toBe("UR1015");
    expect(codeOf("rakho x = @;")).toBe("UR1001");
  });

  it("type errors get UR2xxx codes", () => {
    expect(codeOf('rakho x: adad = "str";')).toBe("UR2001");
    expect(codeOf("bolo anjaan;")).toBe("UR2002");
    expect(codeOf("pakka x = 1; x = 2;")).toBe("UR2003");
    expect(codeOf("rakho x = 1; rakho x = 2;")).toBe("UR2004");
    expect(codeOf('rakho x = "a" * 2;')).toBe("UR2005");
    expect(codeOf("agar (5) { bolo 1; }")).toBe("UR2010");
    expect(codeOf("bas;")).toBe("UR2011");
    expect(codeOf("kaam f(a: adad): adad { wapas a; } f();")).toBe("UR2015");
    expect(codeOf('kaam f(a: adad): adad { wapas a; } f("x");')).toBe("UR2016");
    expect(codeOf('pakka s = { naam: "x" }; bolo s.ghalat;')).toBe("UR2018");
    expect(codeOf("rakho x: Anokha = 1;")).toBe("UR2024");
    expect(codeOf("bolo yeh.naam;")).toBe("UR2034");
  });

  it("codes appear in formatted output", () => {
    const result = compile("bolo anjaan;");
    const formatted = result.diagnostics[0]!.format("bolo anjaan;", "test.ur");
    expect(formatted).toContain("[UR2002]");
  });

  it("all first-diagnostic messages in the suite resolve to a catalogued code", () => {
    // Spot-check a spread of errors — none should fall through to UR0000.
    const samples = [
      "rakho b = 1 == \"1\";",
      "rakho b = 1 && sach;",
      "wapas 5;",
      'kaam f(): adad { wapas "s"; }',
      "rakho x = 5; x();",
      'rakho xs: adad[] = [1, "a"];',
      'rakho s: { naam: lafz } = { naam: "a", faltu: 1 };',
      'rakho s: { naam: lafz } = {};',
      "har n 5 mein { bolo n; }",
      "qisim X = lafz; qisim X = adad;",
      "rakho x = naya Anjaani();",
      "kaam f(): kuchnahi { buzurg(); }",
    ];
    for (const src of samples) {
      expect(codeOf(src), `for: ${src}`).not.toBe("UR0000");
    }
  });
});
