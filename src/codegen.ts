import type { Expr, JsxElement, JsxFragment, Pattern, Program, Span, Stmt } from "./ast.js";
import { SourceMapBuilder } from "./sourcemap.js";
import { cleanJsxText, isIntrinsicTag } from "./jsx.js";

export interface CodegenOptions {
  /** Rewrite `./x.ur` import specifiers to `./x.js` (used by the CLI's file builds). */
  rewriteUrImports?: boolean;
  sourceMap?: SourceMapBuilder | null;
  /** Package whose `<source>/jsx-runtime` provides jsx/jsxs/Fragment. Default: "react". */
  jsxImportSource?: string;
}

// Operator precedence, used to insert parentheses only where needed.
// JS's binding order. `??` shares ||'s tier but may not be mixed with it
// unparenthesized — logicalOperand() handles that.
const PRECEDENCE: Record<string, number> = {
  "??": 1,
  "||": 1,
  "&&": 2,
  "|": 3,
  "^": 4,
  "&": 5,
  "==": 6,
  "!=": 6,
  "<": 7,
  ">": 7,
  "<=": 7,
  ">=": 7,
  hai: 7, // instanceof
  andar: 7, // in
  "<<": 8,
  ">>": 8,
  ">>>": 8,
  "+": 9,
  "-": 9,
  "*": 10,
  "/": 10,
  "%": 10,
  "**": 11,
};

/** JS spellings for the operators UrLang names in Urdu. */
const JS_OPERATOR: Record<string, string> = {
  hai: "instanceof",
  andar: "in",
  noeyat: "typeof",
};

const UNARY_PRECEDENCE = 12;
const ATOM_PRECEDENCE = 13;

function exprPrecedence(e: Expr): number {
  switch (e.kind) {
    case "Assignment": return 0;
    case "Logical":
    case "Binary": return PRECEDENCE[e.op]!;
    case "Unary": return UNARY_PRECEDENCE;
    default: return ATOM_PRECEDENCE; // literals, identifiers, calls, member/index
  }
}

/**
 * Emits readable JavaScript from a checked AST. Pure string building — the
 * output buffer is an array of chunks joined once at the end.
 */
class Codegen {
  private readonly out: string[] = [];
  private indentLevel = 0;
  private genLine = 0;
  private genCol = 0;
  private readonly rewriteUrImports: boolean;
  private readonly map: SourceMapBuilder | null;
  private readonly jsxImportSource: string;
  private usedJsx = false;
  private usedJsxs = false;
  private usedFragment = false;

  constructor(options: CodegenOptions) {
    this.rewriteUrImports = options.rewriteUrImports ?? false;
    this.map = options.sourceMap ?? null;
    this.jsxImportSource = options.jsxImportSource ?? "react";
  }

  generate(program: Program): string {
    for (const stmt of program.body) this.stmt(stmt);
    // Appended (not prepended) so earlier source-map positions stay valid;
    // ES import declarations are hoisted, so placement is immaterial.
    if (this.usedJsx || this.usedJsxs || this.usedFragment) {
      const names: string[] = [];
      if (this.usedJsx) names.push("jsx as _jsx");
      if (this.usedJsxs) names.push("jsxs as _jsxs");
      if (this.usedFragment) names.push("Fragment as _Fragment");
      this.out.push(`import { ${names.join(", ")} } from ${JSON.stringify(this.jsxImportSource + "/jsx-runtime")};\n`);
    }
    return this.out.join("");
  }

  // ---------- emit helpers ----------

  private write(text: string): void {
    this.out.push(text);
    // Track output position for source maps. Emitted chunks never contain
    // newlines except via newline(), but string literals could — scan cheaply.
    let nl = -1;
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) === 10) nl = i;
    }
    if (nl === -1) {
      this.genCol += text.length;
    } else {
      for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) this.genLine++;
      this.genCol = text.length - nl - 1;
    }
  }

  private newline(): void {
    this.out.push("\n");
    this.genLine++;
    this.genCol = 0;
  }

  private indent(): void {
    this.write("  ".repeat(this.indentLevel));
  }

  private mark(span: Span): void {
    this.map?.addMapping(this.genLine, this.genCol, span.line - 1, span.col - 1);
  }

  // ---------- statements ----------

  private stmt(stmt: Stmt): void {
    switch (stmt.kind) {
      case "VarDecl":
        this.indent();
        this.mark(stmt.span);
        this.write(`${stmt.exported ? "export " : ""}${stmt.mutable ? "let" : "const"} ${stmt.name} = `);
        this.expr(stmt.init, 0);
        this.write(";");
        this.newline();
        return;
      case "PrintStmt":
        this.indent();
        this.mark(stmt.span);
        this.write("console.log(");
        stmt.args.forEach((arg, i) => {
          if (i > 0) this.write(", ");
          this.expr(arg, 0);
        });
        this.write(");");
        this.newline();
        return;
      case "IfStmt": {
        this.indent();
        this.emitIf(stmt);
        return;
      }
      case "WhileStmt":
        this.indent();
        this.mark(stmt.span);
        this.write("while (");
        this.expr(stmt.condition, 0);
        this.write(") {");
        this.newline();
        this.body(stmt.body.body);
        this.indent();
        this.write("}");
        this.newline();
        return;
      case "BreakStmt":
        this.indent();
        this.mark(stmt.span);
        this.write(stmt.label === null ? "break;" : `break ${stmt.label};`);
        this.newline();
        return;
      case "ContinueStmt":
        this.indent();
        this.mark(stmt.span);
        this.write(stmt.label === null ? "continue;" : `continue ${stmt.label};`);
        this.newline();
        return;
      case "DoWhileStmt":
        this.indent();
        this.mark(stmt.span);
        this.write("do {");
        this.newline();
        this.body(stmt.body.body);
        this.indent();
        this.write("} while (");
        this.expr(stmt.condition, 0);
        this.write(");");
        this.newline();
        return;
      case "ForStmt": {
        this.indent();
        this.mark(stmt.span);
        this.write("for (");
        if (stmt.init !== null) {
          // The init is a statement (`rakho i = 0;`); emit it inline, without
          // its indentation or trailing newline.
          this.write(this.inlineStmt(stmt.init));
        } else {
          this.write(";");
        }
        this.write(" ");
        if (stmt.condition !== null) this.expr(stmt.condition, 0);
        this.write("; ");
        if (stmt.step !== null) this.expr(stmt.step, 0);
        this.write(") {");
        this.newline();
        this.body(stmt.body.body);
        this.indent();
        this.write("}");
        this.newline();
        return;
      }
      case "SwitchStmt": {
        this.indent();
        this.mark(stmt.span);
        this.write("switch (");
        this.expr(stmt.discriminant, 0);
        this.write(") {");
        this.newline();
        this.indentLevel++;
        for (const c of stmt.cases) {
          this.indent();
          if (c.test === null) {
            this.write("default:");
          } else {
            this.write("case ");
            this.expr(c.test, 0);
            this.write(":");
          }
          this.newline();
          this.body(c.body);
        }
        this.indentLevel--;
        this.indent();
        this.write("}");
        this.newline();
        return;
      }
      case "LabeledStmt":
        this.indent();
        this.mark(stmt.span);
        this.write(`${stmt.label}:`);
        this.newline();
        this.stmt(stmt.body);
        return;
      case "BlockStmt":
        this.indent();
        this.write("{");
        this.newline();
        this.body(stmt.body);
        this.indent();
        this.write("}");
        this.newline();
        return;
      case "ExprStmt":
        this.indent();
        this.mark(stmt.span);
        this.expr(stmt.expr, 0);
        this.write(";");
        this.newline();
        return;
      case "FunctionDecl": {
        this.indent();
        this.mark(stmt.span);
        const prefix = stmt.exportDefault ? "export default " : stmt.exported ? "export " : "";
        this.write(`${prefix}${stmt.isAsync ? "async " : ""}function ${stmt.name}(`);
        this.params(stmt.params);
        this.write(") {");
        this.newline();
        this.body(stmt.body.body);
        this.indent();
        this.write("}");
        this.newline();
        return;
      }
      case "ReturnStmt":
        this.indent();
        this.mark(stmt.span);
        if (stmt.value === null) {
          this.write("return;");
        } else {
          this.write("return ");
          this.expr(stmt.value, 0);
          this.write(";");
        }
        this.newline();
        return;
      case "ImportStmt": {
        this.indent();
        this.mark(stmt.span);
        const source = this.rewriteSource(stmt.source);
        if (stmt.namespaceName !== null) {
          this.write(`import * as ${stmt.namespaceName} from ${JSON.stringify(source)};`);
        } else {
          const clauses: string[] = [];
          if (stmt.defaultName !== null) clauses.push(stmt.defaultName);
          if (stmt.names.length > 0) clauses.push(`{ ${stmt.names.join(", ")} }`);
          this.write(`import ${clauses.join(", ")} from ${JSON.stringify(source)};`);
        }
        this.newline();
        return;
      }
      case "DefaultExportStmt":
        this.indent();
        this.mark(stmt.span);
        this.write("export default ");
        this.expr(stmt.expr, 0);
        this.write(";");
        this.newline();
        return;
      case "ReExportStmt":
        this.indent();
        this.mark(stmt.span);
        this.write(`export { ${stmt.names.join(", ")} } from ${JSON.stringify(this.rewriteSource(stmt.source))};`);
        this.newline();
        return;
      case "DestructureDecl": {
        this.indent();
        this.mark(stmt.span);
        this.write(`${stmt.mutable ? "let" : "const"} `);
        this.pattern(stmt.pattern);
        this.write(" = ");
        this.expr(stmt.init, 0);
        this.write(";");
        this.newline();
        return;
      }
      case "ClassDecl": {
        this.indent();
        this.mark(stmt.span);
        this.write(`${stmt.exported ? "export " : ""}class ${stmt.name}`);
        if (stmt.parent !== null) this.write(` extends ${stmt.parent}`);
        this.write(" {");
        this.newline();
        this.indentLevel++;
        for (const f of stmt.fields) {
          this.indent();
          this.mark(f.span);
          this.write(f.name);
          if (f.init !== null) {
            this.write(" = ");
            this.expr(f.init, 0);
          }
          this.write(";");
          this.newline();
        }
        for (const m of stmt.methods) {
          this.indent();
          this.mark(m.span);
          if (m.name === "banao") {
            this.write("constructor(");
          } else {
            this.write(`${m.isAsync ? "async " : ""}${m.name}(`);
          }
          this.params(m.params);
          this.write(") {");
          this.newline();
          this.body(m.body.body);
          this.indent();
          this.write("}");
          this.newline();
        }
        this.indentLevel--;
        this.indent();
        this.write("}");
        this.newline();
        return;
      }
      case "ForRangeStmt": {
        this.indent();
        this.mark(stmt.span);
        const v = stmt.varName;
        this.write(`for (let ${v} = `);
        this.expr(stmt.from, 0);
        this.write(`; ${v} <= `);
        this.expr(stmt.to, 0);
        this.write(`; ${v}++) {`);
        this.newline();
        this.body(stmt.body.body);
        this.indent();
        this.write("}");
        this.newline();
        return;
      }
      case "ExternDecl":
      case "TypeAliasDecl":
        // Purely checker-level declarations; nothing to emit (types are erased).
        return;
      case "ForEachStmt":
        this.indent();
        this.mark(stmt.span);
        this.write(`for (const ${stmt.varName} of `);
        if (stmt.iterMode === "keys") this.write("Object.keys(");
        this.expr(stmt.iterable, 0);
        if (stmt.iterMode === "keys") this.write(")");
        this.write(") {");
        this.newline();
        this.body(stmt.body.body);
        this.indent();
        this.write("}");
        this.newline();
        return;
      case "TryStmt":
        this.indent();
        this.mark(stmt.span);
        this.write("try {");
        this.newline();
        this.body(stmt.block.body);
        this.indent();
        this.write("}");
        if (stmt.catchBlock !== null) {
          this.write(` catch (${stmt.catchParam ?? "_e"}) {`);
          this.newline();
          this.body(stmt.catchBlock.body);
          this.indent();
          this.write("}");
        }
        if (stmt.finallyBlock !== null) {
          this.write(" finally {");
          this.newline();
          this.body(stmt.finallyBlock.body);
          this.indent();
          this.write("}");
        }
        this.newline();
        return;
      case "ThrowStmt":
        this.indent();
        this.mark(stmt.span);
        this.write("throw ");
        this.expr(stmt.value, 0);
        this.write(";");
        this.newline();
        return;
    }
  }

  private emitIf(stmt: Extract<Stmt, { kind: "IfStmt" }>): void {
    this.mark(stmt.span);
    this.write("if (");
    this.expr(stmt.condition, 0);
    this.write(") {");
    this.newline();
    this.body(stmt.consequent.body);
    this.indent();
    this.write("}");
    if (stmt.alternate !== null) {
      this.write(" else ");
      if (stmt.alternate.kind === "IfStmt") {
        this.emitIf(stmt.alternate);
        return;
      }
      this.write("{");
      this.newline();
      this.body(stmt.alternate.body);
      this.indent();
      this.write("}");
    }
    this.newline();
  }

  private body(stmts: Stmt[]): void {
    this.indentLevel++;
    for (const s of stmts) this.stmt(s);
    this.indentLevel--;
  }

  /** Renders a statement on one line — for a `for (…;…;…)` header. */
  private inlineStmt(stmt: Stmt): string {
    const savedOut = this.out.length;
    const savedIndent = this.indentLevel;
    this.indentLevel = 0;
    this.stmt(stmt);
    const rendered = this.out.splice(savedOut).join("").trim();
    this.indentLevel = savedIndent;
    return rendered;
  }

  private rewriteSource(source: string): string {
    if (this.rewriteUrImports && (source.endsWith(".ur") || source.endsWith(".urx"))) {
      return source.replace(/\.urx?$/, ".js");
    }
    return source;
  }

  private params(params: import("./ast.js").Param[]): void {
    params.forEach((p, i) => {
      if (i > 0) this.write(", ");
      if (p.rest) this.write("...");
      if (p.pattern !== null) this.pattern(p.pattern);
      else this.write(p.name);
      if (p.defaultValue !== null) {
        this.write(" = ");
        this.expr(p.defaultValue, 0);
      }
    });
  }

  /** Destructuring patterns emit as themselves — JS has the same syntax. */
  private pattern(p: Pattern): void {
    if (p.kind === "IdentPattern") {
      this.write(p.name);
      return;
    }
    if (p.kind === "ObjectPattern") {
      this.write("{ ");
      p.props.forEach((prop, i) => {
        if (i > 0) this.write(", ");
        // `{ naam }` when the binding keeps the key's name, else `{ key: <pattern> }`.
        if (prop.value.kind === "IdentPattern" && prop.value.name === prop.key) {
          this.write(prop.key);
        } else {
          this.write(`${prop.key}: `);
          this.pattern(prop.value);
        }
        if (prop.defaultValue !== null) {
          this.write(" = ");
          this.expr(prop.defaultValue, 0);
        }
      });
      if (p.rest !== null) {
        if (p.props.length > 0) this.write(", ");
        this.write(`...${p.rest}`);
      }
      this.write(" }");
      return;
    }
    this.write("[");
    p.elements.forEach((el, i) => {
      if (i > 0) this.write(", ");
      this.pattern(el.value);
      if (el.defaultValue !== null) {
        this.write(" = ");
        this.expr(el.defaultValue, 0);
      }
    });
    if (p.rest !== null) {
      if (p.elements.length > 0) this.write(", ");
      this.write(`...${p.rest}`);
    }
    this.write("]");
  }

  // ---------- expressions ----------

  private expr(e: Expr, parentPrecedence: number): void {
    switch (e.kind) {
      case "NumberLiteral":
        this.write(e.raw);
        return;
      case "StringLiteral":
        this.write(JSON.stringify(e.value));
        return;
      case "BooleanLiteral":
        this.write(e.value ? "true" : "false");
        return;
      case "NullLiteral":
        this.write("null");
        return;
      case "Identifier":
        this.write(e.name);
        return;
      case "ArrayLiteral":
        this.write("[");
        e.elements.forEach((el, i) => {
          if (i > 0) this.write(", ");
          this.expr(el, 0);
        });
        this.write("]");
        return;
      case "ObjectLiteral":
        if (e.properties.length === 0) {
          this.write("{}");
          return;
        }
        this.write("{ ");
        e.properties.forEach((p, i) => {
          if (i > 0) this.write(", ");
          if (p.kind === "spread") {
            this.write("...");
            this.expr(p.argument, 0);
            return;
          }
          if (p.kind === "computed") {
            this.write("[");
            this.expr(p.key, 0);
            this.write("]: ");
            this.expr(p.value, 0);
            return;
          }
          this.write(/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(p.key) ? p.key : JSON.stringify(p.key));
          this.write(": ");
          this.expr(p.value, 0);
        });
        this.write(" }");
        return;
      case "Spread":
        this.write("...");
        this.expr(e.argument, 0);
        return;
      case "Conditional": {
        const needsParens = parentPrecedence > 0;
        if (needsParens) this.write("(");
        this.expr(e.condition, 1);
        this.write(" ? ");
        this.expr(e.consequent, 0);
        this.write(" : ");
        this.expr(e.alternate, 0);
        if (needsParens) this.write(")");
        return;
      }
      case "TemplateLiteral": {
        this.write("`");
        for (let i = 0; i < e.quasis.length; i++) {
          this.write(
            e.quasis[i]!
              .replace(/\\/g, "\\\\")
              .replace(/`/g, "\\`")
              .replace(/\$\{/g, "\\${")
              .replace(/\r/g, "\\r")
              .replace(/\n/g, "\\n")
          );
          if (i < e.expressions.length) {
            this.write("${");
            this.expr(e.expressions[i]!, 0);
            this.write("}");
          }
        }
        this.write("`");
        return;
      }
      case "Unary": {
        const needsParens = parentPrecedence > UNARY_PRECEDENCE;
        if (needsParens) this.write("(");
        // `noeyat x` → `typeof x` needs the space; `-x` / `!x` / `~x` do not.
        const op = JS_OPERATOR[e.op] ?? e.op;
        this.write(op.length > 1 ? `${op} ` : op);
        this.expr(e.operand, UNARY_PRECEDENCE);
        if (needsParens) this.write(")");
        return;
      }
      case "Update": {
        const needsParens = parentPrecedence > UNARY_PRECEDENCE;
        if (needsParens) this.write("(");
        if (e.prefix) this.write(e.op);
        this.expr(e.target, ATOM_PRECEDENCE);
        if (!e.prefix) this.write(e.op);
        if (needsParens) this.write(")");
        return;
      }
      case "DeleteExpr": {
        const needsParens = parentPrecedence > UNARY_PRECEDENCE;
        if (needsParens) this.write("(");
        this.write("delete ");
        this.expr(e.target, UNARY_PRECEDENCE);
        if (needsParens) this.write(")");
        return;
      }
      case "RegexLiteral":
        this.write(e.raw);
        return;
      case "Binary":
      case "Logical": {
        const prec = PRECEDENCE[e.op]!;
        const needsParens = prec < parentPrecedence;
        if (needsParens) this.write("(");
        // `**` is right-associative: the *left* child of equal precedence needs
        // the parens, the right one does not.
        const rightAssoc = e.kind === "Binary" && e.op === "**";
        this.logicalOperand(e.left, e.op, rightAssoc ? prec + 1 : prec);
        // khaali means null-or-undefined, so equality with khaali is loose
        // (x == null matches undefined too); everything else is strict.
        const khaaliCompare =
          (e.kind === "Binary" && (e.left.kind === "NullLiteral" || e.right.kind === "NullLiteral"));
        const jsOp =
          e.op === "==" ? (khaaliCompare ? "==" : "===")
          : e.op === "!=" ? (khaaliCompare ? "!=" : "!==")
          : JS_OPERATOR[e.op] ?? e.op;
        this.write(` ${jsOp} `);
        // left-associative: parenthesize equal-precedence right children
        this.logicalOperand(e.right, e.op, rightAssoc ? prec : prec + 1);
        if (needsParens) this.write(")");
        return;
      }
      case "Assignment": {
        const needsParens = parentPrecedence > 0;
        if (needsParens) this.write("(");
        this.expr(e.target, ATOM_PRECEDENCE);
        this.write(` ${e.op} `);
        this.expr(e.value, 0);
        if (needsParens) this.write(")");
        return;
      }
      case "Call":
        this.expr(e.callee, ATOM_PRECEDENCE);
        this.write(e.optional ? "?.(" : "(");
        e.args.forEach((arg, i) => {
          if (i > 0) this.write(", ");
          this.expr(arg, 0);
        });
        this.write(")");
        return;
      case "Member":
        this.expr(e.object, ATOM_PRECEDENCE);
        this.write(`${e.optional ? "?." : "."}${e.property}`);
        return;
      case "Index":
        this.expr(e.object, ATOM_PRECEDENCE);
        this.write(e.optional ? "?.[" : "[");
        this.expr(e.index, 0);
        this.write("]");
        return;
      case "Await": {
        const needsParens = parentPrecedence > UNARY_PRECEDENCE;
        if (needsParens) this.write("(");
        this.write("await ");
        this.expr(e.operand, UNARY_PRECEDENCE);
        if (needsParens) this.write(")");
        return;
      }
      case "FunctionExpr":
        // Arrow functions keep `yeh` (this) lexical inside jamaat methods.
        this.write(`(${e.isAsync ? "async " : ""}(`);
        this.params(e.params);
        this.write(") => {");
        this.newline();
        this.body(e.body.body);
        this.indent();
        this.write("})");
        return;
      case "ThisExpr":
        this.write("this");
        return;
      case "NewExpr":
        this.write(`new ${e.className}(`);
        e.args.forEach((arg, i) => {
          if (i > 0) this.write(", ");
          this.expr(arg, 0);
        });
        this.write(")");
        return;
      case "SuperCall":
        this.write("super(");
        e.args.forEach((arg, i) => {
          if (i > 0) this.write(", ");
          this.expr(arg, 0);
        });
        this.write(")");
        return;
      case "SuperMember":
        this.write(`super.${e.property}`);
        return;
      case "JsxElement":
      case "JsxFragment":
        this.jsx(e);
        return;
    }
  }

  /**
   * Emits one side of a binary/logical operator. JS rejects `??` mixed with
   * `&&`/`||` without parentheses (`a ?? b || c` is a SyntaxError), so an
   * operand that mixes the two families is always parenthesized — our grammar
   * gives them a defined precedence, and the parens preserve exactly that.
   */
  private logicalOperand(operand: Expr, parentOp: string, precedence: number): void {
    const isNullish = operand.kind === "Logical" && operand.op === "??";
    const isAndOr = operand.kind === "Logical" && operand.op !== "??";
    const mixes = parentOp === "??" ? isAndOr : (parentOp === "&&" || parentOp === "||") && isNullish;
    if (mixes) {
      this.write("(");
      this.expr(operand, 0);
      this.write(")");
      return;
    }
    this.expr(operand, precedence);
  }

  // ---------- JSX ----------

  /**
   * Emits the standard automatic-runtime call: `_jsx(tag, props)` /
   * `_jsxs(tag, { ...props, children: [...] })`, with `key` as the third
   * argument — exactly what TSX emits, so any jsx-runtime works.
   */
  private jsx(e: JsxElement | JsxFragment): void {
    this.mark(e.span);

    const children: (() => void)[] = [];
    for (const child of e.children) {
      if (child.kind === "JsxText") {
        const text = cleanJsxText(child.value);
        if (text !== "") children.push(() => this.write(JSON.stringify(text)));
      } else if (child.kind === "JsxExprContainer") {
        children.push(() => this.expr(child.expr, 0));
      } else {
        children.push(() => this.jsx(child));
      }
    }

    const attrs = e.kind === "JsxElement" ? e.attributes : [];
    let keyValue: Expr | null = null;
    const props: (() => void)[] = [];
    for (const attr of attrs) {
      if (attr.kind === "JsxSpreadAttribute") {
        props.push(() => {
          this.write("...");
          this.expr(attr.argument, 8);
        });
        continue;
      }
      if (attr.name === "key" && attr.value !== null) {
        keyValue = attr.value;
        continue;
      }
      // Element children win over a `children` attribute (as in JSX), so don't
      // emit both and leave a duplicate key in the props object.
      if (attr.name === "children" && children.length > 0) continue;
      props.push(() => {
        this.write(/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(attr.name) ? attr.name : JSON.stringify(attr.name));
        this.write(": ");
        if (attr.value === null) this.write("true");
        else this.expr(attr.value, 0);
      });
    }

    if (children.length === 1) {
      props.push(() => {
        this.write("children: ");
        children[0]!();
      });
    } else if (children.length > 1) {
      props.push(() => {
        this.write("children: [");
        children.forEach((emit, i) => {
          if (i > 0) this.write(", ");
          emit();
        });
        this.write("]");
      });
    }

    const fn = children.length > 1 ? "_jsxs" : "_jsx";
    if (fn === "_jsxs") this.usedJsxs = true;
    else this.usedJsx = true;
    if (e.kind === "JsxFragment") this.usedFragment = true;

    const tag =
      e.kind === "JsxFragment"
        ? "_Fragment"
        : isIntrinsicTag(e.tagName)
          ? JSON.stringify(e.tagName)
          : e.tagName; // component: an identifier or a dotted member expression
    this.write(`${fn}(${tag}, `);
    if (props.length === 0) {
      this.write("{}");
    } else {
      this.write("{ ");
      props.forEach((emit, i) => {
        if (i > 0) this.write(", ");
        emit();
      });
      this.write(" }");
    }
    if (keyValue !== null) {
      this.write(", ");
      this.expr(keyValue, 0);
    }
    this.write(")");
  }
}

export function generate(program: Program, options: CodegenOptions = {}): string {
  return new Codegen(options).generate(program);
}
