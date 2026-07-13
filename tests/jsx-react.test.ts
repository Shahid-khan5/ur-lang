// The real-React proof: .urx modules are compiled to automatic-runtime calls,
// written to disk, imported, and rendered with the actual react-dom package.
import { afterAll, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compile } from "../src/compiler.js";

// Written inside the repo so the emitted `react/jsx-runtime` bare import
// resolves against this repo's node_modules — no specifier rewriting.
const tmpDir = fs.mkdtempSync(path.join(process.cwd(), "node_modules", ".tmp-urx-react-"));
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
let moduleCount = 0;

async function loadUrx(source: string): Promise<Record<string, unknown>> {
  const result = compile(source, { fileName: "component.urx" });
  expect(result.diagnostics).toEqual([]);
  expect(result.code).not.toBeNull();
  const file = path.join(tmpDir, `component-${moduleCount++}.mjs`);
  fs.writeFileSync(file, result.code!);
  return (await import(pathToFileURL(file).href)) as Record<string, unknown>;
}

describe("jsx renders through real react-dom", () => {
  it("renders an intrinsic tree with props and children", async () => {
    const mod = await loadUrx(`
      bhejo asal kaam App(props: { naam: lafz }) {
        wapas (
          <div id="root">
            <h1>Salaam, {props.naam}!</h1>
            <ul>
              <li key="1">ek</li>
              <li key="2">do</li>
            </ul>
          </div>
        );
      }
    `);
    const html = renderToStaticMarkup(createElement(mod.default as never, { naam: "Ali" }));
    expect(html).toBe('<div id="root"><h1>Salaam, Ali!</h1><ul><li>ek</li><li>do</li></ul></div>');
  });

  it("renders nested components, fragments, conditionals, and lists", async () => {
    const mod = await loadUrx(`
      kaam Badge(props: { level: adad }) {
        wapas props.level >= 3 ? <b>ustaad</b> : <i>naya</i>;
      }
      bhejo asal kaam App(props: { users: { naam: lafz, level: adad }[] }) {
        wapas (
          <>
            {props.users.map(kaam (u: { naam: lafz, level: adad }): koi {
              wapas <p key={u.naam}>{u.naam}: <Badge level={u.level}/></p>;
            })}
          </>
        );
      }
    `);
    const html = renderToStaticMarkup(
      createElement(mod.default as never, {
        users: [
          { naam: "Ali", level: 5 },
          { naam: "Sara", level: 1 },
        ],
      })
    );
    expect(html).toBe("<p>Ali: <b>ustaad</b></p><p>Sara: <i>naya</i></p>");
  });

  it("spreads props and handles bare boolean attributes", async () => {
    const mod = await loadUrx(`
      bhejo asal kaam App(props: koi) {
        wapas <input type="checkbox" disabled {...props}/>;
      }
    `);
    const html = renderToStaticMarkup(createElement(mod.default as never, { name: "tik" }));
    expect(html).toBe('<input type="checkbox" disabled="" name="tik"/>');
  });
});
