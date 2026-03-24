# Claude Code Prompt fuer Hetzner Deployment

Kopiere diesen Prompt in Claude Code auf dem Server:

---

```
Ich moechte die infraFEM Web-Applikation auf diesem Server deployen.
Lies bitte zuerst DEPLOY.md fuer die Architektur-Uebersicht.

Das Projekt besteht aus:
1. FastAPI Server (server/app.py) - REST API die SQLite-Dateien liest
2. Three.js Viewer (viewer/index.html) - Statisches SPA

Bitte fuehre folgende Schritte aus:

## 1. Python-Umgebung einrichten
- Erstelle venv in /var/www/infrafem/.venv
- Installiere: fastapi uvicorn pydantic

## 2. Datenverzeichnis
- Erstelle /var/www/infrafem/data/
- Pruefe ob dort .sqlite Dateien liegen (die lade ich separat hoch)

## 3. Viewer API-URL anpassen
- In viewer/index.html die Zeile mit `const API = ...` aendern:
  Von: `const API = new URLSearchParams(location.search).get('api') || 'http://127.0.0.1:8000/api';`
  Zu:  `const API = new URLSearchParams(location.search).get('api') || '/api';`

## 4. systemd Service erstellen
- Erstelle /etc/systemd/system/infrafem.service (siehe DEPLOY.md)
- Environment: SOFISTIK_SQLITE zeigt auf erste .sqlite in /var/www/infrafem/data/
- Aktiviere und starte den Service

## 5. nginx Konfiguration
- Erstelle /etc/nginx/sites-available/infrafem
- Root: /var/www/infrafem/viewer (fuer statische Dateien)
- /api/ als reverse proxy auf 127.0.0.1:8000
- Aktiviere die Site, teste und reloade nginx

## 6. Verifizierung
- curl http://localhost/api/info sollte JSON zurueckgeben
- curl http://localhost/ sollte den HTML-Viewer liefern

Falls nginx oder systemd schon mit anderer Config laufen, passe entsprechend an.
Bei Fehlern: Logs pruefen mit journalctl -u infrafem und nginx error log.
```

---

## Vorher auf dem Server erledigen

```bash
# Repository klonen (oder rsync)
cd /var/www
git clone <repo-url> infrafem

# SQLite-Dateien hochladen (von Windows aus)
scp examples/*.sqlite user@server:/var/www/infrafem/data/
```
