// Editor analysis over a single file: diagnostics, hover, definition,
// completions. Built on the checker's SymbolSink instrumentation.
import { parse } from "../parser.js";
import { checkProgram, ModuleExports } from "../checker.js";
import { UrError } from "../errors.js";
import { KEYWORDS } from "../tokens.js";
import { Type, typeName } from "../types.js";
import type { Span } from "../ast.js";

export interface SymbolAt {
  name: string;
  type: string;
  span: Span;
}

export interface DefinitionAt {
  line: number;
  col: number;
  pos: number;
}

export interface CompletionItem {
  label: string;
  kind: "variable" | "keyword" | "global" | "property";
  detail?: string;
}

interface RecordedSymbol {
  name: string;
  span: Span;
  type: Type;
  declSpan: Span | null;
  length: number;
}

const GLOBALS = [
  "console", "Math", "JSON", "Date", "Promise", "document", "window",
  "parseInt", "parseFloat", "setTimeout", "setInterval", "fetch", "Error",
];

export interface Analysis {
  diagnostics: UrError[];
  hover(offset: number): SymbolAt | null;
  definition(offset: number): DefinitionAt | null;
  completions(offset: number): CompletionItem[];
}

export function analyze(
  source: string,
  options: { resolveModule?: (specifier: string) => ModuleExports | null; ambient?: ModuleExports[] } = {}
): Analysis {
  const symbols: RecordedSymbol[] = [];
  const bindings: RecordedSymbol[] = [];
  let diagnostics: UrError[] = [];

  try {
    const program = parse(source);
    const result = checkProgram(program, {
      ...(options.resolveModule ? { resolveModule: options.resolveModule } : {}),
      ...(options.ambient ? { ambient: options.ambient } : {}),
      symbols: {
        binding(name, span, type) {
          const sym = { name, span, type, declSpan: span, length: name.length };
          bindings.push(sym);
          symbols.push(sym);
        },
        reference(name, span, type, declSpan) {
          symbols.push({ name, span, type, declSpan, length: name.length });
        },
      },
    });
    diagnostics = result.diagnostics;
  } catch (e) {
    if (e instanceof UrError) diagnostics = [e];
    else throw e;
  }

  const symbolAt = (offset: number): RecordedSymbol | null => {
    let best: RecordedSymbol | null = null;
    for (const s of symbols) {
      if (offset >= s.span.pos && offset <= s.span.pos + s.length) {
        // Prefer the tightest (latest-recorded, most specific) match.
        if (best === null || s.span.pos >= best.span.pos) best = s;
      }
    }
    return best;
  };

  return {
    diagnostics,
    hover(offset) {
      const s = symbolAt(offset);
      if (s === null) return null;
      return { name: s.name, type: typeName(s.type), span: s.span };
    },
    definition(offset) {
      const s = symbolAt(offset);
      if (s === null || s.declSpan === null) return null;
      return { line: s.declSpan.line, col: s.declSpan.col, pos: s.declSpan.pos };
    },
    completions(offset) {
      // Member completions: right after `name.` use the object's type.
      const before = source.slice(0, offset);
      const memberMatch = /([A-Za-z_$][A-Za-z0-9_$]*)\s*[?]?\.\s*([A-Za-z_$][A-Za-z0-9_$]*)?$/.exec(before);
      if (memberMatch !== null) {
        const objectName = memberMatch[1]!;
        const decl = [...bindings].reverse().find((b) => b.name === objectName);
        if (decl !== undefined && decl.type.kind === "object") {
          const items: CompletionItem[] = [];
          for (const [key, prop] of decl.type.props) {
            items.push({ label: key, kind: "property", detail: typeName(prop.type) });
          }
          return items;
        }
      }
      const items = new Map<string, CompletionItem>();
      for (const b of bindings) {
        // Only names declared before the cursor (approximates scope visibility).
        if (b.span.pos <= offset && !items.has(b.name)) {
          items.set(b.name, { label: b.name, kind: "variable", detail: typeName(b.type) });
        }
      }
      for (const kw of KEYWORDS.keys()) {
        if (!items.has(kw)) items.set(kw, { label: kw, kind: "keyword" });
      }
      for (const g of GLOBALS) {
        if (!items.has(g)) items.set(g, { label: g, kind: "global" });
      }
      return [...items.values()];
    },
  };
}
