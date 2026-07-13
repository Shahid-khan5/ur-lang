// npm package type resolution: `lao ... "pkg" se` gets real types from the
// package's own .d.ts in node_modules — like tsc's module resolution (subset).
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolveNpmTypes, makeNpmTypesResolver } from "../src/npm-types.js";
import { compile } from "../src/compiler.js";
import { fsModuleLoader } from "../src/cli-lib.js";
import { typeName } from "../src/types.js";

let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "urlang-npm-"));
  const write = (rel: string, content: string): void => {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  };
  // Plain package with a "types" field.
  write(
    "node_modules/mera-pkg/package.json",
    JSON.stringify({ name: "mera-pkg", version: "1.0.0", types: "lib/index.d.ts" })
  );
  write(
    "node_modules/mera-pkg/lib/index.d.ts",
    `export declare function dugna(n: number): number;
export declare const NAAM: string;
export interface Cheez { qeemat: number; }
export default function asli(x: string): string;`
  );
  // Scoped package with subpath exports carrying types.
  write(
    "node_modules/@meri/api/package.json",
    JSON.stringify({
      name: "@meri/api",
      version: "1.0.0",
      exports: {
        ".": { types: "./index.d.ts" },
        "./core": { types: "./core.d.ts" },
      },
    })
  );
  write("node_modules/@meri/api/index.d.ts", "export declare const jarh: number;");
  write(
    "node_modules/@meri/api/core.d.ts",
    "export declare function pukaro(cmd: string, args?: unknown): Promise<unknown>;"
  );
  // The importing app lives under the same root.
  write("src/app.ur", "bolo 1;");
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function importer(): string {
  return path.join(dir, "src", "app.ur");
}

describe("resolveNpmTypes", () => {
  it("resolves a package's types field", () => {
    const exports = resolveNpmTypes("mera-pkg", importer());
    expect(exports).not.toBeNull();
    expect(typeName(exports!.values.get("dugna")!)).toBe("kaam(adad): adad");
    expect(typeName(exports!.values.get("NAAM")!)).toBe("lafz");
    expect(typeName(exports!.types.get("Cheez")!)).toBe("{ qeemat: adad }");
  });

  it("resolves export default declarations", () => {
    const exports = resolveNpmTypes("mera-pkg", importer());
    expect(exports!.defaultType).not.toBeNull();
    expect(typeName(exports!.defaultType!)).toBe("kaam(lafz): lafz");
  });

  it("resolves scoped packages and subpath exports", () => {
    const root = resolveNpmTypes("@meri/api", importer());
    expect(typeName(root!.values.get("jarh")!)).toBe("adad");
    const core = resolveNpmTypes("@meri/api/core", importer());
    expect(typeName(core!.values.get("pukaro")!)).toBe("kaam(lafz, koi?): Wada<koi>");
  });

  it("returns null for unknown packages (degrades to koi upstream)", () => {
    expect(resolveNpmTypes("bilkul-ghaib-pkg", importer())).toBeNull();
  });
});

describe("typed npm imports in compile()", () => {
  function compileApp(src: string): ReturnType<typeof compile> {
    return compile(src, {
      fileName: importer(),
      loadModule: fsModuleLoader,
      resolveTypes: makeNpmTypesResolver(),
    });
  }

  it("named imports carry the package's declared types", () => {
    const ok = compileApp('lao { dugna } "mera-pkg" se;\nrakho n: adad = dugna(21);');
    expect(ok.diagnostics.map((d) => d.message)).toEqual([]);
    const bad = compileApp('lao { dugna } "mera-pkg" se;\ndugna("ikkis");');
    expect(bad.diagnostics).toHaveLength(1);
    expect(bad.diagnostics[0]!.code).toBe("UR2016");
  });

  it("interfaces from packages are usable as annotations", () => {
    const ok = compileApp('lao { Cheez } "mera-pkg" se;\nrakho c: Cheez = { qeemat: 5 };');
    expect(ok.diagnostics.map((d) => d.message)).toEqual([]);
    const bad = compileApp('lao { Cheez } "mera-pkg" se;\nrakho c: Cheez = { qeemat: "paanch" };');
    expect(bad.diagnostics).toHaveLength(1);
  });

  it("default imports get the default export's type", () => {
    const bad = compileApp('lao asal asli "mera-pkg" se;\nasli(42);');
    expect(bad.diagnostics).toHaveLength(1);
  });

  it("subpath imports work (the Tauri invoke shape)", () => {
    const ok = compileApp(
      'lao { pukaro } "@meri/api/core" se;\nkaam chalao(): kuchnahi { bolo intezar pukaro("greet"); }'
    );
    expect(ok.diagnostics.map((d) => d.message)).toEqual([]);
    const bad = compileApp('lao { pukaro } "@meri/api/core" se;\npukaro(42);');
    expect(bad.diagnostics).toHaveLength(1);
  });

  it("unknown packages still degrade to koi with no errors", () => {
    const ok = compileApp('lao { kuchBhi } "bilkul-ghaib-pkg" se;\nkuchBhi(1, 2, 3);');
    expect(ok.diagnostics.map((d) => d.message)).toEqual([]);
  });
});

describe("against the real @tauri-apps/api package", () => {
  const tauriApp = path.resolve(import.meta.dirname, "..", "meri-tauri-app");
  const hasPackage = fs.existsSync(path.join(tauriApp, "node_modules", "@tauri-apps", "api"));

  it.skipIf(!hasPackage)("types invoke from the actual installed package", () => {
    const importerPath = path.join(tauriApp, "src", "x.ur");
    const exports = resolveNpmTypes("@tauri-apps/api/core", importerPath);
    expect(exports).not.toBeNull();
    const invoke = exports!.values.get("invoke");
    expect(invoke).toBeDefined();
    expect(typeName(invoke!)).toContain("Wada<");

    // A real type error against the real package's signature:
    const bad = compile('lao { invoke } "@tauri-apps/api/core" se;\ninvoke(42);', {
      fileName: importerPath,
      loadModule: fsModuleLoader,
      resolveTypes: makeNpmTypesResolver(),
    });
    expect(bad.diagnostics.length).toBeGreaterThan(0);
  });
});
