// Domain logic — typed, framework se bilkul azad.
bhejo qisim User = { naam: lafz, umar: adad, baalig: bool };

bhejo kaam salaam(naam: lafz): lafz {
  wapas `salam, ${naam}!`;
}

bhejo kaam banaoUser(naam: lafz, umar: adad): User {
  wapas { naam: naam, umar: umar, baalig: umar >= 18 };
}
