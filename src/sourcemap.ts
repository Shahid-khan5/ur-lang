// Hand-rolled Source Map v3 builder — no dependencies, append-only fast path.

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function encodeVlq(value: number): string {
  let vlq = value < 0 ? (-value << 1) | 1 : value << 1;
  let out = "";
  do {
    let digit = vlq & 31;
    vlq >>>= 5;
    if (vlq > 0) digit |= 32;
    out += B64[digit]!;
  } while (vlq > 0);
  return out;
}

export interface SourceMapJson {
  version: 3;
  file: string;
  sources: string[];
  sourcesContent: string[];
  names: string[];
  mappings: string;
}

/**
 * Builder for a single-source map. Mappings must be added in generated-output
 * order (which codegen naturally does), so encoding is a single append pass.
 */
export class SourceMapBuilder {
  private mappings = "";
  private currentGenLine = 0;
  private lastGenCol = 0;
  private lastSrcLine = 0;
  private lastSrcCol = 0;
  private lineHasSegments = false;

  constructor(
    private readonly sourceFile: string,
    private readonly sourceContent: string,
    private readonly outputFile: string
  ) {}

  /** All coordinates are 0-based. */
  addMapping(genLine: number, genCol: number, srcLine: number, srcCol: number): void {
    while (this.currentGenLine < genLine) {
      this.mappings += ";";
      this.currentGenLine++;
      this.lastGenCol = 0;
      this.lineHasSegments = false;
    }
    if (this.lineHasSegments) this.mappings += ",";
    this.mappings +=
      encodeVlq(genCol - this.lastGenCol) +
      encodeVlq(0) + // source index (always 0 — single source)
      encodeVlq(srcLine - this.lastSrcLine) +
      encodeVlq(srcCol - this.lastSrcCol);
    this.lastGenCol = genCol;
    this.lastSrcLine = srcLine;
    this.lastSrcCol = srcCol;
    this.lineHasSegments = true;
  }

  toJSON(): SourceMapJson {
    return {
      version: 3,
      file: this.outputFile,
      sources: [this.sourceFile],
      sourcesContent: [this.sourceContent],
      names: [],
      mappings: this.mappings,
    };
  }

  toComment(): string {
    const json = JSON.stringify(this.toJSON());
    const b64 = typeof Buffer !== "undefined"
      ? Buffer.from(json, "utf8").toString("base64")
      : btoa(unescape(encodeURIComponent(json)));
    return `//# sourceMappingURL=data:application/json;charset=utf-8;base64,${b64}`;
  }
}
