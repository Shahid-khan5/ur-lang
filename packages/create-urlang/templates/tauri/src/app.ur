// UrLang + Tauri: frontend 100% UrLang, backend Rust via typed command wrappers.
lao { greet } "./commands.ur" se;

pakka salamEl = document.getElementById("salam");
pakka btn = document.getElementById("btn");
pakka jawabEl = document.getElementById("jawab");

salamEl.textContent = "Salam, Tauri!";

kaam poochho(): kuchnahi {
  koshish {
    pakka jawab: Wada<lafz> = greet("UrLang");
    jawabEl.textContent = intezar jawab;
  } pakro (e) {
    jawabEl.textContent = `ghalti: ${e}`;
  }
}

btn.addEventListener("click", poochho);
