// Async/await aur error handling — production apps ki bunyaad.
// Run with: urlang run examples/async.ur
bahar Promise;

kaam sabr(qeemat: adad): koi {
  wapas Promise.resolve(qeemat);
}

kaam dataLao(kamyab: bool): koi {
  agar (!kamyab) {
    phenko "server ne jawab nahi diya";
  }
  wapas intezar sabr(42);
}

kaam chalao(): koi {
  koshish {
    pakka jawab = intezar dataLao(sach);
    bolo "mila:", jawab;
    intezar dataLao(jhoot);
  } pakro (e) {
    bolo "pakra:", e;
  } akhir {
    bolo "safai mukammal";
  }
}

chalao();
