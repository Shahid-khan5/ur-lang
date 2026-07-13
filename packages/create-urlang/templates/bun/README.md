# UrLang + Bun

Bun runs `.ur` files **directly** — no build step. `bunfig.toml` preloads the
UrLang loader (`ur-lang/bun`), which compiles and type-checks on import, the
same way Bun handles TypeScript.

```sh
bun install
bun run dev        # bun run src/main.ur
bun run check      # type-check only
bun run build      # bundle to dist/

curl http://localhost:3000/
curl http://localhost:3000/sehat
```

Type errors stop the import: fix the code and re-run. `src/greet.ur` holds the
typed logic; `src/main.ur` serves it with `Bun.serve`.
