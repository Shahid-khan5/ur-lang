// @vitest-environment jsdom
//
// The svelte template, proven end to end: scaffolded with the real bin, built
// with the real Vite CLI (Svelte compiler and all), mounted in a real DOM, and
// clicked — asserting on the values its UrLang logic module computes.
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

const projectRoot = path.resolve(import.meta.dirname, "..");
const bin = path.join(projectRoot, "packages", "create-urlang", "index.js");
let tmpRoot: string;
let bundle: string;
let html: string;

beforeAll(() => {
  // Inside the repo so svelte/vite resolve from this repo's node_modules.
  tmpRoot = fs.mkdtempSync(path.join(projectRoot, "node_modules", ".tmp-svelte-"));
  execFileSync(process.execPath, [bin, "meri-svelte-app", "--template", "svelte"], {
    cwd: tmpRoot,
    encoding: "utf8",
  });
  const appRoot = path.join(tmpRoot, "meri-svelte-app");

  // The template imports the published "ur-lang/vite"; tests use local source.
  fs.rmSync(path.join(appRoot, "vite.config.js"));
  const pluginRel = path
    .relative(appRoot, path.join(projectRoot, "src", "vite-plugin.js"))
    .replace(/\\/g, "/");
  fs.writeFileSync(
    path.join(appRoot, "vite.config.ts"),
    [
      'import { defineConfig } from "vite";',
      'import { svelte } from "@sveltejs/vite-plugin-svelte";',
      `import urlang from ${JSON.stringify(pluginRel)};`,
      "export default defineConfig({",
      "  plugins: [urlang(), svelte()],",
      "  build: { modulePreload: false, minify: false },",
      "});",
    ].join("\n")
  );

  execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "build", appRoot, "--logLevel", "error"], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  const assetsDir = path.join(appRoot, "dist", "assets");
  const jsFile = fs.readdirSync(assetsDir).find((f) => f.endsWith(".js"))!;
  bundle = fs.readFileSync(path.join(assetsDir, jsFile), "utf8");
  html = fs.readFileSync(path.join(appRoot, "dist", "index.html"), "utf8");
}, 180000);

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function flush(ms = 50): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("svelte template (real vite build, real Svelte runtime)", () => {
  it("bundles the .ur logic module with no leftover imports", () => {
    expect(bundle).not.toContain('.ur"');
    expect(bundle).not.toMatch(/^\s*import\s/m);
  });

  it("renders and updates using logic computed in UrLang", async () => {
    document.body.innerHTML = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
    new Function(bundle)();
    await flush();
    // paighamBanao(0) — from src/lib/ginti.ur
    expect(document.getElementById("paigham")!.textContent).toBe("shuruaat se shuru");

    const button = document.getElementById("zyada")!;
    button.click();
    await flush();
    expect(document.getElementById("paigham")!.textContent).toBe("ab tak 1 dafa daba");

    for (let i = 0; i < 9; i++) {
      button.click();
      await flush(10);
    }
    // paighamBanao(10) takes the >= 10 branch
    expect(document.getElementById("paigham")!.textContent).toBe("wah! 10 tak pahunch gaye");
  }, 30000);
});
