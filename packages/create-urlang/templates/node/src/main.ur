// Node.js server, poora UrLang mein. `urlang build` isay saada .js banata hai
// (source maps + .d.ts ke saath), phir `node dist/main.js` chalta hai.
lao { createServer } "node:http" se;
lao { salaam, sehatCheck } "./greet.ur" se;

pakka PORT: adad = 3000;

pakka server = createServer(kaam (req: koi, res: koi) {
  agar (req.url == "/sehat") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(sehatCheck()));
    wapas;
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ paigham: salaam("duniya") }));
});

server.listen(PORT);
bolo `Server chal raha hai: http://localhost:${PORT}`;
