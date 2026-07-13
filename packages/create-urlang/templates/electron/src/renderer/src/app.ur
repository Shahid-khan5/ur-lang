// UrLang renderer — bridge is fully typed via bridge.d.ts (no bahar needed).
pakka salamEl = document.getElementById("salam");
pakka btn = document.getElementById("btn");
pakka jawabEl = document.getElementById("jawab");

salamEl.textContent = "Salam, Electron!";

kaam poochho(): kuchnahi {
  koshish {
    pakka jawab: lafz = intezar bridge.greet("UrLang");
    jawabEl.textContent = jawab;
  } pakro (e) {
    jawabEl.textContent = `ghalti: ${e}`;
  }
}

btn.addEventListener("click", poochho);
