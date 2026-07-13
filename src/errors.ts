// Diagnostics for UrLang. Messages are friendly Roman-Urdu, always with
// location info and a stable URxxxx code (see diagnostics.ts + docs/errors.md).
import { codeFor } from "./diagnostics.js";

export interface SourceLocation {
  line: number;
  col: number;
  pos: number;
}

export class UrError extends Error {
  readonly line: number;
  readonly col: number;
  readonly pos: number;
  /** Stable diagnostic code (UR1xxx syntax, UR2xxx types). */
  readonly code: string;

  constructor(message: string, loc: SourceLocation) {
    super(message);
    this.line = loc.line;
    this.col = loc.col;
    this.pos = loc.pos;
    this.code = codeFor(message);
  }

  /** Renders the error with a caret pointing at the offending source column. */
  format(source: string, file = "<urlang>"): string {
    const lines = source.split(/\r?\n/);
    const srcLine = lines[this.line - 1] ?? "";
    const gutter = `${this.line} | `;
    const caret = " ".repeat(gutter.length + this.col - 1) + "^";
    return `${file}:${this.line}:${this.col} — ${this.message} [${this.code}]\n${gutter}${srcLine}\n${caret}`;
  }
}

export class UrSyntaxError extends UrError {
  override name = "UrSyntaxError";
}

export class UrTypeError extends UrError {
  override name = "UrTypeError";
}
