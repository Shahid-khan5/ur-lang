import { KEYWORDS, Token, TokenKind } from "./tokens.js";
import { UrSyntaxError } from "./errors.js";

const enum Ch {
  Newline = 10,
  CarriageReturn = 13,
  Space = 32,
  Tab = 9,
  Quote = 34, // "
  Apostrophe = 39, // '
  Slash = 47,
  Star = 42,
  Backslash = 92,
  Underscore = 95,
  Zero = 48,
  Nine = 57,
  UpperA = 65,
  UpperZ = 90,
  LowerA = 97,
  LowerZ = 122,
  Dot = 46,
}

function isDigit(c: number): boolean {
  return c >= Ch.Zero && c <= Ch.Nine;
}

function isIdentStart(c: number): boolean {
  return (c >= Ch.LowerA && c <= Ch.LowerZ) || (c >= Ch.UpperA && c <= Ch.UpperZ) || c === Ch.Underscore || c === 36; // $
}

function isIdentPart(c: number): boolean {
  return isIdentStart(c) || isDigit(c);
}

export interface Comment {
  /** Comment text without the // or slash-star markers, trimmed. */
  text: string;
  line: number;
  block: boolean;
  pos: number;
}

/**
 * Hand-written single-pass lexer. Uses charCodeAt throughout — no regexes,
 * no per-character substring allocation — to keep large files fast.
 * Pass `comments` to collect comments (used by the formatter).
 */
export function tokenize(source: string, comments?: Comment[]): Token[] {
  const tokens: Token[] = [];
  const len = source.length;
  let i = 0;
  let line = 1;
  let lineStart = 0;
  /** Brace depth per open template interpolation, innermost last. */
  const templateStack: number[] = [];

  const push = (kind: TokenKind, value: string, pos: number): void => {
    tokens.push({ kind, value, line, col: pos - lineStart + 1, pos });
  };

  const fail = (message: string, pos: number): never => {
    throw new UrSyntaxError(message, { line, col: pos - lineStart + 1, pos });
  };

  /**
   * Scans template text starting at `i` until a backtick (returns "end") or
   * `${` (returns "interp"). Handles escapes and newlines.
   */
  const scanTemplateChunk = (startPos: number): { value: string; terminator: "end" | "interp" } => {
    let value = "";
    let chunkStart = i;
    while (i < len) {
      const c = source.charCodeAt(i);
      if (c === 96) { // `
        value += source.slice(chunkStart, i);
        i++;
        return { value, terminator: "end" };
      }
      if (c === 36 && i + 1 < len && source.charCodeAt(i + 1) === 123) { // ${
        value += source.slice(chunkStart, i);
        i += 2;
        return { value, terminator: "interp" };
      }
      if (c === Ch.Backslash && i + 1 < len) {
        value += source.slice(chunkStart, i);
        const esc = source.charCodeAt(i + 1);
        switch (esc) {
          case 110: value += "\n"; break; // n
          case 116: value += "\t"; break; // t
          case 114: value += "\r"; break; // r
          case 96: value += "`"; break;
          case 36: value += "$"; break;
          case Ch.Backslash: value += "\\"; break;
          default: value += source[i + 1]!;
        }
        i += 2;
        chunkStart = i;
        continue;
      }
      if (c === Ch.Newline) {
        line++;
        lineStart = i + 1;
      }
      i++;
    }
    return fail("Arre yaar, template string band karna bhool gaye — '`' nahi mila.", startPos);
  };

  while (i < len) {
    const c = source.charCodeAt(i);

    // Whitespace and newlines
    if (c === Ch.Space || c === Ch.Tab || c === Ch.CarriageReturn) {
      i++;
      continue;
    }
    if (c === Ch.Newline) {
      i++;
      line++;
      lineStart = i;
      continue;
    }

    // Comments
    if (c === Ch.Slash && i + 1 < len) {
      const next = source.charCodeAt(i + 1);
      if (next === Ch.Slash) {
        const start = i;
        const startLine = line;
        i += 2;
        while (i < len && source.charCodeAt(i) !== Ch.Newline) i++;
        comments?.push({ text: source.slice(start + 2, i).trim(), line: startLine, block: false, pos: start });
        continue;
      }
      if (next === Ch.Star) {
        const start = i;
        const startLine = line;
        i += 2;
        let closed = false;
        while (i < len) {
          const cc = source.charCodeAt(i);
          if (cc === Ch.Newline) {
            line++;
            lineStart = i + 1;
          } else if (cc === Ch.Star && i + 1 < len && source.charCodeAt(i + 1) === Ch.Slash) {
            i += 2;
            closed = true;
            break;
          }
          i++;
        }
        if (!closed) fail("Arre yaar, comment band karna bhool gaye — '*/' nahi mila.", start);
        comments?.push({ text: source.slice(start + 2, i - 2).trim(), line: startLine, block: true, pos: start });
        continue;
      }
    }

    // Template literals
    if (c === 96) { // `
      const start = i;
      i++;
      const chunk = scanTemplateChunk(start);
      if (chunk.terminator === "end") {
        push(TokenKind.TemplateFull, chunk.value, start);
      } else {
        push(TokenKind.TemplateStart, chunk.value, start);
        templateStack.push(0);
      }
      continue;
    }

    // A `}` may close a template interpolation rather than a block.
    if (c === 125 && templateStack.length > 0 && templateStack[templateStack.length - 1] === 0) {
      const start = i;
      i++;
      const chunk = scanTemplateChunk(start);
      if (chunk.terminator === "end") {
        push(TokenKind.TemplateEnd, chunk.value, start);
        templateStack.pop();
      } else {
        push(TokenKind.TemplateMiddle, chunk.value, start);
      }
      continue;
    }

    const start = i;

    // Identifiers and keywords
    if (isIdentStart(c)) {
      i++;
      while (i < len && isIdentPart(source.charCodeAt(i))) i++;
      const text = source.slice(start, i);
      push(KEYWORDS.get(text) ?? TokenKind.Identifier, text, start);
      continue;
    }

    // Numbers
    if (isDigit(c)) {
      i++;
      while (i < len && isDigit(source.charCodeAt(i))) i++;
      if (i < len && source.charCodeAt(i) === Ch.Dot && i + 1 < len && isDigit(source.charCodeAt(i + 1))) {
        i++;
        while (i < len && isDigit(source.charCodeAt(i))) i++;
      }
      push(TokenKind.Number, source.slice(start, i), start);
      continue;
    }

    // Strings
    if (c === Ch.Quote || c === Ch.Apostrophe) {
      i++;
      let value = "";
      let chunkStart = i;
      let closed = false;
      while (i < len) {
        const cc = source.charCodeAt(i);
        if (cc === c) {
          value += source.slice(chunkStart, i);
          i++;
          closed = true;
          break;
        }
        if (cc === Ch.Newline) break;
        if (cc === Ch.Backslash && i + 1 < len) {
          value += source.slice(chunkStart, i);
          const esc = source.charCodeAt(i + 1);
          switch (esc) {
            case 110: value += "\n"; break; // n
            case 116: value += "\t"; break; // t
            case 114: value += "\r"; break; // r
            case Ch.Backslash: value += "\\"; break;
            case Ch.Quote: value += '"'; break;
            case Ch.Apostrophe: value += "'"; break;
            case Ch.Zero: value += "\0"; break;
            default: value += source[i + 1]!;
          }
          i += 2;
          chunkStart = i;
          continue;
        }
        i++;
      }
      if (!closed) fail("Arre yaar, string band karna bhool gaye — closing quote nahi mila.", start);
      push(TokenKind.String, value, start);
      continue;
    }

    // Operators and punctuation
    i++;
    const two = i < len ? source.charCodeAt(i) : 0;
    switch (c) {
      case 40: push(TokenKind.LParen, "(", start); continue;
      case 41: push(TokenKind.RParen, ")", start); continue;
      case 123:
        if (templateStack.length > 0) templateStack[templateStack.length - 1]!++;
        push(TokenKind.LBrace, "{", start);
        continue;
      case 125:
        if (templateStack.length > 0) templateStack[templateStack.length - 1]!--;
        push(TokenKind.RBrace, "}", start);
        continue;
      case 91: push(TokenKind.LBracket, "[", start); continue;
      case 93: push(TokenKind.RBracket, "]", start); continue;
      case 44: push(TokenKind.Comma, ",", start); continue;
      case 59: push(TokenKind.Semicolon, ";", start); continue;
      case 58: push(TokenKind.Colon, ":", start); continue;
      case Ch.Dot:
        if (two === Ch.Dot && i + 1 < len && source.charCodeAt(i + 1) === Ch.Dot) {
          i += 2;
          push(TokenKind.DotDotDot, "...", start);
        } else {
          push(TokenKind.Dot, ".", start);
        }
        continue;
      case 43: // +
        if (two === 61) { i++; push(TokenKind.PlusAssign, "+=", start); } else push(TokenKind.Plus, "+", start);
        continue;
      case 45: // -
        if (two === 61) { i++; push(TokenKind.MinusAssign, "-=", start); } else push(TokenKind.Minus, "-", start);
        continue;
      case Ch.Star:
        if (two === 61) { i++; push(TokenKind.StarAssign, "*=", start); } else push(TokenKind.Star, "*", start);
        continue;
      case Ch.Slash:
        if (two === 61) { i++; push(TokenKind.SlashAssign, "/=", start); } else push(TokenKind.Slash, "/", start);
        continue;
      case 37: // %
        if (two === 61) { i++; push(TokenKind.PercentAssign, "%=", start); } else push(TokenKind.Percent, "%", start);
        continue;
      case 61: // =
        if (two === 61) { i++; push(TokenKind.EqEq, "==", start); } else push(TokenKind.Assign, "=", start);
        continue;
      case 33: // !
        if (two === 61) { i++; push(TokenKind.NotEq, "!=", start); } else push(TokenKind.Bang, "!", start);
        continue;
      case 60: // <
        if (two === 61) { i++; push(TokenKind.LtEq, "<=", start); } else push(TokenKind.Lt, "<", start);
        continue;
      case 62: // >
        if (two === 61) { i++; push(TokenKind.GtEq, ">=", start); } else push(TokenKind.Gt, ">", start);
        continue;
      case 38: // &
        if (two === 38) { i++; push(TokenKind.AndAnd, "&&", start); continue; }
        fail("Arre yaar, akela '&' samajh nahi aaya — '&&' likhna tha kya?", start);
        continue;
      case 124: // |
        if (two === 124) { i++; push(TokenKind.OrOr, "||", start); continue; }
        push(TokenKind.Pipe, "|", start);
        continue;
      case 63: // ?
        if (two === Ch.Dot) {
          i++;
          push(TokenKind.QuestionDot, "?.", start);
        } else {
          push(TokenKind.Question, "?", start);
        }
        continue;
      default:
        fail(`Arre yaar, yeh character samajh nahi aaya: '${source[start]}'`, start);
    }
  }

  tokens.push({ kind: TokenKind.EOF, value: "", line, col: i - lineStart + 1, pos: i });
  return tokens;
}
