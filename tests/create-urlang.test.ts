// create-urlang scaffolder: generates working projects whose .ur sources
// actually compile with the real compiler.
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { compile } from "../src/compiler.js";
import { fsModuleLoader } from "../src/cli-lib.js";
import { loadDtsExports } from "../src/dts.js";

const projectRoot = path.resolve(import.meta.dirname, "..");
const bin = path.join(projectRoot, "packages", "create-urlang", "index.js");
let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "create-urlang-"));
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function scaffold(name: string, template: string): string {
  execFileSync(process.execPath, [bin, name, "--template", template], { cwd: dir, encoding: "utf8" });
  return path.join(dir, name);
}

function urFilesUnder(root: string): string[] {
  const found: string[] = [];
  const walk = (d: string): void => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith(".ur") || entry.name.endsWith(".urx")) found.push(p);
    }
  };
  walk(root);
  return found;
}

describe("create-urlang", () => {
  it("scaffolds the vite template with a compiling .ur app", () => {
    const app = scaffold("meri-app", "vite");
    expect(fs.existsSync(path.join(app, "vite.config.js"))).toBe(true);
    expect(fs.existsSync(path.join(app, ".gitignore"))).toBe(true);
    const pkg = JSON.parse(fs.readFileSync(path.join(app, "package.json"), "utf8"));
    expect(pkg.name).toBe("meri-app");
    for (const f of urFilesUnder(app)) {
      const result = compile(fs.readFileSync(f, "utf8"), { fileName: f });
      expect(result.diagnostics.map((d) => d.message)).toEqual([]);
    }
  });

  it("scaffolds the tauri template (Rust backend + typed command wrappers)", () => {
    const app = scaffold("tauri-app", "tauri");
    expect(fs.existsSync(path.join(app, "src-tauri", "tauri.conf.json"))).toBe(true);
    expect(fs.existsSync(path.join(app, "src-tauri", "src", "main.rs"))).toBe(true);
    for (const f of urFilesUnder(app)) {
      const result = compile(fs.readFileSync(f, "utf8"), { fileName: f, loadModule: fsModuleLoader });
      expect(result.diagnostics.map((d) => d.message)).toEqual([]);
    }
    // The typed wrapper's signature is enforced across modules:
    const bad = compile('lao { greet } "./commands.ur" se;\ngreet(42);', {
      fileName: path.join(app, "src", "bad.ur"),
      loadModule: fsModuleLoader,
    });
    expect(bad.diagnostics).toHaveLength(1);
  });

  it("scaffolds the electron template (UrLang main process + typed bridge)", () => {
    const app = scaffold("elec-app", "electron");
    expect(fs.existsSync(path.join(app, "electron.vite.config.js"))).toBe(true);
    expect(fs.existsSync(path.join(app, "src", "main", "main.ur"))).toBe(true);
    const bridgeDts = fs.readFileSync(path.join(app, "src", "renderer", "src", "bridge.d.ts"), "utf8");
    const ambient = [loadDtsExports(bridgeDts)];
    for (const f of urFilesUnder(app)) {
      const result = compile(fs.readFileSync(f, "utf8"), {
        fileName: f,
        loadModule: fsModuleLoader,
        ambient,
      });
      expect(result.diagnostics.map((d) => d.message)).toEqual([]);
    }
    // The bridge types are enforced:
    const bad = compile("bridge.greet(42);", { fileName: "x.ur", ambient });
    expect(bad.diagnostics).toHaveLength(1);
  });

  it("scaffolds the react template with type-checked .urx components", () => {
    const app = scaffold("react-app", "react");
    expect(fs.existsSync(path.join(app, "src", "App.urx"))).toBe(true);
    const pkg = JSON.parse(fs.readFileSync(path.join(app, "package.json"), "utf8"));
    expect(pkg.dependencies.react).toBeTruthy();
    for (const f of urFilesUnder(app)) {
      const result = compile(fs.readFileSync(f, "utf8"), { fileName: f, loadModule: fsModuleLoader });
      expect(result.diagnostics.map((d) => d.message), f).toEqual([]);
    }
    // Props are enforced across .urx modules, TS-style.
    const bad = compile('lao { Ginti } "./Ginti.urx" se;\nbhejo pakka el = <Ginti shuru="galat"/>;', {
      fileName: path.join(app, "src", "bad.urx"),
      loadModule: fsModuleLoader,
    });
    expect(bad.diagnostics).toHaveLength(1);
  });

  it("scaffolds the tauri-react template (Rust backend + React frontend in UrLang)", () => {
    const app = scaffold("tauri-react-app", "tauri-react");
    expect(fs.existsSync(path.join(app, "src-tauri", "src", "main.rs"))).toBe(true);
    expect(fs.existsSync(path.join(app, "src", "App.urx"))).toBe(true);
    for (const f of urFilesUnder(app)) {
      const result = compile(fs.readFileSync(f, "utf8"), { fileName: f, loadModule: fsModuleLoader });
      expect(result.diagnostics.map((d) => d.message), f).toEqual([]);
    }
  });

  it("scaffolds every advertised template with compiling sources", () => {
    // The scaffolder advertises whatever is in templates/ — so every one of them
    // must produce sources that actually compile.
    const templatesRoot = path.join(projectRoot, "packages", "create-urlang", "templates");
    const templates = fs.readdirSync(templatesRoot);
    expect(templates).toEqual(
      expect.arrayContaining(["vite", "react", "svelte", "node", "express", "bun", "tauri", "tauri-react", "tauri-svelte", "electron"])
    );
    for (const template of templates) {
      const app = scaffold(`har-${template}`, template);
      const sources = urFilesUnder(app);
      expect(sources.length, `${template} has no .ur sources`).toBeGreaterThan(0);
      for (const f of sources) {
        const result = compile(fs.readFileSync(f, "utf8"), { fileName: f, loadModule: fsModuleLoader });
        // The electron template's renderer needs its ambient bridge; covered above.
        if (template === "electron") continue;
        expect(result.diagnostics.map((d) => d.message), f).toEqual([]);
      }
    }
  }, 60000);

  it("refuses to overwrite a non-empty directory", () => {
    fs.mkdirSync(path.join(dir, "bhara"), { recursive: true });
    fs.writeFileSync(path.join(dir, "bhara", "x.txt"), "kuch");
    expect(() =>
      execFileSync(process.execPath, [bin, "bhara", "--template", "vite"], { cwd: dir, encoding: "utf8" })
    ).toThrow();
  });
});
