<script>
  // The component is Svelte; every bit of logic below comes from UrLang,
  // fully type-checked at build time.
  import { agliGinti, paighamBanao } from "./lib/ginti.ur";

  let ginti = $state(0);
  let paigham = $derived(paighamBanao(ginti));
</script>

<main>
  <h1>Salaam, duniya!</h1>
  <p id="paigham">{paigham}</p>
  <button id="zyada" onclick={() => (ginti = agliGinti(ginti))}>
    Ginti: {ginti}
  </button>
</main>

<style>
  main {
    font-family: system-ui, sans-serif;
    text-align: center;
    padding: 2rem;
  }
</style>
