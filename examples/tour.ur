// UrLang ka poora tour — har feature ek jagah.

// Variables: rakho (let) aur pakka (const), types ke saath ya inference se.
rakho umar: adad = 25;
pakka naam: lafz = "Ali";
rakho theekHai = sach; // bool infer hota hai

// Arrays aur objects.
rakho hindse: adad[] = [1, 2, 3, 4, 5];
pakka shakhs = { naam: "Sara", sheher: "Karachi" };

// Conditionals.
agar (umar < 18) {
  bolo naam + " abhi chota hai";
} warna agar (umar < 60) {
  bolo naam + " kaam karta hai";
} warna {
  bolo naam + " retire ho gaya";
}

// Loops with bas (break) aur agla (continue).
rakho jama = 0;
rakho i = 0;
jab tak (i < hindse.length) {
  agar (hindse[i] % 2 == 0) { i += 1; agla; }
  jama += hindse[i];
  i += 1;
}
bolo "taaq hindson ka jama:", jama;

// For-each — har cheez list mein.
har n hindse mein {
  bolo "hindsa:", n;
}

// Anonymous functions (callbacks).
pakka dugne = hindse.map(kaam (n: adad): adad { wapas n * 2; });
bolo "dugne:", dugne;

// Error handling.
koshish {
  phenko "jaan boojh kar ghalti";
} pakro (e) {
  bolo "pakra:", e;
} akhir {
  bolo "akhir mein safai";
}

// Functions — typed params aur return types.
kaam salaam(kisko: lafz): lafz {
  wapas "salam, " + kisko + "!";
}
bolo salaam(shakhs.naam);

// JS interop — Math waghera seedha chalta hai.
bolo "jazr:", Math.sqrt(144);
