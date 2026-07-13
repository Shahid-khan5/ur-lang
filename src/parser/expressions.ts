// Expression and JSX grammar. Precedence climbs from assignment down to
// primary; JSX is only reachable when the lexer was put in jsx mode (.urx).
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
import { ParserBase } from "./base.js";

export abstract class ExpressionParser extends ParserBase {
  protected expression(): Expr {
    return this.assignment();
  }

  protected assignment(): Expr {
    const left = this.conditional();
    const t = this.peek();
    let op: Assignment["op"] | null = null;
    switch (t.kind) {
      case TokenKind.Assign: op = "="; break;
      case TokenKind.PlusAssign: op = "+="; break;
      case TokenKind.MinusAssign: op = "-="; break;
      case TokenKind.StarAssign: op = "*="; break;
      case TokenKind.SlashAssign: op = "/="; break;
      case TokenKind.PercentAssign: op = "%="; break;
      default: return left;
    }
    if (left.kind !== "Identifier" && left.kind !== "Member" && left.kind !== "Index") {
      this.fail("Arre yaar, is cheez ko value assign nahi kar sakte.", t);
    }
    this.next();
    const value = this.assignment(); // right-associative
    return { kind: "Assignment", op, target: left, value, span: left.span };
  }

  protected conditional(): Expr {
    const condition = this.nullish();
    if (!this.at(TokenKind.Question)) return condition;
    this.next();
    const consequent = this.assignment();
    this.expect(TokenKind.Colon, ":");
    const alternate = this.assignment(); // right-associative chains
    return { kind: "Conditional", condition, consequent, alternate, span: condition.span };
  }

  /** `a ?? b` — same precedence tier as `||`, but its own level (as in JS). */
  protected nullish(): Expr {
    let left = this.logicalOr();
    while (this.at(TokenKind.QuestionQuestion)) {
      this.next();
      const right = this.logicalOr();
      left = { kind: "Logical", op: "??", left, right, span: left.span };
    }
    return left;
  }

  protected logicalOr(): Expr {
    let left = this.logicalAnd();
    while (this.at(TokenKind.OrOr)) {
      this.next();
      const right = this.logicalAnd();
      left = { kind: "Logical", op: "||", left, right, span: left.span };
    }
    return left;
  }

  protected logicalAnd(): Expr {
    let left = this.equality();
    while (this.at(TokenKind.AndAnd)) {
      this.next();
      const right = this.equality();
      left = { kind: "Logical", op: "&&", left, right, span: left.span };
    }
    return left;
  }

  protected equality(): Expr {
    let left = this.comparison();
    for (;;) {
      const t = this.peek();
      if (t.kind === TokenKind.EqEq || t.kind === TokenKind.NotEq) {
        this.next();
        const right = this.comparison();
        left = { kind: "Binary", op: t.kind === TokenKind.EqEq ? "==" : "!=", left, right, span: left.span };
      } else return left;
    }
  }

  protected comparison(): Expr {
    let left = this.additive();
    for (;;) {
      const t = this.peek();
      let op: "<" | ">" | "<=" | ">=" | null = null;
      if (t.kind === TokenKind.Lt) op = "<";
      else if (t.kind === TokenKind.Gt) op = ">";
      else if (t.kind === TokenKind.LtEq) op = "<=";
      else if (t.kind === TokenKind.GtEq) op = ">=";
      if (op === null) return left;
      this.next();
      const right = this.additive();
      left = { kind: "Binary", op, left, right, span: left.span };
    }
  }

  protected additive(): Expr {
    let left = this.multiplicative();
    for (;;) {
      const t = this.peek();
      if (t.kind === TokenKind.Plus || t.kind === TokenKind.Minus) {
        this.next();
        const right = this.multiplicative();
        left = { kind: "Binary", op: t.kind === TokenKind.Plus ? "+" : "-", left, right, span: left.span };
      } else return left;
    }
  }

  protected multiplicative(): Expr {
    let left = this.unary();
    for (;;) {
      const t = this.peek();
      let op: "*" | "/" | "%" | null = null;
      if (t.kind === TokenKind.Star) op = "*";
      else if (t.kind === TokenKind.Slash) op = "/";
      else if (t.kind === TokenKind.Percent) op = "%";
      if (op === null) return left;
      this.next();
      const right = this.unary();
      left = { kind: "Binary", op, left, right, span: left.span };
    }
  }

  protected unary(): Expr {
    const t = this.peek();
    if (t.kind === TokenKind.Minus || t.kind === TokenKind.Bang) {
      this.next();
      const operand = this.unary();
      return { kind: "Unary", op: t.kind === TokenKind.Minus ? "-" : "!", operand, span: this.span(t) };
    }
    if (t.kind === TokenKind.Intezar) {
      this.next();
      const operand = this.unary();
      if (this.asyncStack.length > 0) this.asyncStack[this.asyncStack.length - 1] = true;
      return { kind: "Await", operand, span: this.span(t) };
    }
    return this.postfix();
  }

  protected postfix(): Expr {
    let expr = this.primary();
    for (;;) {
      if (this.at(TokenKind.LParen)) {
        this.next();
        const args: Expr[] = [];
        if (!this.at(TokenKind.RParen)) {
          do {
            if (this.at(TokenKind.DotDotDot)) {
              const spreadTok = this.next();
              const argument = this.expression();
              args.push({ kind: "Spread", argument, span: this.span(spreadTok) });
            } else {
              args.push(this.expression());
            }
          } while (this.matchListComma(TokenKind.RParen));
        }
        this.expect(TokenKind.RParen, ")");
        expr = { kind: "Call", callee: expr, args, span: expr.span };
      } else if (this.at(TokenKind.Dot)) {
        this.next();
        const prop = this.expect(TokenKind.Identifier, "property ka naam");
        expr = { kind: "Member", object: expr, property: prop.value, optional: false, span: expr.span };
      } else if (this.at(TokenKind.QuestionDot)) {
        this.next();
        const prop = this.expect(TokenKind.Identifier, "property ka naam");
        expr = { kind: "Member", object: expr, property: prop.value, optional: true, span: expr.span };
      } else if (this.at(TokenKind.LBracket)) {
        this.next();
        const index = this.expression();
        this.expect(TokenKind.RBracket, "]");
        expr = { kind: "Index", object: expr, index, span: expr.span };
      } else {
        return expr;
      }
    }
  }

  protected primary(): Expr {
    const t = this.peek();
    switch (t.kind) {
      case TokenKind.Number:
        this.next();
        // `raw` is emitted verbatim (JS understands 1_000 / 0xff); `value` is
        // the numeric value, so separators have to come out first.
        return {
          kind: "NumberLiteral",
          value: Number(t.value.replace(/_/g, "")),
          raw: t.value,
          span: this.span(t),
        };
      case TokenKind.String:
        this.next();
        return { kind: "StringLiteral", value: t.value, span: this.span(t) };
      case TokenKind.Sach:
        this.next();
        return { kind: "BooleanLiteral", value: true, span: this.span(t) };
      case TokenKind.Jhoot:
        this.next();
        return { kind: "BooleanLiteral", value: false, span: this.span(t) };
      case TokenKind.Khaali:
        this.next();
        return { kind: "NullLiteral", span: this.span(t) };
      case TokenKind.Identifier:
        this.next();
        return { kind: "Identifier", name: t.value, span: this.span(t) };
      case TokenKind.Yeh:
        this.next();
        return { kind: "ThisExpr", span: this.span(t) };
      case TokenKind.Naya: {
        this.next();
        const className = this.expect(TokenKind.Identifier, "jamaat ka naam");
        this.expect(TokenKind.LParen, "(");
        const args: Expr[] = [];
        if (!this.at(TokenKind.RParen)) {
          do {
            if (this.at(TokenKind.DotDotDot)) {
              const spreadTok = this.next();
              args.push({ kind: "Spread", argument: this.expression(), span: this.span(spreadTok) });
            } else {
              args.push(this.expression());
            }
          } while (this.matchListComma(TokenKind.RParen));
        }
        this.expect(TokenKind.RParen, ")");
        return { kind: "NewExpr", className: className.value, args, span: this.span(t) };
      }
      case TokenKind.Buzurg: {
        this.next();
        if (this.at(TokenKind.LParen)) {
          this.next();
          const args: Expr[] = [];
          if (!this.at(TokenKind.RParen)) {
            do {
              args.push(this.expression());
            } while (this.matchListComma(TokenKind.RParen));
          }
          this.expect(TokenKind.RParen, ")");
          return { kind: "SuperCall", args, span: this.span(t) };
        }
        if (this.at(TokenKind.Dot)) {
          this.next();
          const prop = this.expect(TokenKind.Identifier, "method ka naam");
          return { kind: "SuperMember", property: prop.value, span: this.span(t) };
        }
        this.fail("Arre yaar, 'buzurg' ke baad '(' ya '.' aana chahiye.", this.peek());
        break;
      }
      case TokenKind.Kaam: {
        // Anonymous function expression: kaam (a: adad): adad { ... }
        this.next();
        const params = this.paramList();
        let returnType: TypeNode | null = null;
        if (this.match(TokenKind.Colon)) returnType = this.typeNode();
        this.asyncStack.push(false);
        const body = this.block();
        const isAsync = this.asyncStack.pop()!;
        return { kind: "FunctionExpr", params, returnType, body, isAsync, span: this.span(t) };
      }
      case TokenKind.LParen: {
        this.next();
        const expr = this.expression();
        this.expect(TokenKind.RParen, ")");
        return expr;
      }
      case TokenKind.LBracket: {
        this.next();
        const elements: Expr[] = [];
        if (!this.at(TokenKind.RBracket)) {
          do {
            if (this.at(TokenKind.DotDotDot)) {
              const spreadTok = this.next();
              const argument = this.expression();
              elements.push({ kind: "Spread", argument, span: this.span(spreadTok) });
            } else {
              elements.push(this.expression());
            }
          } while (this.matchListComma(TokenKind.RBracket));
        }
        this.expect(TokenKind.RBracket, "]");
        return { kind: "ArrayLiteral", elements, span: this.span(t) };
      }
      case TokenKind.LBrace: {
        this.next();
        const properties: import("../ast.js").ObjectEntry[] = [];
        if (!this.at(TokenKind.RBrace)) {
          do {
            if (this.at(TokenKind.DotDotDot)) {
              const spreadTok = this.next();
              const argument = this.expression();
              properties.push({ kind: "spread", argument, span: this.span(spreadTok) });
              continue;
            }
            const keyTok = this.peek();
            let key: string;
            if (keyTok.kind === TokenKind.Identifier || keyTok.kind === TokenKind.String) {
              key = keyTok.value;
              this.next();
            } else {
              this.fail("Arre yaar, object ki key naam ya string honi chahiye.", keyTok);
            }
            // Shorthand: `{ naam }` is `{ naam: naam }`.
            if (keyTok.kind === TokenKind.Identifier && !this.at(TokenKind.Colon)) {
              properties.push({
                kind: "prop",
                key,
                value: { kind: "Identifier", name: key, span: this.span(keyTok) },
                span: this.span(keyTok),
              });
              continue;
            }
            this.expect(TokenKind.Colon, ":");
            const value = this.expression();
            properties.push({ kind: "prop", key, value, span: this.span(keyTok) });
          } while (this.matchListComma(TokenKind.RBrace));
        }
        this.expect(TokenKind.RBrace, "}");
        return { kind: "ObjectLiteral", properties, span: this.span(t) };
      }
      case TokenKind.TemplateFull:
        this.next();
        return { kind: "TemplateLiteral", quasis: [t.value], expressions: [], span: this.span(t) };
      case TokenKind.TemplateStart: {
        this.next();
        const quasis: string[] = [t.value];
        const expressions: Expr[] = [];
        for (;;) {
          expressions.push(this.expression());
          const part = this.peek();
          if (part.kind === TokenKind.TemplateMiddle) {
            this.next();
            quasis.push(part.value);
            continue;
          }
          if (part.kind === TokenKind.TemplateEnd) {
            this.next();
            quasis.push(part.value);
            break;
          }
          this.fail("Arre yaar, template string theek se band nahi hui.", part);
        }
        return { kind: "TemplateLiteral", quasis, expressions, span: this.span(t) };
      }
      case TokenKind.Lt:
        // The lexer only routes `<` here (instead of as a comparison) when it
        // recognized a JSX start in a .urx file.
        if (this.jsx) return this.jsxElement();
        this.fail("Arre yaar, yahan expression hona chahiye tha, mila '<'.", t);
        break;
      default:
        this.fail(`Arre yaar, yahan expression hona chahiye tha, mila '${t.value || "end of file"}'.`, t);
    }
  }

  // ---------- JSX ----------

  /** `<name attrs/>` | `<name attrs>children</name>` | `<>children</>` */
  protected jsxElement(): JsxElement | JsxFragment {
    const lt = this.expect(TokenKind.Lt, "<");

    if (this.match(TokenKind.Gt)) {
      // Fragment: <>children</>
      const children = this.jsxChildren();
      const close = this.peek();
      if (close.kind === TokenKind.JsxName) {
        this.fail(`Arre yaar, JSX tag match nahi karte: '<>' khula tha, '</${close.value}>' se band kiya.`, close);
      }
      this.expect(TokenKind.Gt, ">");
      return { kind: "JsxFragment", children, span: this.span(lt) };
    }

    const nameTok = this.expect(TokenKind.JsxName, "tag ka naam");
    const attributes: JsxAttr[] = [];
    for (;;) {
      const t = this.peek();
      if (t.kind === TokenKind.JsxName) {
        this.next();
        let value: Expr | null = null;
        if (this.match(TokenKind.Assign)) {
          const v = this.peek();
          if (v.kind === TokenKind.String) {
            this.next();
            value = { kind: "StringLiteral", value: v.value, span: this.span(v) };
          } else if (v.kind === TokenKind.LBrace) {
            this.next();
            value = this.expression();
            this.expect(TokenKind.RBrace, "}");
          } else {
            this.fail("Arre yaar, JSX attribute ki value string ya {expression} honi chahiye.", v);
          }
        }
        attributes.push({ kind: "JsxAttribute", name: t.value, value, span: this.span(t) });
        continue;
      }
      if (t.kind === TokenKind.LBrace) {
        // `{...props}` spread attribute.
        this.next();
        this.expect(TokenKind.DotDotDot, "...");
        const argument = this.expression();
        this.expect(TokenKind.RBrace, "}");
        attributes.push({ kind: "JsxSpreadAttribute", argument, span: this.span(t) });
        continue;
      }
      break;
    }

    if (this.match(TokenKind.Slash)) {
      this.expect(TokenKind.Gt, ">");
      return { kind: "JsxElement", tagName: nameTok.value, attributes, children: [], selfClosing: true, span: this.span(lt) };
    }
    this.expect(TokenKind.Gt, ">");
    const children = this.jsxChildren();
    const close = this.peek();
    if (close.kind !== TokenKind.JsxName) {
      this.fail(`Arre yaar, JSX tag match nahi karte: '<${nameTok.value}>' khula tha, '</>' se band kiya.`, close);
    }
    this.next();
    if (close.value !== nameTok.value) {
      this.fail(
        `Arre yaar, JSX tag match nahi karte: '<${nameTok.value}>' khula tha, '</${close.value}>' se band kiya.`,
        close,
      );
    }
    this.expect(TokenKind.Gt, ">");
    return { kind: "JsxElement", tagName: nameTok.value, attributes, children, selfClosing: false, span: this.span(lt) };
  }

  /** Parses children until the closing `</`, consuming the `<` and `/`. */
  protected jsxChildren(): JsxChild[] {
    const children: JsxChild[] = [];
    for (;;) {
      const t = this.peek();
      if (t.kind === TokenKind.JsxText) {
        this.next();
        children.push({ kind: "JsxText", value: t.value, span: this.span(t) });
        continue;
      }
      if (t.kind === TokenKind.LBrace) {
        this.next();
        if (this.match(TokenKind.RBrace)) continue; // `{}` / `{/* tabsara */}` — dropped
        const expr = this.expression();
        this.expect(TokenKind.RBrace, "}");
        children.push({ kind: "JsxExprContainer", expr, span: this.span(t) });
        continue;
      }
      if (t.kind === TokenKind.Lt) {
        if (this.tokens[this.i + 1]!.kind === TokenKind.Slash) {
          this.next(); // <
          this.next(); // /
          return children;
        }
        children.push(this.jsxElement());
        continue;
      }
      this.fail("Arre yaar, JSX element band karna bhool gaye — closing tag nahi mila.", t);
    }
  }
}
