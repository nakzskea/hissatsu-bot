// FICHIER POUR CLOUDFLARE

const DATA_URL = "https://raw.githubusercontent.com/nakzskea/hissatsudle/master/public/data/hissatsus.json";
const COLORS = { Fire: 0xe74c3c, Wind: 0x5dade2, Forest: 0x58d68d, Mountain: 0xb9770e, Void: 0x8e44ad };
const WIN = ["🏄 Bien joué, c'est ça !", "Yeah ! Tu surfes sur la bonne vague, mec ! 🌊", "Parfait ! Même moi j'aurais pas fait mieux 😎"];
const LOSE = ["Aïe, t'es tombé de ta planche… C'était", "Raté, mec ! C'était"];
const PUBLIC_WIN = ["🏄 {u} a trouvé ! Trop fort !", "🌊 {u} surfe sur la bonne vague, bien joué !", "😎 {u} a réussi, respect mec !"];
const PUBLIC_LOSE = ["🌊 {u} s'est pris la vague… raté !", "💦 {u} est tombé de sa planche, perdu !", "🐚 {u} a raté, ce sera pour demain !"];
const INTROS = [
  "Yo ! Tu reconnais cette technique, mec ? 🏄",
  "Hé hé, celle-là elle déchire comme une vague géante ! C'est quoi ? 🌊",
  "Allez, surfe sur ta mémoire : c'est quelle technique ? 🏄‍♂️",
  "Hurley Kane te défie ! Tu la connais, celle-là ? 🌴",
];
const CHANNEL_ID = "1574561004254400572";
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const hex = (s) => Uint8Array.from(s.match(/../g), (b) => parseInt(b, 16));
const json = (o) => new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json" } });
const reply = (content, ephemeral = true) => json({ type: 4, data: { content, flags: ephemeral ? 64 : 0 } });

async function scores(env) {
  const { keys } = await env.KV.list({ prefix: "score:" });
  return keys.map((k) => ({ key: k.name, id: k.name.slice(6), ...k.metadata })).sort((a, b) => b.points - a.points);
}

function ranking(list) {
  const medals = { 1: "🥇", 2: "🥈", 3: "🥉" };
  return list.slice(0, 10).map((s, n) => {
    const rank = list.findIndex((x) => x.points === s.points) + 1; // ex aequo → même rang que le premier à ce score
    return `${medals[rank] ?? `**${rank}.**`} ${s.name} — ${s.points} pt${s.points > 1 ? "s" : ""}`;
  }).join("\n");
}

async function discord(env, path, body) {
  const res = await fetch(`https://discord.com/api/v10/${path}`, {
    method: "POST",
    headers: { Authorization: `Bot ${env.DISCORD_TOKEN}`, "Content-Type": "application/json", "User-Agent": "DiscordBot (hissatsu-du-jour, 1.0)" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Discord ${res.status} : ${await res.text()}`); // visible dans les logs du Worker
}

let groups; // gardé en mémoire tant que le Worker reste chaud
async function question(daily = false) {
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
      title: daily ? pick(INTROS) : "🏋️ Entraînement : c'est quoi cette technique ?",
      color: COLORS[answer.element.split(" ")[0]] ?? 0xf1c40f,
      image: { url: answer.image },
      footer: { text: daily ? "Clique sur ta réponse, un seul essai !" : "Ça compte pas dans le classement, détends-toi 🌴" },
    }],
    components: [{ type: 1, components: choices.map((h, i) => ({
      // custom_id = "choix:bonne réponse" (préfixe p: pour l'entraînement) → aucun stockage nécessaire
      type: 2, style: 1, label: h.names?.fr || h.name, custom_id: `${daily ? "" : "p:"}${i}:${good}`,
    })) }],
    flags: daily ? 0 : 64,
  };
}

export default {
  // déclenché par les Cron Triggers de Cloudflare
  async scheduled(event, env) {
    const when = new Date(event.scheduledTime);

    if (when.getUTCDay() === 0 && when.getUTCHours() === 19) { // dimanche 20h à Paris (21h l'été) : bilan + reset
      const list = await scores(env);
      if (!list.length) return discord(env, `channels/${CHANNEL_ID}/messages`, { content: "🌊 Personne n'a marqué cette semaine… On remet ça lundi, les surfeurs !" });
      const winners = list.filter((s) => s.points === list[0].points);
      await discord(env, `channels/${CHANNEL_ID}/messages`, {
        content: `🏆 **Classement de la semaine**\n${ranking(list)}\n\n🏄 Bravo ${winners.map((s) => `<@${s.id}>`).join(" et ")}, roi${winners.length > 1 ? "s" : ""} de la vague cette semaine !\nLes compteurs repartent à zéro, à demain !`,
        allowed_mentions: { users: winners.map((s) => s.id) },
      });
      await Promise.all(list.map((s) => env.KV.delete(s.key)));
      return;
    }

    await discord(env, `channels/${CHANNEL_ID}/messages`, {
      content: when.getUTCHours() < 10 ? "☀️ **Question du matin !**" : "🌤️ **Question de l'aprem !**",
      ...(await question(true)),
    });
  },

  async fetch(req, env, ctx) {
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
      const list = await scores(env);
      if (!list.length) return reply("Personne n'a encore marqué de point cette semaine, mec ! 🌊", false);
      return reply(`🏄 **Classement de la semaine**\n${ranking(list)}`, false);
    }

    if (i.type === 3) { // clic sur un bouton
      const parts = i.data.custom_id.split(":");
      const practice = parts[0] === "p";
      const [choice, good] = parts.slice(practice ? 1 : 0).map(Number);
      const answer = i.message.components[0].components[good].label;
      const win = choice === good;

      if (!practice) { // question du jour : 1 essai, et ça compte
        const voteKey = `vote:${i.message.id}:${user.id}`;
        if (await env.KV.get(voteKey)) return reply("Hé, t'as déjà répondu à celle-là ! Attends la prochaine vague 🌅");
        await env.KV.put(voteKey, "1", { expirationTtl: 60 * 60 * 24 * 7 });
        if (win) {
          const scoreKey = `score:${user.id}`;
          const { metadata } = await env.KV.getWithMetadata(scoreKey);
          const points = (metadata?.points ?? 0) + 1;
          // les points sont dans les métadonnées pour que /classement les lise en un seul appel
          await env.KV.put(scoreKey, "", { metadata: { name: user.global_name || user.username, points } });
        }
        // annonce publique (sans la réponse) ; si raté, la bonne réponse arrive juste après en privé
        // petit délai : Discord doit avoir reçu l'annonce publique avant le message privé
        if (!win) ctx.waitUntil(new Promise((r) => setTimeout(r, 1000)).then(() => fetch(`https://discord.com/api/v10/webhooks/${i.application_id}/${i.token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: `${pick(LOSE)} **${answer}** !`, flags: 64 }),
        })));
        return json({ type: 4, data: {
          content: pick(win ? PUBLIC_WIN : PUBLIC_LOSE).replace("{u}", `<@${user.id}>`),
          allowed_mentions: { users: [user.id] },
        } });
      }
      return reply(win ? pick(WIN) : `${pick(LOSE)} **${answer}** !`);
    }
    return new Response("?", { status: 400 });
  },
};
