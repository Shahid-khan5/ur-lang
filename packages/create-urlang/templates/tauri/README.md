# UrLang + Tauri

Frontend is 100% UrLang (compiled by `ur-lang/vite`); backend is Rust.

```sh
npm install
npm run tauri dev      # needs the Rust toolchain: https://tauri.app/start/prerequisites/
```

Web-only preview (no Rust needed): `npm run dev`.

Add a Rust command in `src-tauri/src/main.rs`, wrap it with a typed `kaam` in
`src/commands.ur`, and call it from anywhere — cross-module type checking
enforces the signature at every call site.
