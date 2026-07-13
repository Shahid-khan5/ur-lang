# UrLang + Express

An Express API written entirely in UrLang.

```sh
npm install
npm run dev      # compile + run
npm run build    # emit dist/*.js (+ source maps + .d.ts)
npm start        # node dist/main.js

curl http://localhost:3000/
curl -X POST http://localhost:3000/users -H "content-type: application/json" -d "{\"naam\":\"Ali\",\"umar\":30}"
```

`src/users.ur` is the typed domain layer — `banaoUser` returns a `User`, and any
call that gets the shape wrong fails at compile time. `src/main.ur` is the
Express wiring; request/response objects arrive as `koi` (untyped).
