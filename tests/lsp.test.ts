// Language-server analysis (hover, definition, completion, diagnostics) and
// the stdio JSON-RPC server itself.
import { describe, expect, it } from "vitest";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { analyze } from "../src/lsp/analysis.js";

const SRC = `qisim Shakhs = { naam: lafz, umar: adad };

kaam salaam(s: Shakhs): lafz {
  wapas "salam, " + s.naam;
}

pakka mera = { naam: "ali", umar: 20 };
bolo salaam(mera);
`;

/** 0-based line/character → offset helper matching LSP positions. */
function pos(source: string, line: number, character: number): number {
  const lines = source.split("\n");
  let offset = 0;
  for (let i = 0; i < line; i++) offset += lines[i]!.length + 1;
  return offset + character;
}

describe("lsp completions: built-in members", () => {
  it("offers array methods after `xs.`", () => {
    const src = "pakka xs = [1, 2, 3];\nbolo xs.\n";
    const items = analyze(src).completions(pos(src, 1, 8));
    const labels = items.map((i) => i.label);
    expect(labels).toEqual(expect.arrayContaining(["map", "filter", "find", "push", "length", "join"]));
    // The signatures come along, so the editor can show them.
    expect(items.find((i) => i.label === "map")!.detail).toContain("kaam");
    expect(items.find((i) => i.label === "length")!.detail).toBe("adad");
    // And it is *only* members — no keyword noise.
    expect(labels).not.toContain("rakho");
  });

  it("offers string methods after a lafz", () => {
    const src = 'pakka s = "salaam";\nbolo s.\n';
    const labels = analyze(src).completions(pos(src, 1, 7)).map((i) => i.label);
    expect(labels).toEqual(expect.arrayContaining(["toUpperCase", "split", "trim", "includes", "length"]));
  });

  it("offers a jamaat's sakit members through the class", () => {
    const src = "jamaat Ginti {\n  sakit kul: adad = 0;\n}\nbolo Ginti.\n";
    const labels = analyze(src).completions(pos(src, 3, 11)).map((i) => i.label);
    expect(labels).toContain("kul");
  });

  it("still offers object properties", () => {
    const src = 'pakka s = { naam: "Ali", umar: 30 };\nbolo s.\n';
    const labels = analyze(src).completions(pos(src, 1, 7)).map((i) => i.label);
    expect(labels).toEqual(["naam", "umar"]);
  });
});

describe("lsp completions: type positions", () => {
  it("offers builtin types and declared type names after `:`", () => {
    const src = "qisim Shakhs = { naam: lafz };\nfehrist Rang { Laal }\njamaat Dabba {}\npakka x: \n";
    const items = analyze(src).completions(pos(src, 3, 9));
    const labels = items.map((i) => i.label);
    expect(labels).toEqual(expect.arrayContaining(["adad", "lafz", "bool", "koi", "khaali", "Wada"]));
    expect(labels).toEqual(expect.arrayContaining(["Shakhs", "Rang", "Dabba"]));
    // Values and keywords are not types.
    expect(labels).not.toContain("bolo");
  });

  it("offers types in a parameter annotation", () => {
    const src = "qisim Shakhs = { naam: lafz };\nkaam f(s: \n";
    const labels = analyze(src).completions(pos(src, 1, 10)).map((i) => i.label);
    expect(labels).toContain("Shakhs");
    expect(labels).toContain("adad");
  });
});

describe("lsp resilience while typing", () => {
  // A file is syntactically broken for most of the time you are editing it.
  // Hover and completions must keep working from the last good parse, or the
  // editor goes blank exactly when you need it.
  it("keeps hover and completions alive through a broken edit", () => {
    const good = 'qisim Shakhs = { naam: lafz };\npakka s: Shakhs = { naam: "Ali" };\nbolo s.naam;\n';
    const settled = analyze(good);

    // Mid-edit: the user has typed `bolo s.` and nothing else yet.
    const broken = 'qisim Shakhs = { naam: lafz };\npakka s: Shakhs = { naam: "Ali" };\nbolo s.\n';
    const live = analyze(broken, { previous: settled });

    // The syntax error is still reported…
    expect(live.diagnostics.length).toBeGreaterThan(0);
    // …but the editor still knows what `s` is, and what it has.
    expect(live.hover(pos(broken, 1, 6))!.type).toContain("naam");
    expect(live.completions(pos(broken, 2, 7)).map((i) => i.label)).toContain("naam");
  });

  it("without a previous analysis it degrades quietly, not loudly", () => {
    const broken = "pakka s = ";
    const live = analyze(broken);
    expect(live.diagnostics.length).toBeGreaterThan(0);
    expect(() => live.completions(broken.length)).not.toThrow();
    expect(live.hover(3)).toBeNull();
  });
});

describe("lsp analysis", () => {
  it("reports diagnostics with spans and codes", () => {
    const result = analyze('rakho x: adad = "nahi";');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("UR2001");
    expect(result.diagnostics[0]!.line).toBe(1);
  });

  it("hover shows the type of a reference", () => {
    const a = analyze(SRC);
    // hover on `mera` inside bolo salaam(mera)
    const hover = a.hover(pos(SRC, 7, 13));
    expect(hover).not.toBeNull();
    expect(hover!.name).toBe("mera");
    expect(hover!.type).toContain("naam: lafz");
  });

  it("hover shows function types", () => {
    const a = analyze(SRC);
    const hover = a.hover(pos(SRC, 7, 6)); // salaam callee
    expect(hover!.type).toContain("kaam(");
    expect(hover!.type).toContain("): lafz");
  });

  it("go-to-definition resolves references to their declaration", () => {
    const a = analyze(SRC);
    const def = a.definition(pos(SRC, 7, 13)); // mera reference
    expect(def).not.toBeNull();
    expect(def!.line).toBe(7); // pakka mera = ... (1-based line 7)
  });

  it("definition works for function references", () => {
    const a = analyze(SRC);
    const def = a.definition(pos(SRC, 7, 6)); // salaam reference
    expect(def!.line).toBe(3);
  });

  it("completions include declared names, keywords, and globals", () => {
    const a = analyze(SRC);
    const items = a.completions(pos(SRC, 7, 0)).map((c) => c.label);
    expect(items).toContain("salaam");
    expect(items).toContain("mera");
    expect(items).toContain("jab");
    expect(items).toContain("console");
  });

  it("member completions after a dot use the object type", () => {
    const a = analyze(SRC);
    // completions after `s.` inside salaam — line 3 col of `s.naam`
    const offset = SRC.indexOf("s.naam") + 2;
    const items = a.completions(offset).map((c) => c.label);
    expect(items).toContain("naam");
    expect(items).toContain("umar");
  });
});

describe("lsp server (stdio JSON-RPC)", () => {
  function message(obj: unknown): string {
    const body = JSON.stringify(obj);
    return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
  }

  it("initializes, publishes diagnostics on didOpen, and answers hover", async () => {
    const projectRoot = path.resolve(import.meta.dirname, "..");
    const proc = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "src/lsp/server.ts"], {
      cwd: projectRoot,
      stdio: ["pipe", "pipe", "inherit"],
    });

    const received: Record<string, unknown>[] = [];
    let buffer = Buffer.alloc(0);
    proc.stdout.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        const headerEnd = buffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) return;
        const header = buffer.subarray(0, headerEnd).toString();
        const lengthMatch = /Content-Length: (\d+)/.exec(header);
        if (lengthMatch === null) return;
        const length = Number(lengthMatch[1]);
        if (buffer.length < headerEnd + 4 + length) return;
        const body = buffer.subarray(headerEnd + 4, headerEnd + 4 + length).toString();
        buffer = buffer.subarray(headerEnd + 4 + length);
        received.push(JSON.parse(body) as Record<string, unknown>);
      }
    });

    const waitFor = async (pred: (m: Record<string, unknown>) => boolean): Promise<Record<string, unknown>> => {
      for (let i = 0; i < 200; i++) {
        const found = received.find(pred);
        if (found !== undefined) return found;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error(`LSP response nahi mila. Received: ${JSON.stringify(received)}`);
    };

    proc.stdin.write(message({ jsonrpc: "2.0", id: 1, method: "initialize", params: { capabilities: {} } }));
    const init = await waitFor((m) => m.id === 1);
    expect((init.result as { capabilities: { hoverProvider: boolean } }).capabilities.hoverProvider).toBe(true);

    proc.stdin.write(
      message({
        jsonrpc: "2.0",
        method: "textDocument/didOpen",
        params: {
          textDocument: { uri: "file:///test.ur", languageId: "urlang", version: 1, text: 'rakho x: adad = "nahi";\nbolo x;' },
        },
      })
    );
    const diag = await waitFor((m) => m.method === "textDocument/publishDiagnostics");
    const params = diag.params as { diagnostics: { code: string; range: { start: { line: number } } }[] };
    expect(params.diagnostics).toHaveLength(1);
    expect(params.diagnostics[0]!.code).toBe("UR2001");
    expect(params.diagnostics[0]!.range.start.line).toBe(0);

    // Fix the file; diagnostics should clear.
    proc.stdin.write(
      message({
        jsonrpc: "2.0",
        method: "textDocument/didChange",
        params: {
          textDocument: { uri: "file:///test.ur", version: 2 },
          contentChanges: [{ text: "rakho x: adad = 5;\nbolo x;" }],
        },
      })
    );
    await waitFor(
      (m) =>
        m.method === "textDocument/publishDiagnostics" &&
        (m.params as { diagnostics: unknown[] }).diagnostics.length === 0
    );

    // Hover over x in bolo x;
    proc.stdin.write(
      message({
        jsonrpc: "2.0",
        id: 2,
        method: "textDocument/hover",
        params: { textDocument: { uri: "file:///test.ur" }, position: { line: 1, character: 5 } },
      })
    );
    const hover = await waitFor((m) => m.id === 2);
    expect(JSON.stringify(hover.result)).toContain("adad");

    proc.stdin.write(message({ jsonrpc: "2.0", id: 3, method: "shutdown" }));
    await waitFor((m) => m.id === 3);
    proc.stdin.write(message({ jsonrpc: "2.0", method: "exit" }));
    await new Promise((r) => proc.on("exit", r));
  }, 60000);
});
