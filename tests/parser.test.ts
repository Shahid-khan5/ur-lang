import { describe, expect, it } from "vitest";
import { parse } from "../src/parser.js";
import { UrSyntaxError } from "../src/errors.js";
import type {
  Assignment,
  Binary,
  FunctionDecl,
  IfStmt,
  ImportStmt,
  PrintStmt,
  VarDecl,
  WhileStmt,
} from "../src/ast.js";

describe("parser: declarations", () => {
  it("parses rakho (let) declarations", () => {
    const prog = parse("rakho x = 10;");
    const decl = prog.body[0] as VarDecl;
    expect(decl.kind).toBe("VarDecl");
    expect(decl.mutable).toBe(true);
    expect(decl.name).toBe("x");
    expect(decl.init.kind).toBe("NumberLiteral");
  });

  it("parses pakka (const) declarations", () => {
    const decl = parse('pakka naam = "ali";').body[0] as VarDecl;
    expect(decl.mutable).toBe(false);
    expect(decl.init.kind).toBe("StringLiteral");
  });

  it("parses type annotations", () => {
    const decl = parse("rakho x: adad = 5;").body[0] as VarDecl;
    expect(decl.typeAnnotation).toEqual(
      expect.objectContaining({ kind: "NamedType", name: "adad" })
    );
  });

  it("parses array type annotations", () => {
    const decl = parse("rakho xs: adad[] = [1, 2];").body[0] as VarDecl;
    expect(decl.typeAnnotation?.kind).toBe("ArrayType");
  });

  it("requires an initializer", () => {
    expect(() => parse("rakho x;")).toThrow(UrSyntaxError);
  });

  it("requires a semicolon", () => {
    expect(() => parse("rakho x = 1")).toThrow(UrSyntaxError);
  });
});

describe("parser: expressions", () => {
  it("respects arithmetic precedence", () => {
    const stmt = parse("bolo 1 + 2 * 3;").body[0] as PrintStmt;
    const expr = stmt.args[0] as Binary;
    expect(expr.op).toBe("+");
    expect((expr.right as Binary).op).toBe("*");
  });

  it("parses grouping", () => {
    const stmt = parse("bolo (1 + 2) * 3;").body[0] as PrintStmt;
    const expr = stmt.args[0] as Binary;
    expect(expr.op).toBe("*");
    expect((expr.left as Binary).op).toBe("+");
  });

  it("parses logical operators with && binding tighter than ||", () => {
    const stmt = parse("bolo sach || jhoot && sach;").body[0] as PrintStmt;
    const expr = stmt.args[0]!;
    expect(expr.kind).toBe("Logical");
    expect((expr as { op: string }).op).toBe("||");
  });

  it("parses unary operators", () => {
    const stmt = parse("bolo -x + !y;").body[0] as PrintStmt;
    expect(stmt.args[0]!.kind).toBe("Binary");
  });

  it("parses calls, member access, and indexing chains", () => {
    const prog = parse("bolo Math.floor(xs[0]);");
    const call = (prog.body[0] as PrintStmt).args[0]!;
    expect(call.kind).toBe("Call");
  });

  it("parses array and object literals", () => {
    const decl = parse('rakho p = { naam: "ali", umar: 20, "city": "khi" };').body[0] as VarDecl;
    expect(decl.init.kind).toBe("ObjectLiteral");
    const arr = parse("rakho xs = [1, 2, 3];").body[0] as VarDecl;
    expect(arr.init.kind).toBe("ArrayLiteral");
  });

  it("parses compound assignments as statements", () => {
    const prog = parse("x += 1;");
    expect(prog.body[0]!.kind).toBe("ExprStmt");
    const assign = (prog.body[0] as { expr: Assignment }).expr;
    expect(assign.kind).toBe("Assignment");
    expect(assign.op).toBe("+=");
  });

  it("rejects assignment to non-assignable targets", () => {
    expect(() => parse("1 = 2;")).toThrow(UrSyntaxError);
  });
});

describe("parser: control flow", () => {
  it("parses agar / warna agar / warna chains", () => {
    const src = `
      agar (a < 10) { bolo 1; }
      warna agar (a < 20) { bolo 2; }
      warna { bolo 3; }
    `;
    const stmt = parse(src).body[0] as IfStmt;
    expect(stmt.kind).toBe("IfStmt");
    expect(stmt.alternate?.kind).toBe("IfStmt");
    expect((stmt.alternate as IfStmt).alternate?.kind).toBe("BlockStmt");
  });

  it("parses jab tak (while) with bas/agla", () => {
    const src = `
      jab tak (a < 10) {
        agar (a == 5) { agla; }
        agar (a == 8) { bas; }
        a += 1;
      }
    `;
    const stmt = parse(src).body[0] as WhileStmt;
    expect(stmt.kind).toBe("WhileStmt");
  });

  it("requires 'tak' after 'jab'", () => {
    expect(() => parse("jab (a < 10) {}")).toThrow(UrSyntaxError);
  });
});

describe("parser: functions and modules", () => {
  it("parses function declarations with typed params and return type", () => {
    const fn = parse("kaam add(a: adad, b: adad): adad { wapas a + b; }").body[0] as FunctionDecl;
    expect(fn.kind).toBe("FunctionDecl");
    expect(fn.params).toHaveLength(2);
    expect(fn.returnType).toEqual(expect.objectContaining({ name: "adad" }));
  });

  it("parses bare wapas (return with no value)", () => {
    const fn = parse("kaam f() { wapas; }").body[0] as FunctionDecl;
    expect(fn.body.body[0]!.kind).toBe("ReturnStmt");
  });

  it("parses bhejo (export) on functions and variables", () => {
    const fn = parse("bhejo kaam add(a, b) { wapas a + b; }").body[0] as FunctionDecl;
    expect(fn.exported).toBe(true);
    const decl = parse("bhejo pakka PI = 3.14;").body[0] as VarDecl;
    expect(decl.exported).toBe(true);
  });

  it("parses lao ... se (import)", () => {
    const stmt = parse('lao { add, sub } "./math.ur" se;').body[0] as ImportStmt;
    expect(stmt.kind).toBe("ImportStmt");
    expect(stmt.names).toEqual(["add", "sub"]);
    expect(stmt.source).toBe("./math.ur");
  });

  it("parses bahar (extern) declarations", () => {
    const stmt = parse("bahar fetch;").body[0]!;
    expect(stmt.kind).toBe("ExternDecl");
  });
});

describe("parser: errors", () => {
  it("reports missing closing brace with location", () => {
    try {
      parse("agar (a) { bolo 1;");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(UrSyntaxError);
      expect((e as UrSyntaxError).message).toMatch(/}/);
    }
  });

  it("reports helpful message for missing semicolon", () => {
    try {
      parse("bolo 1\nbolo 2;");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect((e as UrSyntaxError).message).toMatch(/;/);
    }
  });
});
