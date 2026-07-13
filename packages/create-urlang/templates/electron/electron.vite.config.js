import { defineConfig } from "electron-vite";
import urlang from "ur-lang/vite";

export default defineConfig({
  // UrLang on both sides — main process and renderer — just like TypeScript.
  main: {
    plugins: [urlang()],
  },
  preload: {},
  renderer: {
    // bridge.d.ts types the preload bridge, so renderer IPC calls are checked.
    plugins: [urlang({ types: ["./src/renderer/src/bridge.d.ts"] })],
  },
});
