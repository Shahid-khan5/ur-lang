// Editor analysis over a single file: diagnostics, hover, definition,
// completions. Built on the checker's SymbolSink instrumentation.
//
// A file being edited is syntactically broken most of the time. When the parse
// fails we still publish the error, but hover/definition/completions fall back
// to the last analysis that *did* parse — otherwise the editor goes blank at
// exactly the moment the programmer is asking it for help.
import { parse } from "../parser.js";
import { checkProgram, ModuleExports } from "../checker.js";
import { UrError } from "../errors.js";
import { KEYWORDS } from "../tokens.js";
import {
  arrayMemberNames,
  arrayMemberType,
  boolMemberNames,
  boolMemberType,
  numberMemberNames,
  numberMemberType,
  stringMemberNames,
  stringMemberType,
} from "../stdlib.js";
import { Type, typeName } from "../types.js";
import type { Program, Span } from "../ast.js";

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
  kind: "variable" | "keyword" | "global" | "property" | "type";
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

const BUILTIN_TYPE_NAMES = ["adad", "lafz", "bool", "koi", "khaali", "kuchnahi", "Wada"];

export interface Analysis {
  diagnostics: UrError[];
  hover(offset: number): SymbolAt | null;
  definition(offset: number): DefinitionAt | null;
  completions(offset: number): CompletionItem[];
  /** True when the source parsed — i.e. this analysis is worth remembering. */
  parsed: boolean;
  /** The symbol table behind the answers; reused when a later edit won't parse. */
  state: AnalysisState;
}

export interface AnalyzeOptions {
  resolveModule?: (specifier: string) => ModuleExports | null;
  ambient?: ModuleExports[];
  /** Enable JSX parsing (.urx documents). */
  jsx?: boolean;
  /** The last analysis that parsed; used to answer requests through a broken edit. */
  previous?: Analysis;
}

/** Type names a program declares — for completions in a type position. */
function declaredTypeNames(program: Program): string[] {
  const names: string[] = [];
  for (const stmt of program.body) {
    if (stmt.kind === "TypeAliasDecl" || stmt.kind === "EnumDecl" || stmt.kind === "ClassDecl") {
      names.push(stmt.name);
    }
  }
  return names;
}

/** What hover/definition/completions actually read. Survives a broken parse. */
interface AnalysisState {
  symbols: RecordedSymbol[];
  bindings: RecordedSymbol[];
  typeNames: string[];
}

const EMPTY_STATE: AnalysisState = { symbols: [], bindings: [], typeNames: [] };

/** Parses and checks, collecting the symbol table. Throws on a syntax error. */
function stateOf(
  source: string,
  options: AnalyzeOptions
): { state: AnalysisState; diagnostics: UrError[] } {
  const symbols: RecordedSymbol[] = [];
  const bindings: RecordedSymbol[] = [];
  const program = parse(source, { jsx: options.jsx === true });
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
  return {
    state: { symbols, bindings, typeNames: declaredTypeNames(program) },
    diagnostics: result.diagnostics,
  };
}

/**
 * Repairs a half-typed file well enough to analyse the rest of it. A trailing
 * `bolo xs.` reports its error at EOF — a blank line — so we walk back to the
 * last line with anything on it, and try dropping that; failing that, we cut
 * the file off there and keep everything above.
 */
function repairCandidates(source: string, errorLine: number): string[] {
  const lines = source.split("\n");
  let target = Math.min(Math.max(errorLine, 1), lines.length);
  while (target > 1 && lines[target - 1]!.trim() === "") target--;

  const blanked = [...lines];
  blanked[target - 1] = "";
  const truncated = lines.slice(0, target - 1);
  return [blanked.join("\n"), truncated.join("\n")];
}

export function analyze(source: string, options: AnalyzeOptions = {}): Analysis {
  let state: AnalysisState = EMPTY_STATE;
  let diagnostics: UrError[] = [];
  let parsed = false;

  try {
    const result = stateOf(source, options);
    state = result.state;
    diagnostics = result.diagnostics;
    parsed = true;
  } catch (e) {
    if (!(e instanceof UrError)) throw e;
    diagnostics = [e];
    // The file is mid-edit. Everything *around* the line being typed is still
    // perfectly good information — and it is exactly what the editor needs to
    // answer the request being made right now.
    state = options.previous?.state ?? EMPTY_STATE;
    for (const candidate of repairCandidates(source, e.line)) {
      try {
        state = stateOf(candidate, options).state;
        break;
      } catch {
        // Try the next repair; otherwise the fallback above stands.
      }
    }
  }

  const { symbols, bindings, typeNames } = state;

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

  /** The members of a receiver type — objects, arrays, strings, numbers, classes. */
  const memberCompletions = (type: Type): CompletionItem[] | null => {
    switch (type.kind) {
      case "object":
        return [...type.props].map(([key, prop]) => ({
          label: key,
          kind: "property" as const,
          detail: typeName(prop.type),
        }));
      case "array":
        return arrayMemberNames().map((name) => ({
          label: name,
          kind: "property" as const,
          detail: typeName(arrayMemberType(type.element, name)!),
        }));
      case "lafz":
        return stringMemberNames().map((name) => ({
          label: name,
          kind: "property" as const,
          detail: typeName(stringMemberType(name)!),
        }));
      case "literal":
        if (typeof type.value === "string") return memberCompletions({ kind: "lafz" });
        if (typeof type.value === "number") return memberCompletions({ kind: "adad" });
        return memberCompletions({ kind: "bool" });
      case "adad":
        return numberMemberNames().map((name) => ({
          label: name,
          kind: "property" as const,
          detail: typeName(numberMemberType(name)!),
        }));
      case "bool":
        return boolMemberNames().map((name) => ({
          label: name,
          kind: "property" as const,
          detail: typeName(boolMemberType(name)!),
        }));
      case "class":
        // Through the class itself you reach its sakit members.
        return [...type.statics].map(([key, prop]) => ({
          label: key,
          kind: "property" as const,
          detail: typeName(prop.type),
        }));
      default:
        return null;
    }
  };

  /**
   * True when the cursor sits in a type annotation: after a `:` with no `=`
   * between it and the cursor. Covers `pakka x: |`, `kaam f(a: |`, and
   * `qisim T = { k: | }`.
   */
  const inTypePosition = (before: string): boolean => {
    const line = before.slice(before.lastIndexOf("\n") + 1);
    const colon = line.lastIndexOf(":");
    if (colon === -1) return false;
    const after = line.slice(colon + 1);
    return !after.includes("=") && !after.includes(";");
  };

  return {
    diagnostics,
    parsed,
    state,
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
      const before = source.slice(0, offset);

      // `name.` / `name?.` — the receiver's members, whatever kind it is.
      const memberMatch = /([A-Za-z_$][A-Za-z0-9_$]*)\s*\??\.\s*([A-Za-z_$][A-Za-z0-9_$]*)?$/.exec(before);
      if (memberMatch !== null) {
        const receiver = memberMatch[1]!;
        const decl = [...bindings].reverse().find((b) => b.name === receiver);
        if (decl !== undefined) {
          const members = memberCompletions(decl.type);
          if (members !== null) return members;
        }
      }

      // A type annotation: offer types, not values.
      if (inTypePosition(before)) {
        const items = new Map<string, CompletionItem>();
        for (const name of typeNames) items.set(name, { label: name, kind: "type" });
        for (const name of BUILTIN_TYPE_NAMES) {
          if (!items.has(name)) items.set(name, { label: name, kind: "type" });
        }
        return [...items.values()];
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
