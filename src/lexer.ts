import { KEYWORDS, Token, TokenKind } from "./tokens.js";
import { UrSyntaxError } from "./errors.js";
import { decodeJsxEntities } from "./jsx.js";

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
  Lt = 60,
  Gt = 62,
  LBrace = 123,
  RBrace = 125,
  Minus = 45,
  Assign = 61,
}

function isDigit(c: number): boolean {
  return c >= Ch.Zero && c <= Ch.Nine;
}

/** Digit valid in base 2, 8, or 16 (hex accepts a–f in either case). */
function isRadixDigit(c: number, radix: number): boolean {
  if (radix === 16) {
    const lower = c | 0x20;
    return isDigit(c) || (lower >= 97 && lower <= 102); // a–f
  }
  return c >= Ch.Zero && c < Ch.Zero + radix;
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

export interface LexOptions {
  /** Enables JSX lexing (used for .urx files). `<` in expression position starts an element. */
  jsx?: boolean;
}

/**
 * Lexing is context-sensitive in two places — template literals and JSX — and
 * both are tracked on one stack so they nest in any order:
 *
 * - "tpl": inside a `${...}` interpolation; its `}` at depth 0 resumes template text.
 * - "container": inside a JSX `{...}` expression container; its `}` at depth 0
 *   resumes the enclosing JSX tag or children.
 * - "jsx": inside a JSX region; `mode` says whether we are between `<`...`>`
 *   (tag) or between tags (children, where everything is raw text).
 */
type LexContext =
  | { type: "tpl"; depth: number }
  | { type: "container"; depth: number }
  | { type: "jsx"; region: JsxRegion };

interface JsxRegion {
  /** Number of currently-open (not yet closed) elements in this region. */
  depth: number;
  mode: "tag" | "children";
  /** The current tag started with `</`. */
  closingTag: boolean;
  /** Saw `/` inside the tag after the name (self-closing candidate). */
  sawSlash: boolean;
  /** Still before the tag name, so a `/` means a closing tag. */
  beforeName: boolean;
}

/** Token kinds that can end an operand — after these, `<` is always less-than. */
const OPERAND_ENDERS: ReadonlySet<TokenKind> = new Set([
  TokenKind.Identifier,
  TokenKind.Number,
  TokenKind.String,
  TokenKind.TemplateFull,
  TokenKind.TemplateEnd,
  TokenKind.Sach,
  TokenKind.Jhoot,
  TokenKind.Khaali,
  TokenKind.Yeh,
  TokenKind.RParen,
  TokenKind.RBracket,
  TokenKind.RBrace,
]);

/**
 * Hand-written single-pass lexer. Uses charCodeAt throughout — no regexes,
 * no per-character substring allocation — to keep large files fast.
 * Pass `comments` to collect comments (used by the formatter).
 */
export function tokenize(source: string, comments?: Comment[], options?: LexOptions): Token[] {
  const jsxEnabled = options?.jsx === true;
  const tokens: Token[] = [];
  const len = source.length;
  let i = 0;
  let line = 1;
  let lineStart = 0;
  const ctx: LexContext[] = [];

  const push = (kind: TokenKind, value: string, pos: number): void => {
    tokens.push({ kind, value, line, col: pos - lineStart + 1, pos });
  };

  const fail = (message: string, pos: number): never => {
    throw new UrSyntaxError(message, { line, col: pos - lineStart + 1, pos });
  };

  const newline = (): void => {
    line++;
    lineStart = i + 1;
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
      if (c === 36 && i + 1 < len && source.charCodeAt(i + 1) === Ch.LBrace) { // ${
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
      if (c === Ch.Newline) newline();
      i++;
    }
    return fail("Arre yaar, template string band karna bhool gaye — '`' nahi mila.", startPos);
  };

  /** After a completed tag (`>`), decides where this JSX region goes next. */
  const finishTag = (region: JsxRegion): void => {
    if (region.closingTag) {
      region.depth--;
      if (region.depth <= 0) { ctx.pop(); return; }
    } else if (region.sawSlash) {
      if (region.depth === 0) { ctx.pop(); return; }
    } else {
      region.depth++;
    }
    region.mode = "children";
  };

  /** Emits exactly one token while inside a JSX tag (`<` ... `>`). */
  const scanJsxTagToken = (region: JsxRegion): void => {
    // Skip whitespace between tag parts.
    while (i < len) {
      const c = source.charCodeAt(i);
      if (c === Ch.Space || c === Ch.Tab || c === Ch.CarriageReturn) { i++; continue; }
      if (c === Ch.Newline) { i++; newline(); continue; }
      break;
    }
    if (i >= len) fail("Arre yaar, JSX tag band karna bhool gaye — '>' nahi mila.", i);
    const start = i;
    const c = source.charCodeAt(i);
    if (c === Ch.Gt) {
      i++;
      push(TokenKind.Gt, ">", start);
      const done = region;
      finishTag(done);
      done.closingTag = false;
      done.sawSlash = false;
      done.beforeName = true;
      return;
    }
    if (c === Ch.Slash) {
      i++;
      if (region.beforeName) region.closingTag = true;
      else region.sawSlash = true;
      push(TokenKind.Slash, "/", start);
      return;
    }
    if (isIdentStart(c)) {
      i++;
      while (i < len) {
        const p = source.charCodeAt(i);
        if (isIdentPart(p) || p === Ch.Minus || p === Ch.Dot) i++;
        else break;
      }
      region.beforeName = false;
      push(TokenKind.JsxName, source.slice(start, i), start);
      return;
    }
    if (c === Ch.Assign) {
      i++;
      push(TokenKind.Assign, "=", start);
      return;
    }
    if (c === Ch.Quote || c === Ch.Apostrophe) {
      // JSX attribute strings take no backslash escapes (a `\` is a literal
      // backslash) but do take HTML entities — same as JSX everywhere.
      i++;
      const valueStart = i;
      while (i < len && source.charCodeAt(i) !== c) {
        if (source.charCodeAt(i) === Ch.Newline) newline();
        i++;
      }
      if (i >= len) fail("Arre yaar, JSX attribute ki string band nahi hui.", start);
      push(TokenKind.String, decodeJsxEntities(source.slice(valueStart, i)), start);
      i++;
      return;
    }
    if (c === Ch.LBrace) {
      i++;
      ctx.push({ type: "container", depth: 0 });
      push(TokenKind.LBrace, "{", start);
      return;
    }
    fail(`Arre yaar, JSX tag ke andar yeh samajh nahi aaya: '${source[i]}'`, start);
  };

  /** Emits one JsxText / `<` / `{` while between tags. */
  const scanJsxChildrenToken = (region: JsxRegion): void => {
    const start = i;
    const startLine = line;
    const startLineStart = lineStart;
    while (i < len) {
      const c = source.charCodeAt(i);
      if (c === Ch.Lt || c === Ch.LBrace) break;
      if (c === Ch.Newline) newline();
      i++;
    }
    if (i > start) {
      // Token position points at the text start, not where scanning stopped.
      tokens.push({
        kind: TokenKind.JsxText,
        value: decodeJsxEntities(source.slice(start, i)),
        line: startLine,
        col: start - startLineStart + 1,
        pos: start,
      });
      return;
    }
    if (i >= len) fail("Arre yaar, JSX element band karna bhool gaye — closing tag nahi mila.", start);
    const c = source.charCodeAt(i);
    if (c === Ch.Lt) {
      i++;
      region.mode = "tag";
      region.closingTag = false;
      region.sawSlash = false;
      region.beforeName = true;
      push(TokenKind.Lt, "<", i - 1);
      return;
    }
    // `{` — expression container child.
    i++;
    ctx.push({ type: "container", depth: 0 });
    push(TokenKind.LBrace, "{", i - 1);
  };

  /**
   * `<` starts JSX only in operand position (the previous token cannot end an
   * operand — the same trick JS lexers use for regex-vs-divide) and only when
   * immediately followed by a name or `>`. Called with `i` just past the `<`.
   */
  const canStartJsx = (): boolean => {
    if (!jsxEnabled || i >= len) return false;
    const next = source.charCodeAt(i);
    if (!isIdentStart(next) && next !== Ch.Gt) return false;
    const prev = tokens[tokens.length - 1];
    return prev === undefined || !OPERAND_ENDERS.has(prev.kind);
  };

  /** Same operand-position rule decides `/` : regex literal vs division. */
  const canStartRegex = (): boolean => {
    const prev = tokens[tokens.length - 1];
    return prev === undefined || !OPERAND_ENDERS.has(prev.kind);
  };

  /**
   * Scans `/pattern/flags` with `i` just past the opening slash. The pattern is
   * kept verbatim (it is emitted as-is), honouring escapes and character
   * classes — `/[/]/` and `/a\/b/` both terminate at the right slash.
   */
  const scanRegex = (start: number): void => {
    let inClass = false;
    while (i < len) {
      const c = source.charCodeAt(i);
      if (c === Ch.Newline) break; // unterminated: regexes never span lines
      if (c === Ch.Backslash) {
        i += 2;
        continue;
      }
      if (c === 91) inClass = true; // [
      else if (c === 93) inClass = false; // ]
      else if (c === Ch.Slash && !inClass) {
        i++;
        while (i < len && isIdentPart(source.charCodeAt(i))) i++; // flags
        push(TokenKind.Regex, source.slice(start, i), start);
        return;
      }
      i++;
    }
    fail("Arre yaar, regex band karna bhool gaye — closing '/' nahi mila.", start);
  };

  while (i < len) {
    // JSX contexts lex with their own scanners.
    const top = ctx[ctx.length - 1];
    if (top?.type === "jsx") {
      if (top.region.mode === "tag") scanJsxTagToken(top.region);
      else scanJsxChildrenToken(top.region);
      continue;
    }

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
        ctx.push({ type: "tpl", depth: 0 });
      }
      continue;
    }

    // A `}` may close a template interpolation or a JSX expression container.
    // (`top` cannot be a jsx context here — those are handled above and continue.)
    if (c === Ch.RBrace && top !== undefined && top.depth === 0) {
      if (top.type === "tpl") {
        const start = i;
        i++;
        const chunk = scanTemplateChunk(start);
        if (chunk.terminator === "end") {
          push(TokenKind.TemplateEnd, chunk.value, start);
          ctx.pop();
        } else {
          push(TokenKind.TemplateMiddle, chunk.value, start);
        }
        continue;
      }
      // container — resume the enclosing JSX tag/children.
      ctx.pop();
      push(TokenKind.RBrace, "}", i);
      i++;
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

    // Numbers: decimals, `1_000_000` separators, and 0x / 0b / 0o radixes.
    if (isDigit(c)) {
      const radixMark = i + 1 < len ? source.charCodeAt(i + 1) | 0x20 : 0; // lowercased
      const radix =
        c !== Ch.Zero ? 0 : radixMark === 120 ? 16 : radixMark === 98 ? 2 : radixMark === 111 ? 8 : 0; // x b o
      if (radix !== 0) {
        i += 2;
        const digitsStart = i;
        while (i < len && (isRadixDigit(source.charCodeAt(i), radix) || source.charCodeAt(i) === Ch.Underscore)) i++;
        if (i === digitsStart) fail(`Arre yaar, '${source.slice(start, i)}' ke baad koi digit nahi hai.`, start);
        push(TokenKind.Number, source.slice(start, i), start);
        continue;
      }
      i++;
      while (i < len && (isDigit(source.charCodeAt(i)) || source.charCodeAt(i) === Ch.Underscore)) i++;
      if (i < len && source.charCodeAt(i) === Ch.Dot && i + 1 < len && isDigit(source.charCodeAt(i + 1))) {
        i++;
        while (i < len && (isDigit(source.charCodeAt(i)) || source.charCodeAt(i) === Ch.Underscore)) i++;
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
      case Ch.LBrace:
        if (top?.type === "tpl" || top?.type === "container") top.depth++;
        push(TokenKind.LBrace, "{", start);
        continue;
      case Ch.RBrace:
        if (top?.type === "tpl" || top?.type === "container") top.depth--;
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
        if (two === 61) { i++; push(TokenKind.PlusAssign, "+=", start); }
        else if (two === 43) { i++; push(TokenKind.PlusPlus, "++", start); }
        else push(TokenKind.Plus, "+", start);
        continue;
      case Ch.Minus:
        if (two === 61) { i++; push(TokenKind.MinusAssign, "-=", start); }
        else if (two === Ch.Minus) { i++; push(TokenKind.MinusMinus, "--", start); }
        else push(TokenKind.Minus, "-", start);
        continue;
      case Ch.Star:
        if (two === Ch.Star) {
          i++;
          if (i < len && source.charCodeAt(i) === 61) { i++; push(TokenKind.StarStarAssign, "**=", start); }
          else push(TokenKind.StarStar, "**", start);
        } else if (two === 61) { i++; push(TokenKind.StarAssign, "*=", start); }
        else push(TokenKind.Star, "*", start);
        continue;
      case Ch.Slash:
        if (two === 61) { i++; push(TokenKind.SlashAssign, "/=", start); continue; }
        // `/` in operand position starts a regex literal; otherwise it divides.
        // (Comments were already consumed above.)
        if (canStartRegex()) {
          scanRegex(start);
          continue;
        }
        push(TokenKind.Slash, "/", start);
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
      case Ch.Lt:
        if (canStartJsx()) {
          ctx.push({
            type: "jsx",
            region: { depth: 0, mode: "tag", closingTag: false, sawSlash: false, beforeName: true },
          });
          push(TokenKind.Lt, "<", start);
          continue;
        }
        if (two === 61) { i++; push(TokenKind.LtEq, "<=", start); }
        else if (two === Ch.Lt) {
          i++;
          if (i < len && source.charCodeAt(i) === 61) { i++; push(TokenKind.ShlAssign, "<<=", start); }
          else push(TokenKind.Shl, "<<", start);
        } else push(TokenKind.Lt, "<", start);
        continue;
      case Ch.Gt:
        if (two === 61) { i++; push(TokenKind.GtEq, ">=", start); continue; }
        if (two === Ch.Gt) {
          i++;
          if (i < len && source.charCodeAt(i) === Ch.Gt) {
            i++;
            if (i < len && source.charCodeAt(i) === 61) { i++; push(TokenKind.UShrAssign, ">>>=", start); }
            else push(TokenKind.UShr, ">>>", start);
          } else if (i < len && source.charCodeAt(i) === 61) { i++; push(TokenKind.ShrAssign, ">>=", start); }
          else push(TokenKind.Shr, ">>", start);
          continue;
        }
        push(TokenKind.Gt, ">", start);
        continue;
      case 38: // &
        if (two === 38) { i++; push(TokenKind.AndAnd, "&&", start); continue; }
        if (two === 61) { i++; push(TokenKind.AmpAssign, "&=", start); continue; }
        push(TokenKind.Amp, "&", start);
        continue;
      case 124: // |
        if (two === 124) { i++; push(TokenKind.OrOr, "||", start); continue; }
        if (two === 61) { i++; push(TokenKind.PipeAssign, "|=", start); continue; }
        push(TokenKind.Pipe, "|", start);
        continue;
      case 94: // ^
        if (two === 61) { i++; push(TokenKind.CaretAssign, "^=", start); } else push(TokenKind.Caret, "^", start);
        continue;
      case 126: // ~
        push(TokenKind.Tilde, "~", start);
        continue;
      case 63: // ?
        if (two === Ch.Dot) {
          i++;
          // `?.(` and `?.[` are optional call / optional index.
          const after = i < len ? source.charCodeAt(i) : 0;
          if (after === 40) { i++; push(TokenKind.QuestionDotLParen, "?.(", start); }
          else if (after === 91) { i++; push(TokenKind.QuestionDotLBracket, "?.[", start); }
          else push(TokenKind.QuestionDot, "?.", start);
        } else if (two === 63) {
          i++;
          push(TokenKind.QuestionQuestion, "??", start);
        } else {
          push(TokenKind.Question, "?", start);
        }
        continue;
      default:
        fail(`Arre yaar, yeh character samajh nahi aaya: '${source[start]}'`, start);
    }
  }

  if (ctx.some((entry) => entry.type === "jsx" || entry.type === "container")) {
    fail("Arre yaar, JSX element band karna bhool gaye — closing tag nahi mila.", i);
  }

  tokens.push({ kind: TokenKind.EOF, value: "", line, col: i - lineStart + 1, pos: i });
  return tokens;
}
