# UrLang + Node.js

A plain Node server written entirely in UrLang.

```sh
npm install
npm run dev      # compile + run in one step
npm run build    # emit dist/*.js (+ source maps + .d.ts)
npm start        # node dist/main.js
npm run check    # type-check only
```

`src/greet.ur` holds the typed logic; `src/main.ur` wires up `node:http`. Node's
own modules come in as `koi` (untyped) — declare what you need, or point
`--types` at a `.d.ts` to type them.
