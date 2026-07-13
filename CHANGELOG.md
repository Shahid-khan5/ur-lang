# Changelog

All notable changes to UrLang are documented here. The format follows [Keep a Changelog](https://keepachangelog.com); versioning follows [Semantic Versioning](https://semver.org).

## Semver policy

UrLang versions the **language** and the **toolchain** together:

- **MAJOR** — breaking changes to documented syntax, typing rules (SPEC.md), the CLI's documented commands/flags, the `ur-lang` / `ur-lang/vite` / `ur-lang/dts` public exports, or emitted-code semantics. Removing/renaming a diagnostic code is breaking; *adding* diagnostics that reject previously-accepted unsound programs is a MINOR with a changelog callout.
- **MINOR** — new syntax, new type-system capabilities, new CLI commands/flags, new diagnostics, LSP capabilities.
- **PATCH** — bug fixes, performance work, message wording (codes stay stable).

Covered by semver: everything in `SPEC.md`, `docs/errors.md` codes, CLI commands, the three package exports, and the shape of `compile()`'s options/result. **Not covered:** compiler internals (direct imports from `dist/` paths other than the documented exports), generated-JS formatting, and the exact text of error messages.

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
