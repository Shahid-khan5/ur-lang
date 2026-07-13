# Changelog

All notable changes to UrLang are documented here. The format follows [Keep a Changelog](https://keepachangelog.com); versioning follows [Semantic Versioning](https://semver.org).

## Semver policy

UrLang versions the **language** and the **toolchain** together:

- **MAJOR** — breaking changes to documented syntax, typing rules (SPEC.md), the CLI's documented commands/flags, the `ur-lang` / `ur-lang/vite` / `ur-lang/dts` public exports, or emitted-code semantics. Removing/renaming a diagnostic code is breaking; *adding* diagnostics that reject previously-accepted unsound programs is a MINOR with a changelog callout.
- **MINOR** — new syntax, new type-system capabilities, new CLI commands/flags, new diagnostics, LSP capabilities.
- **PATCH** — bug fixes, performance work, message wording (codes stay stable).

Covered by semver: everything in `SPEC.md`, `docs/errors.md` codes, CLI commands, the three package exports, and the shape of `compile()`'s options/result. **Not covered:** compiler internals (direct imports from `dist/` paths other than the documented exports), generated-JS formatting, and the exact text of error messages.

## [1.3.0] — 2026-07-13

A consistency pass over the language surface: places where a construct behaved
differently from its siblings for no defensible reason.

### Added

- **A typed standard library.** `xs.map(…)`, `s.split(…)`, `xs.find(…)` and the
  rest are fully typed instead of returning `koi` — a language that calls itself
  typed cannot hand back `any` the moment you call a built-in method. Arrays,
  strings, numbers, and bools all have method tables (`src/stdlib.ts`); an
  unknown method is now an **error**, not a silent `koi`.
  - **Callback parameters are contextually typed**: `xs.map(kaam (n) { wapas n * 2; })`
    sees `n` as the element type with no annotation, and the result is `adad[]`.
  - Unannotated lambdas **infer their return type** from the body.
  - Callbacks may take fewer parameters than declared (`xs.map(kaam (n) …)`
    satisfies a `(T, adad) => U` slot), as in JS.
- **Parentheses around conditions are optional**: `agar x > 5 { … }` and
  `jab tak x > 0 { … }`. Braces are mandatory, so the parens never disambiguated
  anything — and `har … mein` never required them. The parenthesized form still
  parses (they are ordinary grouping parens).
- **Object shorthand**: `{ naam, umar }` means `{ naam: naam, umar: umar }`.
- **`bahar` takes a type**: `bahar Bun: { serve: kaam(koi): koi };`. Ambient
  declarations were the one thing in the language that could not be typed.
- **Function types are writable**: `kaam(adad, lafz): bool` — the checker had
  them all along, but there was no syntax to spell one.
- **`??`** (nullish coalescing), which pairs with the `?.` we already had:
  `naam ?? "mehmaan"` types as `lafz`, dropping `khaali`.
- **Numeric literals**: `1_000_000`, `0xff`, `0b1010`, `0o755`.

### Changed

- `checker.ts` and `parser.ts` were split into `src/checker/` and `src/parser/`
  (core → expressions → statements). The public import paths are unchanged.

## [1.2.0] — 2026-07-13

### Added

- **Bun support**: `ur-lang/bun` is a Bun loader plugin — preload it (`bunfig.toml`) and Bun imports `.ur` / `.urx` files **directly**, compiling and type-checking them on import, exactly as it does TypeScript. No build step; a type error stops the import.
- **Trailing commas** are accepted wherever a comma-separated list is closed by a bracket: object and array literals, call arguments, parameter lists, `naya`/`buzurg` calls, import/export lists, object types, and type parameters. Multi-line code and formatters depend on this.
- **Standard globals work with `naya`**: `naya Date()`, `naya URL(…)`, `naya Map()` no longer need a `bahar` declaration. The known-globals set now also covers `URL`, `URLSearchParams`, `Request`, `Response`, `Headers`, `AbortController`, `Map`, `Set`, `RegExp`, `Symbol`, `TextEncoder`, `TextDecoder`, `structuredClone`, `crypto`, and friends. Runtime-specific globals (`Bun`, `process`, `Deno`) still want `bahar`, so a file says which runtime it assumes.
- **Five new templates**: `node` (plain Node server), `express`, `bun`, `svelte`, and `tauri-svelte` — bringing the set to ten. Each is exercised by a test that actually runs it: the servers are started and hit over HTTP; the Svelte app is built with the real Vite/Svelte toolchain and clicked in a real DOM.

### Fixed

- **`urlang build` now follows imports.** It compiled only the files named on the command line, so a multi-module project emitted an entry `main.js` importing a `greet.js` that was never written — `node dist/main.js` then died with `ERR_MODULE_NOT_FOUND`. It now builds the whole import graph, as `urlang run` and `--watch` already did.

## [1.1.0] — 2026-07-13

### Added — JSX (`.urx` files)

- **JSX syntax**, exactly as in TSX: elements, attributes (`a="s"`, `a={expr}`, bare `a`), `{...spread}`, `{expr}` children, fragments `<>…</>`, self-closing tags, dotted (`<Foo.Bar/>`) and dashed (`data-id`) names, and HTML entities (`&nbsp;` → U+00A0) in text and attribute strings. `key` is reserved by the runtime, never a prop. Enabled **only** in `.urx` files, so `a < b` keeps meaning less-than everywhere else.
- **Typed components, TS-style.** A capitalized tag resolves to a `kaam`, and its attributes are checked against the component's first parameter: missing required props (`UR2046`), unknown props (`UR2045`), and mistyped props (`UR2042`) are compile errors. JSX children satisfy a `children` prop. A `{...spread}` attribute relaxes the missing/unknown checks (the value types are still checked). Intrinsic tags (`<div>`) accept any attribute name, but every attribute *expression* is type-checked.
- **Framework-independent codegen** targeting the standard automatic runtime: `_jsx`/`_jsxs`/`_Fragment` imported from `<source>/jsx-runtime`, with `key` passed as the third argument — byte-for-byte the protocol TSX emits. `jsxImportSource` (compiler + Vite plugin option, default `"react"`) points it at React, Preact, or any runtime speaking that protocol. No Babel, no custom runtime.
- Toolchain support for `.urx` across the board: CLI (`run`/`build`/`check`/`fmt`), Vite plugin, watch mode, LSP, `.d.ts` emission, and cross-module type checking between `.ur` and `.urx`.
- **New templates**: `npm create urlang my-app -- --template react` and `--template tauri-react`.
- New diagnostics: `UR1029`–`UR1032` (JSX syntax), `UR2044`–`UR2046` (JSX types).

### Fixed

- A module surface read from a package's `.d.ts` is now marked **partial**: our TypeScript reader understands a subset of the language, so a name it can't see (React's `useState`, behind `export =` plus a namespace) degrades to `koi` instead of being reported as *"no such export"* — a false error on a real export. Names it *does* read stay strictly typed. Applies to both `lao` and re-exports.
- `urlang fmt` no longer collapses a whole component onto one line: structurally nested JSX breaks across lines, while elements containing text stay inline (breaking those would swallow whitespace between children and change what renders).
- The Vite plugin now strips the query from module ids (`?t=…` on hot updates, `?import`), so `.ur`/`.urx` files still compile in dev instead of being skipped.

### Notes

- Purely additive — every 1.0.0 program compiles unchanged.
- React Compiler (the Babel optimization pass) composes with this: it runs *after* our transform in Vite, on the emitted `_jsx` calls, like it does for TSX output.

## [1.0.0] — 2026-07-12

First production release. Everything below is new.

### Language
- Static, structural type system: `adad`, `lafz`, `bool`, `koi`, `khaali`, `kuchnahi`, arrays, unions, literal types, object types with optional properties, `Wada<T>`.
- Inference with TS-style widening (`pakka` keeps literals; `rakho` widens); contextual typing with excess-property (freshness) checks; control-flow narrowing via `agar`/ternary over `khaali` and literal comparisons.
- Generic functions `kaam<T>` with call-site inference.
- `qisim` type aliases — exportable and importable.
- Cross-module type checking: imports carry real exported types; npm specifiers degrade to `koi`.
- Classes: `jamaat`/`banao`/`yeh`/`naya`/`waris`/`buzurg` with typed fields, methods, inheritance, and structural instances.
- Async: `intezar` (await) with automatic `async` inference; typed as `Wada<T>`.
- Error handling: `koshish`/`pakro`/`akhir`/`phenko`.
- Loops: `jab tak`, `har x list mein` (arrays, strings, object keys), `har i a se b tak` (inclusive), `bas`/`agla`.
- Modules: `bhejo` (named/default/re-export), `lao` (named/`asal` default/`sab` namespace).
- Surface: ternary, template strings, destructuring, spread/rest, optional chaining `?.`, optional + default parameters.
- `bahar` ambient declarations; `khaali` unifies null/undefined (`== khaali` compiles loose, all else strict).

### Toolchain
- `urlang run | build | check | fmt | lsp`, `--watch` with dependency-aware incremental rebuilds, `--types` for ambient `.d.ts`.
- Vite plugin (`ur-lang/vite`) with `types` option — works with Vite, Tauri, Electron (electron-vite).
- `.d.ts` consumption (subset via the TypeScript compiler API) and `.d.ts` emission for compiled modules.
- **Typed npm imports**: `lao ... "pkg" se` automatically resolves the package's own declarations from `node_modules` (`types`/`typings`/`exports` fields, `@types/*` fallback) in the CLI, Vite plugin, and LSP; packages without types degrade to `koi`.
- Zero-dependency LSP server: live diagnostics, hover types, completions (including member completions), go-to-definition; VS Code extension client.
- `urlang fmt`: canonical formatter, comment-preserving, idempotent.
- Diagnostics with stable `URxxxx` codes (docs/errors.md).
- Source maps (hand-rolled VLQ), friendly Roman-Urdu errors with carets.
- `create-urlang` scaffolder: Vite, Tauri (Rust backend included), Electron (UrLang main process + typed IPC bridge) templates.
- Language spec (SPEC.md) + data-driven conformance suite.
