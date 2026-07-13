import { describe, expect, it, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { buildFile, buildGraph, checkFile } from "../src/cli-lib.js";

let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "urlang-test-"));
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function writeUr(name: string, content: string): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
}

describe("cli-lib: buildFile", () => {
  it("emits .js and .js.map next to each other", () => {
    const input = writeUr("hello.ur", 'bolo "salam";');
    const out = path.join(dir, "dist1");
    const result = buildFile(input, { outDir: out });
    expect(result.diagnostics).toEqual([]);
    expect(result.outputPath).toBe(path.join(out, "hello.js"));
    const code = fs.readFileSync(result.outputPath!, "utf8");
    expect(code).toContain('console.log("salam");');
    expect(code).toContain("sourceMappingURL=hello.js.map");
    expect(fs.existsSync(path.join(out, "hello.js.map"))).toBe(true);
  });

  it("reports diagnostics and emits nothing on type errors", () => {
    const input = writeUr("bad.ur", 'rakho x: adad = "str";');
    const out = path.join(dir, "dist2");
    const result = buildFile(input, { outDir: out });
    expect(result.outputPath).toBeNull();
    expect(result.diagnostics).toHaveLength(1);
    expect(fs.existsSync(path.join(out, "bad.js"))).toBe(false);
  });
});

describe("cli-lib: buildGraph", () => {
  it("compiles imported .ur modules transitively and the output runs in Node", () => {
    writeUr("math.ur", "bhejo kaam add(a: adad, b: adad): adad { wapas a + b; }");
    const entry = writeUr("main.ur", 'lao { add } "./math.ur" se;\nbolo add(2, 3);');
    const out = path.join(dir, "dist3");
    const results = buildGraph(entry, { outDir: out });
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.diagnostics.length === 0)).toBe(true);
    // Node needs to know these are ES modules.
    fs.writeFileSync(path.join(out, "package.json"), '{"type":"module"}');
    const stdout = execFileSync(process.execPath, [path.join(out, "main.js")], { encoding: "utf8" });
    expect(stdout.trim()).toBe("5");
  });
});

describe("cli-lib: checkFile", () => {
  it("returns diagnostics without writing output", () => {
    const input = writeUr("check.ur", "bolo undeclared_naam;");
    const { diagnostics } = checkFile(input);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.message).toContain("undeclared_naam");
  });

  it("returns clean for valid programs", () => {
    const input = writeUr("ok.ur", "kaam f(): adad { wapas 1; } bolo f();");
    expect(checkFile(input).diagnostics).toEqual([]);
  });
});

describe("cli: end-to-end via tsx", () => {
  it("urlang run executes a program", () => {
    const input = writeUr("run-me.ur", `
      kaam fib(n: adad): adad {
        agar (n < 2) { wapas n; }
        wapas fib(n - 1) + fib(n - 2);
      }
      bolo "fib(15) =", fib(15);
    `);
    const stdout = execFileSync(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", "src/cli.ts", "run", input],
      { encoding: "utf8", cwd: path.resolve(import.meta.dirname, "..") }
    );
    expect(stdout).toContain("fib(15) = 610");
  }, 30000);

  it("urlang build follows imports, so the emitted entry actually runs", () => {
    // A build that emits main.js without the greet.js it imports is a broken
    // build — `node dist/main.js` would die on a missing module.
    const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), "urlang-build-"));
    fs.writeFileSync(
      path.join(buildDir, "greet.ur"),
      'bhejo kaam salaam(naam: lafz): lafz { wapas "salam " + naam; }'
    );
    const entry = path.join(buildDir, "main.ur");
    fs.writeFileSync(entry, 'lao { salaam } "./greet.ur" se;\nbolo salaam("duniya");');
    const out = path.join(buildDir, "dist");

    execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "src/cli.ts", "build", entry, "-o", out], {
      encoding: "utf8",
      cwd: path.resolve(import.meta.dirname, ".."),
    });

    expect(fs.existsSync(path.join(out, "main.js"))).toBe(true);
    expect(fs.existsSync(path.join(out, "greet.js"))).toBe(true);
    fs.writeFileSync(path.join(out, "package.json"), '{"type":"module"}');
    const stdout = execFileSync(process.execPath, [path.join(out, "main.js")], { encoding: "utf8" });
    expect(stdout.trim()).toBe("salam duniya");
    fs.rmSync(buildDir, { recursive: true, force: true });
  }, 30000);

  it("urlang check reports type errors with carets and exits nonzero", () => {
    const input = writeUr("bad-check.ur", "rakho x: adad = sach;");
    let failed = false;
    try {
      execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "src/cli.ts", "check", input], {
        encoding: "utf8",
        cwd: path.resolve(import.meta.dirname, ".."),
      });
    } catch (e) {
      failed = true;
      const err = e as { stderr: string };
      expect(err.stderr).toContain("^");
      expect(err.stderr).toContain("adad");
    }
    expect(failed).toBe(true);
  }, 30000);
});
