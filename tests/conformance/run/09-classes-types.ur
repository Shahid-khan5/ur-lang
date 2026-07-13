// Statics, accessors, private, generics, enums, destructuring, casts.
fehrist Rang { Laal, Hara, Neela }
bolo Rang.Laal, Rang.Hara, Rang.Neela;

jamaat Ginti {
  sakit kul: adad = 0;
  nijee andar_ka: adad = 0;

  sakit barhao(): adad {
    Ginti.kul += 1;
    wapas Ginti.kul;
  }

  hasil dugna(): adad {
    wapas yeh.andar_ka * 2;
  }

  lagao qeemat(n: adad) {
    yeh.andar_ka = n;
  }
}
Ginti.barhao();
Ginti.barhao();
bolo Ginti.kul;

rakho g = naya Ginti();
g.qeemat = 21;
bolo g.dugna;

jamaat Dabba<T> {
  cheez: T;
  banao(cheez: T) {
    yeh.cheez = cheez;
  }
  nikaalo(): T {
    wapas yeh.cheez;
  }
}
pakka d = naya Dabba<lafz>("salaam");
bolo d.nikaalo();

qisim Jorra<T> = { pehla: T, doosra: T };
pakka j: Jorra<adad> = { pehla: 1, doosra: 2 };
bolo j.pehla + j.doosra;

pakka conf = { server: { port: 8080 }, naam: "app", extra: sach };
pakka { server: { port }, naam: app_ka_naam, ...baqi } = conf;
bolo port, app_ka_naam, JSON.stringify(baqi);

pakka xs = [1, 2, 3];
pakka [pehla, ...tail] = xs;
bolo pehla, tail.length;

pakka maybe: { n?: adad } = { n: 5 };
bolo maybe.n!, maybe.n ?? 0;
