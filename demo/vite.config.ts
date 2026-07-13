import { defineConfig } from "vite";
import urlang from "../src/vite-plugin.js";

// In a published setup this would be: import urlang from "ur-lang/vite";
export default defineConfig({
  plugins: [urlang()],
  build: {
    // Keeps the emitted chunk directly executable in tests; harmless for real use.
    modulePreload: false,
    minify: false,
  },
});
