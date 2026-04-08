# 🌲 Scrum Adventure Game

Interaktives Scrum-Abenteuer-Spiel für Teams. **Keine externe Datenbank nötig** — läuft komplett auf Render Free (kostenlos, keine Kreditkarte nötig via GitHub Student / oder mit CC-Verifizierung ohne Kosten).

---

## 📁 Projektstruktur

```
scrum-adventure/
├── backend/
│   ├── server.js           # Express API + JSON-Datei-Datenbank
│   ├── package.json        # Nur 5 Dependencies, keine native modules
│   └── .env.example
├── frontend/
│   └── public/
│       ├── welcome.html        # Spielstart
│       ├── quest-forest.html   # Quest 1: Scrum-Baum
│       ├── quest-huette.html   # Quest 2: Zollhütte
│       ├── quest-bit.html      # Quest 3: BIT Zollikofen
│       ├── quest-marzili.html  # Quest 4: Marzili Bern
│       ├── quest-olymp.html    # Quest 5: Scrum Olymp
│       ├── admin.html          # Spielleiter-Tool
│       └── api-client.js       # Frontend SDK
├── render.yaml             # Render.com Deployment (1 Service, keine DB)
└── README.md
```

---

## 🚀 Deployment auf Render.com (KOSTENLOS)

### Schritt 1 – GitHub Repository

```bash
cd scrum-adventure
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/DEIN_USER/scrum-adventure.git
git push -u origin main
```

### Schritt 2 – Render.com

1. **render.com** → Login mit GitHub
2. **New +** → **Web Service**
3. GitHub Repository auswählen
4. Einstellungen:
   - **Build Command:** `cd backend && npm install`
   - **Start Command:** `cd backend && node server.js`
   - **Plan:** Free
5. **Environment Variables** hinzufügen:

| Variable | Wert |
|----------|------|
| `ADMIN_PASSWORD` | Dein Admin-Passwort |
| `JWT_SECRET` | Beliebiger langer zufälliger String |
| `DB_PATH` | `/opt/render/project/src/backend/db.json` |

6. **Deploy** klicken → fertig in ~2 Minuten!

> ⚠️ **Hinweis:** Render Free pausiert den Service nach 15 Minuten Inaktivität.
> Beim ersten Aufruf kann es 30-60 Sekunden dauern bis er wieder startet.
> Spielstände bleiben erhalten (JSON-Datei auf dem Render-Disk).

---

## 🖥️ Lokal testen

```bash
cd backend
cp .env.example .env
npm install
node server.js
# → http://localhost:3001
```

---

## 🎮 URLs

| URL | Beschreibung |
|-----|-------------|
| `/welcome` | Spiel starten |
| `/quest-forest` | Quest 1 |
| `/quest-huette` | Quest 2 |
| `/quest-bit` | Quest 3 |
| `/quest-marzili` | Quest 4 |
| `/quest-olymp` | Quest 5 (Final) |
| `/admin` | Spielleiter-Tool (Login: admin / ADMIN_PASSWORD) |

---

## 🔑 Quest-Lösungen (nur Spielleiter)

| Quest | Lösung |
|-------|--------|
| Scrum-Baum Q1 | Option B: `+=` statt `=+` |
| Scrum-Baum Q2 | Option A: PO, SM, Dev Team |
| Scrum-Baum Q3 | `story_points / tage` |
| Zollhütte (Team Valletta) | `DAZITTPE-17125` |
| Zollhütte (Team Suvretta) | `DAZITSUV-7951` |
| BIT Sorting | Features/Enabler den richtigen PIs zuweisen |
| Marzili | `230` Meter |
| Olymp | `mein Scrum Master ist der Beste!!!` |

---

## 💾 Datenspeicherung

Spielstände werden in `db.json` gespeichert (neben `server.js`).
- Spieler können das Spiel unterbrechen und mit Name + Team weiterspielen
- Bei einem neuen Render-Deploy bleiben die Daten erhalten (persistenter Pfad)
