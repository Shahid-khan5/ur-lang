#!/usr/bin/env node
// UrLang CLI: urlang run <file> | urlang build <files...> -o <dir> | urlang check <files...>
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { buildGraph, checkFile } from "./cli-lib.js";
import { formatDiagnostics } from "./compiler.js";
import type { UrError } from "./errors.js";

const HELP = `UrLang — Urdu-flavored typed language that compiles to JavaScript.

Usage:
  urlang run <file.ur>              Compile (with imports) and execute with Node
  urlang build <files...> -o <dir>  Compile files to JavaScript (+ source maps + .d.ts)
  urlang build <file> --watch       Rebuild on change (dependency-aware)
  urlang check <files...>           Type-check only, no output
  urlang fmt <files...>             Format files in place (--check to verify only)
  urlang lsp                        Start the language server (stdio)
  urlang --help                     Show this help

Options:
  -o, --out <dir>      Output directory for build (default: dist)
  --no-sourcemap       Skip source map emission
  --no-dts             Skip .d.ts declaration emission on build
  --types <file.d.ts>  Load TypeScript declarations as typed globals (repeatable)
`;

function printDiagnostics(file: string, source: string, diagnostics: UrError[]): void {
  process.stderr.write(formatDiagnostics(diagnostics, source, file) + "\n");
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command === undefined || command === "--help" || command === "-h") {
    process.stdout.write(HELP);
    return command === undefined ? 1 : 0;
  }

  if (command === "lsp") {
    await import("./lsp/server.js"); // starts the stdio loop
    return await new Promise<number>(() => {}); // stays alive until exit notification
  }

  const files: string[] = [];
  const typeFiles: string[] = [];
  let outDir = "dist";
  let sourceMap = true;
  let declarations = true;
  let watch = false;
  let checkOnly = false;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (arg === "--watch" || arg === "-w") {
      watch = true;
    } else if (arg === "--check") {
      checkOnly = true;
    } else if (arg === "-o" || arg === "--out") {
      const value = rest[++i];
      if (value === undefined) {
        process.stderr.write("Arre yaar, -o ke baad directory ka naam do.\n");
        return 1;
      }
      outDir = value;
    } else if (arg === "--no-sourcemap") {
      sourceMap = false;
    } else if (arg === "--no-dts") {
      declarations = false;
    } else if (arg === "--types") {
      const value = rest[++i];
      if (value === undefined) {
        process.stderr.write("Arre yaar, --types ke baad .d.ts file ka naam do.\n");
        return 1;
      }
      typeFiles.push(value);
    } else {
      files.push(arg);
    }
  }

  let ambient: import("./checker.js").ModuleExports[] | undefined;
  if (typeFiles.length > 0) {
    // Lazy import: `typescript` stays an optional dependency.
    const { loadDtsExports } = await import("./dts.js");
    ambient = typeFiles.map((p) => loadDtsExports(fs.readFileSync(p, "utf8")));
  }

  // npm-package type resolution: available whenever `typescript` is installed.
  let resolveTypes: import("./compiler.js").CompileOptions["resolveTypes"];
  try {
    const { makeNpmTypesResolver } = await import("./npm-types.js");
    resolveTypes = makeNpmTypesResolver();
  } catch {
    resolveTypes = undefined; // typescript not installed — npm imports stay koi
  }

  if (files.length === 0) {
    process.stderr.write("Arre yaar, koi file to do.\n\n" + HELP);
    return 1;
  }

  switch (command) {
    case "run": {
      const entry = files[0]!;
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "urlang-run-"));
      try {
        const results = buildGraph(entry, {
          outDir: tmp,
          sourceMap,
          declarations: false,
          ...(ambient ? { ambient } : {}),
          ...(resolveTypes ? { resolveTypes } : {}),
        });
        let failed = false;
        for (const r of results) {
          if (r.diagnostics.length > 0) {
            printDiagnostics(r.inputPath, r.source, r.diagnostics);
            failed = true;
          }
        }
        if (failed) return 1;
        fs.writeFileSync(path.join(tmp, "package.json"), '{"type":"module"}');
        const entryJs = path.join(tmp, path.basename(entry).replace(/\.urx?$/, ".js"));
        const proc = spawnSync(process.execPath, ["--enable-source-maps", entryJs], { stdio: "inherit" });
        return proc.status ?? 1;
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }
    case "build": {
      if (watch) {
        const { BuildWatcher } = await import("./watch.js");
        const entry = files[0]!;
        const watcher = new BuildWatcher(entry, {
          outDir,
          sourceMap,
          declarations,
          ...(ambient ? { ambient } : {}),
          ...(resolveTypes ? { resolveTypes } : {}),
        });
        const report = (results: import("./cli-lib.js").BuildFileResult[]): void => {
          for (const r of results) {
            if (r.diagnostics.length > 0) {
              printDiagnostics(r.inputPath, r.source, r.diagnostics);
            } else {
              process.stdout.write(`${r.inputPath} -> ${r.outputPath}\n`);
            }
          }
        };
        report(watcher.buildAll());
        process.stdout.write("dekh raha hoon... (Ctrl+C se band karo)\n");
        watcher.watch(report);
        return await new Promise<number>(() => {}); // run until interrupted
      }
      let failed = false;
      const built = new Set<string>();
      for (const file of files) {
        // Follow imports: emitting an entry without the modules it imports
        // would produce a dist/ that cannot run.
        for (const result of buildGraph(file, {
          outDir,
          sourceMap,
          declarations,
          ...(ambient ? { ambient } : {}),
          ...(resolveTypes ? { resolveTypes } : {}),
        })) {
          if (built.has(result.inputPath)) continue; // shared by several entries
          built.add(result.inputPath);
          if (result.diagnostics.length > 0) {
            printDiagnostics(result.inputPath, result.source, result.diagnostics);
            failed = true;
          } else {
            process.stdout.write(`${result.inputPath} -> ${result.outputPath}\n`);
          }
        }
      }
      return failed ? 1 : 0;
    }
    case "fmt": {
      const { format } = await import("./formatter.js");
      let failed = false;
      for (const file of files) {
        const source = fs.readFileSync(file, "utf8");
        try {
          const formatted = format(source, { jsx: file.endsWith(".urx") });
          if (checkOnly) {
            if (formatted !== source) {
              process.stderr.write(`${file}: format theek nahi hai (urlang fmt chalao)\n`);
              failed = true;
            }
          } else if (formatted !== source) {
            fs.writeFileSync(file, formatted);
            process.stdout.write(`${file}: format kar diya\n`);
          }
        } catch (e) {
          if (e instanceof Error && "format" in e) {
            printDiagnostics(file, source, [e as import("./errors.js").UrError]);
            failed = true;
          } else {
            throw e;
          }
        }
      }
      return failed ? 1 : 0;
    }
    case "check": {
      let failed = false;
      for (const file of files) {
        const { diagnostics, source } = checkFile(file, ambient, resolveTypes);
        if (diagnostics.length > 0) {
          printDiagnostics(file, source, diagnostics);
          failed = true;
        } else {
          process.stdout.write(`${file}: sab theek hai ✔\n`);
        }
      }
      return failed ? 1 : 0;
    }
    default:
      process.stderr.write(`Arre yaar, '${command}' koi command nahi hai.\n\n` + HELP);
      return 1;
  }
}

process.exit(await main(process.argv.slice(2)));
