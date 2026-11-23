import json, os, urllib.request

HEADERS = {
    "Authorization": f"Bot {os.environ['DISCORD_TOKEN']}",
    "Content-Type": "application/json",
    "User-Agent": "DiscordBot (hissatsu-du-jour, 1.0)",
}
COMMANDS = [
    {"name": "entrainement", "description": "Une question d'entraînement, juste pour toi (ne compte pas)"},
    {"name": "classement", "description": "Le classement de la question du jour"},
]

app = json.load(urllib.request.urlopen(urllib.request.Request("https://discord.com/api/v10/oauth2/applications/@me", headers=HEADERS)))
urllib.request.urlopen(urllib.request.Request(
    f"https://discord.com/api/v10/applications/{app['id']}/commands",
    data=json.dumps(COMMANDS).encode(), headers=HEADERS, method="PUT",
))
print("Commandes enregistrées pour", app["name"])
