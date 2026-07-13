import { defineConfig } from "vite";
import urlang from "ur-lang/vite";

export default defineConfig({
  plugins: [urlang()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
});
