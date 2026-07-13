// Bun server, poora UrLang mein. Bun .ur files ko seedha chalata hai —
// koi build step nahi (bunfig.toml mein loader register hai).
lao { salaam, sehatCheck } "./greet.ur" se;

bahar Bun;
bahar Response;

pakka PORT: adad = 3000;

Bun.serve({
  port: PORT,
  fetch: kaam (req: koi): koi {
    pakka raah = naya URL(req.url).pathname;
    agar (raah == "/sehat") {
      wapas Response.json(sehatCheck());
    }
    wapas Response.json({ paigham: salaam("duniya") });
  },
});

bolo `Bun chal raha hai: http://localhost:${PORT}`;
