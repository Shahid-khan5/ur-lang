# UrLang Language Specification

Version 1.1 — covers the syntax and typing rules implemented by the reference compiler. The conformance suite (`tests/conformance/`) executes examples of every rule below.

## 1. Lexical structure

- **Encoding:** UTF-8 source; identifiers are ASCII `[A-Za-z_$][A-Za-z0-9_$]*`.
- **Comments:** `// line` and `/* block */`.
- **Numbers:** decimal integers and decimals (`3`, `3.14`).
- **Strings:** `"..."` or `'...'` with escapes `\n \t \r \\ \" \' \0`.
- **Template strings:** `` `text ${expr} text` `` with escapes ``\` \$ \\ \n \t \r``; may span lines.
- **Reserved words:** `rakho pakka bolo agar warna jab tak bas agla kaam wapas sach jhoot khaali bhejo lao se bahar har mein koshish pakro akhir phenko intezar qisim asal sab jamaat naya yeh waris buzurg`.
- **Trailing commas** are permitted before the closing bracket of any comma-separated list (arguments, parameters, array/object literals, import/export lists, object types, type parameters).
- **File extensions:** `.ur`, and `.urx` for files containing JSX. In a `.urx` file, a `<` in operand position (i.e. not after a value) followed by a name or `>` opens a JSX element; everywhere else `<` is less-than. `.ur` files never lex JSX, so `a < b` is unambiguous there.

## 2. Grammar (EBNF)

```ebnf
program        = { statement } ;

statement      = varDecl | destructureDecl | printStmt | ifStmt | whileStmt
               | forEachStmt | forRangeStmt | breakStmt | continueStmt
               | functionDecl | returnStmt | importStmt | exportStmt
               | externDecl | typeAliasDecl | classDecl | tryStmt | throwStmt
               | blockStmt | exprStmt ;

varDecl        = ("rakho" | "pakka") IDENT [":" type] "=" expr ";" ;
destructureDecl= ("rakho" | "pakka") ("{" identList "}" | "[" identList "]") "=" expr ";" ;
printStmt      = "bolo" expr { "," expr } ";" ;
ifStmt         = "agar" "(" expr ")" block { "warna" "agar" "(" expr ")" block } ["warna" block] ;
whileStmt      = "jab" "tak" "(" expr ")" block ;
forEachStmt    = "har" IDENT expr "mein" block ;
forRangeStmt   = "har" IDENT expr "se" expr "tak" block ;          (* inclusive *)
breakStmt      = "bas" ";" ;
continueStmt   = "agla" ";" ;
functionDecl   = "kaam" IDENT [typeParams] "(" [paramList] ")" [":" type] block ;
typeParams     = "<" IDENT { "," IDENT } ">" ;
paramList      = param { "," param } ;
param          = ["..."] IDENT ["?"] [":" type] ["=" expr] ;       (* rest last; ? xor default *)
returnStmt     = "wapas" [expr] ";" ;
importStmt     = "lao" importClause STRING "se" ";" ;
importClause   = "sab" IDENT | ["asal" IDENT [","]] ["{" identList "}"] ;
exportStmt     = "bhejo" (functionDecl | varDecl | typeAliasDecl | classDecl
               | "asal" (functionDecl | expr ";")
               | "{" identList "}" STRING "se" ";") ;              (* last = re-export *)
externDecl     = "bahar" IDENT ";" ;
typeAliasDecl  = "qisim" IDENT "=" type ";" ;
classDecl      = "jamaat" IDENT ["waris" IDENT] "{" { classMember } "}" ;
classMember    = IDENT ":" type ["=" expr] ";"                     (* field *)
               | IDENT "(" [paramList] ")" [":" type] block ;      (* method; banao = ctor *)
tryStmt        = "koshish" block ["pakro" "(" IDENT ")" block] ["akhir" block] ;
throwStmt      = "phenko" expr ";" ;
blockStmt      = block ;
block          = "{" { statement } "}" ;
exprStmt       = expr ";" ;

type           = postfixType { "|" postfixType } ;
postfixType    = primaryType { "[" "]" } ;
primaryType    = "(" type ")" | objectType | literalType
               | IDENT ["<" type { "," type } ">"] | "khaali" ;
objectType     = "{" [typeProp { "," typeProp }] "}" ;
typeProp       = IDENT ["?"] ":" type ;
literalType    = STRING | NUMBER | "sach" | "jhoot" ;

expr           = assignment ;
assignment     = conditional [assignOp assignment] ;               (* target: ident/member/index *)
assignOp       = "=" | "+=" | "-=" | "*=" | "/=" | "%=" ;
conditional    = logicalOr ["?" assignment ":" assignment] ;
logicalOr      = logicalAnd { "||" logicalAnd } ;
logicalAnd     = equality { "&&" equality } ;
equality       = comparison { ("==" | "!=") comparison } ;
comparison     = additive { ("<" | ">" | "<=" | ">=") additive } ;
additive       = multiplicative { ("+" | "-") multiplicative } ;
multiplicative = unary { ("*" | "/" | "%") unary } ;
unary          = ("-" | "!" | "intezar") unary | postfix ;
postfix        = primary { call | "." IDENT | "?." IDENT | "[" expr "]" } ;
call           = "(" [argList] ")" ;
argList        = arg { "," arg } ;   arg = ["..."] expr ;
primary        = NUMBER | STRING | template | "sach" | "jhoot" | "khaali"
               | IDENT | "yeh" | "(" expr ")" | arrayLit | objectLit
               | "kaam" "(" [paramList] ")" [":" type] block        (* fn expression *)
               | "naya" IDENT "(" [argList] ")"
               | "buzurg" ("(" [argList] ")" | "." IDENT)
               | jsxElement ;                                       (* .urx files only *)
arrayLit       = "[" [arg { "," arg }] "]" ;
objectLit      = "{" [objEntry { "," objEntry }] "}" ;
objEntry       = (IDENT | STRING) ":" expr | "..." expr ;

(* JSX — only in .urx files, where `<` in operand position opens an element. *)
jsxElement     = "<" JSXNAME { jsxAttr } ("/>" | ">" { jsxChild } "</" JSXNAME ">")
               | "<" ">" { jsxChild } "</" ">" ;                    (* fragment *)
jsxAttr        = JSXNAME ["=" (STRING | "{" expr "}")]              (* bare attr = sach *)
               | "{" "..." expr "}" ;
jsxChild       = JSXTEXT | "{" [expr] "}" | jsxElement ;
JSXNAME        = IDENT { ("-" | ".") IDENT } ;
```

## 3. Types

**Builtins:** `adad` (number), `lafz` (string), `bool`, `koi` (any), `khaali` (null ∪ undefined), `kuchnahi` (void). Composites: arrays `T[]`, unions `A | B`, object types `{ k: T, opt?: U }`, literal types (`"chota"`, `5`, `sach`), `Wada<T>` (Promise), function types, class instances, generic type parameters.

### 3.1 Assignability (`target ⊇ source`)

- `koi` is assignable to and from everything.
- Primitives are assignable to themselves.
- A literal type is assignable to its base primitive; distinct literals are incompatible.
- A union **target** accepts any member match; a union **source** requires every member to fit.
- Arrays and `Wada` are covariant in their element/value.
- Object types are **structural with width subtyping**: every target property must exist in the source (unless optional) with an assignable type. Extra source properties are fine — except **freshness**: an object *literal* checked against a known type may not include unknown keys (excess-property error) and must include all required keys.
- Functions: parameter types contravariant, return type covariant, arity equal.
- Class instances participate structurally via their instance type; `naya` requires an actual class.

### 3.2 Inference and widening

- `rakho x = e` binds `x` to `widen(typeof e)`; `pakka x = e` keeps literal types (TS `const` behavior). `khaali` initializers infer `koi`.
- Array literals infer the unified (widened) element type; heterogeneous elements form a union.
- Object literal properties widen.
- Contextual typing: literals checked against an expected type are checked member-by-member.
- Generic calls infer type arguments by structural matching of arguments against parameters (literal inferences widen; uninferrable parameters become `koi`).

### 3.3 Control-flow narrowing

Within `agar`/ternary branches, a variable's type narrows when the condition is:
`x == khaali`, `x != khaali`, `x == <literal>`, `x != <literal>`, a `!`-negation, an `&&` conjunction (then-branch) or `||` disjunction (else-branch) of the above. The else-branch receives the complement.

### 3.4 Operators

- `+`: adad+adad→adad; any lafz operand → lafz; `koi` propagates.
- `- * / % < > <= >=`: adad only.
- `== !=`: operands must overlap after widening; compiles to `===`/`!==`, except comparisons with `khaali`, which compile to loose `== null` (matching both null and undefined).
- `&& || !`: bool only. Conditions must be bool — no truthiness.
- `intezar e`: unwraps `Wada<T>` to `T`; non-promises pass through.

### 3.5 Functions and async

- Unannotated parameters and returns are `koi`. Optional parameters (`?` or default) relax call arity; optional-without-default binds as `T | khaali` in the body. Rest params require an array type.
- A `kaam` or method whose body contains `intezar` compiles to `async function`; with declared return `T`, callers observe `Wada<T>` (annotating `Wada<T>` directly is equivalent).
- `wapas` values check against the declared return type; bare `wapas;` requires `kuchnahi`/`koi`/no annotation.

### 3.6 Classes

`jamaat` declares a class: typed fields (with optional initializers), methods, `banao` constructor, `yeh` typed as the instance, single inheritance via `waris` (fields/methods/constructor inherited), `buzurg(...)`/`buzurg.m()` checked against the parent. Instances are structurally typed. No statics/private/interfaces in v1.

### 3.7 Modules

`bhejo` exports values, types, classes, defaults (`asal`), and re-exports. `lao` imports named/default (`asal`)/namespace (`sab`) bindings. Cross-module checking gives imports their real exported types when the host (CLI/Vite plugin/LSP) can resolve the file; unresolvable specifiers (npm packages) degrade to `koi`. Ambient `.d.ts` surfaces may inject typed globals. `bahar x;` declares an untyped (`koi`) global. `.ur` and `.urx` modules import each other freely, with types intact in both directions.

### 3.8 JSX (`.urx`)

A JSX expression has type `koi`. A **plain** tag name starting with a lowercase letter, or containing `-`, is **intrinsic**: any attribute name is accepted, but every attribute *expression* is type-checked. Every other tag name — including any **dotted** name, whatever its case — is a **component**, resolved as a value (dotted names via member access) and checked as follows:

- The component's **first parameter** is its props type. If it is an object type, attributes are checked against it: an unknown attribute is an error (UR2045), a missing required property is an error (UR2046), and each attribute's value must be assignable to the declared property type (UR2042, with contextual typing).
- A bare attribute (`<Comp on/>`) has type `sach`. A `key` attribute is reserved by the runtime: its expression is type-checked, but it is never reported as an unknown prop, never checked against a props type, and satisfies a declared `key` prop.
- Element children satisfy a required `children` prop.
- A `{...spread}` attribute makes the attribute set open-ended: unknown/missing checks are suppressed, while the types of explicitly named attributes are still checked.
- If the props parameter is not an object type (e.g. `koi`), attributes are only checked as expressions.

## 4. Execution semantics

UrLang compiles to JavaScript with no runtime library. Notable mappings: `bolo`→`console.log`, `==`→`===` (khaali→loose), `har x e mein` → `for...of` (`Object.keys(e)` for typed objects), `har i a se b tak` → inclusive `for` loop, function expressions → arrow functions (lexical `yeh`), `qisim`/type annotations erase. Programs with type errors do not emit code.

JSX compiles to the **standard automatic runtime**: `<t a={x}>{y}</t>` → `_jsx(t, { a: x, children: y })` (`_jsxs` when there are 2+ children, with `children` as an array), a `key` attribute becomes the third argument, and `<>…</>` uses `_Fragment`. `_jsx`/`_jsxs`/`_Fragment` are imported from `<jsxImportSource>/jsx-runtime` (default `react`). Intrinsic tags emit as string literals, components as value references. Element children take precedence over a `children` attribute. JSX text is whitespace-cleaned as Babel does (leading/trailing indentation around newlines removed, lines joined with a single space), and HTML entities in text and attribute strings are decoded (`&nbsp;` → U+00A0; unknown entities are left verbatim). Unlike ordinary UrLang strings, JSX attribute strings take no backslash escapes.

## 5. Stability

See `CHANGELOG.md` for the semver policy. Anything in this document is covered by semver; compiler internals (`src/**` APIs beyond the documented `ur-lang` exports) are not.
