# UrLang + React + Tauri

React components written in UrLang (`.urx` files — JSX with Urdu keywords),
compiled by `ur-lang/vite`; the backend is Rust.

```sh
npm install
npm run tauri dev      # needs the Rust toolchain: https://tauri.app/start/prerequisites/
```

Web-only preview (no Rust needed): `npm run dev`.

- `src/App.urx` — the React component, fully type-checked (props included).
- `src/commands.ur` — typed wrappers over your Rust `#[tauri::command]`s. The
  signature comes from `@tauri-apps/api`'s own `.d.ts`, so `greet(42)` is a
  compile error before it ever reaches Rust.
