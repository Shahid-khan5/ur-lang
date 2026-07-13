// urlang fmt: canonical formatting for UrLang source. Parses to the AST and
// reprints with a fixed style (2-space indent, K&R braces, double-quoted
// strings), preserving comments and single blank lines between statements.
import { tokenize, Comment } from "./lexer.js";
import { parse } from "./parser.js";
import { cleanJsxText } from "./codegen.js";
import type { BlockStmt, Expr, JsxChild, JsxElement, JsxFragment, Param, Stmt, TypeNode } from "./ast.js";

const PRECEDENCE: Record<string, number> = {
  "||": 1, "&&": 2, "==": 3, "!=": 3, "<": 4, ">": 4, "<=": 4, ">=": 4,
  "+": 5, "-": 5, "*": 6, "/": 6, "%": 6,
};

class Formatter {
  private readonly lines: string[] = [];
  private indentLevel = 0;
  private readonly comments: Comment[];
  private commentIndex = 0;
  private lastSourceLine = 0;

  constructor(source: string, options?: FormatOptions) {
    const jsx = options?.jsx === true;
    this.comments = [];
    tokenize(source, this.comments, { jsx });
    const program = parse(source, { jsx });
    this.statements(program.body, Infinity);
    this.flushComments(Infinity);
  }

  toString(): string {
    // Collapse leading/trailing blank lines; end with exactly one newline.
    while (this.lines[0] === "") this.lines.shift();
    while (this.lines[this.lines.length - 1] === "") this.lines.pop();
    return this.lines.join("\n") + "\n";
  }

  // ---------- line plumbing ----------

  private emit(text: string): void {
    this.lines.push(text === "" ? "" : "  ".repeat(this.indentLevel) + text);
  }

  private blankBetween(stmtLine: number): void {
    if (this.lastSourceLine > 0 && stmtLine - this.lastSourceLine > 1 && this.lines[this.lines.length - 1] !== "") {
      this.emit("");
    }
  }

  /** Emits comments whose source line precedes `beforeLine`. */
  private flushComments(beforeLine: number): void {
    while (this.commentIndex < this.comments.length && this.comments[this.commentIndex]!.line < beforeLine) {
      const c = this.comments[this.commentIndex++]!;
      this.blankBetween(c.line);
      this.emit(c.block ? `/* ${c.text} */` : `// ${c.text}`);
      this.lastSourceLine = c.line;
    }
  }

  /** A comment on exactly this line becomes a trailing comment. */
  private trailingComment(line: number): string {
    if (this.commentIndex < this.comments.length && this.comments[this.commentIndex]!.line === line) {
      const c = this.comments[this.commentIndex++]!;
      return c.block ? ` /* ${c.text} */` : ` // ${c.text}`;
    }
    return "";
  }

  private statements(body: Stmt[], endLine: number): void {
    for (const stmt of body) {
      this.flushComments(stmt.span.line);
      this.blankBetween(stmt.span.line);
      this.stmt(stmt);
    }
    this.flushComments(endLine);
  }

  private line(stmt: Stmt, text: string): void {
    // Trailing comment sits on the statement's *last* source line; for
    // single-line statements that's the span line.
    this.emit(text + this.trailingComment(stmt.span.line));
    this.lastSourceLine = stmt.span.line;
  }

  // ---------- statements ----------

  private stmt(stmt: Stmt): void {
    switch (stmt.kind) {
      case "VarDecl": {
        const kw = stmt.mutable ? "rakho" : "pakka";
        const ann = stmt.typeAnnotation !== null ? `: ${this.type(stmt.typeAnnotation)}` : "";
        const prefix = stmt.exported ? "bhejo " : "";
        this.line(stmt, `${prefix}${kw} ${stmt.name}${ann} = ${this.expr(stmt.init, 0)};`);
        return;
      }
      case "DestructureDecl": {
        const kw = stmt.mutable ? "rakho" : "pakka";
        const open = stmt.pattern.type === "object" ? "{ " : "[";
        const close = stmt.pattern.type === "object" ? " }" : "]";
        this.line(stmt, `${kw} ${open}${stmt.pattern.names.join(", ")}${close} = ${this.expr(stmt.init, 0)};`);
        return;
      }
      case "PrintStmt":
        this.line(stmt, `bolo ${stmt.args.map((a) => this.expr(a, 0)).join(", ")};`);
        return;
      case "IfStmt": {
        let text = `agar (${this.expr(stmt.condition, 0)}) {`;
        this.emit(text);
        this.lastSourceLine = stmt.span.line;
        this.indentLevel++;
        this.statements(stmt.consequent.body, stmt.consequent.endLine ?? Infinity);
        this.indentLevel--;
        let alternate = stmt.alternate;
        let closing = "}";
        while (alternate !== null) {
          if (alternate.kind === "IfStmt") {
            this.emit(`${closing} warna agar (${this.expr(alternate.condition, 0)}) {`);
            this.indentLevel++;
            this.statements(alternate.consequent.body, alternate.consequent.endLine ?? Infinity);
            this.indentLevel--;
            alternate = alternate.alternate;
          } else {
            this.emit(`${closing} warna {`);
            this.indentLevel++;
            this.statements(alternate.body, alternate.endLine ?? Infinity);
            this.indentLevel--;
            alternate = null;
          }
        }
        this.emit(closing);
        return;
      }
      case "WhileStmt":
        this.blockish(stmt, `jab tak (${this.expr(stmt.condition, 0)}) {`, stmt.body);
        return;
      case "ForEachStmt":
        this.blockish(stmt, `har ${stmt.varName} ${this.expr(stmt.iterable, 0)} mein {`, stmt.body);
        return;
      case "ForRangeStmt":
        this.blockish(
          stmt,
          `har ${stmt.varName} ${this.expr(stmt.from, 0)} se ${this.expr(stmt.to, 0)} tak {`,
          stmt.body
        );
        return;
      case "BreakStmt":
        this.line(stmt, "bas;");
        return;
      case "ContinueStmt":
        this.line(stmt, "agla;");
        return;
      case "BlockStmt":
        this.emit("{");
        this.indentLevel++;
        this.statements(stmt.body, stmt.endLine ?? Infinity);
        this.indentLevel--;
        this.emit("}");
        return;
      case "ExprStmt":
        this.line(stmt, `${this.expr(stmt.expr, 0)};`);
        return;
      case "FunctionDecl": {
        const prefix = stmt.exportDefault ? "bhejo asal " : stmt.exported ? "bhejo " : "";
        const tp = stmt.typeParams.length > 0 ? `<${stmt.typeParams.join(", ")}>` : "";
        const ret = stmt.returnType !== null ? `: ${this.type(stmt.returnType)}` : "";
        this.blockish(stmt, `${prefix}kaam ${stmt.name}${tp}(${this.params(stmt.params)})${ret} {`, stmt.body);
        return;
      }
      case "ReturnStmt":
        this.line(stmt, stmt.value === null ? "wapas;" : `wapas ${this.expr(stmt.value, 0)};`);
        return;
      case "ImportStmt": {
        const clauses: string[] = [];
        if (stmt.namespaceName !== null) clauses.push(`sab ${stmt.namespaceName}`);
        if (stmt.defaultName !== null) clauses.push(`asal ${stmt.defaultName}`);
        if (stmt.names.length > 0) clauses.push(`{ ${stmt.names.join(", ")} }`);
        this.line(stmt, `lao ${clauses.join(", ")} ${JSON.stringify(stmt.source)} se;`);
        return;
      }
      case "ReExportStmt":
        this.line(stmt, `bhejo { ${stmt.names.join(", ")} } ${JSON.stringify(stmt.source)} se;`);
        return;
      case "DefaultExportStmt":
        this.line(stmt, `bhejo asal ${this.expr(stmt.expr, 0)};`);
        return;
      case "ExternDecl":
        this.line(stmt, `bahar ${stmt.name};`);
        return;
      case "TypeAliasDecl":
        this.line(stmt, `${stmt.exported ? "bhejo " : ""}qisim ${stmt.name} = ${this.type(stmt.type)};`);
        return;
      case "ThrowStmt":
        this.line(stmt, `phenko ${this.expr(stmt.value, 0)};`);
        return;
      case "TryStmt": {
        this.emit("koshish {");
        this.lastSourceLine = stmt.span.line;
        this.indentLevel++;
        this.statements(stmt.block.body, stmt.block.endLine ?? Infinity);
        this.indentLevel--;
        if (stmt.catchBlock !== null) {
          this.emit(`} pakro (${stmt.catchParam ?? "e"}) {`);
          this.indentLevel++;
          this.statements(stmt.catchBlock.body, stmt.catchBlock.endLine ?? Infinity);
          this.indentLevel--;
        }
        if (stmt.finallyBlock !== null) {
          this.emit("} akhir {");
          this.indentLevel++;
          this.statements(stmt.finallyBlock.body, stmt.finallyBlock.endLine ?? Infinity);
          this.indentLevel--;
        }
        this.emit("}");
        return;
      }
      case "ClassDecl": {
        const prefix = stmt.exported ? "bhejo " : "";
        const parent = stmt.parent !== null ? ` waris ${stmt.parent}` : "";
        this.emit(`${prefix}jamaat ${stmt.name}${parent} {`);
        this.lastSourceLine = stmt.span.line;
        this.indentLevel++;
        for (const f of stmt.fields) {
          this.flushComments(f.span.line);
          const init = f.init !== null ? ` = ${this.expr(f.init, 0)}` : "";
          this.emit(`${f.name}: ${this.type(f.typeAnnotation)}${init};`);
          this.lastSourceLine = f.span.line;
        }
        for (const m of stmt.methods) {
          this.flushComments(m.span.line);
          this.blankBetween(m.span.line);
          const ret = m.returnType !== null ? `: ${this.type(m.returnType)}` : "";
          this.emit(`${m.name}(${this.params(m.params)})${ret} {`);
          this.lastSourceLine = m.span.line;
          this.indentLevel++;
          this.statements(m.body.body, m.body.endLine ?? Infinity);
          this.indentLevel--;
          this.emit("}");
        }
        this.indentLevel--;
        this.emit("}");
        return;
      }
    }
  }

  private blockish(stmt: Stmt, header: string, body: BlockStmt): void {
    this.emit(header);
    this.lastSourceLine = stmt.span.line;
    this.indentLevel++;
    this.statements(body.body, body.endLine ?? Infinity);
    this.indentLevel--;
    this.emit("}");
    if (body.endLine !== undefined) this.lastSourceLine = body.endLine;
  }

  private params(params: Param[]): string {
    return params
      .map((p) => {
        const rest = p.rest ? "..." : "";
        const opt = p.optional ? "?" : "";
        const ann = p.typeAnnotation !== null ? `: ${this.type(p.typeAnnotation)}` : "";
        const def = p.defaultValue !== null ? ` = ${this.expr(p.defaultValue, 0)}` : "";
        return `${rest}${p.name}${opt}${ann}${def}`;
      })
      .join(", ");
  }

  // ---------- types ----------

  private type(node: TypeNode): string {
    switch (node.kind) {
      case "NamedType":
        return node.typeArgs.length > 0
          ? `${node.name}<${node.typeArgs.map((t) => this.type(t)).join(", ")}>`
          : node.name;
      case "ArrayType": {
        const inner = this.type(node.element);
        return node.element.kind === "UnionType" ? `(${inner})[]` : `${inner}[]`;
      }
      case "UnionType":
        return node.members.map((m) => this.type(m)).join(" | ");
      case "LiteralType":
        return typeof node.value === "string" ? JSON.stringify(node.value) : String(node.value);
      case "ObjectType": {
        if (node.props.length === 0) return "{}";
        const props = node.props.map((p) => `${p.key}${p.optional ? "?" : ""}: ${this.type(p.type)}`);
        return `{ ${props.join(", ")} }`;
      }
    }
  }

  // ---------- expressions ----------

  private expr(e: Expr, parentPrecedence: number): string {
    switch (e.kind) {
      case "NumberLiteral":
        return e.raw;
      case "StringLiteral":
        return JSON.stringify(e.value);
      case "BooleanLiteral":
        return e.value ? "sach" : "jhoot";
      case "NullLiteral":
        return "khaali";
      case "Identifier":
        return e.name;
      case "ThisExpr":
        return "yeh";
      case "ArrayLiteral":
        return `[${e.elements.map((el) => this.expr(el, 0)).join(", ")}]`;
      case "ObjectLiteral": {
        if (e.properties.length === 0) return "{}";
        const parts = e.properties.map((p) =>
          p.kind === "spread"
            ? `...${this.expr(p.argument, 0)}`
            : `${/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(p.key) ? p.key : JSON.stringify(p.key)}: ${this.expr(p.value, 0)}`
        );
        return `{ ${parts.join(", ")} }`;
      }
      case "Spread":
        return `...${this.expr(e.argument, 0)}`;
      case "TemplateLiteral": {
        let out = "`";
        for (let i = 0; i < e.quasis.length; i++) {
          out += e.quasis[i]!.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
          if (i < e.expressions.length) out += "${" + this.expr(e.expressions[i]!, 0) + "}";
        }
        return out + "`";
      }
      case "Unary": {
        const inner = `${e.op}${this.expr(e.operand, 7)}`;
        return parentPrecedence > 7 ? `(${inner})` : inner;
      }
      case "Await": {
        const inner = `intezar ${this.expr(e.operand, 7)}`;
        return parentPrecedence > 7 ? `(${inner})` : inner;
      }
      case "Binary":
      case "Logical": {
        const prec = PRECEDENCE[e.op]!;
        const text = `${this.expr(e.left, prec)} ${e.op} ${this.expr(e.right, prec + 1)}`;
        return prec < parentPrecedence ? `(${text})` : text;
      }
      case "Conditional": {
        const text = `${this.expr(e.condition, 1)} ? ${this.expr(e.consequent, 0)} : ${this.expr(e.alternate, 0)}`;
        return parentPrecedence > 0 ? `(${text})` : text;
      }
      case "Assignment": {
        const text = `${this.expr(e.target, 8)} ${e.op} ${this.expr(e.value, 0)}`;
        return parentPrecedence > 0 ? `(${text})` : text;
      }
      case "Call":
        return `${this.expr(e.callee, 8)}(${e.args.map((a) => this.expr(a, 0)).join(", ")})`;
      case "NewExpr":
        return `naya ${e.className}(${e.args.map((a) => this.expr(a, 0)).join(", ")})`;
      case "SuperCall":
        return `buzurg(${e.args.map((a) => this.expr(a, 0)).join(", ")})`;
      case "SuperMember":
        return `buzurg.${e.property}`;
      case "Member":
        return `${this.expr(e.object, 8)}${e.optional ? "?." : "."}${e.property}`;
      case "Index":
        return `${this.expr(e.object, 8)}[${this.expr(e.index, 0)}]`;
      case "FunctionExpr": {
        const ret = e.returnType !== null ? `: ${this.type(e.returnType)}` : "";
        // Function expression bodies format on one line when short, else keep
        // block structure via a nested emit — v1 keeps them inline-compact.
        const bodyStmts = e.body.body.map((s) => this.inlineStmt(s)).join(" ");
        return `kaam (${this.params(e.params)})${ret} { ${bodyStmts} }`.replace("{  }", "{ }");
      }
      case "JsxElement":
      case "JsxFragment":
        return this.jsx(e);
    }
  }

  /** Compact inline JSX; multi-line indentation text collapses (same output after codegen). */
  private jsx(e: JsxElement | JsxFragment): string {
    const children = e.children.map((c) => this.jsxChild(c)).filter((s) => s !== "").join("");
    if (e.kind === "JsxFragment") return `<>${children}</>`;
    const attrs = e.attributes.map((a) =>
      a.kind === "JsxSpreadAttribute"
        ? `{...${this.expr(a.argument, 0)}}`
        : a.value === null
          ? a.name
          : a.value.kind === "StringLiteral"
            ? `${a.name}=${JSON.stringify(a.value.value)}`
            : `${a.name}={${this.expr(a.value, 0)}}`
    );
    const head = [e.tagName, ...attrs].join(" ");
    if (e.selfClosing && e.children.length === 0) return `<${head}/>`;
    return `<${head}>${children}</${e.tagName}>`;
  }

  private jsxChild(c: JsxChild): string {
    if (c.kind === "JsxText") return cleanJsxText(c.value);
    if (c.kind === "JsxExprContainer") return `{${this.expr(c.expr, 0)}}`;
    return this.jsx(c);
  }

  /** Compact single-line rendering for function-expression bodies. */
  private inlineStmt(stmt: Stmt): string {
    const saved = this.lines.length;
    const savedIndent = this.indentLevel;
    this.indentLevel = 0;
    this.stmt(stmt);
    const rendered = this.lines.splice(saved).map((l) => l.trim()).filter((l) => l !== "").join(" ");
    this.indentLevel = savedIndent;
    return rendered;
  }
}

export interface FormatOptions {
  /** Enable JSX (.urx files). */
  jsx?: boolean;
}

/** Formats UrLang source into canonical style. Throws UrSyntaxError on parse errors. */
export function format(source: string, options?: FormatOptions): string {
  return new Formatter(source, options).toString();
}
