jamaat Shakhs {
  naam: lafz;
  umar: adad = 0;

  banao(naam: lafz, umar: adad) {
    yeh.naam = naam;
    yeh.umar = umar;
  }

  salaam(): lafz {
    wapas "salam, " + yeh.naam;
  }
}

jamaat Talib waris Shakhs {
  madrasa: lafz;

  banao(naam: lafz, madrasa: lafz) {
    buzurg(naam, 18);
    yeh.madrasa = madrasa;
  }

  salaam(): lafz {
    wapas buzurg.salaam() + ` (${yeh.madrasa})`;
  }
}

pakka t = naya Talib("sara", "khi");
bolo t.salaam();
bolo t.umar;

pakka log: lafz[] = [];
pakka shakhsain: Shakhs[] = [naya Shakhs("ali", 40), t];
har s shakhsain mein { log.push(s.salaam()); }
bolo log.length;
