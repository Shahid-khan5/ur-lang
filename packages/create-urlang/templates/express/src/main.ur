// Express server, poora UrLang mein. Express ka default export `asal` se aata
// hai — bilkul waise jaise TypeScript mein `import express from "express"`.
lao asal express "express" se;
lao { salaam, banaoUser } "./users.ur" se;

pakka app = express();
pakka PORT: adad = 3000;

app.use(express.json());

app.get("/", kaam (req: koi, res: koi) {
  res.json({ paigham: salaam("duniya") });
});

app.post("/users", kaam (req: koi, res: koi) {
  // banaoUser ka type users.ur se aata hai — ghalat shape yahin pakri jayegi.
  pakka user = banaoUser(req.body.naam, req.body.umar);
  res.status(201).json(user);
});

app.listen(PORT);
bolo `Express chal raha hai: http://localhost:${PORT}`;
