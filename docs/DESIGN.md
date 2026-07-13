# UrLang Design Decisions

## Classes: `jamaat`

UrLang has real classes — *jamaat* (جماعت) is literally the Urdu word for "class" — compiled to native ES classes:

```
jamaat Shakhs {
  naam: lafz;                       // typed field
  umar: adad = 0;                   // field with initializer

  banao(naam: lafz, umar: adad) {   // constructor ("banao" = make)
    yeh.naam = naam;                // "yeh" = this
    yeh.umar = umar;
  }

  salaam(): lafz {                  // typed method
    wapas "salam, " + yeh.naam;
  }
}

jamaat Talib waris Shakhs {         // "waris" = inherits/extends
  banao(naam: lafz) {
    buzurg(naam, 18);               // "buzurg" = super
  }
  salaam(): lafz {
    wapas buzurg.salaam() + "!";    // super.method()
  }
}

pakka t = naya Talib("sara");       // "naya" = new
```

Design choices:

- **Instances are structural.** A `naya Shakhs(...)` satisfies any `qisim` or object type its shape matches — classes don't create a parallel nominal world. `naya` is checked nominally (you can only `naya` an actual jamaat), but the *instances* flow through the structural type system like any object.
- **`yeh` is typed** as the instance shape; unknown-property access and type-changing assignments through `yeh` are compile errors.
- **Constructor and `buzurg(...)` calls are arity- and type-checked** against `banao` signatures (inherited when a subclass declares none).
- **Anonymous `kaam` expressions compile to arrow functions**, so `yeh` inside callbacks refers to the enclosing method's instance — the classic detached-`this` bug can't happen.
- **Not in v1** (documented, revisit on demand): `static` members, private fields, interfaces/`implements`, abstract classes, class expressions, decorators. Statics type as `koi`.
- **Prefer functions when a class isn't earning its keep.** `qisim` + `kaam` + factory functions remain the lighter default for plain data; jamaat is there when you want encapsulated state, inheritance, or API familiarity.

## Other decisions worth recording

- **`khaali` is both null and undefined.** One "no value" concept. `x == khaali` compiles to loose `x == null`, which matches both JS nulls and undefineds; every other equality is strict (`===`).
- **Auto-async.** A `kaam` (or method) containing `intezar` compiles to `async function`. Its declared return type `T` means callers see `Wada<T>`. There is no `async` keyword to forget.
- **`==` is `===`.** No coercion, ever (except the khaali rule above, which exists to *absorb* the null/undefined split).
- **No emit on type errors.** Unlike `tsc`'s default, UrLang refuses to generate JavaScript from a program that doesn't type-check.
- **Inclusive ranges.** `har i 1 se 10 tak` runs 1 through 10 inclusive — matching how the phrase reads in Urdu.
- **Objects are structural; freshness applies.** Object literals are checked exactly against the expected type (excess properties are errors); values that already have a wider type may be assigned to narrower slots (width subtyping).
- **`pakka` infers literal types; `rakho` widens** — mirroring TS `const`/`let` inference.
