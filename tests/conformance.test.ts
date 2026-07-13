// Conformance suite: data-driven fixtures under tests/conformance/, separate
// from unit tests. `run/*.ur` must compile clean and print `*.expected`;
// `errors/*.ur` must produce exactly the codes in `*.codes` (in order).
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { compile } from "../src/compiler.js";

const root = path.join(import.meta.dirname, "conformance");

function fixtures(dir: string, dataExt: string): [string, string, string][] {
  const full = path.join(root, dir);
  return fs
    .readdirSync(full)
    .filter((f) => f.endsWith(".ur"))
    .map((f) => [
      f,
      fs.readFileSync(path.join(full, f), "utf8"),
      fs.readFileSync(path.join(full, f.replace(/\.ur$/, dataExt)), "utf8"),
    ]);
}

function inspect(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return `[ ${value.map(inspect).join(", ")} ]`;
  return String(value);
}

describe("conformance: run", () => {
  for (const [name, source, expected] of fixtures("run", ".expected")) {
    it(name, () => {
      const result = compile(source, { fileName: name });
      expect(result.diagnostics.map((d) => d.message)).toEqual([]);
      const lines: string[] = [];
      const original = console.log;
      console.log = (...args: unknown[]) => {
        lines.push(args.map(inspect).join(" "));
      };
      try {
        new Function(result.code!)();
      } finally {
        console.log = original;
      }
      expect(lines.join("\n") + "\n").toBe(expected.replace(/\r\n/g, "\n"));
    });
  }
});

describe("conformance: errors", () => {
  for (const [name, source, codesRaw] of fixtures("errors", ".codes")) {
    it(name, () => {
      const expectedCodes = codesRaw.trim().split(/\r?\n/);
      const result = compile(source, { fileName: name });
      expect(result.code).toBeNull();
      expect(result.diagnostics.map((d) => d.code)).toEqual(expectedCodes);
    });
  }
});
