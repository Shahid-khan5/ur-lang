// Watch mode: dependency-aware incremental rebuilds. Tracks the .ur import
// graph; a change rebuilds only the changed file and its transitive
// dependents (whose type checks depend on the changed module's exports).
import * as fs from "node:fs";
import * as path from "node:path";
import { buildFile, BuildFileResult, BuildOptions } from "./cli-lib.js";
import { parse } from "./parser.js";

export class BuildWatcher {
  /** file → set of files it imports */
  private readonly deps = new Map<string, Set<string>>();
  /** file → set of files that import it */
  private readonly dependents = new Map<string, Set<string>>();
  /** last-built content per file, to skip no-op rebuilds */
  private readonly lastContent = new Map<string, string>();
  private readonly watchers: fs.FSWatcher[] = [];

  constructor(
    private readonly entry: string,
    private readonly options: BuildOptions
  ) {}

  /** Full initial build of the entry and everything it imports. */
  buildAll(): BuildFileResult[] {
    const results: BuildFileResult[] = [];
    const queue = [path.resolve(this.entry)];
    const seen = new Set<string>();
    while (queue.length > 0) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      results.push(this.buildOne(file));
      for (const dep of this.deps.get(file) ?? []) queue.push(dep);
    }
    return results;
  }

  /** Rebuilds a changed file plus every transitive dependent. */
  onFileChanged(changedPath: string): BuildFileResult[] {
    const file = path.resolve(changedPath);
    let content: string;
    try {
      content = fs.readFileSync(file, "utf8");
    } catch {
      return [];
    }
    if (this.lastContent.get(file) === content) return []; // spurious event
    const affected = [file, ...this.transitiveDependents(file)];
    return affected.map((f) => this.buildOne(f));
  }

  transitiveDependents(file: string): string[] {
    const out: string[] = [];
    const queue = [path.resolve(file)];
    const seen = new Set<string>(queue);
    while (queue.length > 0) {
      const current = queue.pop()!;
      for (const dep of this.dependents.get(current) ?? []) {
        if (!seen.has(dep)) {
          seen.add(dep);
          out.push(dep);
          queue.push(dep);
        }
      }
    }
    return out;
  }

  /** Wires fs.watch over every file in the graph. Returns a dispose function. */
  watch(onRebuild: (results: BuildFileResult[]) => void): () => void {
    const watched = new Set<string>();
    const attach = (file: string): void => {
      if (watched.has(file)) return;
      watched.add(file);
      try {
        const watcher = fs.watch(file, () => {
          const results = this.onFileChanged(file);
          if (results.length > 0) {
            for (const r of results) {
              for (const dep of this.deps.get(path.resolve(r.inputPath)) ?? []) attach(dep);
            }
            onRebuild(results);
          }
        });
        this.watchers.push(watcher);
      } catch {
        // File may have been deleted between build and watch.
      }
    };
    for (const file of this.deps.keys()) attach(file);
    return () => {
      for (const w of this.watchers) w.close();
      this.watchers.length = 0;
    };
  }

  private buildOne(file: string): BuildFileResult {
    const result = buildFile(file, this.options);
    this.lastContent.set(file, result.source);
    this.updateGraph(file, result.source);
    return result;
  }

  private updateGraph(file: string, source: string): void {
    // Clear old edges from this file.
    for (const dep of this.deps.get(file) ?? []) {
      this.dependents.get(dep)?.delete(file);
    }
    const newDeps = new Set<string>();
    try {
      const program = parse(source, { jsx: file.endsWith(".urx") });
      for (const stmt of program.body) {
        if (
          (stmt.kind === "ImportStmt" || stmt.kind === "ReExportStmt") &&
          (stmt.source.endsWith(".ur") || stmt.source.endsWith(".urx"))
        ) {
          if (stmt.source.startsWith(".")) {
            newDeps.add(path.resolve(path.dirname(file), stmt.source));
          }
        }
      }
    } catch {
      // Parse errors: keep an empty dep set; diagnostics already reported.
    }
    this.deps.set(file, newDeps);
    for (const dep of newDeps) {
      let set = this.dependents.get(dep);
      if (set === undefined) {
        set = new Set();
        this.dependents.set(dep, set);
      }
      set.add(file);
    }
  }
}
