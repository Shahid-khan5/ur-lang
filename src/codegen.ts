import type { Expr, Program, Span, Stmt } from "./ast.js";
import { SourceMapBuilder } from "./sourcemap.js";

export interface CodegenOptions {
  /** Rewrite `./x.ur` import specifiers to `./x.js` (used by the CLI's file builds). */
  rewriteUrImports?: boolean;
  sourceMap?: SourceMapBuilder | null;
}

// Operator precedence, used to insert parentheses only where needed.
const PRECEDENCE: Record<string, number> = {
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  "<": 4,
  ">": 4,
  "<=": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6,
};

function exprPrecedence(e: Expr): number {
  switch (e.kind) {
    case "Assignment": return 0;
    case "Logical":
    case "Binary": return PRECEDENCE[e.op]!;
    case "Unary": return 7;
    default: return 8; // literals, identifiers, calls, member/index — atomic
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

  constructor(options: CodegenOptions) {
    this.rewriteUrImports = options.rewriteUrImports ?? false;
    this.map = options.sourceMap ?? null;
  }

  generate(program: Program): string {
    for (const stmt of program.body) this.stmt(stmt);
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
        this.write("break;");
        this.newline();
        return;
      case "ContinueStmt":
        this.indent();
        this.mark(stmt.span);
        this.write("continue;");
        this.newline();
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
        const open = stmt.pattern.type === "object" ? "{ " : "[";
        const close = stmt.pattern.type === "object" ? " }" : "]";
        this.write(`${stmt.mutable ? "let" : "const"} ${open}${stmt.pattern.names.join(", ")}${close} = `);
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

  private rewriteSource(source: string): string {
    if (this.rewriteUrImports && source.endsWith(".ur")) {
      return source.slice(0, -3) + ".js";
    }
    return source;
  }

  private params(params: import("./ast.js").Param[]): void {
    params.forEach((p, i) => {
      if (i > 0) this.write(", ");
      if (p.rest) this.write("...");
      this.write(p.name);
      if (p.defaultValue !== null) {
        this.write(" = ");
        this.expr(p.defaultValue, 0);
      }
    });
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
        const needsParens = parentPrecedence > 7;
        if (needsParens) this.write("(");
        this.write(e.op);
        this.expr(e.operand, 7);
        if (needsParens) this.write(")");
        return;
      }
      case "Binary":
      case "Logical": {
        const prec = PRECEDENCE[e.op]!;
        const needsParens = prec < parentPrecedence;
        if (needsParens) this.write("(");
        this.expr(e.left, prec);
        // khaali means null-or-undefined, so equality with khaali is loose
        // (x == null matches undefined too); everything else is strict.
        const khaaliCompare =
          (e.kind === "Binary" && (e.left.kind === "NullLiteral" || e.right.kind === "NullLiteral"));
        const jsOp =
          e.op === "==" ? (khaaliCompare ? "==" : "===")
          : e.op === "!=" ? (khaaliCompare ? "!=" : "!==")
          : e.op;
        this.write(` ${jsOp} `);
        this.expr(e.right, prec + 1); // left-associative: parenthesize equal-precedence right children
        if (needsParens) this.write(")");
        return;
      }
      case "Assignment": {
        const needsParens = parentPrecedence > 0;
        if (needsParens) this.write("(");
        this.expr(e.target, 8);
        this.write(` ${e.op} `);
        this.expr(e.value, 0);
        if (needsParens) this.write(")");
        return;
      }
      case "Call":
        this.expr(e.callee, 8);
        this.write("(");
        e.args.forEach((arg, i) => {
          if (i > 0) this.write(", ");
          this.expr(arg, 0);
        });
        this.write(")");
        return;
      case "Member":
        this.expr(e.object, 8);
        this.write(`${e.optional ? "?." : "."}${e.property}`);
        return;
      case "Index":
        this.expr(e.object, 8);
        this.write("[");
        this.expr(e.index, 0);
        this.write("]");
        return;
      case "Await": {
        const needsParens = parentPrecedence > 7;
        if (needsParens) this.write("(");
        this.write("await ");
        this.expr(e.operand, 7);
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
    }
  }
}

export function generate(program: Program, options: CodegenOptions = {}): string {
  return new Codegen(options).generate(program);
}
