// Statement grammar and the public entry point. Expressions come from
// ./expressions.ts, the cursor and type grammar from ./base.ts.
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
import { ExpressionParser } from "./expressions.js";
import type { ParseOptions } from "./base.js";

/** Recursive-descent parser. One token of lookahead, no backtracking. */
export class Parser extends ExpressionParser {
  parseProgram(): Program {
    const body: Stmt[] = [];
    while (!this.at(TokenKind.EOF)) {
      body.push(this.statement());
    }
    return { kind: "Program", body };
  }

  // ---------- token helpers ----------

  protected statement(): Stmt {
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
        const label = this.at(TokenKind.Identifier) ? this.next().value : null;
        this.semicolon();
        return { kind: "BreakStmt", label, span: this.span(t) };
      }
      case TokenKind.Agla: {
        this.next();
        const label = this.at(TokenKind.Identifier) ? this.next().value : null;
        this.semicolon();
        return { kind: "ContinueStmt", label, span: this.span(t) };
      }
      case TokenKind.Chuno:
        return this.switchStmt();
      case TokenKind.Karo:
        return this.doWhileStmt();
      case TokenKind.Identifier: {
        // `naam: <loop>` — a label. (Nothing else starts with `IDENT :`.)
        if (this.tokens[this.i + 1]!.kind === TokenKind.Colon) {
          this.next();
          this.next();
          return { kind: "LabeledStmt", label: t.value, body: this.statement(), span: this.span(t) };
        }
        // Otherwise it is an ordinary expression statement.
        const expr = this.expression();
        this.semicolon();
        return { kind: "ExprStmt", expr, span: this.span(t) };
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
          } while (this.matchListComma(TokenKind.RBrace));
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
        // `bahar naam: T;` — an ambient declaration can carry a type, like
        // everything else in the language. Without one it stays koi.
        const typeAnnotation = this.match(TokenKind.Colon) !== null ? this.typeNode() : null;
        this.semicolon();
        return { kind: "ExternDecl", name: name.value, typeAnnotation, span: this.span(t) };
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

  protected semicolon(): void {
    const t = this.peek();
    if (t.kind !== TokenKind.Semicolon) {
      this.fail("Arre yaar, ';' lagana bhool gaye.", t);
    }
    this.next();
  }

  protected varDecl(exported: boolean): VarDecl {
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

  protected printStmt(): Stmt {
    const kw = this.next();
    const args: Expr[] = [this.expression()];
    while (this.match(TokenKind.Comma)) {
      args.push(this.expression());
    }
    this.semicolon();
    return { kind: "PrintStmt", args, span: this.span(kw) };
  }

  protected ifStmt(): IfStmt {
    const kw = this.expect(TokenKind.Agar, "agar");
    // Parenthesized, as in JS/TS/C#/Java. They are not needed to disambiguate
    // anything (the braces are mandatory), but familiarity wins — and one
    // spelling beats two.
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

  protected whileStmt(): Stmt {
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

  protected block(): BlockStmt {
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

  protected classDecl(exported: boolean): Stmt {
    const kw = this.expect(TokenKind.Jamaat, "jamaat");
    const name = this.expect(TokenKind.Identifier, "jamaat ka naam");
    let parent: string | null = null;
    if (this.match(TokenKind.Waris)) {
      parent = this.expect(TokenKind.Identifier, "waris jamaat ka naam").value;
    }
    this.expect(TokenKind.LBrace, "{");
    const fields: import("../ast.js").ClassField[] = [];
    const methods: import("../ast.js").ClassMethod[] = [];
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

  protected typeAliasDecl(exported: boolean): Stmt {
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

  protected paramList(): Param[] {
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
      } while (this.matchListComma(TokenKind.RParen));
    }
    this.expect(TokenKind.RParen, ")");
    return params;
  }

  protected functionDecl(exported: boolean, exportDefault: boolean): FunctionDecl {
    const kw = this.expect(TokenKind.Kaam, "kaam");
    const name = this.expect(TokenKind.Identifier, "naam");
    const typeParams: string[] = [];
    if (this.at(TokenKind.Lt)) {
      this.next();
      do {
        typeParams.push(this.expect(TokenKind.Identifier, "type parameter").value);
      } while (this.matchListComma(TokenKind.Gt));
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

  /** `chuno (x) { surat a: … bas; warna: … }` — JS switch, fallthrough and all. */
  protected switchStmt(): Stmt {
    const kw = this.expect(TokenKind.Chuno, "chuno");
    this.expect(TokenKind.LParen, "(");
    const discriminant = this.expression();
    this.expect(TokenKind.RParen, ")");
    this.expect(TokenKind.LBrace, "{");
    const cases: import("../ast.js").SwitchCase[] = [];
    let sawDefault = false;
    while (!this.at(TokenKind.RBrace)) {
      if (this.at(TokenKind.EOF)) {
        this.fail("Arre yaar, 'chuno' band karna bhool gaye — '}' nahi mila.", this.peek());
      }
      const caseTok = this.peek();
      let test: Expr | null = null;
      if (this.match(TokenKind.Surat) !== null) {
        test = this.expression();
      } else if (this.match(TokenKind.Warna) !== null) {
        if (sawDefault) this.fail("Arre yaar, 'chuno' mein ek hi 'warna' ho sakta hai.", caseTok);
        sawDefault = true;
      } else {
        this.fail("Arre yaar, 'chuno' ke andar 'surat <value>:' ya 'warna:' aana chahiye.", caseTok);
      }
      this.expect(TokenKind.Colon, ":");
      const body: Stmt[] = [];
      while (!this.at(TokenKind.Surat) && !this.at(TokenKind.Warna) && !this.at(TokenKind.RBrace)) {
        if (this.at(TokenKind.EOF)) {
          this.fail("Arre yaar, 'chuno' band karna bhool gaye — '}' nahi mila.", this.peek());
        }
        body.push(this.statement());
      }
      cases.push({ test, body, span: this.span(caseTok) });
    }
    this.expect(TokenKind.RBrace, "}");
    return { kind: "SwitchStmt", discriminant, cases, span: this.span(kw) };
  }

  /** `karo { … } jab tak (cond);` — the body runs at least once. */
  protected doWhileStmt(): Stmt {
    const kw = this.expect(TokenKind.Karo, "karo");
    const body = this.block();
    if (!this.at(TokenKind.Jab)) {
      this.fail("Arre yaar, 'karo { ... }' ke baad 'jab tak (shart);' aana chahiye.", this.peek());
    }
    this.next();
    if (!this.at(TokenKind.Tak)) {
      this.fail("Arre yaar, 'jab' ke baad 'tak' aana chahiye.", this.peek());
    }
    this.next();
    this.expect(TokenKind.LParen, "(");
    const condition = this.expression();
    this.expect(TokenKind.RParen, ")");
    this.semicolon();
    return { kind: "DoWhileStmt", body, condition, span: this.span(kw) };
  }

  protected forEachStmt(): Stmt {
    const kw = this.next(); // har
    // `har (init; cond; step) { … }` — the C-style loop, told apart from the
    // other two `har` forms by the parenthesis.
    if (this.at(TokenKind.LParen)) {
      this.next();
      const init = this.at(TokenKind.Semicolon) ? null : this.statement(); // consumes its own `;`
      if (init === null) this.next();
      const condition = this.at(TokenKind.Semicolon) ? null : this.expression();
      this.expect(TokenKind.Semicolon, ";");
      const step = this.at(TokenKind.RParen) ? null : this.expression();
      this.expect(TokenKind.RParen, ")");
      const body = this.block();
      return { kind: "ForStmt", init, condition, step, body, span: this.span(kw) };
    }
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

  protected destructureDecl(): Stmt {
    const kw = this.next(); // rakho | pakka
    const mutable = kw.kind === TokenKind.Rakho;
    const open = this.next(); // { or [
    const isObject = open.kind === TokenKind.LBrace;
    const closer = isObject ? TokenKind.RBrace : TokenKind.RBracket;
    const names: string[] = [];
    do {
      names.push(this.expect(TokenKind.Identifier, "naam").value);
    } while (this.matchListComma(closer));
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

  protected tryStmt(): Stmt {
    const kw = this.next(); // koshish
    const block = this.block();
    let catchParam: string | null = null;
    let catchBlock: import("../ast.js").BlockStmt | null = null;
    let finallyBlock: import("../ast.js").BlockStmt | null = null;
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

  protected importStmt(): Stmt {
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
        } while (this.matchListComma(TokenKind.RBrace));
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

}

export function parse(source: string, options?: ParseOptions): Program {
  return new Parser(source, options).parseProgram();
}
