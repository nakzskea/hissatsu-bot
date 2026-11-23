import json, os, random, sys, urllib.request, urllib.error
sys.excepthook = lambda t, e, tb: print(e, e.read().decode() if isinstance(e, urllib.error.HTTPError) else "")

URL = "https://raw.githubusercontent.com/nakzskea/hissatsudle/master/public/data/hissatsus.json"
CHANNEL_ID = "1574561004254400572"
COLORS = {"Fire": 0xE74C3C, "Wind": 0x5DADE2, "Forest": 0x58D68D, "Mountain": 0xB9770E, "Void": 0x8E44AD}
INTROS = [
    "Yo ! Tu reconnais cette technique, mec ? 🏄",
    "Hé hé, celle-là elle déchire comme une vague géante ! C'est quoi ? 🌊",
    "Allez, surfe sur ta mémoire : c'est quelle technique ? 🏄‍♂️",
    "Hurley Kane te défie ! Tu la connais, celle-là ? 🌴",
]

data = json.load(urllib.request.urlopen(URL))
groups = {}
for h in data:
    groups.setdefault((h["type"], h["element"]), []).append(h)

# 4 techniques du même type et du même élément ; les groupes trop petits (multi-éléments rares) sont exclus
pick = random.choice([h for h in data if len(groups[(h["type"], h["element"])]) >= 4])
answer, *others = random.sample(groups[(pick["type"], pick["element"])], 4)
choices = random.sample([answer, *others], 4)
good = choices.index(answer)

payload = {
    "embeds": [{
        "title": random.choice(INTROS),
        "color": COLORS.get(answer["element"].split()[0], 0xF1C40F),
        "image": {"url": answer["image"]},
        "footer": {"text": "Clique sur ta réponse, Hurley te dira en privé si t'as bon !"},
    }],
    "components": [{"type": 1, "components": [
        # custom_id = "choix:bonne réponse" → le Worker n'a besoin d'aucun stockage
        {"type": 2, "style": 1, "label": h["names"].get("fr") or h["name"], "custom_id": f"{i}:{good}"}
        for i, h in enumerate(choices)
    ]}],
}

if "--dry-run" in sys.argv:
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    sys.exit()

urllib.request.urlopen(urllib.request.Request(
    f"https://discord.com/api/v10/channels/{CHANNEL_ID}/messages",
    data=json.dumps(payload).encode(),
    headers={
        "Authorization": f"Bot {os.environ['DISCORD_TOKEN']}",
        "Content-Type": "application/json",
        "User-Agent": "DiscordBot (hissatsu-du-jour, 1.0)",
    },
))
