// Server templates, proven by running them: each is scaffolded with the real
// create-urlang bin, compiled with the real toolchain, started as a real
// process, and hit over real HTTP. No mocks anywhere in the chain.
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import { execFileSync, spawn, ChildProcess } from "node:child_process";

const projectRoot = path.resolve(import.meta.dirname, "..");
const bin = path.join(projectRoot, "packages", "create-urlang", "index.js");
const bunBin = path.join(projectRoot, "node_modules", "bun", "bin", process.platform === "win32" ? "bun.exe" : "bun");
const hasBun = fs.existsSync(bunBin);

// Scaffolded inside the repo so `express`, `react`, and `ur-lang`'s own deps
// resolve through the normal node_modules walk-up — no linking games.
let root: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(projectRoot, "node_modules", ".tmp-servers-"));
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function scaffold(name: string, template: string): string {
  execFileSync(process.execPath, [bin, name, "--template", template], { cwd: root, encoding: "utf8" });
  return path.join(root, name);
}

/** An OS-assigned free port — the templates ship 3000, which anything could hold. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

/** Points a scaffolded app at `port` instead of the template's default 3000. */
function usePort(app: string, port: number): void {
  const main = path.join(app, "src", "main.ur");
  fs.writeFileSync(main, fs.readFileSync(main, "utf8").replace("= 3000;", `= ${port};`));
}

/** Waits for the server to answer, then returns the parsed JSON body. */
async function getJson(url: string, attempts = 60): Promise<unknown> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server never came up: ${url}`);
}

/** Runs a server process for the duration of one test, killing it afterwards. */
async function withServer<T>(
  proc: ChildProcess,
  body: () => Promise<T>
): Promise<T> {
  const errors: string[] = [];
  proc.stderr?.on("data", (d: Buffer) => errors.push(d.toString()));
  try {
    return await body();
  } catch (e) {
    if (errors.length > 0) throw new Error(`${String(e)}\n--- server stderr ---\n${errors.join("")}`);
    throw e;
  } finally {
    proc.kill();
  }
}

/** Runs the real `urlang build` the template's package.json would run. */
function build(app: string): void {
  execFileSync(process.execPath, [
    path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs"),
    path.join(projectRoot, "src", "cli.ts"),
    "build",
    "src/main.ur",
    "-o",
    "dist",
  ], { cwd: app, encoding: "utf8" });
}

describe("node template", () => {
  it("builds with the CLI and serves typed JSON", async () => {
    const app = scaffold("node-app", "node");
    const port = await freePort();
    usePort(app, port);
    build(app);

    expect(fs.existsSync(path.join(app, "dist", "main.js"))).toBe(true);
    expect(fs.existsSync(path.join(app, "dist", "greet.js"))).toBe(true);
    expect(fs.existsSync(path.join(app, "dist", "greet.d.ts"))).toBe(true); // types for TS consumers

    const proc = spawn(process.execPath, ["dist/main.js"], { cwd: app, stdio: "pipe" });
    await withServer(proc, async () => {
      expect(await getJson(`http://localhost:${port}/`)).toEqual({ paigham: "salam, duniya!" });
      const sehat = (await getJson(`http://localhost:${port}/sehat`)) as { theek: boolean; waqt: string };
      expect(sehat.theek).toBe(true);
      expect(typeof sehat.waqt).toBe("string");
    });
  }, 120000);
});

describe("express template", () => {
  it("serves GET and POST through UrLang route handlers", async () => {
    const app = scaffold("express-app", "express");
    const port = await freePort();
    usePort(app, port);
    build(app);

    const proc = spawn(process.execPath, ["dist/main.js"], { cwd: app, stdio: "pipe" });
    await withServer(proc, async () => {
      expect(await getJson(`http://localhost:${port}/`)).toEqual({ paigham: "salam, duniya!" });
      const res = await fetch(`http://localhost:${port}/users`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ naam: "Ali", umar: 30 }),
      });
      expect(res.status).toBe(201);
      // baalig is computed by the typed domain layer in users.ur
      expect(await res.json()).toEqual({ naam: "Ali", umar: 30, baalig: true });
    });
  }, 120000);
});

describe("bun template", () => {
  it.skipIf(!hasBun)("runs .ur files directly through the Bun loader plugin", async () => {
    const app = scaffold("bun-app", "bun");
    const port = await freePort();
    usePort(app, port);
    // The template preloads the published "ur-lang/bun"; point it at the source.
    const pluginPath = path.join(projectRoot, "src", "bun-plugin.ts").replace(/\\/g, "/");
    fs.writeFileSync(
      path.join(app, "urlang.preload.js"),
      [
        'import { plugin } from "bun";',
        `import urlang from "${pluginPath}";`,
        "plugin(urlang());",
      ].join("\n")
    );

    // No build step: bun executes src/main.ur itself.
    const proc = spawn(bunBin, ["run", "src/main.ur"], { cwd: app, stdio: "pipe" });
    await withServer(proc, async () => {
      expect(await getJson(`http://localhost:${port}/`)).toEqual({ paigham: "salam, duniya!" });
      const sehat = (await getJson(`http://localhost:${port}/sehat`)) as { theek: boolean };
      expect(sehat.theek).toBe(true);
    });
  }, 120000);

  it.skipIf(!hasBun)("refuses to run a .ur file with a type error", async () => {
    const app = scaffold("bun-bad-app", "bun");
    const pluginPath = path.join(projectRoot, "src", "bun-plugin.ts").replace(/\\/g, "/");
    fs.writeFileSync(
      path.join(app, "urlang.preload.js"),
      [
        'import { plugin } from "bun";',
        `import urlang from "${pluginPath}";`,
        "plugin(urlang());",
      ].join("\n")
    );
    // salaam takes a lafz; hand it an adad.
    fs.writeFileSync(path.join(app, "src", "bad.ur"), 'lao { salaam } "./greet.ur" se;\nbolo salaam(42);');

    let stderr = "";
    const code = await new Promise<number>((resolve) => {
      const proc = spawn(bunBin, ["run", "src/bad.ur"], { cwd: app, stdio: "pipe" });
      proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
      proc.on("exit", (c) => resolve(c ?? 1));
    });
    expect(code).not.toBe(0);
    expect(stderr).toContain("UR2016"); // argument type mismatch
  }, 120000);
});
