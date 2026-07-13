// Token kinds for UrLang. Numeric enum keeps comparisons cheap in the hot path.
export enum TokenKind {
  EOF,
  // Literals
  Number,
  String,
  Identifier,
  // Keywords
  Rakho, // let
  Pakka, // const
  Bolo, // print
  Agar, // if
  Warna, // else
  Jab, // while (part 1: "jab tak")
  Tak, // while (part 2)
  Bas, // break
  Agla, // continue
  Kaam, // function
  Wapas, // return
  Sach, // true
  Jhoot, // false
  Khaali, // null
  Bhejo, // export
  Lao, // import
  Se, // from
  Bahar, // external (ambient JS declaration)
  Har, // for-each (part 1: "har x list mein")
  Mein, // for-each (part 2)
  Koshish, // try
  Pakro, // catch
  Akhir, // finally
  Phenko, // throw
  Intezar, // await
  Qisim, // type alias
  Question, // ? (optional props, ternary)
  Pipe, // | (union types)
  QuestionDot, // ?. (optional chaining)
  DotDotDot, // ... (spread/rest)
  Asal, // default (export/import)
  Sab, // namespace import ("sab" = all)
  Jamaat, // class
  Naya, // new
  Yeh, // this
  Waris, // extends
  Buzurg, // super
  // JSX (only produced when the lexer runs in jsx mode, i.e. .urx files):
  // JsxName covers tag and attribute names (allows `-` and `.`);
  // JsxText is a raw text chunk between tags.
  JsxName,
  JsxText,
  // Template literals: `a${ x }b${ y }c` lexes as
  // TemplateStart("a") x TemplateMiddle("b") y TemplateEnd("c");
  // a template with no ${} lexes as a single TemplateFull.
  TemplateFull,
  TemplateStart,
  TemplateMiddle,
  TemplateEnd,
  // Punctuation
  LParen,
  RParen,
  LBrace,
  RBrace,
  LBracket,
  RBracket,
  Comma,
  Semicolon,
  Colon,
  Dot,
  // Operators
  Assign, // =
  PlusAssign,
  MinusAssign,
  StarAssign,
  SlashAssign,
  PercentAssign,
  Plus,
  Minus,
  Star,
  Slash,
  Percent,
  EqEq, // ==
  NotEq, // !=
  Lt,
  Gt,
  LtEq,
  GtEq,
  AndAnd,
  OrOr,
  QuestionQuestion, // ?? (nullish coalescing — pairs with ?.)
  Bang,
  // Increment / decrement
  PlusPlus,
  MinusMinus,
  // Exponent
  StarStar,
  StarStarAssign,
  // Bitwise
  Amp, // &
  Caret, // ^
  Tilde, // ~
  Shl, // <<
  Shr, // >>
  UShr, // >>>
  AmpAssign,
  PipeAssign,
  CaretAssign,
  ShlAssign,
  ShrAssign,
  UShrAssign,
  // Operator keywords
  Noeyat, // typeof
  Hai, // instanceof
  Andar, // in
  Mitao, // delete
  Chuno, // switch
  Surat, // case
  Karo, // do (do…while)
  /** A regex literal, e.g. /ab+c/gi — value holds the whole literal. */
  Regex,
  /** `?.(` — optional call */
  QuestionDotLParen,
  /** `?.[` — optional index */
  QuestionDotLBracket,
}

export interface Token {
  kind: TokenKind;
  /** Raw text for identifiers/numbers; decoded value for strings; keyword text otherwise. */
  value: string;
  line: number;
  col: number;
  /** Offset into the source, used for source maps. */
  pos: number;
}

export const KEYWORDS: ReadonlyMap<string, TokenKind> = new Map([
  ["rakho", TokenKind.Rakho],
  ["pakka", TokenKind.Pakka],
  ["bolo", TokenKind.Bolo],
  ["agar", TokenKind.Agar],
  ["warna", TokenKind.Warna],
  ["jab", TokenKind.Jab],
  ["tak", TokenKind.Tak],
  ["bas", TokenKind.Bas],
  ["agla", TokenKind.Agla],
  ["kaam", TokenKind.Kaam],
  ["wapas", TokenKind.Wapas],
  ["sach", TokenKind.Sach],
  ["jhoot", TokenKind.Jhoot],
  ["khaali", TokenKind.Khaali],
  ["bhejo", TokenKind.Bhejo],
  ["lao", TokenKind.Lao],
  ["se", TokenKind.Se],
  ["bahar", TokenKind.Bahar],
  ["har", TokenKind.Har],
  ["mein", TokenKind.Mein],
  ["koshish", TokenKind.Koshish],
  ["pakro", TokenKind.Pakro],
  ["akhir", TokenKind.Akhir],
  ["phenko", TokenKind.Phenko],
  ["intezar", TokenKind.Intezar],
  ["qisim", TokenKind.Qisim],
  ["asal", TokenKind.Asal],
  ["sab", TokenKind.Sab],
  ["jamaat", TokenKind.Jamaat],
  ["naya", TokenKind.Naya],
  ["yeh", TokenKind.Yeh],
  ["waris", TokenKind.Waris],
  ["buzurg", TokenKind.Buzurg],
  ["noeyat", TokenKind.Noeyat],
  ["hai", TokenKind.Hai],
  ["andar", TokenKind.Andar],
  ["mitao", TokenKind.Mitao],
  ["chuno", TokenKind.Chuno],
  ["surat", TokenKind.Surat],
  ["karo", TokenKind.Karo],
]);
