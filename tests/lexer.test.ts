import { describe, expect, it } from "vitest";
import { tokenize } from "../src/lexer.js";
import { TokenKind } from "../src/tokens.js";
import { UrSyntaxError } from "../src/errors.js";

function kinds(src: string): TokenKind[] {
  return tokenize(src).map((t) => t.kind);
}

describe("lexer", () => {
  it("tokenizes an empty program to EOF", () => {
    expect(kinds("")).toEqual([TokenKind.EOF]);
  });

  it("tokenizes a variable declaration", () => {
    expect(kinds("rakho x = 10;")).toEqual([
      TokenKind.Rakho,
      TokenKind.Identifier,
      TokenKind.Assign,
      TokenKind.Number,
      TokenKind.Semicolon,
      TokenKind.EOF,
    ]);
  });

  it("distinguishes keywords from identifiers", () => {
    const toks = tokenize("rakho rakhoX = sach;");
    expect(toks[0]!.kind).toBe(TokenKind.Rakho);
    expect(toks[1]!.kind).toBe(TokenKind.Identifier);
    expect(toks[1]!.value).toBe("rakhoX");
    expect(toks[3]!.kind).toBe(TokenKind.Sach);
  });

  it("tokenizes numbers including decimals", () => {
    const toks = tokenize("3 3.14 0.5");
    expect(toks.map((t) => t.value).slice(0, 3)).toEqual(["3", "3.14", "0.5"]);
    expect(toks[0]!.kind).toBe(TokenKind.Number);
  });

  it("tokenizes single- and double-quoted strings with escapes", () => {
    const toks = tokenize(`"hello" 'ok' "a\\"b" "tab\\t"`);
    expect(toks[0]!.value).toBe("hello");
    expect(toks[1]!.value).toBe("ok");
    expect(toks[2]!.value).toBe('a"b');
    expect(toks[3]!.value).toBe("tab\t");
  });

  it("throws a friendly error on unterminated strings", () => {
    expect(() => tokenize('"open')).toThrow(UrSyntaxError);
  });

  it("tokenizes all operators", () => {
    expect(kinds("= += -= *= /= %= + - * / % == != < > <= >= && || !")).toEqual([
      TokenKind.Assign,
      TokenKind.PlusAssign,
      TokenKind.MinusAssign,
      TokenKind.StarAssign,
      TokenKind.SlashAssign,
      TokenKind.PercentAssign,
      TokenKind.Plus,
      TokenKind.Minus,
      TokenKind.Star,
      TokenKind.Slash,
      TokenKind.Percent,
      TokenKind.EqEq,
      TokenKind.NotEq,
      TokenKind.Lt,
      TokenKind.Gt,
      TokenKind.LtEq,
      TokenKind.GtEq,
      TokenKind.AndAnd,
      TokenKind.OrOr,
      TokenKind.Bang,
      TokenKind.EOF,
    ]);
  });

  it("tokenizes punctuation", () => {
    expect(kinds("( ) { } [ ] , ; : .")).toEqual([
      TokenKind.LParen,
      TokenKind.RParen,
      TokenKind.LBrace,
      TokenKind.RBrace,
      TokenKind.LBracket,
      TokenKind.RBracket,
      TokenKind.Comma,
      TokenKind.Semicolon,
      TokenKind.Colon,
      TokenKind.Dot,
      TokenKind.EOF,
    ]);
  });

  it("skips line and block comments", () => {
    expect(kinds("// pura comment\nrakho x = 1; /* beech mein */ bolo x;")).toEqual([
      TokenKind.Rakho,
      TokenKind.Identifier,
      TokenKind.Assign,
      TokenKind.Number,
      TokenKind.Semicolon,
      TokenKind.Bolo,
      TokenKind.Identifier,
      TokenKind.Semicolon,
      TokenKind.EOF,
    ]);
  });

  it("tracks line and column numbers (1-based)", () => {
    const toks = tokenize("rakho x = 1;\n  bolo x;");
    const bolo = toks.find((t) => t.kind === TokenKind.Bolo)!;
    expect(bolo.line).toBe(2);
    expect(bolo.col).toBe(3);
  });

  it("throws with line info on unexpected characters", () => {
    try {
      tokenize("rakho x = 1;\nrakho y = @;");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(UrSyntaxError);
      expect((e as UrSyntaxError).line).toBe(2);
    }
  });

  it("handles a full while-loop program", () => {
    const src = `
      rakho a = 0;
      jab tak (a < 5) {
        bolo a;
        a += 1;
      }
    `;
    expect(() => tokenize(src)).not.toThrow();
    const toks = tokenize(src);
    expect(toks[toks.length - 1]!.kind).toBe(TokenKind.EOF);
  });
});
