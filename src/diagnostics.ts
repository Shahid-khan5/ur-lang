// Central diagnostic catalog — the single source of truth for error codes.
// Every UrError resolves its code here (same model as TypeScript's
// diagnosticMessages.json). UR1xxx = syntax, UR2xxx = type/semantic.

export interface DiagnosticEntry {
  code: string;
  /** Matched against the (templated) message text. First match wins. */
  match: RegExp;
  title: string;
  help: string;
}

export const DIAGNOSTIC_CATALOG: DiagnosticEntry[] = [
  // ---- UR1xxx: lexical + syntax ----
  { code: "UR1001", match: /yeh character samajh nahi aaya/, title: "Unexpected character", help: "Source mein aisa character hai jo UrLang ka hissa nahi. Usay hatao ya string mein rakho." },
  { code: "UR1002", match: /string band karna bhool gaye/, title: "Unterminated string", help: "Har string ko usi quote se band karo jis se shuru ki thi." },
  { code: "UR1003", match: /comment band karna bhool gaye/, title: "Unterminated comment", help: "Block comment ko '*/' se band karo." },
  { code: "UR1004", match: /akela '&'|akela '\|'/, title: "Lone & or |", help: "Logic ke liye '&&' aur '||' likho. Type unions mein akela '|' sirf type ki jagah aata hai." },
  { code: "UR1005", match: /template string (band karna bhool|theek se band nahi)/, title: "Unterminated template string", help: "Backtick template ko '`' se band karo; har ${ ko } se." },
  { code: "UR1010", match: /';' lagana bhool gaye/, title: "Missing semicolon", help: "Har statement ';' pe khatam hoti hai." },
  { code: "UR1011", match: /yahan '.*' hona chahiye tha/, title: "Expected token", help: "Parser ko yahan aur kuch chahiye tha — message mein likha hai kya." },
  { code: "UR1012", match: /ko koi value to do/, title: "Missing initializer", help: "rakho/pakka declaration ko '=' ke saath value do." },
  { code: "UR1013", match: /is cheez ko value assign nahi/, title: "Invalid assignment target", help: "Sirf variable, property ya index ko assign kar sakte ho." },
  { code: "UR1014", match: /'jab' ke baad 'tak'/, title: "Incomplete jab tak", help: "While loop 'jab tak (shart) { }' hota hai." },
  { code: "UR1015", match: /block band karna bhool gaye|jamaat band karna bhool gaye/, title: "Unclosed block", help: "Har '{' ka ek '}' hona chahiye." },
  { code: "UR1016", match: /import aise likhte hain|re-export aise likhte hain/, title: "Malformed import/export", help: 'lao { naam } "./module.ur" se; — isi tarteeb mein.' },
  { code: "UR1017", match: /yahan type hona chahiye|yahan type ka naam/, title: "Expected a type", help: "Annotation mein type do: adad, lafz, { naam: lafz }, \"literal\", union waghera." },
  { code: "UR1018", match: /yahan expression hona chahiye/, title: "Expected an expression", help: "Yahan koi value ya expression aana chahiye tha." },
  { code: "UR1019", match: /rest parameter (aakhri|ki default)/, title: "Bad rest parameter", help: "Rest parameter aakhri hota hai aur default value nahi leta." },
  { code: "UR1020", match: /'\?' aur default value dono nahi/, title: "Optional with default", help: "Ya '?' likho ya default value — default khud optional bana deta hai." },
  { code: "UR1021", match: /loop aise likhte hain|range loop aise likhte hain/, title: "Malformed har loop", help: "har cheez list mein { } — ya — har i 1 se 10 tak { }." },
  { code: "UR1022", match: /'koshish' ke baad 'pakro'/, title: "koshish without pakro/akhir", help: "koshish ke baad pakro (e) { } ya akhir { } zaroori hai." },
  { code: "UR1023", match: /qisim aise likhte hain/, title: "Malformed qisim", help: "qisim Naam = type; — '=' aur ';' dono chahiye." },
  { code: "UR1024", match: /'bhejo' ke baad/, title: "Malformed bhejo", help: "bhejo ke baad kaam, rakho, pakka, qisim, jamaat, asal ya { } aana chahiye." },
  { code: "UR1025", match: /'buzurg' ke baad/, title: "Malformed buzurg", help: "buzurg(...) constructor call ke liye, buzurg.method() parent method ke liye." },
  { code: "UR1026", match: /destructuring mein '='/, title: "Malformed destructuring", help: "pakka { naam } = obj; — '=' ke saath source do." },
  { code: "UR1027", match: /object ki key naam ya string/, title: "Bad object key", help: "Object keys naam ya string hote hain." },
  { code: "UR1028", match: /statement samajh nahi aayi/, title: "Unknown statement", help: "Yeh UrLang ki koi statement nahi bani." },

  // ---- UR2xxx: types + semantics ----
  { code: "UR2001", match: /ka type '.*' hai, lekin value/, title: "Initializer type mismatch", help: "Annotation aur value ka type ek hona chahiye." },
  { code: "UR2002", match: /declare hi nahi kiya/, title: "Undeclared name", help: "Pehle rakho/pakka se banao; JS global ke liye 'bahar naam;' likho." },
  { code: "UR2003", match: /pakka hai — isse badla/, title: "Assignment to pakka", help: "pakka const hai. Badalna hai to rakho use karo." },
  { code: "UR2004", match: /pehle se declared hai/, title: "Duplicate declaration", help: "Isi scope mein yeh naam pehle se hai — naya naam do ya block se shadow karo." },
  { code: "UR2005", match: /sirf adad pe chalta hai/, title: "Numeric operator misuse", help: "-, *, /, %, <, > sirf adad par chalte hain." },
  { code: "UR2006", match: /'\+' adad ya lafz pe/, title: "Bad + operands", help: "+ adad jama karta hai ya lafz jorta hai — aur kuch nahi." },
  { code: "UR2007", match: /kabhi barabar nahi ho sakte/, title: "Impossible comparison", help: "In types ka overlap nahi — comparison hamesha jhoot degi." },
  { code: "UR2008", match: /ke dono taraf bool/, title: "Logical operator needs bool", help: "&& aur || ke operands bool hone chahiye." },
  { code: "UR2009", match: /'!' sirf bool pe|'-' sirf adad pe/, title: "Unary operator misuse", help: "! bool par, - adad par." },
  { code: "UR2010", match: /condition bool honi chahiye/, title: "Condition must be bool", help: "agar/jab tak ki shart bool ho — '== khaali' ya comparison use karo." },
  { code: "UR2011", match: /'bas' sirf loop|'agla' sirf loop/, title: "bas/agla outside loop", help: "break/continue loop ke andar hi chalte hain." },
  { code: "UR2012", match: /'wapas' sirf kaam/, title: "wapas outside function", help: "Return sirf kaam ke andar." },
  { code: "UR2013", match: /wapas karna hai, lekin|khaali 'wapas;' nahi chalega/, title: "Return type mismatch", help: "Kaam jo type declare karta hai wohi wapas karo." },
  { code: "UR2014", match: /kuchnahi \(void\) hai — value wapas/, title: "Value return from void", help: "kuchnahi kaam se sirf 'wapas;' (bina value)." },
  { code: "UR2015", match: /argument chahiye, \d+ diye/, title: "Wrong argument count", help: "Kaam ki signature dekho — required/optional/rest ka hisaab rakho." },
  { code: "UR2016", match: /argument \d+ ka type/, title: "Argument type mismatch", help: "Har argument declared param type se match kare." },
  { code: "UR2017", match: /ko call nahi kar sakte/, title: "Not callable", help: "Sirf kaam call hote hain." },
  { code: "UR2018", match: /naam ki property nahi hai/, title: "Unknown property", help: "Type mein yeh property nahi — spelling dekho ya type update karo." },
  { code: "UR2019", match: /khaali ho sakti hai|khaali pe '\.'|kuchnahi pe '\.'/, title: "Possibly-khaali access", help: "Pehle 'agar (x != khaali)' se narrow karo, ya '?.' use karo." },
  { code: "UR2020", match: /is array mein '.*' aane chahiye/, title: "Array element type mismatch", help: "Array ke sab elements declared element type ke hon." },
  { code: "UR2021", match: /array ka index adad/, title: "Bad array index", help: "Index adad hota hai." },
  { code: "UR2022", match: /is type mein hai hi nahi/, title: "Excess property", help: "Object literal mein sirf wahi keys jo expected type mein hain." },
  { code: "UR2023", match: /property dena zaroori hai/, title: "Missing required property", help: "Expected type ki har required key do (ya usay optional banao: key?: T)." },
  { code: "UR2024", match: /naam ki koi type nahi hai/, title: "Unknown type name", help: "qisim se banao, import karo, ya builtin types use karo." },
  { code: "UR2025", match: /qisim '.*' pehle se defined/, title: "Duplicate type name", help: "Type ka naam scope mein unique hona chahiye." },
  { code: "UR2026", match: /naam ka koi export nahi/, title: "Unknown export", help: "Module ke bhejo kiye hue naam hi import ho sakte hain." },
  { code: "UR2027", match: /'\.\.\.' (yahan nahi|ke saath array|wali value)/, title: "Bad spread", help: "'...' array/object literals aur call arguments mein, array/object value ke saath." },
  { code: "UR2028", match: /'har \.\.\. mein' (sirf array|array, lafz)/, title: "Not iterable", help: "har array, lafz (characters) ya object (keys) pe chalta hai." },
  { code: "UR2029", match: /destructuring (object|array) pe chalti/, title: "Bad destructuring source", help: "{ } object se, [ ] array se." },
  { code: "UR2030", match: /rest parameter ka type array/, title: "Rest parameter type", help: "Rest param ka type array do, jaise adad[]." },
  { code: "UR2031", match: /zaroori parameter optional walon ke baad/, title: "Required after optional", help: "Pehle required params, phir optional/default." },
  { code: "UR2032", match: /default value ka type/, title: "Default value type mismatch", help: "Default value param ke declared type ki ho." },
  { code: "UR2033", match: /range loop ki hadein adad/, title: "Bad range bounds", help: "har i <adad> se <adad> tak." },
  { code: "UR2034", match: /'yeh' sirf jamaat/, title: "yeh outside jamaat", help: "yeh (this) sirf jamaat ke methods mein." },
  { code: "UR2035", match: /'naya' sirf jamaat pe|naam ki koi jamaat nahi hai\./, title: "naya on non-class", help: "naya sirf declared jamaat pe. (JS class ho to 'bahar' se declare karo — woh koi hai.)" },
  { code: "UR2036", match: /'buzurg\(\.\.\.\)' sirf waris|'buzurg\.' sirf waris/, title: "buzurg misuse", help: "buzurg sirf waris (extends) wali jamaat mein." },
  { code: "UR2037", match: /naam ki koi jamaat nahi hai \(pehle define/, title: "Unknown parent class", help: "waris se pehle parent jamaat define karo." },
  { code: "UR2038", match: /wali jagah '.*' nahi rakh sakte|'\+=' yahan nahi chalega/, title: "Assignment type mismatch", help: "Variable ka declared type badla nahi ja sakta." },
  { code: "UR2039", match: /parameter '.*' do dafa/, title: "Duplicate parameter", help: "Har parameter ka naam alag ho." },
  { code: "UR2040", match: /Wada ko ek type argument/, title: "Wada needs one type argument", help: "Wada<adad> — theek ek type argument." },
  { code: "UR2041", match: /type arguments nahi leta/, title: "Type arguments on non-generic", help: "Sirf Wada<T> type arguments leta hai (abhi)." },
  { code: "UR2042", match: /ka type '.*' hona chahiye, '.*' nahi/, title: "Property/argument type mismatch", help: "Value ko expected type ke mutabiq do." },
  { code: "UR2043", match: /banao ko .* argument chahiye/, title: "Constructor argument count", help: "banao ki signature ke mutabiq arguments do." },
];

/** Resolves a diagnostic code for a message; UR0000 if uncatalogued. */
export function codeFor(message: string): string {
  for (const entry of DIAGNOSTIC_CATALOG) {
    if (entry.match.test(message)) return entry.code;
  }
  return "UR0000";
}
