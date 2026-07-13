// Compiler throughput benchmark. Generates a large realistic program and
// measures lines/second through each stage and the full pipeline.
import { tokenize } from "../src/lexer.js";
import { parse } from "../src/parser.js";
import { check } from "../src/checker.js";
import { compile } from "../src/compiler.js";

function makeProgram(functions: number): string {
  const parts: string[] = [];
  for (let i = 0; i < functions; i++) {
    parts.push(`
kaam kaam${i}(a: adad, b: adad): adad {
  rakho jama = a + b * 2 - (a % 3);
  rakho ginti = 0;
  jab tak (ginti < 10) {
    agar (jama % 2 == 0) {
      jama += ginti * 2;
    } warna agar (jama % 3 == 0) {
      jama -= 1;
      agla;
    } warna {
      jama += 1;
    }
    ginti += 1;
  }
  wapas jama;
}
pakka natija${i}: adad = kaam${i}(${i}, ${i + 1});
bolo "natija${i} =", natija${i};`);
  }
  return parts.join("\n");
}

const source = makeProgram(2000);
const lines = source.split("\n").length;
const bytes = Buffer.byteLength(source);
console.log(`Program: ${lines.toLocaleString()} lines, ${(bytes / 1024).toFixed(0)} KiB\n`);

function bench(name: string, fn: () => void, iterations = 5): number {
  fn(); // warm up
  fn();
  let best = Infinity;
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    fn();
    best = Math.min(best, performance.now() - t0);
  }
  const linesPerSec = lines / (best / 1000);
  console.log(
    `${name.padEnd(22)} ${best.toFixed(1).padStart(8)} ms   ${Math.round(linesPerSec).toLocaleString().padStart(12)} lines/s`
  );
  return best;
}

bench("tokenize", () => void tokenize(source));
const program = parse(source);
bench("parse (incl. lex)", () => void parse(source));
bench("check", () => void check(program));
bench("full compile", () => void compile(source));
bench("compile + sourcemap", () => void compile(source, { sourceMap: true }));
