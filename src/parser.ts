import { Token, TokenKind } from "./tokens.js";
import { tokenize } from "./lexer.js";
import { UrSyntaxError } from "./errors.js";
import type {
  Assignment,
  BlockStmt,
  Expr,
  FunctionDecl,
  IfStmt,
  Param,
  Program,
  Span,
  Stmt,
  TypeNode,
  VarDecl,
} from "./ast.js";


/** Recursive-descent parser. One token of lookahead, no backtracking. */
class Parser {
  private readonly tokens: Token[];
  private i = 0;
  /** One entry per function being parsed; flips to true when its body contains `intezar`. */
  private readonly asyncStack: boolean[] = [];

  constructor(source: string) {
    this.tokens = tokenize(source);
  }

  parseProgram(): Program {
    const body: Stmt[] = [];
    while (!this.at(TokenKind.EOF)) {
      body.push(this.statement());
    }
    return { kind: "Program", body };
  }

  // ---------- token helpers ----------

  private peek(): Token {
    return this.tokens[this.i]!;
  }

  private at(kind: TokenKind): boolean {
    return this.tokens[this.i]!.kind === kind;
  }

  private next(): Token {
    return this.tokens[this.i++]!;
  }

  private match(kind: TokenKind): Token | null {
    if (this.at(kind)) return this.next();
    return null;
  }

  private expect(kind: TokenKind, what: string): Token {
    const t = this.peek();
    if (t.kind !== kind) {
      this.fail(`Arre yaar, yahan '${what}' hona chahiye tha, mila '${t.value || "end of file"}'.`, t);
    }
    return this.next();
  }

  private fail(message: string, token: Token): never {
    throw new UrSyntaxError(message, { line: token.line, col: token.col, pos: token.pos });
  }

  private span(t: Token): Span {
    return { line: t.line, col: t.col, pos: t.pos };
  }

  // ---------- statements ----------

  private statement(): Stmt {
    const t = this.peek();
    switch (t.kind) {
      case TokenKind.Rakho:
      case TokenKind.Pakka: {
        const after = this.tokens[this.i + 1]!;
        if (after.kind === TokenKind.LBrace || after.kind === TokenKind.LBracket) {
          return this.destructureDecl();
        }
        return this.varDecl(false);
      }
      case TokenKind.Bolo:
        return this.printStmt();
      case TokenKind.Agar:
        return this.ifStmt();
      case TokenKind.Jab:
        return this.whileStmt();
      case TokenKind.Bas: {
        this.next();
        this.semicolon();
        return { kind: "BreakStmt", span: this.span(t) };
      }
      case TokenKind.Agla: {
        this.next();
        this.semicolon();
        return { kind: "ContinueStmt", span: this.span(t) };
      }
      case TokenKind.Kaam:
        return this.functionDecl(false, false);
      case TokenKind.Wapas: {
        this.next();
        const value = this.at(TokenKind.Semicolon) ? null : this.expression();
        this.semicolon();
        return { kind: "ReturnStmt", value, span: this.span(t) };
      }
      case TokenKind.Bhejo: {
        this.next();
        const inner = this.peek();
        if (inner.kind === TokenKind.Kaam) return this.functionDecl(true, false);
        if (inner.kind === TokenKind.Rakho || inner.kind === TokenKind.Pakka) return this.varDecl(true);
        if (inner.kind === TokenKind.Qisim) return this.typeAliasDecl(true);
        if (inner.kind === TokenKind.Jamaat) return this.classDecl(true);
        if (inner.kind === TokenKind.Asal) {
          this.next();
          if (this.at(TokenKind.Kaam)) return this.functionDecl(false, true);
          const expr = this.expression();
          this.semicolon();
          return { kind: "DefaultExportStmt", expr, span: this.span(t) };
        }
        if (inner.kind === TokenKind.LBrace) {
          // Re-export: bhejo { a, b } "./m.ur" se;
          this.next();
          const names: string[] = [];
          do {
            names.push(this.expect(TokenKind.Identifier, "naam").value);
          } while (this.match(TokenKind.Comma));
          this.expect(TokenKind.RBrace, "}");
          const source = this.expect(TokenKind.String, "module ka path");
          if (!this.at(TokenKind.Se)) {
            this.fail('Arre yaar, re-export aise likhte hain: bhejo { naam } "./module.ur" se;', this.peek());
          }
          this.next();
          this.semicolon();
          return { kind: "ReExportStmt", names, source: source.value, span: this.span(t) };
        }
        this.fail("Arre yaar, 'bhejo' ke baad 'kaam', 'rakho', 'pakka', 'qisim', 'jamaat', 'asal' ya '{' aana chahiye.", inner);
        break;
      }
      case TokenKind.Qisim:
        return this.typeAliasDecl(false);
      case TokenKind.Jamaat:
        return this.classDecl(false);
      case TokenKind.Lao:
        return this.importStmt();
      case TokenKind.Bahar: {
        this.next();
        const name = this.expect(TokenKind.Identifier, "naam");
        this.semicolon();
        return { kind: "ExternDecl", name: name.value, span: this.span(t) };
      }
      case TokenKind.Har:
        return this.forEachStmt();
      case TokenKind.Koshish:
        return this.tryStmt();
      case TokenKind.Phenko: {
        this.next();
        const value = this.expression();
        this.semicolon();
        return { kind: "ThrowStmt", value, span: this.span(t) };
      }
      case TokenKind.LBrace:
        return this.block();
      default: {
        const expr = this.expression();
        this.semicolon();
        return { kind: "ExprStmt", expr, span: this.span(t) };
      }
    }
    // Unreachable, but satisfies control-flow analysis for the Bhejo branch.
    this.fail("Arre yaar, yeh statement samajh nahi aayi.", t);
  }

  private semicolon(): void {
    const t = this.peek();
    if (t.kind !== TokenKind.Semicolon) {
      this.fail("Arre yaar, ';' lagana bhool gaye.", t);
    }
    this.next();
  }

  private varDecl(exported: boolean): VarDecl {
    const kw = this.next(); // rakho | pakka
    const mutable = kw.kind === TokenKind.Rakho;
    const name = this.expect(TokenKind.Identifier, "naam");
    let typeAnnotation: TypeNode | null = null;
    if (this.match(TokenKind.Colon)) {
      typeAnnotation = this.typeNode();
    }
    if (!this.at(TokenKind.Assign)) {
      this.fail(`Arre yaar, '${name.value}' ko koi value to do — '=' ke saath.`, this.peek());
    }
    this.next();
    const init = this.expression();
    this.semicolon();
    return { kind: "VarDecl", mutable, name: name.value, typeAnnotation, init, exported, span: this.span(kw) };
  }

  // Type grammar: union := postfix ('|' postfix)* ; postfix := primary ('[]')* ;
  // primary := '(' union ')' | objectType | literal | named ('<' union (',' union)* '>')?
  private typeNode(): TypeNode {
    const first = this.postfixType();
    if (!this.at(TokenKind.Pipe)) return first;
    const members: TypeNode[] = [first];
    while (this.match(TokenKind.Pipe)) {
      members.push(this.postfixType());
    }
    return { kind: "UnionType", members, span: first.span };
  }

  private postfixType(): TypeNode {
    let node = this.primaryType();
    while (this.at(TokenKind.LBracket)) {
      const open = this.next();
      this.expect(TokenKind.RBracket, "]");
      node = { kind: "ArrayType", element: node, span: this.span(open) };
    }
    return node;
  }

  private primaryType(): TypeNode {
    const t = this.peek();
    switch (t.kind) {
      case TokenKind.LParen: {
        this.next();
        const inner = this.typeNode();
        this.expect(TokenKind.RParen, ")");
        return inner;
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
          } while (this.match(TokenKind.Comma));
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
          } while (this.match(TokenKind.Comma));
          this.expect(TokenKind.Gt, ">");
        }
        return { kind: "NamedType", name: t.value, typeArgs, span: this.span(t) };
      }
      default:
        this.fail("Arre yaar, yahan type hona chahiye (adad, lafz, { ... }, \"literal\", union...).", t);
    }
  }

  private printStmt(): Stmt {
    const kw = this.next();
    const args: Expr[] = [this.expression()];
    while (this.match(TokenKind.Comma)) {
      args.push(this.expression());
    }
    this.semicolon();
    return { kind: "PrintStmt", args, span: this.span(kw) };
  }

  private ifStmt(): IfStmt {
    const kw = this.expect(TokenKind.Agar, "agar");
    this.expect(TokenKind.LParen, "(");
    const condition = this.expression();
    this.expect(TokenKind.RParen, ")");
    const consequent = this.block();
    let alternate: IfStmt | BlockStmt | null = null;
    if (this.match(TokenKind.Warna)) {
      alternate = this.at(TokenKind.Agar) ? this.ifStmt() : this.block();
    }
    return { kind: "IfStmt", condition, consequent, alternate, span: this.span(kw) };
  }

  private whileStmt(): Stmt {
    const kw = this.next(); // jab
    if (!this.at(TokenKind.Tak)) {
      this.fail("Arre yaar, 'jab' ke baad 'tak' aana chahiye — loop 'jab tak' se banta hai.", this.peek());
    }
    this.next();
    this.expect(TokenKind.LParen, "(");
    const condition = this.expression();
    this.expect(TokenKind.RParen, ")");
    const body = this.block();
    return { kind: "WhileStmt", condition, body, span: this.span(kw) };
  }

  private block(): BlockStmt {
    const open = this.expect(TokenKind.LBrace, "{");
    const body: Stmt[] = [];
    while (!this.at(TokenKind.RBrace)) {
      if (this.at(TokenKind.EOF)) {
        this.fail("Arre yaar, block band karna bhool gaye — '}' nahi mila.", this.peek());
      }
      body.push(this.statement());
    }
    const close = this.next();
    return { kind: "BlockStmt", body, span: this.span(open), endLine: close.line };
  }

  private classDecl(exported: boolean): Stmt {
    const kw = this.expect(TokenKind.Jamaat, "jamaat");
    const name = this.expect(TokenKind.Identifier, "jamaat ka naam");
    let parent: string | null = null;
    if (this.match(TokenKind.Waris)) {
      parent = this.expect(TokenKind.Identifier, "waris jamaat ka naam").value;
    }
    this.expect(TokenKind.LBrace, "{");
    const fields: import("./ast.js").ClassField[] = [];
    const methods: import("./ast.js").ClassMethod[] = [];
    while (!this.at(TokenKind.RBrace)) {
      if (this.at(TokenKind.EOF)) {
        this.fail("Arre yaar, jamaat band karna bhool gaye — '}' nahi mila.", this.peek());
      }
      const member = this.expect(TokenKind.Identifier, "field ya method ka naam");
      if (this.at(TokenKind.LParen)) {
        // Method (banao = constructor).
        const params = this.paramList();
        let returnType: TypeNode | null = null;
        if (this.match(TokenKind.Colon)) returnType = this.typeNode();
        this.asyncStack.push(false);
        const body = this.block();
        const isAsync = this.asyncStack.pop()!;
        methods.push({ name: member.value, params, returnType, body, isAsync, span: this.span(member) });
        continue;
      }
      // Field: naam: type [= init];
      this.expect(TokenKind.Colon, ":");
      const typeAnnotation = this.typeNode();
      let init: Expr | null = null;
      if (this.match(TokenKind.Assign)) init = this.expression();
      this.semicolon();
      fields.push({ name: member.value, typeAnnotation, init, span: this.span(member) });
    }
    this.next(); // }
    return { kind: "ClassDecl", name: name.value, parent, fields, methods, exported, span: this.span(kw) };
  }

  private typeAliasDecl(exported: boolean): Stmt {
    const kw = this.expect(TokenKind.Qisim, "qisim");
    const name = this.expect(TokenKind.Identifier, "type ka naam");
    if (!this.at(TokenKind.Assign)) {
      this.fail("Arre yaar, qisim aise likhte hain: qisim Naam = type;", this.peek());
    }
    this.next();
    const type = this.typeNode();
    this.semicolon();
    return { kind: "TypeAliasDecl", name: name.value, type, exported, span: this.span(kw) };
  }

  private paramList(): Param[] {
    this.expect(TokenKind.LParen, "(");
    const params: Param[] = [];
    if (!this.at(TokenKind.RParen)) {
      do {
        const rest = this.match(TokenKind.DotDotDot) !== null;
        const p = this.expect(TokenKind.Identifier, "parameter naam");
        const optional = !rest && this.match(TokenKind.Question) !== null;
        let typeAnnotation: TypeNode | null = null;
        if (this.match(TokenKind.Colon)) typeAnnotation = this.typeNode();
        let defaultValue: Expr | null = null;
        if (this.match(TokenKind.Assign)) {
          if (optional) this.fail("Arre yaar, '?' aur default value dono nahi — default hi kaafi hai.", p);
          if (rest) this.fail("Arre yaar, rest parameter ki default value nahi hoti.", p);
          defaultValue = this.expression();
        }
        params.push({ name: p.value, typeAnnotation, optional, defaultValue, rest, span: this.span(p) });
        if (rest && !this.at(TokenKind.RParen)) {
          this.fail("Arre yaar, rest parameter aakhri hona chahiye.", this.peek());
        }
      } while (this.match(TokenKind.Comma));
    }
    this.expect(TokenKind.RParen, ")");
    return params;
  }

  private functionDecl(exported: boolean, exportDefault: boolean): FunctionDecl {
    const kw = this.expect(TokenKind.Kaam, "kaam");
    const name = this.expect(TokenKind.Identifier, "naam");
    const typeParams: string[] = [];
    if (this.at(TokenKind.Lt)) {
      this.next();
      do {
        typeParams.push(this.expect(TokenKind.Identifier, "type parameter").value);
      } while (this.match(TokenKind.Comma));
      this.expect(TokenKind.Gt, ">");
    }
    const params = this.paramList();
    let returnType: TypeNode | null = null;
    if (this.match(TokenKind.Colon)) returnType = this.typeNode();
    this.asyncStack.push(false);
    const body = this.block();
    const isAsync = this.asyncStack.pop()!;
    return {
      kind: "FunctionDecl",
      name: name.value,
      typeParams,
      params,
      returnType,
      body,
      exported,
      exportDefault,
      isAsync,
      span: this.span(kw),
    };
  }

  private forEachStmt(): Stmt {
    const kw = this.next(); // har
    const name = this.expect(TokenKind.Identifier, "loop variable ka naam");
    const first = this.expression();
    if (this.match(TokenKind.Se)) {
      // Numeric range: har i 1 se 10 tak { ... }
      const to = this.expression();
      if (!this.at(TokenKind.Tak)) {
        this.fail("Arre yaar, range loop aise likhte hain: har i 1 se 10 tak { ... }", this.peek());
      }
      this.next();
      const body = this.block();
      return { kind: "ForRangeStmt", varName: name.value, from: first, to, body, span: this.span(kw) };
    }
    if (!this.at(TokenKind.Mein)) {
      this.fail("Arre yaar, loop aise likhte hain: har cheez list mein { ... }", this.peek());
    }
    this.next();
    const body = this.block();
    return { kind: "ForEachStmt", varName: name.value, iterable: first, body, span: this.span(kw) };
  }

  private destructureDecl(): Stmt {
    const kw = this.next(); // rakho | pakka
    const mutable = kw.kind === TokenKind.Rakho;
    const open = this.next(); // { or [
    const isObject = open.kind === TokenKind.LBrace;
    const closer = isObject ? TokenKind.RBrace : TokenKind.RBracket;
    const names: string[] = [];
    do {
      names.push(this.expect(TokenKind.Identifier, "naam").value);
    } while (this.match(TokenKind.Comma));
    this.expect(closer, isObject ? "}" : "]");
    if (!this.at(TokenKind.Assign)) {
      this.fail("Arre yaar, destructuring mein '=' ke saath value do.", this.peek());
    }
    this.next();
    const init = this.expression();
    this.semicolon();
    return {
      kind: "DestructureDecl",
      mutable,
      pattern: { type: isObject ? "object" : "array", names },
      init,
      span: this.span(kw),
    };
  }

  private tryStmt(): Stmt {
    const kw = this.next(); // koshish
    const block = this.block();
    let catchParam: string | null = null;
    let catchBlock: import("./ast.js").BlockStmt | null = null;
    let finallyBlock: import("./ast.js").BlockStmt | null = null;
    if (this.match(TokenKind.Pakro)) {
      this.expect(TokenKind.LParen, "(");
      catchParam = this.expect(TokenKind.Identifier, "error ka naam").value;
      this.expect(TokenKind.RParen, ")");
      catchBlock = this.block();
    }
    if (this.match(TokenKind.Akhir)) {
      finallyBlock = this.block();
    }
    if (catchBlock === null && finallyBlock === null) {
      this.fail("Arre yaar, 'koshish' ke baad 'pakro (e) { }' ya 'akhir { }' aana chahiye.", this.peek());
    }
    return { kind: "TryStmt", block, catchParam, catchBlock, finallyBlock, span: this.span(kw) };
  }

  private importStmt(): Stmt {
    const kw = this.next(); // lao
    let defaultName: string | null = null;
    let namespaceName: string | null = null;
    const names: string[] = [];
    if (this.match(TokenKind.Sab)) {
      // lao sab math "./math.ur" se;
      namespaceName = this.expect(TokenKind.Identifier, "naam").value;
    } else {
      if (this.match(TokenKind.Asal)) {
        // lao asal config "./config.ur" se;  (optionally followed by , { ... })
        defaultName = this.expect(TokenKind.Identifier, "naam").value;
        if (this.at(TokenKind.Comma)) this.next();
      }
      if (this.at(TokenKind.LBrace)) {
        this.next();
        do {
          names.push(this.expect(TokenKind.Identifier, "naam").value);
        } while (this.match(TokenKind.Comma));
        this.expect(TokenKind.RBrace, "}");
      } else if (defaultName === null) {
        this.fail('Arre yaar, import aise likhte hain: lao { naam } "./module.ur" se;', this.peek());
      }
    }
    const source = this.expect(TokenKind.String, "module ka path");
    if (!this.at(TokenKind.Se)) {
      this.fail('Arre yaar, import aise likhte hain: lao { naam } "./module.ur" se;', this.peek());
    }
    this.next();
    this.semicolon();
    return { kind: "ImportStmt", names, defaultName, namespaceName, source: source.value, span: this.span(kw) };
  }

  // ---------- expressions (precedence climbing) ----------

  private expression(): Expr {
    return this.assignment();
  }

  private assignment(): Expr {
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

  private conditional(): Expr {
    const condition = this.logicalOr();
    if (!this.at(TokenKind.Question)) return condition;
    this.next();
    const consequent = this.assignment();
    this.expect(TokenKind.Colon, ":");
    const alternate = this.assignment(); // right-associative chains
    return { kind: "Conditional", condition, consequent, alternate, span: condition.span };
  }

  private logicalOr(): Expr {
    let left = this.logicalAnd();
    while (this.at(TokenKind.OrOr)) {
      this.next();
      const right = this.logicalAnd();
      left = { kind: "Logical", op: "||", left, right, span: left.span };
    }
    return left;
  }

  private logicalAnd(): Expr {
    let left = this.equality();
    while (this.at(TokenKind.AndAnd)) {
      this.next();
      const right = this.equality();
      left = { kind: "Logical", op: "&&", left, right, span: left.span };
    }
    return left;
  }

  private equality(): Expr {
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

  private comparison(): Expr {
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

  private additive(): Expr {
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

  private multiplicative(): Expr {
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

  private unary(): Expr {
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

  private postfix(): Expr {
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
          } while (this.match(TokenKind.Comma));
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

  private primary(): Expr {
    const t = this.peek();
    switch (t.kind) {
      case TokenKind.Number:
        this.next();
        return { kind: "NumberLiteral", value: Number(t.value), raw: t.value, span: this.span(t) };
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
          } while (this.match(TokenKind.Comma));
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
            } while (this.match(TokenKind.Comma));
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
          } while (this.match(TokenKind.Comma));
        }
        this.expect(TokenKind.RBracket, "]");
        return { kind: "ArrayLiteral", elements, span: this.span(t) };
      }
      case TokenKind.LBrace: {
        this.next();
        const properties: import("./ast.js").ObjectEntry[] = [];
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
            this.expect(TokenKind.Colon, ":");
            const value = this.expression();
            properties.push({ kind: "prop", key, value, span: this.span(keyTok) });
          } while (this.match(TokenKind.Comma));
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
      default:
        this.fail(`Arre yaar, yahan expression hona chahiye tha, mila '${t.value || "end of file"}'.`, t);
    }
  }
}

export function parse(source: string): Program {
  return new Parser(source).parseProgram();
}
