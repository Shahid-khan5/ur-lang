kaam fib(n: adad): adad {
  agar (n < 2) { wapas n; }
  wapas fib(n - 1) + fib(n - 2);
}
bolo fib(12);

kaam banaao(shuru: adad): koi {
  kaam aage(): adad { shuru += 1; wapas shuru; }
  wapas aage;
}
pakka ginti = banaao(5);
bolo ginti(), ginti();

kaam pehla<T>(xs: T[]): T { wapas xs[0]; }
rakho n: adad = pehla([7, 8]);
rakho s: lafz = pehla(["saat", "aath"]);
bolo n, s;

kaam salaam(naam: lafz, laqab: lafz = "sahib", ...baqi: adad[]): lafz {
  rakho jama = 0;
  har x baqi mein { jama += x; }
  wapas naam + " " + laqab + " " + jama;
}
bolo salaam("ali");
bolo salaam("ali", "bhai", 1, 2, 3);
