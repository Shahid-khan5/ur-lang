// Watch mode: incremental, dependency-aware rebuilds.
import { describe, expect, it, beforeEach, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { BuildWatcher } from "../src/watch.js";

let dir: string;
const dirs: string[] = [];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "urlang-watch-"));
  dirs.push(dir);
});

afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

function write(name: string, content: string): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
}

describe("BuildWatcher", () => {
  it("builds the whole graph initially", () => {
    write("math.ur", "bhejo kaam jama(a: adad, b: adad): adad { wapas a + b; }");
    const entry = write("main.ur", 'lao { jama } "./math.ur" se;\nbolo jama(1, 2);');
    const watcher = new BuildWatcher(entry, { outDir: path.join(dir, "out"), declarations: false });
    const results = watcher.buildAll();
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.diagnostics.length === 0)).toBe(true);
    expect(fs.existsSync(path.join(dir, "out", "main.js"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "out", "math.js"))).toBe(true);
  });

  it("a change rebuilds the file and its dependents — and surfaces new type errors", () => {
    const math = write("math.ur", "bhejo kaam jama(a: adad, b: adad): adad { wapas a + b; }");
    const entry = write("main.ur", 'lao { jama } "./math.ur" se;\nbolo jama(1, 2);');
    write("standalone.ur", "bolo 1;");
    const watcher = new BuildWatcher(entry, { outDir: path.join(dir, "out"), declarations: false });
    watcher.buildAll();

    // Break math's signature: jama now takes lafz — main's call becomes invalid.
    fs.writeFileSync(math, "bhejo kaam jama(a: lafz, b: lafz): lafz { wapas a + b; }");
    const results = watcher.onFileChanged(math);
    const names = results.map((r) => path.basename(r.inputPath)).sort();
    expect(names).toEqual(["main.ur", "math.ur"]); // standalone.ur untouched
    const main = results.find((r) => r.inputPath.endsWith("main.ur"))!;
    expect(main.diagnostics.length).toBeGreaterThan(0);
    expect(main.diagnostics[0]!.code).toBe("UR2016");

    // Fix it again — everything rebuilds clean.
    fs.writeFileSync(math, "bhejo kaam jama(a: adad, b: adad): adad { wapas a + b; }");
    const fixed = watcher.onFileChanged(math);
    expect(fixed.every((r) => r.diagnostics.length === 0)).toBe(true);
  });

  it("ignores no-op changes (same content)", () => {
    const entry = write("main.ur", "bolo 1;");
    const watcher = new BuildWatcher(entry, { outDir: path.join(dir, "out"), declarations: false });
    watcher.buildAll();
    expect(watcher.onFileChanged(entry)).toEqual([]);
  });

  it("tracks transitive dependents (a → b → c)", () => {
    const c = write("c.ur", "bhejo pakka QEEMAT: adad = 1;");
    write("b.ur", 'lao { QEEMAT } "./c.ur" se;\nbhejo pakka DUGNA: adad = QEEMAT * 2;');
    const entry = write("a.ur", 'lao { DUGNA } "./b.ur" se;\nbolo DUGNA;');
    const watcher = new BuildWatcher(entry, { outDir: path.join(dir, "out"), declarations: false });
    watcher.buildAll();
    const dependents = watcher.transitiveDependents(c).map((p) => path.basename(p)).sort();
    expect(dependents).toEqual(["a.ur", "b.ur"]);
  });
});
