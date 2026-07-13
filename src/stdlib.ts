// Types for the built-in methods of arrays and strings.
//
// Without these, a language that advertises static typing hands back `koi` the
// moment you call `.map(...)` — the checker knows the element type and then
// throws it away. Each table below is keyed by method name and produces a
// *fully applied* function type for the receiver at hand (the element type is
// substituted in), so no generic machinery is needed for the common cases.
// Methods that genuinely introduce a new type (`map`, `reduce`, `flatMap`)
// declare a type parameter, which call-site inference then resolves.
import {
  ADAD,
  BOOL,
  KHAALI,
  KOI,
  KUCHNAHI,
  LAFZ,
  Type,
  arrayOf,
  functionOf,
  typeParam,
  union,
} from "./types.js";

/** The `U` that `map`/`reduce`/`flatMap` introduce. */
const U = typeParam("U");

/**
 * Array methods, given the element type `T`. Predicates and callbacks are given
 * real function types, so an unannotated lambda parameter is contextually typed
 * (`xs.map(kaam (n) { … })` sees `n: T`).
 */
export function arrayMemberType(element: Type, name: string): Type | null {
  const T = element;
  const arrayOfT = arrayOf(T);
  switch (name) {
    case "length":
      return ADAD;

    // --- transforming ---
    case "map":
      return functionOf([functionOf([T, ADAD], U)], arrayOf(U), {
        typeParams: ["U"],
        requiredParams: 1,
      });
    case "flatMap":
      return functionOf([functionOf([T, ADAD], arrayOf(U))], arrayOf(U), {
        typeParams: ["U"],
        requiredParams: 1,
      });
    case "filter":
      return functionOf([functionOf([T, ADAD], BOOL)], arrayOfT, { requiredParams: 1 });
    case "reduce":
      return functionOf([functionOf([U, T, ADAD], U), U], U, {
        typeParams: ["U"],
        requiredParams: 2,
      });
    case "slice":
      return functionOf([ADAD, ADAD], arrayOfT, { requiredParams: 0 });
    case "concat":
      return functionOf([arrayOfT], arrayOfT, { requiredParams: 1 });
    case "reverse":
    case "sort":
      // `sort` takes an optional comparator; both return the array.
      return functionOf([functionOf([T, T], ADAD)], arrayOfT, { requiredParams: 0 });
    case "flat":
      return functionOf([], arrayOf(KOI));

    // --- searching ---
    case "find":
      return functionOf([functionOf([T, ADAD], BOOL)], union([T, KHAALI]), { requiredParams: 1 });
    case "findIndex":
      return functionOf([functionOf([T, ADAD], BOOL)], ADAD, { requiredParams: 1 });
    case "some":
    case "every":
      return functionOf([functionOf([T, ADAD], BOOL)], BOOL, { requiredParams: 1 });
    case "includes":
      return functionOf([T], BOOL, { requiredParams: 1 });
    case "indexOf":
    case "lastIndexOf":
      return functionOf([T], ADAD, { requiredParams: 1 });

    // --- mutating ---
    case "push":
      return functionOf([], ADAD, { restParam: T });
    case "unshift":
      return functionOf([], ADAD, { restParam: T });
    case "pop":
    case "shift":
      return functionOf([], union([T, KHAALI]));

    // --- iterating ---
    case "forEach":
      return functionOf([functionOf([T, ADAD], KOI)], KUCHNAHI, { requiredParams: 1 });
    case "join":
      return functionOf([LAFZ], LAFZ, { requiredParams: 0 });
    default:
      return null;
  }
}

/** `adad` methods. Anything unlisted is an error, not a silent koi. */
export function numberMemberType(name: string): Type | null {
  switch (name) {
    case "toFixed":
      return functionOf([ADAD], LAFZ, { requiredParams: 0 });
    case "toString":
      return functionOf([ADAD], LAFZ, { requiredParams: 0 }); // optional radix
    default:
      return null;
  }
}

/** `bool` methods. */
export function boolMemberType(name: string): Type | null {
  return name === "toString" ? functionOf([], LAFZ) : null;
}

/** String methods. `lafz` is immutable, so every one of these is pure. */
export function stringMemberType(name: string): Type | null {
  switch (name) {
    case "length":
      return ADAD;
    case "toUpperCase":
    case "toLowerCase":
    case "trim":
    case "trimStart":
    case "trimEnd":
      return functionOf([], LAFZ);
    case "repeat":
      return functionOf([ADAD], LAFZ, { requiredParams: 1 });
    case "padStart":
    case "padEnd":
      return functionOf([ADAD, LAFZ], LAFZ, { requiredParams: 1 });
    case "slice":
    case "substring":
      return functionOf([ADAD, ADAD], LAFZ, { requiredParams: 0 });
    case "charAt":
      return functionOf([ADAD], LAFZ, { requiredParams: 1 });
    case "at":
      return functionOf([ADAD], union([LAFZ, KHAALI]), { requiredParams: 1 });
    case "split":
      return functionOf([LAFZ], arrayOf(LAFZ), { requiredParams: 1 });
    case "replace":
    case "replaceAll":
      return functionOf([LAFZ, LAFZ], LAFZ, { requiredParams: 2 });
    case "concat":
      return functionOf([], LAFZ, { restParam: LAFZ });
    case "includes":
    case "startsWith":
    case "endsWith":
      return functionOf([LAFZ], BOOL, { requiredParams: 1 });
    case "indexOf":
    case "lastIndexOf":
      return functionOf([LAFZ], ADAD, { requiredParams: 1 });
    default:
      return null;
  }
}
