// Built-in methods are typed. A language that calls itself typed cannot hand
// back `koi` from xs.map(...) — that was the biggest hole in the type system.
import { describe, expect, it } from "vitest";
import { compile } from "../src/compiler.js";
import { parse } from "../src/parser.js";
import { checkProgram } from "../src/checker.js";
import { typeName } from "../src/types.js";

function ok(src: string): void {
  expect(compile(src).diagnostics.map((d) => d.message), src).toEqual([]);
}

function errs(src: string): string[] {
  return compile(src).diagnostics.map((d) => d.message);
}

/** Type of the last top-level `pakka` in the program. */
function typeOfLast(src: string): string {
  const program = parse(src);
  const result = checkProgram(program);
  expect(result.diagnostics.map((d) => d.message), src).toEqual([]);
  const names = [...result.exports.values.keys()];
  return typeName(result.exports.values.get(names[names.length - 1]!)!);
}

describe("array methods are typed", () => {
  it("map infers the element type of the result", () => {
    expect(typeOfLast("bhejo pakka xs = [1, 2, 3];\nbhejo pakka out = xs.map(kaam (n: adad): lafz { wapas `${n}`; });"))
      .toBe("lafz[]");
  });

  it("map's callback parameter is contextually typed", () => {
    // `n` has no annotation: it must still be adad, and n * 2 must type-check.
    expect(typeOfLast("bhejo pakka xs = [1, 2, 3];\nbhejo pakka out = xs.map(kaam (n) { wapas n * 2; });"))
      .toBe("adad[]");
  });

  it("catches a wrong operation inside a contextually typed callback", () => {
    expect(errs('pakka xs = [1, 2];\npakka out = xs.map(kaam (n) { wapas n.toUpperCase(); });').length)
      .toBeGreaterThan(0);
  });

  it("filter keeps the element type", () => {
    expect(typeOfLast('bhejo pakka xs = ["a", "b"];\nbhejo pakka out = xs.filter(kaam (s) { wapas s == "a"; });'))
      .toBe("lafz[]");
  });

  it("find returns T | khaali", () => {
    expect(typeOfLast("bhejo pakka xs = [1, 2];\nbhejo pakka hit = xs.find(kaam (n) { wapas n > 1; });"))
      .toBe("adad | khaali");
  });

  it("push, pop, includes, indexOf, join, length", () => {
    ok(`
      rakho xs: adad[] = [1, 2];
      pakka n: adad = xs.push(3);
      pakka last: adad | khaali = xs.pop();
      pakka has: bool = xs.includes(2);
      pakka at: adad = xs.indexOf(2);
      pakka s: lafz = xs.join(", ");
      pakka len: adad = xs.length;
    `);
  });

  it("slice, concat, reverse, sort keep the array type", () => {
    ok(`
      pakka xs: lafz[] = ["b", "a"];
      pakka a: lafz[] = xs.slice(0, 1);
      pakka b: lafz[] = xs.concat(["c"]);
      pakka c: lafz[] = xs.reverse();
      pakka d: lafz[] = xs.sort();
    `);
  });

  it("reduce infers the accumulator type", () => {
    expect(
      typeOfLast("bhejo pakka xs = [1, 2, 3];\nbhejo pakka kul = xs.reduce(kaam (acc: adad, n: adad): adad { wapas acc + n; }, 0);")
    ).toBe("adad");
  });

  it("some / every return bool, forEach returns kuchnahi", () => {
    ok(`
      pakka xs = [1, 2];
      pakka a: bool = xs.some(kaam (n) { wapas n > 1; });
      pakka b: bool = xs.every(kaam (n) { wapas n > 0; });
      xs.forEach(kaam (n) { bolo n; });
    `);
  });

  it("rejects a callback with the wrong parameter type", () => {
    expect(errs("pakka xs = [1, 2];\nxs.map(kaam (s: lafz): lafz { wapas s; });").length).toBeGreaterThan(0);
  });

  it("rejects pushing the wrong element type", () => {
    expect(errs('rakho xs: adad[] = [1];\nxs.push("do");').length).toBeGreaterThan(0);
  });

  it("rejects an unknown array method", () => {
    expect(errs("pakka xs = [1];\nxs.koiAjeebMethod();").length).toBeGreaterThan(0);
  });
});

describe("string methods are typed", () => {
  it("case, trim, and repeat return lafz", () => {
    ok(`
      pakka s = "Salaam";
      pakka a: lafz = s.toUpperCase();
      pakka b: lafz = s.toLowerCase();
      pakka c: lafz = s.trim();
      pakka d: lafz = s.repeat(2);
    `);
  });

  it("split returns lafz[], includes/startsWith return bool, indexOf adad", () => {
    ok(`
      pakka s = "a,b";
      pakka parts: lafz[] = s.split(",");
      pakka has: bool = s.includes("a");
      pakka pre: bool = s.startsWith("a");
      pakka post: bool = s.endsWith("b");
      pakka at: adad = s.indexOf("b");
      pakka len: adad = s.length;
    `);
  });

  it("chains through the typed results", () => {
    expect(typeOfLast('bhejo pakka out = "a,b,c".split(",").map(kaam (p) { wapas p.toUpperCase(); }).join("-");'))
      .toBe("lafz");
  });

  it("rejects a wrong argument type", () => {
    expect(errs('pakka s = "abc";\npakka x = s.repeat("do");').length).toBeGreaterThan(0);
  });

  it("rejects an unknown string method", () => {
    expect(errs('pakka s = "abc";\ns.koiAjeebMethod();').length).toBeGreaterThan(0);
  });
});

describe("koi still opts out of checking", () => {
  it("anything goes on koi", () => {
    ok("bahar jo_bhi;\njo_bhi.kuch().bhi.chalta(1, 2, 3);");
  });
});
