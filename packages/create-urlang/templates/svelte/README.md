# UrLang + Svelte

Svelte owns the components (`.svelte`); **UrLang owns the logic** (`.ur`), which
the components import like any module — the same split TypeScript users have in
a Svelte project (Svelte's template syntax is its own compiler, so components
are never written in UrLang or in TSX).

```sh
npm install
npm run dev
npm run check    # type-check the .ur logic
```

`src/lib/ginti.ur` is fully type-checked, and its types flow into `App.svelte`
through the import. Swap the UI framework later and the `.ur` files come along
untouched.
