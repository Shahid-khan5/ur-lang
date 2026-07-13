# UrLang + Svelte + Tauri

Svelte components, a Rust backend, and UrLang for everything in between.

```sh
npm install
npm run tauri dev      # needs the Rust toolchain: https://tauri.app/start/prerequisites/
```

Web-only preview (no Rust needed): `npm run dev`.

- `src/lib/commands.ur` — typed wrappers over your Rust `#[tauri::command]`s.
  The signature comes from `@tauri-apps/api`'s own `.d.ts`, so `greet(42)` fails
  to compile long before it reaches Rust.
- `src/lib/ginti.ur` — plain typed logic.
- `src/App.svelte` — the UI. Svelte's template syntax is its own compiler, so
  components stay `.svelte` and import UrLang, exactly as they would TypeScript.
