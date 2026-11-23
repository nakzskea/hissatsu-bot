const WIN = ["Tubular ! 🏄 Bien joué, c'est ça !", "Yeah ! Tu surfes sur la bonne vague, mec ! 🌊", "Parfait ! Même moi j'aurais pas fait mieux 😎"];
const LOSE = ["Wipeout ! 🌊 C'était", "Aïe, t'es tombé de ta planche… C'était", "Raté, mec ! C'était"];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const hex = (s) => Uint8Array.from(s.match(/../g), (b) => parseInt(b, 16));
const json = (o) => new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json" } });

export default {
  async fetch(req, env) {
    // Discord exige qu'on vérifie la signature de chaque requête
    const sig = req.headers.get("X-Signature-Ed25519");
    const ts = req.headers.get("X-Signature-Timestamp");
    const body = await req.text();
    const key = await crypto.subtle.importKey("raw", hex(env.PUBLIC_KEY), { name: "Ed25519" }, false, ["verify"]);
    const ok = sig && ts && (await crypto.subtle.verify("Ed25519", key, hex(sig), new TextEncoder().encode(ts + body)));
    if (!ok) return new Response("signature invalide", { status: 401 });

    const i = JSON.parse(body);
    if (i.type === 1) return json({ type: 1 }); // PING de Discord à l'enregistrement de l'URL

    if (i.type === 3) { // clic sur un bouton
      const [choice, good] = i.data.custom_id.split(":").map(Number);
      const answer = i.message.components[0].components[good].label;
      const content = choice === good ? pick(WIN) : `${pick(LOSE)} **${answer}** !`;
      return json({ type: 4, data: { content, flags: 64 } }); // 64 = éphémère, visible que par lui
    }
    return new Response("?", { status: 400 });
  },
};
