// UrLang demo app — counter, async data loading with error handling,
// and list rendering. All application logic is UrLang.
lao { hindsaBanao } "./format.ur" se;
lao { shehrLao } "./data.ur" se;

pakka gintiEl = document.getElementById("ginti");
pakka paighamEl = document.getElementById("paigham");
pakka kamBtn = document.getElementById("kam");
pakka zyadaBtn = document.getElementById("zyada");
pakka loadBtn = document.getElementById("load");
pakka shehrList = document.getElementById("sheher-list");
pakka statusEl = document.getElementById("status");

// ---------- Counter ----------

rakho ginti: adad = 0;

kaam dikhao(): kuchnahi {
  gintiEl.textContent = hindsaBanao(ginti);
  agar (ginti == 0) {
    paighamEl.textContent = "shuruaat se shuru";
  } warna agar (ginti < 0) {
    paighamEl.textContent = "manfi mein chale gaye!";
  } warna agar (ginti >= 10) {
    paighamEl.textContent = "das paar — shabash!";
  } warna {
    paighamEl.textContent = "";
  }
}

kaam badlo(farq: adad): kuchnahi {
  ginti += farq;
  dikhao();
}

zyadaBtn.addEventListener("click", kaam (): kuchnahi { badlo(1); });
kamBtn.addEventListener("click", kaam (): kuchnahi { badlo(-1); });

// ---------- Async data loading (in Tauri this would be invoke(...)) ----------

kaam shehrDikhao(): koi {
  statusEl.textContent = "lo raha hai...";
  koshish {
    pakka sheher: lafz[] = intezar shehrLao();
    shehrList.textContent = "";
    har naam sheher mein {
      pakka li = document.createElement("li");
      li.textContent = naam;
      shehrList.appendChild(li);
    }
    statusEl.textContent = sheher.length + " sheher mil gaye";
  } pakro (e) {
    statusEl.textContent = "ghalti: " + e;
  }
}

loadBtn.addEventListener("click", shehrDikhao);

dikhao();
