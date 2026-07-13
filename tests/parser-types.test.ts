// Parser tests for the Phase-1 type grammar: object types, unions, literal
// types, qisim aliases, generics, Wada<T>.
import { describe, expect, it } from "vitest";
import { parse } from "../src/parser.js";
import { UrSyntaxError } from "../src/errors.js";
import type { FunctionDecl, TypeAliasDecl, TypeNode, VarDecl } from "../src/ast.js";

function typeOf(src: string): TypeNode {
  const decl = parse(src).body[0] as VarDecl;
  return decl.typeAnnotation!;
}

describe("parser: object type annotations", () => {
  it("parses inline object types", () => {
    const t = typeOf('rakho s: { naam: lafz, umar: adad } = { naam: "a", umar: 1 };');
    expect(t.kind).toBe("ObjectType");
    const obj = t as Extract<TypeNode, { kind: "ObjectType" }>;
    expect(obj.props.map((p) => p.key)).toEqual(["naam", "umar"]);
    expect(obj.props[0]!.optional).toBe(false);
  });

  it("parses optional properties with ?", () => {
    const t = typeOf('rakho s: { naam: lafz, laqab?: lafz } = { naam: "a" };') as Extract<
      TypeNode,
      { kind: "ObjectType" }
    >;
    expect(t.props[1]!.optional).toBe(true);
  });

  it("parses nested object types", () => {
    const t = typeOf(
      'rakho s: { pata: { sheher: lafz } } = { pata: { sheher: "khi" } };'
    ) as Extract<TypeNode, { kind: "ObjectType" }>;
    expect(t.props[0]!.type.kind).toBe("ObjectType");
  });
});

describe("parser: union and literal types", () => {
  it("parses unions", () => {
    const t = typeOf("rakho x: lafz | khaali = khaali;");
    expect(t.kind).toBe("UnionType");
    const u = t as Extract<TypeNode, { kind: "UnionType" }>;
    expect(u.members).toHaveLength(2);
  });

  it("parses literal types", () => {
    const t = typeOf('rakho size: "chota" | "bara" = "chota";') as Extract<
      TypeNode,
      { kind: "UnionType" }
    >;
    expect(t.members[0]).toEqual(expect.objectContaining({ kind: "LiteralType", value: "chota" }));
  });

  it("parses number and boolean literal types", () => {
    expect(typeOf("rakho x: 1 | 2 = 1;").kind).toBe("UnionType");
    expect(typeOf("rakho b: sach = sach;")).toEqual(
      expect.objectContaining({ kind: "LiteralType", value: true })
    );
  });

  it("parses parenthesized union arrays", () => {
    const t = typeOf('rakho xs: (lafz | adad)[] = [1, "a"];');
    expect(t.kind).toBe("ArrayType");
    expect((t as Extract<TypeNode, { kind: "ArrayType" }>).element.kind).toBe("UnionType");
  });
});

describe("parser: qisim (type aliases)", () => {
  it("parses type alias declarations", () => {
    const stmt = parse("qisim Shakhs = { naam: lafz };").body[0] as TypeAliasDecl;
    expect(stmt.kind).toBe("TypeAliasDecl");
    expect(stmt.name).toBe("Shakhs");
    expect(stmt.type.kind).toBe("ObjectType");
    expect(stmt.exported).toBe(false);
  });

  it("parses exported aliases", () => {
    const stmt = parse('bhejo qisim Size = "chota" | "bara";').body[0] as TypeAliasDecl;
    expect(stmt.exported).toBe(true);
  });

  it("aliases can reference other aliases", () => {
    const stmt = parse("qisim Fauj = Shakhs[];").body[0] as TypeAliasDecl;
    expect(stmt.type.kind).toBe("ArrayType");
  });

  it("requires = and ;", () => {
    expect(() => parse("qisim X { naam: lafz };")).toThrow(UrSyntaxError);
    expect(() => parse("qisim X = lafz")).toThrow(UrSyntaxError);
  });
});

describe("parser: generics and Wada", () => {
  it("parses generic function declarations", () => {
    const fn = parse("kaam pehla<T>(xs: T[]): T { wapas xs[0]; }").body[0] as FunctionDecl;
    expect(fn.typeParams).toEqual(["T"]);
    expect(fn.params[0]!.typeAnnotation!.kind).toBe("ArrayType");
  });

  it("parses multiple type params", () => {
    const fn = parse("kaam jorra<A, B>(a: A, b: B): A { wapas a; }").body[0] as FunctionDecl;
    expect(fn.typeParams).toEqual(["A", "B"]);
  });

  it("parses Wada<T> type references", () => {
    const t = typeOf("rakho p: Wada<adad> = khaali;");
    expect(t).toEqual(
      expect.objectContaining({ kind: "NamedType", name: "Wada" })
    );
    expect((t as Extract<TypeNode, { kind: "NamedType" }>).typeArgs).toHaveLength(1);
  });

  it("still parses plain named types with no type args", () => {
    const t = typeOf("rakho x: adad = 1;");
    expect(t).toEqual(expect.objectContaining({ kind: "NamedType", name: "adad", typeArgs: [] }));
  });
});
