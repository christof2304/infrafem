# infraFEM — Hetzner Server Deployment

## Architektur

```
┌─────────────────────────────────────────────────────┐
│  Hetzner Server (Linux)                              │
│                                                      │
│  nginx (:443)                                        │
│  ├── /          → /var/www/infrafem/viewer/          │
│  └── /api/      → proxy_pass http://127.0.0.1:8000  │
│                                                      │
│  uvicorn (systemd) → server/app.py (:8000)           │
│                                                      │
│  /var/www/infrafem/data/*.sqlite   (Modell-Dateien)  │
└─────────────────────────────────────────────────────┘
```

## Voraussetzungen

- Ubuntu/Debian Server mit Root-Zugriff
- Domain (optional, fuer HTTPS mit Let's Encrypt)
- Python 3.11+

## Schritt 1: Repository klonen

```bash
cd /var/www
git clone <repo-url> infrafem
cd infrafem
```

## Schritt 2: Python-Umgebung

```bash
python3 -m venv /var/www/infrafem/.venv
source /var/www/infrafem/.venv/bin/activate
pip install fastapi uvicorn pydantic
```

## Schritt 3: SQLite-Dateien hochladen

Lokal auf Windows:
```powershell
scp examples/*.sqlite user@server:/var/www/infrafem/data/
```

## Schritt 4: Viewer anpassen

In `viewer/index.html` muss die API-URL auf den Server zeigen.
Da der Viewer die API-URL per Query-Parameter oder Fallback liest:

```javascript
const API = new URLSearchParams(location.search).get('api') || 'http://127.0.0.1:8000/api';
```

Bei nginx-Reverse-Proxy auf `/api/` wird der Fallback automatisch durch
einen relativen Pfad ersetzt. Aenderung in `index.html`:

```javascript
const API = new URLSearchParams(location.search).get('api') || '/api';
```

## Schritt 5: systemd Service fuer FastAPI

Datei: `/etc/systemd/system/infrafem.service`

```ini
[Unit]
Description=infraFEM API Server
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/infrafem
Environment="SOFISTIK_SQLITE=/var/www/infrafem/data/beispiel.sqlite"
ExecStart=/var/www/infrafem/.venv/bin/uvicorn server.app:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now infrafem
systemctl status infrafem
```

## Schritt 6: nginx Konfiguration

Datei: `/etc/nginx/sites-available/infrafem`

```nginx
server {
    listen 80;
    server_name _;  # oder domain.de

    # Viewer (statische Dateien)
    root /var/www/infrafem/viewer;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API Reverse Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/infrafem /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

## Schritt 7: HTTPS (optional, mit Certbot)

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d domain.de
```

## Schritt 8: Neue Modelle hochladen

```powershell
# Lokal: CDB -> SQLite
python tools/cdb_to_sqlite.py examples/neues_modell.cdb

# Upload
scp examples/neues_modell.sqlite user@server:/var/www/infrafem/data/

# Server: API neustarten (liest DB_DIR automatisch)
ssh user@server "systemctl restart infrafem"
```

## Dateien die auf den Server muessen

```
/var/www/infrafem/
  server/
    app.py              # FastAPI Server
    __init__.py
  viewer/
    index.html          # Three.js Viewer (angepasste API-URL)
  data/
    *.sqlite            # Modell-Dateien
  .venv/                # Python virtual environment
```

## Wichtig

- **Keine SOFiSTiK-Installation noetig** auf dem Server
- Pipeline (`cdb_to_sqlite.py`) laeuft nur lokal unter Windows
- SQLite-Dateien sind self-contained, brauchen nur Python + FastAPI
- CORS ist im Server bereits auf `*` gesetzt (ok hinter nginx)
