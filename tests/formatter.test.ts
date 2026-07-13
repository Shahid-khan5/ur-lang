// urlang fmt: canonical style, idempotent, comment-preserving, semantics-preserving.
import { describe, expect, it } from "vitest";
import { format } from "../src/formatter.js";
import { compile } from "../src/compiler.js";

describe("format: canonical style", () => {
  it("normalizes spacing, quotes, and indentation", () => {
    const messy = `rakho    x:adad=5;\npakka naam='ali'  ;\nagar(x>3){bolo naam;}warna{bolo "chota";}`;
    expect(format(messy)).toBe(
      `rakho x: adad = 5;
pakka naam = "ali";
agar (x > 3) {
  bolo naam;
} warna {
  bolo "chota";
}
`
    );
  });

  it("formats functions, loops, classes", () => {
    const src = `kaam  jama( a :adad , b:adad ) :adad{wapas a+b;}
jab tak(sach){bas;}
jamaat Ginti{qeemat:adad=0;barhao():kuchnahi{yeh.qeemat+=1;}}`;
    const out = format(src);
    expect(out).toContain("kaam jama(a: adad, b: adad): adad {");
    expect(out).toContain("jab tak (sach) {");
    expect(out).toContain("jamaat Ginti {");
    expect(out).toContain("  qeemat: adad = 0;");
    expect(out).toContain("  barhao(): kuchnahi {");
    expect(out).toContain("    yeh.qeemat += 1;");
  });

  it("is idempotent", () => {
    const src = `qisim Shakhs = { naam: lafz, umar?: adad };
kaam salaam(s: Shakhs, laqab: lafz = "sahib"): lafz {
  agar (s.umar != khaali && s.umar > 60) {
    wapas \`janab \${s.naam}\`;
  }
  wapas s.naam + " " + laqab;
}
har i 1 se 3 tak {
  bolo salaam({ naam: "ali" }, i == 1 ? "bhai" : "sahib");
}
`;
    const once = format(src);
    expect(format(once)).toBe(once);
  });

  it("preserves comments (leading and trailing)", () => {
    const src = `// pehla comment
rakho x = 1; // trailing baat
/* block wala */
bolo x;`;
    const out = format(src);
    expect(out).toContain("// pehla comment");
    expect(out).toContain("rakho x = 1; // trailing baat");
    expect(out).toContain("/* block wala */");
    const boloIdx = out.indexOf("bolo x");
    expect(out.indexOf("/* block wala */")).toBeLessThan(boloIdx);
  });

  it("preserves single blank lines between groups", () => {
    const src = `rakho a = 1;\n\n\n\nrakho b = 2;`;
    expect(format(src)).toBe("rakho a = 1;\n\nrakho b = 2;\n");
  });

  it("does not change program behavior", () => {
    const src = `
      rakho jama = 0;
      har n [1,2,3,4] mein { agar(n%2==0){agla;} jama+=n; }
      bolo \`jama: \${jama}\`;
    `;
    const before = compile(src).code;
    const after = compile(format(src)).code;
    expect(after).toBe(before);
  });

  it("formats module and class surface", () => {
    const src = `lao asal config,{a,b} "./m.ur" se;
lao sab math "./math.ur" se;
bhejo{x,y} "./z.ur" se;
bhejo qisim  T=lafz|khaali;
bhejo asal kaam chalao():kuchnahi{bolo 1;}`;
    const out = format(src);
    expect(out).toContain('lao asal config, { a, b } "./m.ur" se;');
    expect(out).toContain('lao sab math "./math.ur" se;');
    expect(out).toContain('bhejo { x, y } "./z.ur" se;');
    expect(out).toContain("bhejo qisim T = lafz | khaali;");
    expect(out).toContain("bhejo asal kaam chalao(): kuchnahi {");
  });
});
