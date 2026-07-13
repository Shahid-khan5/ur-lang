// chuno / karo / C-style har / labelled loops.
pakka rang = "hara";
chuno (rang) {
  surat "laal": bolo "ruko"; bas;
  surat "hara": bolo "chalo"; bas;
  warna: bolo "pata nahi";
}

rakho i = 0;
karo {
  i += 1;
} jab tak (i < 3);
bolo i;

har (rakho j = 0; j < 3; j++) {
  bolo j;
}

bahar_wala: har a 1 se 3 tak {
  har b 1 se 3 tak {
    agar (b == 2) { agla bahar_wala; }
    bolo a, b;
  }
}
