#!/usr/bin/env node
// UrLang language server: JSON-RPC 2.0 over stdio, zero dependencies.
// Supports: initialize, didOpen/didChange/didClose (full sync),
// publishDiagnostics, hover, definition, completion.
import { analyze, Analysis } from "./analysis.js";
import { fsModuleLoader } from "../cli-lib.js";
import type { ModuleExports } from "../checker.js";
import { parse } from "../parser.js";
import { checkProgram } from "../checker.js";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";

interface RpcMessage {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}

const documents = new Map<string, { text: string; analysis: Analysis }>();
let shuttingDown = false;

// npm-package type resolution (needs the optional `typescript` package).
let npmTypes: ((specifier: string, importerPath: string) => ModuleExports | null) | undefined;
try {
  const { makeNpmTypesResolver } = await import("../npm-types.js");
  npmTypes = makeNpmTypesResolver();
} catch {
  npmTypes = undefined;
}

function send(message: object): void {
  const body = JSON.stringify({ jsonrpc: "2.0", ...message });
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}

function uriToPath(uri: string): string | null {
  try {
    return uri.startsWith("file://") ? fileURLToPath(uri) : null;
  } catch {
    return null;
  }
}

/** Resolves imports relative to the open document so cross-module types work. */
function resolverFor(uri: string): ((specifier: string) => ModuleExports | null) | undefined {
  const filePath = uriToPath(uri);
  if (filePath === null) return undefined;
  const cache = new Map<string, ModuleExports | null>();
  const resolve = (specifier: string, importer: string): ModuleExports | null => {
    const loaded = fsModuleLoader(specifier, importer);
    if (loaded === null) return npmTypes?.(specifier, importer) ?? null;
    if (cache.has(loaded.path)) return cache.get(loaded.path)!;
    cache.set(loaded.path, null); // cycle guard
    try {
      const program = parse(loaded.source);
      const result = checkProgram(program, { resolveModule: (s) => resolve(s, loaded.path) });
      cache.set(loaded.path, result.exports);
      return result.exports;
    } catch {
      return null;
    }
  };
  return (specifier) => resolve(specifier, filePath);
}

/** LSP positions are 0-based line/character; our spans are 1-based line/col. */
function offsetOf(text: string, line: number, character: number): number {
  let offset = 0;
  let currentLine = 0;
  while (currentLine < line) {
    const nl = text.indexOf("\n", offset);
    if (nl === -1) return text.length;
    offset = nl + 1;
    currentLine++;
  }
  return offset + character;
}

function refresh(uri: string, text: string): void {
  const resolveModule = resolverFor(uri);
  const analysis = analyze(text, resolveModule ? { resolveModule } : {});
  documents.set(uri, { text, analysis });
  send({
    method: "textDocument/publishDiagnostics",
    params: {
      uri,
      diagnostics: analysis.diagnostics.map((d) => ({
        range: {
          start: { line: d.line - 1, character: d.col - 1 },
          end: { line: d.line - 1, character: d.col },
        },
        severity: 1,
        code: d.code,
        source: "urlang",
        message: d.message,
      })),
    },
  });
}

function handle(msg: RpcMessage): void {
  switch (msg.method) {
    case "initialize":
      send({
        id: msg.id,
        result: {
          capabilities: {
            textDocumentSync: 1, // full
            hoverProvider: true,
            definitionProvider: true,
            completionProvider: { triggerCharacters: ["."] },
          },
          serverInfo: { name: "urlang-lsp", version: "1.0.0" },
        },
      });
      return;
    case "initialized":
      return;
    case "shutdown":
      shuttingDown = true;
      send({ id: msg.id, result: null });
      return;
    case "exit":
      process.exit(shuttingDown ? 0 : 1);
      return;
    case "textDocument/didOpen": {
      const p = msg.params as { textDocument: { uri: string; text: string } };
      refresh(p.textDocument.uri, p.textDocument.text);
      return;
    }
    case "textDocument/didChange": {
      const p = msg.params as { textDocument: { uri: string }; contentChanges: { text: string }[] };
      const last = p.contentChanges[p.contentChanges.length - 1];
      if (last !== undefined) refresh(p.textDocument.uri, last.text);
      return;
    }
    case "textDocument/didClose": {
      const p = msg.params as { textDocument: { uri: string } };
      documents.delete(p.textDocument.uri);
      return;
    }
    case "textDocument/hover": {
      const p = msg.params as { textDocument: { uri: string }; position: { line: number; character: number } };
      const doc = documents.get(p.textDocument.uri);
      if (doc === undefined) return send({ id: msg.id, result: null });
      const hover = doc.analysis.hover(offsetOf(doc.text, p.position.line, p.position.character));
      send({
        id: msg.id,
        result:
          hover === null
            ? null
            : { contents: { kind: "markdown", value: `\`\`\`urlang\n${hover.name}: ${hover.type}\n\`\`\`` } },
      });
      return;
    }
    case "textDocument/definition": {
      const p = msg.params as { textDocument: { uri: string }; position: { line: number; character: number } };
      const doc = documents.get(p.textDocument.uri);
      if (doc === undefined) return send({ id: msg.id, result: null });
      const def = doc.analysis.definition(offsetOf(doc.text, p.position.line, p.position.character));
      send({
        id: msg.id,
        result:
          def === null
            ? null
            : {
                uri: p.textDocument.uri,
                range: {
                  start: { line: def.line - 1, character: def.col - 1 },
                  end: { line: def.line - 1, character: def.col - 1 },
                },
              },
      });
      return;
    }
    case "textDocument/completion": {
      const p = msg.params as { textDocument: { uri: string }; position: { line: number; character: number } };
      const doc = documents.get(p.textDocument.uri);
      if (doc === undefined) return send({ id: msg.id, result: [] });
      const items = doc.analysis.completions(offsetOf(doc.text, p.position.line, p.position.character));
      const kindMap = { variable: 6, keyword: 14, global: 6, property: 5 } as const;
      send({
        id: msg.id,
        result: items.map((c) => ({ label: c.label, kind: kindMap[c.kind], detail: c.detail })),
      });
      return;
    }
    default:
      if (msg.id !== undefined) {
        send({ id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } });
      }
  }
}

// ---- stdio framing loop ----
let buffer = Buffer.alloc(0);
process.stdin.on("data", (chunk: Buffer) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) return;
    const header = buffer.subarray(0, headerEnd).toString();
    const match = /Content-Length: (\d+)/i.exec(header);
    if (match === null) {
      buffer = buffer.subarray(headerEnd + 4);
      continue;
    }
    const length = Number(match[1]);
    if (buffer.length < headerEnd + 4 + length) return;
    const body = buffer.subarray(headerEnd + 4, headerEnd + 4 + length).toString();
    buffer = buffer.subarray(headerEnd + 4 + length);
    try {
      handle(JSON.parse(body) as RpcMessage);
    } catch {
      // Malformed frame — skip.
    }
  }
});
