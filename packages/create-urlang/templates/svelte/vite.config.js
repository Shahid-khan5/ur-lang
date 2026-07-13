import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import urlang from "ur-lang/vite";

// Svelte owns the components (.svelte); UrLang owns the typed logic (.ur) that
// they import — exactly how TypeScript is used in a Svelte project.
export default defineConfig({
  plugins: [urlang(), svelte()],
});
