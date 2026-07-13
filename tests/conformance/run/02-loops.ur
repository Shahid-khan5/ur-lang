rakho jama = 0;
rakho i = 0;
jab tak (i < 10) {
  i += 1;
  agar (i % 2 == 0) { agla; }
  agar (i > 7) { bas; }
  jama += i;
}
bolo jama;

rakho kul = 0;
har n [10, 20, 30] mein { kul += n; }
bolo kul;

rakho harf = "";
har ch "abc" mein { harf += ch + "."; }
bolo harf;

pakka scores = { ali: 1, sara: 2 };
rakho naam = "";
har k scores mein { naam += k + ","; }
bolo naam;

rakho zarb = 1;
har x 1 se 5 tak { zarb *= x; }
bolo zarb;
