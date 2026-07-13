// Vite/Rollup plugin: lets any Vite-based app (plain web, Tauri, Electron via
// electron-vite, etc.) import `.ur` files directly, exactly like TypeScript.
import * as fs from "node:fs";
import type { Plugin } from "vite";
import { compile, formatDiagnostics } from "./compiler.js";
import { fsModuleLoader } from "./cli-lib.js";
import type { ModuleExports } from "./checker.js";

export interface UrlangPluginOptions {
  /** Paths to .d.ts files whose declarations become typed globals (Tauri APIs etc.). */
  types?: string[];
  /** Package whose `<pkg>/jsx-runtime` serves .urx files. Default: "react". */
  jsxImportSource?: string;
}

export default function urlang(options: UrlangPluginOptions = {}): Plugin {
  let ambient: ModuleExports[] = [];
  let resolveTypes: ((specifier: string, importerPath: string) => ModuleExports | null) | undefined;
  return {
    name: "vite-plugin-urlang",
    enforce: "pre",
    async buildStart() {
      // Lazy imports keep `typescript` optional for plugin users who don't need it.
      if (options.types !== undefined && options.types.length > 0) {
        const { loadDtsExports } = await import("./dts.js");
        ambient = options.types.map((p) => loadDtsExports(fs.readFileSync(p, "utf8")));
      }
      try {
        const { makeNpmTypesResolver } = await import("./npm-types.js");
        resolveTypes = makeNpmTypesResolver();
      } catch {
        resolveTypes = undefined; // typescript missing — npm imports stay koi
      }
    },
    transform(code, id) {
      if (!id.endsWith(".ur") && !id.endsWith(".urx")) return null;
      const result = compile(code, {
        fileName: id,
        sourceMap: true,
        loadModule: fsModuleLoader,
        ...(ambient.length > 0 ? { ambient } : {}),
        ...(resolveTypes ? { resolveTypes } : {}),
        ...(options.jsxImportSource !== undefined ? { jsxImportSource: options.jsxImportSource } : {}),
      });
      if (result.code === null) {
        // Vite surfaces this in the browser overlay and the terminal.
        this.error("\n" + formatDiagnostics(result.diagnostics, code, id));
      }
      return { code: result.code, map: result.map };
    },
  };
}
