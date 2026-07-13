import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import urlang from "ur-lang/vite";

export default defineConfig({
  plugins: [urlang(), svelte()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
});
