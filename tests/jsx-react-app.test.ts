// @vitest-environment jsdom
//
// Real-project integration for JSX: scaffolds the actual `react` template with
// the create-urlang bin, builds it with the real vite CLI (React resolved from
// this repo's node_modules), mounts the produced bundle in a real DOM, and
// clicks the UrLang-authored React counter.
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
  // Inside the repo so vite resolves react/react-dom from this repo's node_modules.
  tmpRoot = fs.mkdtempSync(path.join(projectRoot, "node_modules", ".tmp-urx-app-"));
  execFileSync(process.execPath, [bin, "meri-react-app", "--template", "react"], {
    cwd: tmpRoot,
    encoding: "utf8",
  });
  const appRoot = path.join(tmpRoot, "meri-react-app");
  // The template imports the published "ur-lang/vite"; tests use the local source.
  fs.rmSync(path.join(appRoot, "vite.config.js"));
  const pluginRel = path
    .relative(appRoot, path.join(projectRoot, "src", "vite-plugin.js"))
    .replace(/\\/g, "/");
  fs.writeFileSync(
    path.join(appRoot, "vite.config.ts"),
    [
      'import { defineConfig } from "vite";',
      `import urlang from ${JSON.stringify(pluginRel)};`,
      "export default defineConfig({",
      "  plugins: [urlang()],",
      "  build: { modulePreload: false, minify: false },",
      "});",
    ].join("\n")
  );
  // Spawned out-of-process because esbuild cannot run inside jsdom.
  execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "build", appRoot, "--logLevel", "error"], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  const assetsDir = path.join(appRoot, "dist", "assets");
  const jsFile = fs.readdirSync(assetsDir).find((f) => f.endsWith(".js"))!;
  bundle = fs.readFileSync(path.join(assetsDir, jsFile), "utf8");
  html = fs.readFileSync(path.join(appRoot, "dist", "index.html"), "utf8");
}, 120000);

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function flushAsync(ms = 50): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("react template (real vite build, real React DOM)", () => {
  it("bundles .urx components with no leftover imports", () => {
    expect(bundle).not.toContain('.urx"');
    expect(bundle).not.toMatch(/^\s*import\s/m);
  });

  it("renders and updates UrLang-authored React components", async () => {
    document.body.innerHTML = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
    new Function(bundle)();
    await flushAsync();
    expect(document.querySelector("h1")!.textContent).toBe("Salaam, duniya!");
    const button = document.querySelector("button")!;
    expect(button.textContent).toBe("Ginti: 0");
    button.click();
    await flushAsync();
    button.click();
    await flushAsync();
    expect(button.textContent).toBe("Ginti: 2");
  });
});
