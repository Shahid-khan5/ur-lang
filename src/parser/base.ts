// Parser core: the token cursor and the primitives every layer uses
// (peek/expect/fail/span), plus the type grammar. Expressions build on this in
// ./expressions.ts, statements on those in ./parser.ts.
import { Token, TokenKind } from "../tokens.js";
import { tokenize } from "../lexer.js";
import { UrSyntaxError } from "../errors.js";
import type {
  Assignment,
  BlockStmt,
  Expr,
  FunctionDecl,
  IfStmt,
  JsxAttr,
  JsxChild,
  JsxElement,
  JsxFragment,
  Param,
  Program,
  Span,
  Stmt,
  TypeNode,
  VarDecl,
} from "../ast.js";

export interface ParseOptions {
  /** Enables JSX (used for .urx files). */
  jsx?: boolean;
}

export abstract class ParserBase {
  protected readonly tokens: Token[];
  protected i = 0;
  protected readonly jsx: boolean;
  /** One entry per function being parsed; flips to true when its body contains `intezar`. */
  protected readonly asyncStack: boolean[] = [];

  constructor(source: string, options?: ParseOptions) {
    this.jsx = options?.jsx === true;
    this.tokens = tokenize(source, undefined, { jsx: this.jsx });
  }


  protected peek(): Token {
    return this.tokens[this.i]!;
  }

  protected at(kind: TokenKind): boolean {
    return this.tokens[this.i]!.kind === kind;
  }

  protected next(): Token {
    return this.tokens[this.i++]!;
  }

  protected match(kind: TokenKind): Token | null {
    if (this.at(kind)) return this.next();
    return null;
  }

  /**
   * Consumes a separator comma in a bracketed list, and reports whether another
   * item follows. A comma sitting right before the list's closing token is a
   * *trailing* comma: it is consumed, but the list ends — the same rule JS and
   * TypeScript use, and what any multi-line formatter produces.
   */
  protected matchListComma(closer: TokenKind): boolean {
    if (!this.at(TokenKind.Comma)) return false;
    this.next();
    return !this.at(closer);
  }

  protected expect(kind: TokenKind, what: string): Token {
    const t = this.peek();
    if (t.kind !== kind) {
      this.fail(`Arre yaar, yahan '${what}' hona chahiye tha, mila '${t.value || "end of file"}'.`, t);
    }
    return this.next();
  }

  protected fail(message: string, token: Token): never {
    throw new UrSyntaxError(message, { line: token.line, col: token.col, pos: token.pos });
  }

  protected span(t: Token): Span {
    return { line: t.line, col: t.col, pos: t.pos };
  }

  // ---------- statements ----------

  // Provided by the statement layer; a `kaam (…) { … }` expression needs both.
  protected abstract paramList(): Param[];
  protected abstract block(): BlockStmt;
  protected abstract statement(): Stmt;

  // ---------- type grammar ----------

  protected typeNode(): TypeNode {
    const first = this.postfixType();
    if (!this.at(TokenKind.Pipe)) return first;
    const members: TypeNode[] = [first];
    while (this.match(TokenKind.Pipe)) {
      members.push(this.postfixType());
    }
    return { kind: "UnionType", members, span: first.span };
  }

  protected postfixType(): TypeNode {
    let node = this.primaryType();
    while (this.at(TokenKind.LBracket)) {
      const open = this.next();
      this.expect(TokenKind.RBracket, "]");
      node = { kind: "ArrayType", element: node, span: this.span(open) };
    }
    return node;
  }

  protected primaryType(): TypeNode {
    const t = this.peek();
    switch (t.kind) {
      case TokenKind.LParen: {
        this.next();
        const inner = this.typeNode();
        this.expect(TokenKind.RParen, ")");
        return inner;
      }
      case TokenKind.Kaam: {
        // `kaam(adad, lafz): bool` — the type of a function value.
        this.next();
        this.expect(TokenKind.LParen, "(");
        const params: TypeNode[] = [];
        if (!this.at(TokenKind.RParen)) {
          do {
            params.push(this.typeNode());
          } while (this.matchListComma(TokenKind.RParen));
        }
        this.expect(TokenKind.RParen, ")");
        this.expect(TokenKind.Colon, ":");
        const returnType = this.typeNode();
        return { kind: "FunctionType", params, returnType, span: this.span(t) };
      }
      case TokenKind.LBrace: {
        this.next();
        const props: { key: string; type: TypeNode; optional: boolean; span: Span }[] = [];
        if (!this.at(TokenKind.RBrace)) {
          do {
            if (this.at(TokenKind.RBrace)) break; // trailing comma
            const keyTok = this.expect(TokenKind.Identifier, "property ka naam");
            const optional = this.match(TokenKind.Question) !== null;
            this.expect(TokenKind.Colon, ":");
            const type = this.typeNode();
            props.push({ key: keyTok.value, type, optional, span: this.span(keyTok) });
          } while (this.matchListComma(TokenKind.RBrace));
        }
        this.expect(TokenKind.RBrace, "}");
        return { kind: "ObjectType", props, span: this.span(t) };
      }
      case TokenKind.String:
        this.next();
        return { kind: "LiteralType", value: t.value, span: this.span(t) };
      case TokenKind.Number:
        this.next();
        return { kind: "LiteralType", value: Number(t.value), span: this.span(t) };
      case TokenKind.Sach:
        this.next();
        return { kind: "LiteralType", value: true, span: this.span(t) };
      case TokenKind.Jhoot:
        this.next();
        return { kind: "LiteralType", value: false, span: this.span(t) };
      case TokenKind.Khaali:
        this.next();
        return { kind: "NamedType", name: "khaali", typeArgs: [], span: this.span(t) };
      case TokenKind.Identifier: {
        this.next();
        const typeArgs: TypeNode[] = [];
        if (this.at(TokenKind.Lt)) {
          this.next();
          do {
            typeArgs.push(this.typeNode());
          } while (this.matchListComma(TokenKind.Gt));
          this.expect(TokenKind.Gt, ">");
        }
        return { kind: "NamedType", name: t.value, typeArgs, span: this.span(t) };
      }
      default:
        this.fail("Arre yaar, yahan type hona chahiye (adad, lafz, { ... }, \"literal\", union...).", t);
    }
  }

}
