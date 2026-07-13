qisim Shakhs = { naam: lafz, umar?: adad };

kaam tafseel(s: Shakhs): lafz {
  agar (s.umar != khaali) {
    wapas `${s.naam} (${s.umar})`;
  }
  wapas s.naam;
}
bolo tafseel({ naam: "ali", umar: 30 });
bolo tafseel({ naam: "sara" });

rakho size: "chota" | "bara" = "chota";
bolo size == "chota" ? "S" : "L";

rakho x: lafz | khaali = khaali;
bolo x == khaali ? "khaali tha" : x;
x = "bhara";
agar (x != khaali) { bolo x.length; }
