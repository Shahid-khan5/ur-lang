// @vitest-environment jsdom
//
// Real-project integration test: builds the actual demo/ Vite app (the same
// structure a Tauri or Electron frontend uses), loads the produced bundle into
// a real DOM, and asserts on user-visible behavior — clicks, async data
// loading, error-free execution. No mocks of the compiler pipeline anywhere.
import { describe, expect, it, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

const projectRoot = path.resolve(import.meta.dirname, "..");
const demoRoot = path.join(projectRoot, "demo");
let bundle: string;
let html: string;

function bodyOf(fullHtml: string): string {
  return fullHtml.slice(fullHtml.indexOf("<body>") + 6, fullHtml.indexOf("</body>"));
}

beforeAll(async () => {
  // Real project, real CLI — the exact command a Tauri/Electron frontend runs.
  // (Spawned out-of-process because esbuild cannot run inside jsdom.)
  execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "build", demoRoot, "--logLevel", "error"], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  const assetsDir = path.join(demoRoot, "dist", "assets");
  const jsFile = fs.readdirSync(assetsDir).find((f) => f.endsWith(".js"))!;
  bundle = fs.readFileSync(path.join(assetsDir, jsFile), "utf8");
  html = fs.readFileSync(path.join(demoRoot, "dist", "index.html"), "utf8");
}, 120000);

function mountApp(): void {
  document.body.innerHTML = bodyOf(html);
  new Function(bundle)();
}

function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

describe("demo app (real vite build, real DOM)", () => {
  it("produces a single self-contained bundle with no leftover .ur imports", () => {
    expect(bundle).not.toContain('.ur"');
    expect(bundle).not.toMatch(/^\s*import\s/m);
  });

  it("renders the initial state", () => {
    mountApp();
    expect(document.getElementById("ginti")!.textContent).toBe("0");
    expect(document.getElementById("paigham")!.textContent).toBe("shuruaat se shuru");
  });

  it("increments and decrements the counter on click", () => {
    mountApp();
    const zyada = document.getElementById("zyada")!;
    const kam = document.getElementById("kam")!;
    zyada.click();
    zyada.click();
    zyada.click();
    expect(document.getElementById("ginti")!.textContent).toBe("3");
    kam.click();
    kam.click();
    kam.click();
    kam.click();
    expect(document.getElementById("ginti")!.textContent).toBe("-1");
    expect(document.getElementById("paigham")!.textContent).toBe("manfi mein chale gaye!");
  });

  it("shows the milestone message at 10+", () => {
    mountApp();
    const zyada = document.getElementById("zyada")!;
    for (let i = 0; i < 10; i++) zyada.click();
    expect(document.getElementById("ginti")!.textContent).toBe("10");
    expect(document.getElementById("paigham")!.textContent).toBe("das paar — shabash!");
  });

  it("loads cities asynchronously (intezar + koshish + har all compiled in)", async () => {
    mountApp();
    document.getElementById("load")!.click();
    expect(document.getElementById("status")!.textContent).toBe("lo raha hai...");
    await flushAsync();
    const items = [...document.querySelectorAll("#sheher-list li")].map((li) => li.textContent);
    expect(items).toEqual(["Karachi", "Lahore", "Islamabad", "Peshawar", "Quetta"]);
    expect(document.getElementById("status")!.textContent).toBe("5 sheher mil gaye");
  });

  it("reloading the list is idempotent (no duplicate items)", async () => {
    mountApp();
    document.getElementById("load")!.click();
    await flushAsync();
    document.getElementById("load")!.click();
    await flushAsync();
    expect(document.querySelectorAll("#sheher-list li")).toHaveLength(5);
  });
});
