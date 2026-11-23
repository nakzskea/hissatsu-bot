const DATA_URL = "https://raw.githubusercontent.com/nakzskea/hissatsudle/master/public/data/hissatsus.json";
const COLORS = { Fire: 0xe74c3c, Wind: 0x5dade2, Forest: 0x58d68d, Mountain: 0xb9770e, Void: 0x8e44ad };
const WIN = ["🏄 Bien joué, c'est ça !", "Yeah ! Tu surfes sur la bonne vague, mec ! 🌊", "Parfait ! Même moi j'aurais pas fait mieux 😎"];
const LOSE = ["Aïe, t'es tombé de ta planche… C'était", "Raté, mec ! C'était"];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const hex = (s) => Uint8Array.from(s.match(/../g), (b) => parseInt(b, 16));
const json = (o) => new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json" } });
const reply = (content, ephemeral = true) => json({ type: 4, data: { content, flags: ephemeral ? 64 : 0 } });

let groups; // gardé en mémoire tant que le Worker reste chaud
async function question() {
  if (!groups) {
    const data = await (await fetch(DATA_URL, { cf: { cacheTtl: 86400 } })).json();
    groups = {};
    for (const h of data) (groups[h.type + h.element] ??= []).push(h);
    groups = Object.values(groups).filter((g) => g.length >= 4); // même règle que le script quotidien
  }
  const all = groups.flatMap((g) => g.map((h) => [h, g]));
  const [answer, group] = pick(all);
  const choices = [answer, ...group.filter((h) => h !== answer).sort(() => Math.random() - 0.5).slice(0, 3)].sort(() => Math.random() - 0.5);
  const good = choices.indexOf(answer);
  return {
    embeds: [{
      title: "🏋️ Entraînement : c'est quoi cette technique ?",
      color: COLORS[answer.element.split(" ")[0]] ?? 0xf1c40f,
      image: { url: answer.image },
      footer: { text: "Ça compte pas dans le classement, détends-toi 🌴" },
    }],
    components: [{ type: 1, components: choices.map((h, i) => ({
      type: 2, style: 1, label: h.names?.fr || h.name, custom_id: `p:${i}:${good}`,
    })) }],
    flags: 64,
  };
}

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
    const user = i.member?.user ?? i.user;
    if (i.type === 1) return json({ type: 1 }); // PING de Discord

    if (i.type === 2 && i.data.name === "entrainement") return json({ type: 4, data: await question() });

    if (i.type === 2 && i.data.name === "classement") {
      const { keys } = await env.KV.list({ prefix: "score:" });
      const top = keys.map((k) => k.metadata).sort((a, b) => b.points - a.points).slice(0, 10);
      if (!top.length) return reply("Personne n'a encore marqué de point, mec ! 🌊", false);
      const medals = ["🥇", "🥈", "🥉"];
      const lines = top.map((s, n) => `${medals[n] ?? `**${n + 1}.**`} ${s.name} — ${s.points} pt${s.points > 1 ? "s" : ""}`);
      return reply(`🏄 **Classement de Hurley**\n${lines.join("\n")}`, false);
    }

    if (i.type === 3) { // clic sur un bouton
      const parts = i.data.custom_id.split(":");
      const practice = parts[0] === "p";
      const [choice, good] = parts.slice(practice ? 1 : 0).map(Number);
      const answer = i.message.components[0].components[good].label;
      const win = choice === good;

      if (!practice) { // question du jour : 1 essai, et ça compte
        const voteKey = `vote:${i.message.id}:${user.id}`;
        if (await env.KV.get(voteKey)) return reply("Hé, t'as déjà répondu à celle-là ! Reviens demain 🌅");
        await env.KV.put(voteKey, "1", { expirationTtl: 60 * 60 * 24 * 7 });
        if (win) {
          const scoreKey = `score:${user.id}`;
          const { metadata } = await env.KV.getWithMetadata(scoreKey);
          const points = (metadata?.points ?? 0) + 1;
          // les points sont dans les métadonnées pour que /classement les lise en un seul appel
          await env.KV.put(scoreKey, "", { metadata: { name: user.global_name || user.username, points } });
        }
      }
      return reply(win ? pick(WIN) : `${pick(LOSE)} **${answer}** !`);
    }
    return new Response("?", { status: 400 });
  },
};
