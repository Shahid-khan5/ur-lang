<script>
  // Svelte component; the Rust bridge it calls is typed UrLang.
  import { greet } from "./lib/commands.ur";

  let jawab = $state("");
</script>

<main>
  <h1>UrLang + Svelte + Tauri</h1>
  <button id="poochho" onclick={async () => (jawab = await greet("duniya"))}>
    Rust se poochho
  </button>
  <p id="jawab">{jawab}</p>
</main>

<style>
  main {
    font-family: system-ui, sans-serif;
    text-align: center;
    padding: 2rem;
  }
</style>
