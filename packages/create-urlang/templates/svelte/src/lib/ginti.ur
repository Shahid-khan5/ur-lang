// Typed logic, framework se azad — Svelte, React, ya kahin bhi chalti hai.
bhejo kaam agliGinti(ab: adad): adad {
  wapas ab + 1;
}

bhejo kaam paighamBanao(ginti: adad): lafz {
  agar (ginti == 0) {
    wapas "shuruaat se shuru";
  }
  agar (ginti >= 10) {
    wapas `wah! ${ginti} tak pahunch gaye`;
  }
  wapas `ab tak ${ginti} dafa daba`;
}
