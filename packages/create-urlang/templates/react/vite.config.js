import { defineConfig } from "vite";
import urlang from "ur-lang/vite";

// .urx files compile to React's automatic jsx-runtime — no babel needed.
export default defineConfig({
  plugins: [urlang()],
});
