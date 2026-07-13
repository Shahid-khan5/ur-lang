pakka shakhs = { naam: "ali", umar: 20, sheher: "khi" };
pakka { naam, umar } = shakhs;
bolo `${naam} ${umar}`;

pakka [pehla, doosra] = [100, 200];
bolo pehla + doosra;

pakka bara = { ...shakhs, umar: 21 };
bolo bara.umar, bara.sheher;

pakka hindse = [1, 2, 3];
pakka zyada = [0, ...hindse, 4];
bolo zyada.length;
bolo Math.max(...hindse);

pakka dugne = hindse.map(kaam (n: adad): adad { wapas n * 2; });
bolo dugne;

koshish {
  phenko "masla";
} pakro (e) {
  bolo "pakra:", e;
} akhir {
  bolo "safai";
}
