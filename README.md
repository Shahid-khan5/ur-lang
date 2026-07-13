# UrLang

An Urdu-flavored, **statically typed** programming language that compiles to JavaScript — built like TypeScript: structural types, inference, narrowing, generics, classes, modules, **JSX/React**, an LSP, and full interop with the JS ecosystem. Written in strict TypeScript with a **zero-dependency compiler core**, tested end-to-end against real Vite, React, Tauri, and Electron projects.

Because UrLang transpiles to plain JavaScript (with source maps), it runs everywhere JS runs: **Node, browsers, Electron, Tauri**, Deno — anything.

```
qisim Shakhs = { naam: lafz, umar?: adad };

kaam salaam(s: Shakhs): lafz {
  agar (s.umar != khaali && s.umar >= 60) {
    wapas `janab ${s.naam} sahib`;
  }
  wapas `salam, ${s.naam}!`;
}

har s [{ naam: "Ali" }, { naam: "Sara", umar: 65 }] mein {
  bolo salaam(s);
}
```

## Quick start

```sh
npm install && npm run build            # build the toolchain
npm test                                # 320+ tests incl. conformance suite

npx tsx src/cli.ts run examples/tour.ur         # compile + execute
npx tsx src/cli.ts build src/app.ur -o out      # emit .js + .js.map + .d.ts
npx tsx src/cli.ts build src/app.ur --watch     # incremental rebuilds
npx tsx src/cli.ts check src/app.ur             # type-check only
npx tsx src/cli.ts fmt src/app.ur               # format (--check in CI)
npx tsx src/cli.ts lsp                          # language server (stdio)
```

After `npm link`, all of the above are just `urlang <command>`. New project:

```sh
npm create urlang my-app -- --template vite     # or: react | tauri | tauri-react | electron
```

## The language in 60 seconds

| | UrLang | JS/TS equivalent |
|---|---|---|
| Variables | `rakho x = 1;` / `pakka PI = 3.14;` | `let` / `const` (with const literal inference) |
| Types | `adad lafz bool koi khaali kuchnahi`, `T[]`, `A \| B`, `{ k?: T }`, `"literal"`, `Wada<T>` | `number string boolean any null/undefined void`, arrays, unions, objects, literals, `Promise<T>` |
| Aliases | `qisim Shakhs = { naam: lafz };` | `type Shakhs = { naam: string };` |
| Print | `bolo a, b;` | `console.log(a, b)` |
| Branches | `agar / warna agar / warna`, ternary `? :` | `if / else if / else` |
| Loops | `jab tak (…)`, `har x list mein`, `har i 1 se 10 tak`, `bas`, `agla` | `while`, `for…of`, `for`, `break`, `continue` |
| Functions | `kaam f<T>(x: T[], y?: adad, z: adad = 1, ...r: adad[]): T` | generics, optional/default/rest params |
| Lambdas | `kaam (n: adad): adad { wapas n * 2; }` | arrow functions (lexical `yeh`) |
| Async | `intezar` (auto-`async`) | `await` / `async` |
| Errors | `koshish / pakro / akhir / phenko` | `try / catch / finally / throw` |
| Classes | `jamaat / banao / yeh / naya / waris / buzurg` | `class / constructor / this / new / extends / super` |
| Modules | `bhejo` (+ `asal`, re-exports), `lao { } / asal / sab … se` | `export` (+ default), `import { } / default / * as` |
| JSX | `.urx` files: `<div a={x}>{y}</div>`, `<Comp/>`, `<>…</>` | `.tsx` files |
| Interop | `bahar fetch;`, `.d.ts` consumption, typed npm imports | ambient declarations |

Full grammar and typing rules: **[SPEC.md](SPEC.md)**. Design rationale: **[docs/DESIGN.md](docs/DESIGN.md)**. Every diagnostic has a stable code: **[docs/errors.md](docs/errors.md)**.

## Typed like TypeScript

- **Structural object types** with width subtyping, optional properties (typed `T | khaali`), and excess-property checks on fresh literals.
- **Inference + widening**: `pakka` keeps literal types, `rakho` widens — so `pakka size = "chota"` satisfies `"chota" | "bara"`.
- **Control-flow narrowing**: `agar (x != khaali)`, literal equality, `!`, `&&`, `||`, ternary — the branch sees the narrowed type.
- **Generics** with call-site inference: `kaam pehla<T>(xs: T[]): T`.
- **Typed async**: a `kaam` containing `intezar` is automatically `async`; declared return `T` means callers see `Wada<T>`; `intezar` unwraps it.
- **Cross-module checking**: `lao { jama } "./math.ur" se;` gives `jama` its real exported signature — a bad call in one file is caught when the *importer* compiles.
- **Classes** compile to native ES classes; instances flow structurally through the type system; `yeh`, constructors, and `buzurg` calls are fully checked.
- **No emit on type errors**, `==` compiles to `===` (khaali comparisons compile loose to absorb null/undefined), conditions must be `bool` — no truthiness bugs.

## React, in UrLang

Write React components in `.urx` files — JSX with Urdu keywords, **and props are type-checked exactly like TSX**:

```sh
npm create urlang my-app -- --template react     # or tauri-react
```

```
// src/Ginti.urx
lao { useState } "react" se;

qisim GintiProps = { shuru: adad };

bhejo kaam Ginti(props: GintiProps): koi {
  pakka [ginti, setGinti] = useState(props.shuru);
  wapas (
    <button onClick={kaam () { setGinti(ginti + 1); }}>
      Ginti: {ginti}
    </button>
  );
}
```

`<Ginti/>` is a missing-prop error, `<Ginti shuru="ek"/>` is a type error, `<Ginti shuru={0} faltu={1}/>` is an unknown-prop error — all at compile time. Everything you'd expect works: fragments, `{...spread}`, `key`, optional props, nested components, and `.urx` importing `.ur` (and vice versa) with full types across the boundary.

Under the hood it emits the **standard automatic JSX runtime** (`_jsx`/`_jsxs` from `react/jsx-runtime`) — the same protocol TSX emits, so there's no custom runtime and no Babel. Point it elsewhere with `jsxImportSource` (`urlang({ jsxImportSource: "preact" })`); React Compiler composes on top, as it does with TSX.

For **Svelte or Vue**, the pattern is the one TypeScript users already know: components stay `.svelte`/`.vue`, and your typed logic lives in `.ur` modules they import.

## Use with Vite, Tauri, Electron

```ts
// vite.config.ts
import urlang from "ur-lang/vite";
export default { plugins: [urlang({ types: ["./src/bridge.d.ts"] })] };
```

```js
import "./app.ur"; // compiled on the fly, source-mapped, type-checked
```

- **Tauri**: `npm create urlang my-app -- --template tauri` — Rust backend with a `#[tauri::command]`, UrLang frontend with typed command wrappers. Proven: this repo's `meri-tauri-app/` was scaffolded with that command and builds to a working Windows executable.
- **Electron**: `--template electron` — the **main process is UrLang too** (`main.ur`), and the renderer's IPC bridge is typed via `bridge.d.ts`.
- **Plain web**: `--template vite`.

## Interop with the TypeScript ecosystem

- **Use any npm/TS library.** `lao { debounce } "lodash-es" se;` compiles to a real ES import; Vite bundles it exactly as it would for TypeScript. **And it's typed automatically**: the compiler resolves the package's own `.d.ts` from `node_modules` (`types`/`typings`/`exports` fields, `@types/*` fallback), so `lao { invoke } "@tauri-apps/api/core" se;` gives `invoke` its real signature — `invoke(42)` is a compile error (`UR2016`). Packages without declarations degrade gracefully to `koi`.
- **Consume `.d.ts` ambiently** (subset): `urlang check app.ur --types api.d.ts` or the plugin's `types` option turns TS declarations into *typed UrLang globals* — typed preload bridges, typed anything.
- **Emit `.d.ts`**: `urlang build` writes declarations for every module, so TypeScript code can import compiled UrLang with full types.

## Tooling

- **LSP** (`urlang lsp`): live diagnostics with `URxxxx` codes, hover types, completions (member-aware after `.`), go-to-definition. VS Code extension in `editors/vscode-urlang/`.
- **Watch mode** (`urlang build --watch`): dependency-aware — changing `math.ur` rebuilds `math.ur` *and everything that imports it*, nothing else.
- **Formatter** (`urlang fmt`, `--check` for CI): canonical style, idempotent, preserves comments and blank-line groups.
- **Playground**: `npm run playground:build && npx vite playground` — the full compiler running in your browser tab.

## Performance

Hand-written lexer/parser, one-pass checker, string-building codegen, hand-rolled VLQ source maps, zero runtime dependencies. A 38,000-line program compiles end-to-end (with source map) in well under a second — run `npm run bench` for numbers on your machine.

## Project layout

```
src/            compiler: lexer → parser → checker → codegen (+ sourcemaps, dts, fmt, lsp, watch)
tests/          unit + integration tests; tests/conformance/ = spec conformance suite
examples/       language tour and runnable samples
demo/           real Vite app (built + DOM-tested in CI)
packages/create-urlang/   project scaffolder (vite | react | tauri | tauri-react | electron)
editors/vscode-urlang/    VS Code extension (grammar + LSP client)
playground/     in-browser compile+run
SPEC.md         language specification   docs/errors.md   diagnostic codes
CHANGELOG.md    semver policy + history  docs/DESIGN.md   design decisions
```

## Versioning & license

Semantic versioning over the spec, CLI, and public exports — policy in [CHANGELOG.md](CHANGELOG.md). MIT.
