// Public entry point for the type checker. The implementation lives in
// ./checker/ — this file is the stable import path the rest of the toolchain
// (compiler, CLI, LSP, dts, bundler plugins) depends on.
export type { CheckOptions, CheckResult, ModuleExports, SymbolSink } from "./checker/api.js";
export { check, checkProgram } from "./checker/checker.js";
