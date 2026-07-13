// Pehli UrLang app — sab kuch typed hai.
qisim Shakhs = { naam: lafz };

kaam salaam(s: Shakhs): lafz {
  wapas `salam, ${s.naam}!`;
}

pakka app = document.getElementById("app");
app.innerHTML = `<h1>${salaam({ naam: "duniya" })}</h1>`;
