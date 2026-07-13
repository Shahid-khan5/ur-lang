// import.meta helpers for main.ur (UrLang has no import.meta syntax).
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export const mainDirname = path.dirname(fileURLToPath(import.meta.url));
export function joinPath(...parts) {
  return path.join(...parts);
}
