// TypeScript .d.ts consumption (subset). Uses the TypeScript compiler API to
// parse declarations and maps what it understands onto UrLang types; anything
// unmappable degrades to koi rather than failing. This is what makes typed
// DOM globals, typed npm packages, and typed Tauri `invoke` possible.
import ts from "typescript";
import type { ModuleExports } from "./checker.js";
import {
  ADAD,
  BOOL,
  KHAALI,
  KOI,
  KUCHNAHI,
  LAFZ,
  PropInfo,
  Type,
  arrayOf,
  literal,
  union,
  wadaOf,
} from "./types.js";

/** Maps a TS type node to an UrLang type; unknown constructs become koi. */
function mapType(node: ts.TypeNode | undefined, aliases: Map<string, Type>): Type {
  if (node === undefined) return KOI;
  switch (node.kind) {
    case ts.SyntaxKind.StringKeyword: return LAFZ;
    case ts.SyntaxKind.NumberKeyword: return ADAD;
    case ts.SyntaxKind.BooleanKeyword: return BOOL;
    case ts.SyntaxKind.VoidKeyword:
    case ts.SyntaxKind.UndefinedKeyword: return node.kind === ts.SyntaxKind.VoidKeyword ? KUCHNAHI : KHAALI;
    case ts.SyntaxKind.NullKeyword: return KHAALI;
    case ts.SyntaxKind.AnyKeyword:
    case ts.SyntaxKind.UnknownKeyword:
    case ts.SyntaxKind.ObjectKeyword:
    case ts.SyntaxKind.NeverKeyword:
      return KOI;
    default:
      break;
  }
  if (ts.isLiteralTypeNode(node)) {
    const lit = node.literal;
    if (ts.isStringLiteral(lit)) return literal(lit.text);
    if (ts.isNumericLiteral(lit)) return literal(Number(lit.text));
    if (lit.kind === ts.SyntaxKind.TrueKeyword) return literal(true);
    if (lit.kind === ts.SyntaxKind.FalseKeyword) return literal(false);
    if (lit.kind === ts.SyntaxKind.NullKeyword) return KHAALI;
    return KOI;
  }
  if (ts.isArrayTypeNode(node)) return arrayOf(mapType(node.elementType, aliases));
  if (ts.isUnionTypeNode(node)) return union(node.types.map((t) => mapType(t, aliases)));
  if (ts.isParenthesizedTypeNode(node)) return mapType(node.type, aliases);
  if (ts.isTypeLiteralNode(node)) return mapMembers(node.members, aliases);
  if (ts.isFunctionTypeNode(node)) return mapSignature(node, aliases);
  if (ts.isTypeReferenceNode(node)) {
    const name = ts.isIdentifier(node.typeName) ? node.typeName.text : null;
    if (name === "Promise" && node.typeArguments?.length === 1) {
      return wadaOf(mapType(node.typeArguments[0], aliases));
    }
    if (name === "Array" && node.typeArguments?.length === 1) {
      return arrayOf(mapType(node.typeArguments[0], aliases));
    }
    if (name !== null) {
      const known = aliases.get(name);
      if (known !== undefined) return known;
    }
    return KOI;
  }
  return KOI;
}

function mapSignature(
  node: ts.SignatureDeclarationBase,
  aliases: Map<string, Type>
): Type {
  const params: Type[] = [];
  let required = 0;
  let rest: Type | null = null;
  let sawOptional = false;
  for (const p of node.parameters) {
    const pType = mapType(p.type, aliases);
    if (p.dotDotDotToken !== undefined) {
      rest = pType.kind === "array" ? pType.element : KOI;
      continue;
    }
    if (p.questionToken !== undefined || p.initializer !== undefined) {
      sawOptional = true;
    } else if (!sawOptional) {
      required++;
    }
    params.push(pType);
  }
  return {
    kind: "function",
    typeParams: [],
    params,
    requiredParams: required,
    restParam: rest,
    returnType: mapType(node.type, aliases),
  };
}

function mapMembers(members: ts.NodeArray<ts.TypeElement>, aliases: Map<string, Type>): Type {
  const props = new Map<string, PropInfo>();
  for (const m of members) {
    if (ts.isPropertySignature(m) && m.name !== undefined && ts.isIdentifier(m.name)) {
      props.set(m.name.text, {
        type: mapType(m.type, aliases),
        optional: m.questionToken !== undefined,
      });
    } else if (ts.isMethodSignature(m) && m.name !== undefined && ts.isIdentifier(m.name)) {
      props.set(m.name.text, {
        type: mapSignature(m, aliases),
        optional: m.questionToken !== undefined,
      });
    }
  }
  return { kind: "object", props };
}

/**
 * Parses .d.ts source and returns its declarations as an UrLang module
 * surface. Both `export declare` and plain `declare` entries are included —
 * ambient files describe globals either way.
 */
export function loadDtsExports(source: string): ModuleExports {
  const sf = ts.createSourceFile("ambient.d.ts", source, ts.ScriptTarget.Latest, true);
  const values = new Map<string, Type>();
  const types = new Map<string, Type>();

  // First pass: named types (interfaces, aliases) so later references resolve.
  for (const stmt of sf.statements) {
    if (ts.isInterfaceDeclaration(stmt)) {
      types.set(stmt.name.text, mapMembers(stmt.members, types));
    } else if (ts.isTypeAliasDeclaration(stmt)) {
      types.set(stmt.name.text, mapType(stmt.type, types));
    }
  }
  // Second pass again for interfaces that referenced later types (best effort).
  for (const stmt of sf.statements) {
    if (ts.isInterfaceDeclaration(stmt)) {
      types.set(stmt.name.text, mapMembers(stmt.members, types));
    } else if (ts.isTypeAliasDeclaration(stmt)) {
      types.set(stmt.name.text, mapType(stmt.type, types));
    }
  }

  let defaultType: import("./types.js").Type | null = null;
  const isDefault = (stmt: ts.HasModifiers): boolean =>
    (ts.getModifiers(stmt) ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);

  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt)) {
      const sig = mapSignature(stmt, types);
      if (isDefault(stmt)) {
        defaultType = sig;
      } else if (stmt.name !== undefined) {
        values.set(stmt.name.text, sig);
      }
    } else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          values.set(decl.name.text, mapType(decl.type, types));
        }
      }
    } else if (ts.isClassDeclaration(stmt) && stmt.name !== undefined) {
      values.set(stmt.name.text, KOI); // JS classes are constructible via naya (koi)
    } else if (ts.isExportAssignment(stmt) && !stmt.isExportEquals && ts.isIdentifier(stmt.expression)) {
      defaultType = values.get(stmt.expression.text) ?? KOI; // export default someName;
    }
  }

  return { values, types, defaultType };
}

/** Convenience for tests/tools: map a single TS type string to an UrLang type. */
export function tsTypeToUr(tsType: string): Type {
  const exports = loadDtsExports(`declare const __x: ${tsType};`);
  return exports.values.get("__x") ?? KOI;
}
