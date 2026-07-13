import { describe, expect, it, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { build } from "vite";
import urlang from "../src/vite-plugin.js";

describe("vite-plugin-urlang: transform hook", () => {
  const plugin = urlang();
  const transform = plugin.transform as (
    this: { error: (msg: string) => never },
    code: string,
    id: string
  ) => { code: string; map: unknown } | null;

  const ctx = {
    error(msg: string): never {
      throw new Error(msg);
    },
  };

  it("compiles .ur modules and returns code + map", () => {
    const out = transform.call(ctx, 'bolo "salam";', "/app/src/main.ur");
    expect(out).not.toBeNull();
    expect(out!.code).toContain('console.log("salam");');
    expect(out!.map).toBeTruthy();
  });

  it("ignores non-.ur files", () => {
    expect(transform.call(ctx, "export const x = 1;", "/app/src/main.ts")).toBeNull();
  });

  it("reports type errors through the Vite error channel", () => {
    expect(() => transform.call(ctx, 'rakho x: adad = "nahi";', "/app/src/bad.ur")).toThrow(/adad/);
  });
});

describe("vite-plugin-urlang: full vite build", () => {
  let root: string;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "urlang-vite-"));
    fs.mkdirSync(path.join(root, "src"));
    fs.writeFileSync(
      path.join(root, "index.html"),
      '<!doctype html><html><body><div id="app"></div><script type="module" src="/src/main.js"></script></body></html>'
    );
    fs.writeFileSync(path.join(root, "src", "main.js"), 'import "./app.ur";');
    fs.writeFileSync(
      path.join(root, "src", "app.ur"),
      [
        'lao { istaqbal } "./greet.ur" se;',
        'pakka app = document.getElementById("app");',
        "app.textContent = istaqbal(\"duniya\");",
      ].join("\n")
    );
    fs.writeFileSync(
      path.join(root, "src", "greet.ur"),
      'bhejo kaam istaqbal(naam: lafz): lafz { wapas "salam " + naam; }'
    );
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("bundles a multi-module .ur app end to end", async () => {
    await build({
      root,
      logLevel: "silent",
      plugins: [urlang()],
      build: { outDir: "dist", minify: false },
    });
    const assets = fs.readdirSync(path.join(root, "dist", "assets"));
    const jsFile = assets.find((f) => f.endsWith(".js"))!;
    const bundle = fs.readFileSync(path.join(root, "dist", "assets", jsFile), "utf8");
    expect(bundle).toContain("salam ");
    expect(bundle).toContain("getElementById");
  }, 60000);
});
