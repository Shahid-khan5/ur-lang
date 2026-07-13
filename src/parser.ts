// Public entry point for the parser. The grammar lives in ./parser/ — this
// file is the stable import path used across the toolchain.
export type { ParseOptions } from "./parser/base.js";
export { parse } from "./parser/parser.js";
