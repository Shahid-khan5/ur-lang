// AST node types for UrLang. Every node carries line/col/pos for diagnostics and source maps.

export interface Span {
  line: number;
  col: number;
  pos: number;
}

// ---------- Type annotations ----------

export type TypeNode =
  | { kind: "NamedType"; name: string; typeArgs: TypeNode[]; span: Span } // adad, Shakhs, Wada<adad>, T
  | { kind: "ArrayType"; element: TypeNode; span: Span }
  | { kind: "UnionType"; members: TypeNode[]; span: Span }
  | {
      kind: "ObjectType";
      props: { key: string; type: TypeNode; optional: boolean; span: Span }[];
      span: Span;
    }
  | { kind: "LiteralType"; value: string | number | boolean; span: Span };

// ---------- Expressions ----------

export type Expr =
  | NumberLiteral
  | StringLiteral
  | BooleanLiteral
  | NullLiteral
  | Identifier
  | ArrayLiteral
  | ObjectLiteral
  | Unary
  | Binary
  | Logical
  | Assignment
  | Call
  | Member
  | Index
  | Await
  | FunctionExpr
  | Conditional
  | TemplateLiteral
  | Spread
  | NewExpr
  | ThisExpr
  | SuperCall
  | SuperMember
  | JsxElement
  | JsxFragment;

export interface NumberLiteral { kind: "NumberLiteral"; value: number; raw: string; span: Span }
export interface StringLiteral { kind: "StringLiteral"; value: string; span: Span }
export interface BooleanLiteral { kind: "BooleanLiteral"; value: boolean; span: Span }
export interface NullLiteral { kind: "NullLiteral"; span: Span }
export interface Identifier { kind: "Identifier"; name: string; span: Span }
export interface ArrayLiteral { kind: "ArrayLiteral"; elements: Expr[]; span: Span }
export type ObjectEntry =
  | { kind: "prop"; key: string; value: Expr; span: Span }
  | { kind: "spread"; argument: Expr; span: Span };

export interface ObjectLiteral {
  kind: "ObjectLiteral";
  properties: ObjectEntry[];
  span: Span;
}
export interface Unary { kind: "Unary"; op: "-" | "!"; operand: Expr; span: Span }
export interface Binary {
  kind: "Binary";
  op: "+" | "-" | "*" | "/" | "%" | "==" | "!=" | "<" | ">" | "<=" | ">=";
  left: Expr;
  right: Expr;
  span: Span;
}
export interface Logical { kind: "Logical"; op: "&&" | "||"; left: Expr; right: Expr; span: Span }
export interface Assignment {
  kind: "Assignment";
  op: "=" | "+=" | "-=" | "*=" | "/=" | "%=";
  target: Expr; // Identifier | Member | Index — validated by the parser
  value: Expr;
  span: Span;
}
export interface Call { kind: "Call"; callee: Expr; args: Expr[]; span: Span }
export interface Member {
  kind: "Member";
  object: Expr;
  property: string;
  optional: boolean; // ?. access
  span: Span;
}
export interface Index { kind: "Index"; object: Expr; index: Expr; span: Span }
export interface Await { kind: "Await"; operand: Expr; span: Span }
export interface FunctionExpr {
  kind: "FunctionExpr";
  params: Param[];
  returnType: TypeNode | null;
  body: BlockStmt;
  isAsync: boolean;
  span: Span;
}

/** `cond ? a : b` */
export interface Conditional {
  kind: "Conditional";
  condition: Expr;
  consequent: Expr;
  alternate: Expr;
  span: Span;
}

/** `` `salam ${naam}!` `` — quasis.length === expressions.length + 1. */
export interface TemplateLiteral {
  kind: "TemplateLiteral";
  quasis: string[];
  expressions: Expr[];
  span: Span;
}

/** `...expr` in array literals, call arguments, and object literals. */
export interface Spread { kind: "Spread"; argument: Expr; span: Span }

/** `naya Shakhs(args)` → `new Shakhs(args)` */
export interface NewExpr { kind: "NewExpr"; className: string; args: Expr[]; span: Span }

/** `yeh` → `this` (only valid inside jamaat methods). */
export interface ThisExpr { kind: "ThisExpr"; span: Span }

/** `buzurg(args)` → `super(args)` (only in banao of a waris class). */
export interface SuperCall { kind: "SuperCall"; args: Expr[]; span: Span }

/** `buzurg.method(...)` receiver → `super.method` (only in waris methods). */
export interface SuperMember { kind: "SuperMember"; property: string; span: Span }

// ---------- JSX (only parsed in .urx files) ----------

/** `naam="x"` / `naam={expr}` / bare `naam` (value null → true). */
export interface JsxAttribute { kind: "JsxAttribute"; name: string; value: Expr | null; span: Span }
/** `{...props}` inside a tag. */
export interface JsxSpreadAttribute { kind: "JsxSpreadAttribute"; argument: Expr; span: Span }
export type JsxAttr = JsxAttribute | JsxSpreadAttribute;

/** Raw text between tags; cleaned of indentation whitespace at codegen. */
export interface JsxText { kind: "JsxText"; value: string; span: Span }
/** `{expr}` child. */
export interface JsxExprContainer { kind: "JsxExprContainer"; expr: Expr; span: Span }
export type JsxChild = JsxText | JsxExprContainer | JsxElement | JsxFragment;

/**
 * `<div a="x">...</div>` — tagName may be dotted (`Foo.Bar`). Lowercase or
 * dashed names are intrinsic (emitted as strings); capitalized names are
 * component references resolved as values.
 */
export interface JsxElement {
  kind: "JsxElement";
  tagName: string;
  attributes: JsxAttr[];
  children: JsxChild[];
  selfClosing: boolean;
  span: Span;
}

/** `<>...</>` */
export interface JsxFragment { kind: "JsxFragment"; children: JsxChild[]; span: Span }

// ---------- Statements ----------

export type Stmt =
  | VarDecl
  | PrintStmt
  | IfStmt
  | WhileStmt
  | BreakStmt
  | ContinueStmt
  | BlockStmt
  | ExprStmt
  | FunctionDecl
  | ReturnStmt
  | ImportStmt
  | ExternDecl
  | ForEachStmt
  | TryStmt
  | ThrowStmt
  | TypeAliasDecl
  | DestructureDecl
  | DefaultExportStmt
  | ReExportStmt
  | ForRangeStmt
  | ClassDecl;

export interface VarDecl {
  kind: "VarDecl";
  mutable: boolean; // rakho = true, pakka = false
  name: string;
  typeAnnotation: TypeNode | null;
  init: Expr;
  exported: boolean;
  span: Span;
}

export interface PrintStmt { kind: "PrintStmt"; args: Expr[]; span: Span }

export interface IfStmt {
  kind: "IfStmt";
  condition: Expr;
  consequent: BlockStmt;
  alternate: IfStmt | BlockStmt | null; // "warna agar" chains as a nested IfStmt
  span: Span;
}

export interface WhileStmt { kind: "WhileStmt"; condition: Expr; body: BlockStmt; span: Span }
export interface BreakStmt { kind: "BreakStmt"; span: Span }
export interface ContinueStmt { kind: "ContinueStmt"; span: Span }
export interface BlockStmt {
  kind: "BlockStmt";
  body: Stmt[];
  span: Span;
  /** Source line of the closing brace (used by the formatter for comments). */
  endLine?: number;
}
export interface ExprStmt { kind: "ExprStmt"; expr: Expr; span: Span }

export interface Param {
  name: string;
  typeAnnotation: TypeNode | null;
  optional: boolean; // `naam?: lafz`
  defaultValue: Expr | null; // `naam: lafz = "x"`
  rest: boolean; // `...naam: lafz[]` (must be last)
  span: Span;
}

export interface FunctionDecl {
  kind: "FunctionDecl";
  name: string;
  typeParams: string[];
  params: Param[];
  returnType: TypeNode | null;
  body: BlockStmt;
  exported: boolean;
  /** `bhejo asal kaam ...` → `export default function ...` */
  exportDefault: boolean;
  isAsync: boolean;
  span: Span;
}

/** `qisim Shakhs = { naam: lafz };` — a named, exportable type alias. */
export interface TypeAliasDecl {
  kind: "TypeAliasDecl";
  name: string;
  type: TypeNode;
  exported: boolean;
  span: Span;
}

/** `har item list mein { ... }` → `for (const item of list) { ... }` */
export interface ForEachStmt {
  kind: "ForEachStmt";
  varName: string;
  iterable: Expr;
  body: BlockStmt;
  /** Set by the checker: "keys" when iterating a typed object's keys. */
  iterMode?: "of" | "keys";
  span: Span;
}

/** `koshish { } pakro (e) { } akhir { }` → try/catch/finally. */
export interface TryStmt {
  kind: "TryStmt";
  block: BlockStmt;
  catchParam: string | null;
  catchBlock: BlockStmt | null;
  finallyBlock: BlockStmt | null;
  span: Span;
}

export interface ThrowStmt { kind: "ThrowStmt"; value: Expr; span: Span }

export interface ReturnStmt { kind: "ReturnStmt"; value: Expr | null; span: Span }

export interface ImportStmt {
  kind: "ImportStmt";
  names: string[];
  /** `lao asal config ...` — default import binding. */
  defaultName: string | null;
  /** `lao sab math ...` — namespace import binding. */
  namespaceName: string | null;
  source: string;
  span: Span;
}

/** `pakka { naam, umar } = shakhs;` / `rakho [a, b] = jorra;` */
export interface DestructureDecl {
  kind: "DestructureDecl";
  mutable: boolean;
  pattern: { type: "object" | "array"; names: string[] };
  init: Expr;
  span: Span;
}

/** `bhejo asal <expr>;` → `export default <expr>;` */
export interface DefaultExportStmt { kind: "DefaultExportStmt"; expr: Expr; span: Span }

/** `bhejo { a, b } "./m.ur" se;` → `export { a, b } from "./m.ur";` */
export interface ReExportStmt { kind: "ReExportStmt"; names: string[]; source: string; span: Span }

export interface ClassField {
  name: string;
  typeAnnotation: TypeNode;
  init: Expr | null;
  span: Span;
}

export interface ClassMethod {
  name: string; // "banao" = constructor
  params: Param[];
  returnType: TypeNode | null;
  body: BlockStmt;
  isAsync: boolean;
  span: Span;
}

/** `jamaat Shakhs waris Insaan { ... }` → `class Shakhs extends Insaan { ... }` */
export interface ClassDecl {
  kind: "ClassDecl";
  name: string;
  parent: string | null;
  fields: ClassField[];
  methods: ClassMethod[]; // banao (constructor) included
  exported: boolean;
  span: Span;
}

/** `har i 1 se 10 tak { ... }` → `for (let i = 1; i <= 10; i++)` (inclusive). */
export interface ForRangeStmt {
  kind: "ForRangeStmt";
  varName: string;
  from: Expr;
  to: Expr;
  body: BlockStmt;
  span: Span;
}

/** `bahar fetch;` — declares an external JS global so the checker allows it (typed koi). */
export interface ExternDecl { kind: "ExternDecl"; name: string; span: Span }

export interface Program { kind: "Program"; body: Stmt[] }
