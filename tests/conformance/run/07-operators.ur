// Operators: increments, exponent, bitwise, and the keyword operators.
rakho i = 0;
i++;
++i;
bolo i;

bolo 2 ** 8, 2 ** 3 ** 2;
bolo 6 & 3, 6 | 3, 6 ^ 3, ~6, 1 << 3, 16 >> 2;

rakho x = 6;
x &= 3;
x |= 8;
bolo x;

bolo noeyat 5, noeyat "lafz";

jamaat Shakhs {
  naam: lafz;
  banao(naam: lafz) {
    yeh.naam = naam;
  }
}
pakka s = naya Shakhs("Ali");
bolo s hai Shakhs;

pakka o = { a: 1, b: 2 };
bolo "a" andar o, "z" andar o;

rakho m = { a: 1, b: 2 };
mitao m.a;
bolo JSON.stringify(m);
