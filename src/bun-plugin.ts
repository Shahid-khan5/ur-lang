// Bun loader plugin: lets Bun import `.ur` / `.urx` files directly, the same
// way it handles TypeScript. Registered from a preload script (bunfig.toml).
//
// This module deliberately does not import "bun" — it only describes the small
// slice of the plugin API it uses — so `ur-lang/bun` stays importable (and
// type-checkable) under plain Node too.
import * as fs from "node:fs";
import { createRequire } from "node:module";
import { compile, formatDiagnostics } from "./compiler.js";
import { fsModuleLoader } from "./cli-lib.js";
import type { ModuleExports } from "./checker.js";

// Bun's onLoad callback is synchronous, so the optional pieces (dts, npm-types)
// load through require rather than a dynamic import.
const requireFrom = createRequire(import.meta.url);

interface BunOnLoadArgs {
  path: string;
}

interface BunOnLoadResult {
  contents: string;
  loader: "js";
}

interface BunPluginBuilder {
  onLoad(
    constraints: { filter: RegExp },
    callback: (args: BunOnLoadArgs) => BunOnLoadResult
  ): void;
}

export interface UrlangBunPlugin {
  name: string;
  setup(build: BunPluginBuilder): void;
}

export interface UrlangBunPluginOptions {
  /** Paths to .d.ts files whose declarations become typed globals. */
  types?: string[];
  /** Package whose `<pkg>/jsx-runtime` serves .urx files. Default: "react". */
  jsxImportSource?: string;
}

export default function urlang(options: UrlangBunPluginOptions = {}): UrlangBunPlugin {
  return {
    name: "urlang",
    setup(build) {
      // Resolved once per process, on the first .ur import rather than at
      // startup, so a project that never touches UrLang pays nothing.
      let ambient: ModuleExports[] | undefined;
      let resolveTypes: ((specifier: string, importerPath: string) => ModuleExports | null) | undefined;
      let initialized = false;

      const init = (): void => {
        if (initialized) return;
        initialized = true;
        if (options.types !== undefined && options.types.length > 0) {
          const { loadDtsExports } = requireFrom("./dts.js") as typeof import("./dts.js");
          ambient = options.types.map((p) => loadDtsExports(fs.readFileSync(p, "utf8")));
        }
        try {
          const { makeNpmTypesResolver } = requireFrom("./npm-types.js") as typeof import("./npm-types.js");
          resolveTypes = makeNpmTypesResolver();
        } catch {
          resolveTypes = undefined; // typescript missing — npm imports stay koi
        }
      };

      build.onLoad({ filter: /\.urx?$/ }, (args) => {
        init();
        const source = fs.readFileSync(args.path, "utf8");
        const result = compile(source, {
          fileName: args.path,
          loadModule: fsModuleLoader,
          ...(ambient !== undefined && ambient.length > 0 ? { ambient } : {}),
          ...(resolveTypes ? { resolveTypes } : {}),
          ...(options.jsxImportSource !== undefined ? { jsxImportSource: options.jsxImportSource } : {}),
        });
        if (result.code === null) {
          throw new Error("\n" + formatDiagnostics(result.diagnostics, source, args.path));
        }
        return { contents: result.code, loader: "js" };
      });
    },
  };
}
