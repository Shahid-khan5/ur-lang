// JSX support (.urx files) — lexer, parser, codegen, and checker layers.
// JSX only activates when the jsx option is set; plain .ur lexing is untouched.
import { describe, expect, it } from "vitest";
import { tokenize } from "../src/lexer.js";
import { TokenKind } from "../src/tokens.js";
import { parse } from "../src/parser.js";
import { UrSyntaxError } from "../src/errors.js";
import { compile } from "../src/compiler.js";
import type { JsxElement, ReturnStmt, FunctionDecl, VarDecl } from "../src/ast.js";

function jsxKinds(src: string): TokenKind[] {
  return tokenize(src, undefined, { jsx: true }).map((t) => t.kind);
}

function compileJsx(src: string) {
  return compile(src, { fileName: "app.urx" });
}

describe("jsx lexer", () => {
  it("keeps less-than as an operator after an operand", () => {
    expect(jsxKinds("a < b;")).toEqual([
      TokenKind.Identifier,
      TokenKind.Lt,
      TokenKind.Identifier,
      TokenKind.Semicolon,
      TokenKind.EOF,
    ]);
  });

  it("keeps generics as less-than context (identifier before <)", () => {
    const kinds = jsxKinds("kaam pehla<T>(xs: T[]): T { wapas xs[0]; }");
    expect(kinds).toContain(TokenKind.Lt);
    expect(kinds).not.toContain(TokenKind.JsxName);
  });

  it("lexes a self-closing element in expression position", () => {
    expect(jsxKinds("rakho el = <br/>;")).toEqual([
      TokenKind.Rakho,
      TokenKind.Identifier,
      TokenKind.Assign,
      TokenKind.Lt,
      TokenKind.JsxName,
      TokenKind.Slash,
      TokenKind.Gt,
      TokenKind.Semicolon,
      TokenKind.EOF,
    ]);
  });

  it("lexes attributes: string, container, bare, spread", () => {
    const toks = tokenize('rakho e = <div id="x" naam={n} chhupa {...rest}/>;', undefined, { jsx: true });
    const kinds = toks.map((t) => t.kind);
    expect(kinds).toEqual([
      TokenKind.Rakho, TokenKind.Identifier, TokenKind.Assign,
      TokenKind.Lt, TokenKind.JsxName,
      TokenKind.JsxName, TokenKind.Assign, TokenKind.String,
      TokenKind.JsxName, TokenKind.Assign, TokenKind.LBrace, TokenKind.Identifier, TokenKind.RBrace,
      TokenKind.JsxName,
      TokenKind.LBrace, TokenKind.DotDotDot, TokenKind.Identifier, TokenKind.RBrace,
      TokenKind.Slash, TokenKind.Gt, TokenKind.Semicolon, TokenKind.EOF,
    ]);
    expect(toks[4]!.value).toBe("div");
    expect(toks[7]!.value).toBe("x");
  });

  it("lexes children text and nested elements", () => {
    const toks = tokenize("rakho e = <p>salaam <b>duniya</b>!</p>;", undefined, { jsx: true });
    const texts = toks.filter((t) => t.kind === TokenKind.JsxText).map((t) => t.value);
    expect(texts).toEqual(["salaam ", "duniya", "!"]);
  });

  it("lexes expression containers in children and resumes text", () => {
    const toks = tokenize("rakho e = <p>ginti: {n + 1} bas</p>;", undefined, { jsx: true });
    const kinds = toks.map((t) => t.kind);
    expect(kinds).toContain(TokenKind.Plus);
    const texts = toks.filter((t) => t.kind === TokenKind.JsxText).map((t) => t.value);
    expect(texts).toEqual(["ginti: ", " bas"]);
  });

  it("treats < inside a container as an operator again", () => {
    const toks = tokenize("rakho e = <p>{a < b}</p>;", undefined, { jsx: true });
    expect(toks.map((t) => t.kind)).toContain(TokenKind.Lt);
    // one Lt for the tag, one for the comparison, one for </p
    expect(toks.filter((t) => t.kind === TokenKind.Lt)).toHaveLength(3);
  });

  it("lexes fragments", () => {
    expect(jsxKinds("rakho e = <><br/></>;")).toEqual([
      TokenKind.Rakho, TokenKind.Identifier, TokenKind.Assign,
      TokenKind.Lt, TokenKind.Gt,
      TokenKind.Lt, TokenKind.JsxName, TokenKind.Slash, TokenKind.Gt,
      TokenKind.Lt, TokenKind.Slash, TokenKind.Gt,
      TokenKind.Semicolon, TokenKind.EOF,
    ]);
  });

  it("lexes dotted and dashed jsx names", () => {
    const toks = tokenize('rakho e = <Foo.Bar data-id="1"/>;', undefined, { jsx: true });
    const names = toks.filter((t) => t.kind === TokenKind.JsxName).map((t) => t.value);
    expect(names).toEqual(["Foo.Bar", "data-id"]);
  });

  it("handles apostrophes and quotes in text without string-lexing them", () => {
    const toks = tokenize("rakho e = <p>don't \"quote\" me</p>;", undefined, { jsx: true });
    const texts = toks.filter((t) => t.kind === TokenKind.JsxText).map((t) => t.value);
    expect(texts).toEqual([`don't "quote" me`]);
  });

  it("supports templates inside containers and containers inside templates", () => {
    const src = "rakho e = <p>{`salaam ${naam}`}</p>;";
    const kinds = jsxKinds(src);
    expect(kinds).toContain(TokenKind.TemplateStart);
    expect(kinds).toContain(TokenKind.TemplateEnd);
  });

  it("supports nested jsx inside a container inside jsx", () => {
    const src = "rakho e = <div>{sach ? <b>haan</b> : <i>nahi</i>}</div>;";
    const toks = tokenize(src, undefined, { jsx: true });
    const names = toks.filter((t) => t.kind === TokenKind.JsxName).map((t) => t.value);
    expect(names).toEqual(["div", "b", "b", "i", "i", "div"]);
  });

  it("does not enter jsx mode without the jsx option", () => {
    // `<br/>;` without jsx mode: Lt, Identifier, Slash... no JsxName.
    const kinds = tokenize("rakho e = 1 < 2;").map((t) => t.kind);
    expect(kinds).not.toContain(TokenKind.JsxName);
  });

  it("fails on unterminated jsx", () => {
    expect(() => tokenize("rakho e = <div>salaam", undefined, { jsx: true })).toThrow(UrSyntaxError);
  });
});

describe("jsx parser", () => {
  function firstInit(src: string) {
    const program = parse(src, { jsx: true });
    return (program.body[0] as VarDecl).init;
  }

  it("parses a self-closing element with attributes", () => {
    const el = firstInit('rakho e = <img src="a.png" chhupa {...rest}/>;') as JsxElement;
    expect(el.kind).toBe("JsxElement");
    expect(el.tagName).toBe("img");
    expect(el.selfClosing).toBe(true);
    expect(el.attributes).toHaveLength(3);
    expect(el.attributes[0]).toMatchObject({ kind: "JsxAttribute", name: "src" });
    expect(el.attributes[1]).toMatchObject({ kind: "JsxAttribute", name: "chhupa", value: null });
    expect(el.attributes[2]!.kind).toBe("JsxSpreadAttribute");
  });

  it("parses children: text, containers, nested elements", () => {
    const el = firstInit("rakho e = <p>salaam {naam}<br/></p>;") as JsxElement;
    expect(el.children.map((c) => c.kind)).toEqual(["JsxText", "JsxExprContainer", "JsxElement"]);
  });

  it("parses fragments", () => {
    const el = firstInit("rakho e = <>ek<br/></>;");
    expect(el.kind).toBe("JsxFragment");
  });

  it("parses jsx as a return value", () => {
    const program = parse("kaam App() { wapas <div/>; }", { jsx: true });
    const fn = program.body[0] as FunctionDecl;
    const ret = fn.body.body[0] as ReturnStmt;
    expect(ret.value?.kind).toBe("JsxElement");
  });

  it("rejects mismatched closing tags with a helpful error", () => {
    expect(() => parse("rakho e = <div>x</span>;", { jsx: true })).toThrow(/div.*span|span.*div/);
  });

  it("treats {} and {/* comment */} children as empty (dropped) containers", () => {
    const el = firstInit("rakho e = <div>{/* tabsara */}</div>;") as JsxElement;
    expect(el.children).toHaveLength(0);
  });

  it("does not parse jsx without the jsx option", () => {
    expect(() => parse("rakho e = <div/>;")).toThrow(UrSyntaxError);
  });
});

describe("jsx codegen", () => {
  it("emits _jsx for an intrinsic element and appends the runtime import", () => {
    const result = compileJsx('bhejo kaam App() { wapas <div id="x"/>; }');
    expect(result.diagnostics).toEqual([]);
    expect(result.code).toContain('_jsx("div", { id: "x" })');
    expect(result.code).toContain('from "react/jsx-runtime"');
  });

  it("emits _jsxs when there are multiple children", () => {
    const result = compileJsx("bhejo kaam App() { wapas <p>ek<br/>do</p>; }");
    expect(result.code).toContain('_jsxs("p", { children: ["ek", _jsx("br", {}), "do"] })');
  });

  it("emits a single child without an array", () => {
    const result = compileJsx("bhejo kaam App() { wapas <p>salaam</p>; }");
    expect(result.code).toContain('_jsx("p", { children: "salaam" })');
  });

  it("passes key as the third argument", () => {
    const result = compileJsx('bhejo kaam Item() { wapas <li key="k1">x</li>; }');
    expect(result.code).toContain('_jsx("li", { children: "x" }, "k1")');
  });

  it("references components by identifier and supports props", () => {
    const src = `
      kaam Salaam(props: { naam: lafz }) { wapas <b>{props.naam}</b>; }
      bhejo kaam App() { wapas <Salaam naam="Ali"/>; }
    `;
    const result = compileJsx(src);
    expect(result.diagnostics).toEqual([]);
    expect(result.code).toContain('_jsx(Salaam, { naam: "Ali" })');
  });

  it("emits fragments via the runtime Fragment", () => {
    const result = compileJsx("bhejo kaam App() { wapas <>ek</>; }");
    expect(result.code).toContain("_jsx(_Fragment, { children: \"ek\" })");
  });

  it("quotes dashed attribute names and spreads spread attrs", () => {
    const result = compileJsx('bhejo kaam App(props: koi) { wapas <div data-id="1" {...props}/>; }');
    expect(result.code).toContain('"data-id": "1"');
    expect(result.code).toContain("...props");
  });

  it("cleans multiline jsx text like babel", () => {
    const src = `bhejo kaam App() {
  wapas (
    <p>
      salaam
      duniya
    </p>
  );
}`;
    const result = compileJsx(src);
    expect(result.code).toContain('{ children: "salaam duniya" }');
  });

  it("honors a custom jsxImportSource", () => {
    const result = compile("bhejo kaam App() { wapas <div/>; }", {
      fileName: "app.urx",
      jsxImportSource: "preact",
    });
    expect(result.code).toContain('from "preact/jsx-runtime"');
  });

  it("does not append the runtime import when no jsx is used", () => {
    const result = compileJsx("bhejo kaam f(): adad { wapas 1; }");
    expect(result.code).not.toContain("jsx-runtime");
  });

  it("decodes HTML entities in text and attribute strings, like JSX does", () => {
    const result = compileJsx('bhejo kaam App() { wapas <p title="a&amp;b">ek&nbsp;do &lt;3 &#33;</p>; }');
    expect(result.diagnostics).toEqual([]);
    expect(result.code).toContain('title: "a&b"');
    // &nbsp; becomes a real U+00A0, not the six literal characters.
    expect(result.code).toContain('children: "ek\u00a0do <3 !"');
  });

  it("element children win over a children attribute without emitting a duplicate key", () => {
    const result = compileJsx('bhejo kaam App(x: koi) { wapas <div children={x}>asli</div>; }');
    expect(result.code).toContain('_jsx("div", { children: "asli" })');
    expect(result.code!.match(/children:/g)).toHaveLength(1);
  });
});

describe("jsx checker", () => {
  it("errors on a missing required prop", () => {
    const src = `
      kaam Salaam(props: { naam: lafz }) { wapas <b/>; }
      bhejo kaam App() { wapas <Salaam/>; }
    `;
    const result = compileJsx(src);
    expect(result.diagnostics.some((d) => d.message.includes("naam"))).toBe(true);
  });

  it("errors on a mistyped prop", () => {
    const src = `
      kaam Salaam(props: { naam: lafz }) { wapas <b/>; }
      bhejo kaam App() { wapas <Salaam naam={42}/>; }
    `;
    const result = compileJsx(src);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it("errors on an excess prop (like TS)", () => {
    const src = `
      kaam Salaam(props: { naam: lafz }) { wapas <b/>; }
      bhejo kaam App() { wapas <Salaam naam="Ali" faltu={1}/>; }
    `;
    const result = compileJsx(src);
    expect(result.diagnostics.some((d) => d.message.includes("faltu"))).toBe(true);
  });

  it("skips missing/excess checks when props are spread", () => {
    const src = `
      kaam Salaam(props: { naam: lafz }) { wapas <b/>; }
      bhejo kaam App(rest: koi) { wapas <Salaam {...rest}/>; }
    `;
    expect(compileJsx(src).diagnostics).toEqual([]);
  });

  it("errors on an unknown component", () => {
    const result = compileJsx("bhejo kaam App() { wapas <Ghaib/>; }");
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it("allows any attributes on intrinsic tags but checks their expressions", () => {
    const ok = compileJsx('bhejo kaam App() { wapas <div anything="goes"/>; }');
    expect(ok.diagnostics).toEqual([]);
    const bad = compileJsx("bhejo kaam App() { wapas <div onClick={ghaib}/>; }");
    expect(bad.diagnostics.length).toBeGreaterThan(0);
  });

  it("treats jsx children as satisfying a children prop", () => {
    const src = `
      kaam Card(props: { children: koi }) { wapas <div>{props.children}</div>; }
      bhejo kaam App() { wapas <Card><b>x</b></Card>; }
    `;
    expect(compileJsx(src).diagnostics).toEqual([]);
  });

  it("bare attributes are booleans", () => {
    const src = `
      kaam Toggle(props: { on: bool }) { wapas <b/>; }
      bhejo kaam App() { wapas <Toggle on/>; }
    `;
    expect(compileJsx(src).diagnostics).toEqual([]);
  });

  it("key is reserved by the runtime, not a component prop", () => {
    // The list pattern: <Comp key={...}/> must not be an unknown-prop error.
    const src = `
      kaam Item(props: { naam: lafz }) { wapas <li>{props.naam}</li>; }
      bhejo kaam App(naam: lafz) { wapas <Item key={naam} naam={naam}/>; }
    `;
    const result = compileJsx(src);
    expect(result.diagnostics.map((d) => d.message)).toEqual([]);
    expect(result.code).toContain("_jsx(Item, { naam: naam }, naam)");
  });

  it("still type-checks the key expression itself", () => {
    const src = `
      kaam Item(props: { naam: lafz }) { wapas <li>{props.naam}</li>; }
      bhejo kaam App() { wapas <Item key={ghaib} naam="a"/>; }
    `;
    expect(compileJsx(src).diagnostics.length).toBeGreaterThan(0);
  });

  it("a key attribute also satisfies a component that declares a key prop", () => {
    const src = `
      kaam Item(props: { key: lafz }) { wapas <li/>; }
      bhejo kaam App() { wapas <Item key="k"/>; }
    `;
    expect(compileJsx(src).diagnostics).toEqual([]);
  });

  it("dotted tag names are components, never intrinsic strings", () => {
    const src = `
      bahar ui;
      bhejo kaam App() { wapas <ui.Button label="ok"/>; }
    `;
    const result = compileJsx(src);
    expect(result.diagnostics).toEqual([]);
    expect(result.code).toContain('_jsx(ui.Button, { label: "ok" })');
    expect(result.code).not.toContain('"ui.Button"');
  });
});

describe("jsx toolchain", () => {
  it("assigns stable URxxxx codes to jsx diagnostics", () => {
    const codeOf = (src: string) => compileJsx(src).diagnostics[0]!.code;
    expect(codeOf("rakho e = <div>x</span>;")).toBe("UR1030");
    expect(codeOf("rakho e = <div>kabhi band nahi")).toBe("UR1029");
    expect(codeOf("rakho e = <div id=naam/>;")).toBe("UR1031"); // bare name after `=`
    expect(codeOf("rakho e = <div id=42/>;")).toBe("UR1032"); // lexer rejects inside the tag
    expect(codeOf("bhejo kaam App() { wapas <Ghaib/>; }")).toBe("UR2002");
    expect(
      codeOf("kaam C(props: { a: adad }) { wapas <b/>; } bhejo kaam App() { wapas <C a={1} b={2}/>; }")
    ).toBe("UR2045");
    expect(
      codeOf("kaam C(props: { a: adad }) { wapas <b/>; } bhejo kaam App() { wapas <C/>; }")
    ).toBe("UR2046");
  });

  it("formats jsx canonically and idempotently", async () => {
    const { format } = await import("../src/formatter.js");
    // Attribute spacing is normalized; text content is preserved verbatim.
    const src = 'kaam App(props: { naam: lafz }) {\n  wapas <div   id="x"  >salaam {props.naam}</div>;\n}\n';
    const once = format(src, { jsx: true });
    expect(once).toContain('<div id="x">salaam {props.naam}</div>');
    expect(format(once, { jsx: true })).toBe(once);
  });

  it("keeps structural jsx on multiple lines instead of collapsing it", async () => {
    const { format } = await import("../src/formatter.js");
    const src = [
      "kaam App(props: { naam: lafz }) {",
      "  wapas (",
      '    <div className="app">',
      "      <h1>Salaam, {props.naam}!</h1>",
      "      <Ginti shuru={0}/>",
      "    </div>",
      "  );",
      "}",
      "",
    ].join("\n");
    const once = format(src, { jsx: true });
    // Element-only children each get their own line; text-bearing tags stay inline.
    expect(once).toContain('  wapas <div className="app">\n');
    expect(once).toContain("    <h1>Salaam, {props.naam}!</h1>\n");
    expect(once).toContain("    <Ginti shuru={0}/>\n");
    expect(once).toContain("  </div>;\n");
    expect(format(once, { jsx: true })).toBe(once);
  });

  it("formatting never drops significant whitespace between inline children", async () => {
    const { format } = await import("../src/formatter.js");
    const src = 'kaam App(a: koi) {\n  wapas <p>{a} <b>bold</b> tail</p>;\n}\n';
    const once = format(src, { jsx: true });
    expect(once).toContain("<p>{a} <b>bold</b> tail</p>");
    expect(format(once, { jsx: true })).toBe(once);
  });

  it("vite plugin compiles .urx files", async () => {
    const { default: urlang } = await import("../src/vite-plugin.js");
    const plugin = urlang();
    const transform = plugin.transform as unknown as (
      this: { error: (msg: string) => never },
      code: string,
      id: string
    ) => { code: string } | null;
    const ctx = { error(msg: string): never { throw new Error(msg); } };
    const out = transform.call(ctx, "bhejo asal kaam App() { wapas <div/>; }", "/app/src/App.urx");
    expect(out).not.toBeNull();
    expect(out!.code).toContain('_jsx("div", {})');
    expect(out!.code).toContain('from "react/jsx-runtime"');
  });

  it("vite plugin handles ids carrying a query suffix (HMR, ?import)", async () => {
    const { default: urlang } = await import("../src/vite-plugin.js");
    const plugin = urlang();
    const transform = plugin.transform as unknown as (
      this: { error: (msg: string) => never },
      code: string,
      id: string
    ) => { code: string } | null;
    const ctx = { error(msg: string): never { throw new Error(msg); } };
    // Vite appends ?t=<timestamp> on hot updates; the file must still compile.
    const out = transform.call(ctx, "bhejo asal kaam App() { wapas <div/>; }", "/app/src/App.urx?t=1712345");
    expect(out).not.toBeNull();
    expect(out!.code).toContain('_jsx("div", {})');
    expect(transform.call(ctx, 'bolo "hi";', "/app/src/main.ur?import")).not.toBeNull();
  });

  it("cross-module: .ur imports a component from .urx with real types", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const { buildFile } = await import("../src/cli-lib.js");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "urx-build-"));
    const out = path.join(dir, "out");
    fs.writeFileSync(
      path.join(dir, "Salaam.urx"),
      'bhejo kaam Salaam(props: { naam: lafz }): koi { wapas <b>{props.naam}</b>; }'
    );
    fs.writeFileSync(path.join(dir, "main.urx"), 'lao { Salaam } "./Salaam.urx" se;\nbhejo pakka el = <Salaam naam="Ali"/>;');
    const comp = buildFile(path.join(dir, "Salaam.urx"), { outDir: out, sourceMap: false });
    const main = buildFile(path.join(dir, "main.urx"), { outDir: out, sourceMap: false });
    expect(comp.diagnostics).toEqual([]);
    expect(main.diagnostics).toEqual([]);
    expect(fs.existsSync(path.join(out, "Salaam.js"))).toBe(true);
    expect(fs.existsSync(path.join(out, "Salaam.d.ts"))).toBe(true);
    expect(fs.readFileSync(path.join(out, "main.js"), "utf8")).toContain('from "./Salaam.js"');
    // And the types flow: a bad prop from the importer is caught.
    fs.writeFileSync(path.join(dir, "bad.urx"), 'lao { Salaam } "./Salaam.urx" se;\nbhejo pakka el = <Salaam naam={42}/>;');
    const bad = buildFile(path.join(dir, "bad.urx"), { outDir: out, sourceMap: false });
    expect(bad.diagnostics.length).toBeGreaterThan(0);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
