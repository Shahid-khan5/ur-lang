// Aapki business logic — typed, aur cross-module check hoti hai.
qisim Sehat = { theek: bool, waqt: lafz };

bhejo kaam salaam(naam: lafz): lafz {
  wapas `salam, ${naam}!`;
}

bhejo kaam sehatCheck(): Sehat {
  wapas { theek: sach, waqt: naya Date().toISOString() };
}
