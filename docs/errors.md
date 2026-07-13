# UrLang Diagnostic Codes

Every compiler error carries a stable code: `UR1xxx` for lexical/syntax errors, `UR2xxx` for type and semantic errors. Codes are resolved from the central catalog in `src/diagnostics.ts` and shown in brackets in terminal output:

```
app.ur:3:1 — Arre yaar, 'x' ka type 'adad' hai, lekin value 'lafz' de rahe ho. [UR2001]
```

## Syntax errors (UR1xxx)

| Code | Title | Fix |
|---|---|---|
| UR1001 | Unexpected character | Remove the stray character or put it inside a string. |
| UR1002 | Unterminated string | Close the string with the same quote it started with. |
| UR1003 | Unterminated comment | Close block comments with `*/`. |
| UR1004 | Lone `&` or `\|` | Use `&&`/`\|\|` in logic; a single `\|` belongs only in type unions. |
| UR1005 | Unterminated template string | Close `` ` `` templates; every `${` needs a `}`. |
| UR1010 | Missing semicolon | Every statement ends with `;`. |
| UR1011 | Expected token | The parser needed a specific token here — the message names it. |
| UR1012 | Missing initializer | `rakho`/`pakka` declarations need `= value`. |
| UR1013 | Invalid assignment target | Only variables, properties, and indexes can be assigned. |
| UR1014 | Incomplete `jab tak` | While loops are written `jab tak (shart) { }`. |
| UR1015 | Unclosed block | Every `{` needs a matching `}`. |
| UR1016 | Malformed import/export | `lao { naam } "./module.ur" se;` — in that order. |
| UR1017 | Expected a type | Annotations take a type: `adad`, `{ naam: lafz }`, `"literal"`, unions… |
| UR1018 | Expected an expression | A value/expression was required here. |
| UR1019 | Bad rest parameter | Rest params come last and take no default. |
| UR1020 | Optional with default | Use `?` or a default value — not both. |
| UR1021 | Malformed `har` loop | `har cheez list mein { }` or `har i 1 se 10 tak { }`. |
| UR1022 | `koshish` without `pakro`/`akhir` | Follow `koshish { }` with `pakro (e) { }` or `akhir { }`. |
| UR1023 | Malformed `qisim` | `qisim Naam = type;` — both `=` and `;` required. |
| UR1024 | Malformed `bhejo` | `bhejo` is followed by `kaam`, `rakho`, `pakka`, `qisim`, `jamaat`, `asal`, or `{ }`. |
| UR1025 | Malformed `buzurg` | `buzurg(...)` for the parent constructor, `buzurg.method()` for parent methods. |
| UR1026 | Malformed destructuring | `pakka { naam } = obj;` — the `=` source is required. |
| UR1027 | Bad object key | Object keys are names or strings. |
| UR1028 | Unknown statement | This isn't a recognizable UrLang statement. |
| UR1029 | Unclosed JSX | Close every open tag: `<div>…</div>`, or self-close `<div/>`. |
| UR1030 | Mismatched JSX closing tag | The closing tag's name must match the opening tag's. |
| UR1031 | Bad JSX attribute | An attribute value is a string (`"…"`) or an expression (`{…}`). |
| UR1032 | Unexpected character in JSX tag | Inside a tag: names, attributes, `=`, strings, `{expressions}`, and `/>`. |
| UR1033 | Unterminated regex | Close it with `/`: `/ab+c/gi`. |
| UR1034 | Malformed `chuno` | `chuno (x) { surat 1: … bas; warna: … }` — one `warna` at most. |
| UR1035 | Malformed `karo` | `karo { … } jab tak (shart);` |
| UR1036 | Rest binding not last | `...baqi` comes last in a pattern. |
| UR1037 | Accessor needs parentheses | `hasil naam(): T { … }` / `lagao naam(v: T) { … }` |
| UR1038 | Bad `mitao` target | `mitao o.a;` or `mitao o[k];` — a property or index. |

## Type errors (UR2xxx)

| Code | Title | Fix |
|---|---|---|
| UR2001 | Initializer type mismatch | Annotation and value must agree. |
| UR2002 | Undeclared name | Declare with `rakho`/`pakka`; for JS globals use `bahar naam;`. |
| UR2003 | Assignment to `pakka` | `pakka` is const — use `rakho` if it must change. |
| UR2004 | Duplicate declaration | The name already exists in this scope. |
| UR2005 | Numeric operator misuse | `- * / % < >` work on `adad` only. |
| UR2006 | Bad `+` operands | `+` adds numbers or joins strings — nothing else. |
| UR2007 | Impossible comparison | The two types can never be equal. |
| UR2008 | Logical operator needs bool | `&&`/`\|\|` take `bool` operands. |
| UR2009 | Unary operator misuse | `!` on `bool`, `-` on `adad`. |
| UR2010 | Condition must be bool | Use a comparison or `== khaali` — no truthiness. |
| UR2011 | `bas`/`agla` outside loop | break/continue only inside loops. |
| UR2012 | `wapas` outside function | Return only inside `kaam`. |
| UR2013 | Return type mismatch | Return what the `kaam` declares. |
| UR2014 | Value return from void | `kuchnahi` functions use bare `wapas;`. |
| UR2015 | Wrong argument count | Check the function's required/optional/rest params. |
| UR2016 | Argument type mismatch | Each argument must match its parameter type. |
| UR2017 | Not callable | Only functions can be called. |
| UR2018 | Unknown property | The type has no such property. |
| UR2019 | Possibly-khaali access | Narrow first (`agar (x != khaali)`) or use `?.`. |
| UR2020 | Array element type mismatch | All elements must fit the declared element type. |
| UR2021 | Bad array index | Indexes are `adad`. |
| UR2022 | Excess property | Object literals may only use keys the expected type declares. |
| UR2023 | Missing required property | Provide every required key (or mark it `key?: T`). |
| UR2024 | Unknown type name | Define with `qisim`, import it, or use a builtin. |
| UR2025 | Duplicate type name | Type names are unique per scope. |
| UR2026 | Unknown export | Only names the module `bhejo`s can be imported. |
| UR2027 | Bad spread | `...` belongs in array/object literals and calls, with array/object values. |
| UR2028 | Not iterable | `har` iterates arrays, `lafz` (characters), or objects (keys). |
| UR2029 | Bad destructuring source | `{ }` from objects, `[ ]` from arrays. |
| UR2030 | Rest parameter type | Rest params take an array type like `adad[]`. |
| UR2031 | Required after optional | Required params come before optional/default ones. |
| UR2032 | Default value type mismatch | Defaults must match the parameter's type. |
| UR2033 | Bad range bounds | `har i <adad> se <adad> tak`. |
| UR2034 | `yeh` outside `jamaat` | `yeh` (this) only inside class methods. |
| UR2035 | `naya` on non-class | `naya` needs a declared `jamaat` (JS classes via `bahar` are `koi`). |
| UR2036 | `buzurg` misuse | `buzurg` only in classes with `waris`. |
| UR2037 | Unknown parent class | Define the parent `jamaat` before `waris`-ing it. |
| UR2038 | Assignment type mismatch | A variable's declared type can't change. |
| UR2039 | Duplicate parameter | Parameter names must be unique. |
| UR2040 | `Wada` needs one type argument | `Wada<adad>` — exactly one. |
| UR2041 | Type arguments on non-generic | Only `Wada<T>` takes type arguments (for now). |
| UR2042 | Property/argument type mismatch | Give the value the expected type. |
| UR2043 | Constructor argument count | Match the `banao` signature. |
| UR2044 | Not a component | A capitalized JSX tag must refer to a `kaam` (component). |
| UR2045 | Unknown prop | That name isn't in the component's props type — check the spelling, or add it. |
| UR2046 | Missing required prop | Pass every required prop (or make it optional: `key?: T`). |
| UR2047 | Unknown method | No such built-in method on this type — check the spelling (or use `koi`). |
| UR2048 | Bad `hai`/`andar` operand | `x hai Jamaat;` — a class on the right. `"key" andar object;` |
| UR2049 | Unknown static member | Only `sakit` members are reachable through the class itself. |
| UR2050 | Private member | A `nijee` member only works inside its own `jamaat`. |
| UR2051 | Wrong type argument count | Give a generic exactly as many type arguments as it declares. |
| UR2052 | Impossible cast | `jaisa` needs the two types to overlap; go through `koi` if you really mean it. |
| UR2053 | Bad enum value | A `fehrist` member's value is a number or string literal. |
| UR2054 | Bad computed key | In `{ [k]: v }`, `k` must be `lafz` or `adad`. |
| UR2055 | Unknown label | Label the loop first: `naam: har … { bas naam; }` |

`UR0000` marks an uncatalogued diagnostic — if you see one, it's a bug in the catalog; please report it.
