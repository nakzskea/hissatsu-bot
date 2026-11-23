import json, os, random, sys, urllib.request

TYPES = {"Shoot": "Tir", "Catch": "Arrêt", "Dribble": "Dribble", "Block": "Défense"}
ELEMENTS = {"Fire": "Feu", "Wind": "Air", "Forest": "Bois", "Mountain": "Terre", "Void": "Néant"}
COLORS = {"Fire": 0xE74C3C, "Wind": 0x5DADE2, "Forest": 0x58D68D, "Mountain": 0xB9770E, "Void": 0x8E44AD}

URL = "https://raw.githubusercontent.com/nakzskea/hissatsudle/master/public/data/hissatsus.json"
h = random.choice(json.load(urllib.request.urlopen(URL)))

elements = h["element"].split()
payload = {"embeds": [{
    "title": f"⚡ Hissatsu du jour : {h['names'].get('fr') or h['name']}",
    "description": h["description"].get("fr") or h["description"].get("en", ""),
    "color": COLORS.get(elements[0], 0xF1C40F),
    "image": {"url": h["image"]},
    "fields": [
        {"name": "Type", "value": TYPES.get(h["type"], h["type"]), "inline": True},
        {"name": "Élément", "value": " / ".join(ELEMENTS.get(e, e) for e in elements), "inline": True},
        {"name": "TP", "value": str(h["tp"] or "?"), "inline": True},
        {"name": "Utilisé par", "value": ", ".join(h.get("user") or ["?"]), "inline": False},
    ],
    "footer": {"text": f"{h['name']} · {h['names'].get('jp', '')} · {h['debut']}"},
}]}

if "--dry-run" in sys.argv:
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    sys.exit()

req = urllib.request.Request(
    os.environ["DISCORD_WEBHOOK"],
    data=json.dumps(payload).encode(),
    headers={"Content-Type": "application/json", "User-Agent": "hissatsu-du-jour"},  # Discord bloque l'UA Python par défaut
)
urllib.request.urlopen(req)
