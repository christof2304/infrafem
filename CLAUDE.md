# infraFEM — SOFiSTiK Web-Postprozessor

## Projektstruktur

```
sofistik/
  server/app.py          FastAPI REST API auf SOFiSTiK sync_cdb_to_db SQLite
  viewer/index.html      Three.js 3D-Viewer (single file)
  tools/cdb_to_sqlite.py CDB → SQLite Pipeline (ein Befehl)
  tools/inject_results.py Standalone .erg Parser (veraltet, in cdb_to_sqlite integriert)
  tools/cdb_exporter.py   Legacy DLL-Exporter (funktioniert nicht mit berechneten CDBs)
  tools/cdb_analyze.py    CDB-Analyse-Tool
  examples/               CDB + SQLite Testdateien
  research/interfaces/    sofistik_daten.py, cdbase.h, cd_error.h
```

## Pipeline

```bash
python tools/cdb_to_sqlite.py examples/beispiel.cdb
```

1. `sync_cdb_to_db --scope full` → Geometrie-SQLite
2. `sps + RESULTS` → .erg Textexport (Verschiebungen, Schnittgroessen, Spannungen)
3. Parser → Ergebnisse in SQLite injiziert

## Server starten

```bash
python -m server.app examples/beispiel.sqlite  # API auf :8000
python -m http.server 8080 --directory viewer   # Viewer auf :8080
```

## API Endpoints

- `GET /api/info` — Modellinfos, verfuegbare Lastfaelle
- `GET /api/model/nodes` — Knoten mit Koordinaten + Lager
- `GET /api/model/elements` — Balken + Quads + Federn + Koppelungen
- `GET /api/model/sections` — Querschnitts-Polygone + Abmessungen (aus AQUA)
- `GET /api/model/groups` — Primaergruppen mit Namen
- `GET /api/model/tendons` — Spannglied-Verlaeufe als WCS-Segmente
- `GET /api/model/loadcases` — Lastfaelle
- `GET /api/results/node-displacements?lc=N` — Knotenverschiebungen
- `GET /api/results/beam-forces?lc=N` — Balkenschnittkraefte
- `GET /api/results/quad-forces?lc=N` — Flaechenschnittkraefte
- `GET /api/results/quad-stresses?lc=N&elem=M` — Spannungen oben/unten (fuer Klick-Panel)

## Kritische Hinweise

- **DLL (sof_cdb_w-2026.dll) kann berechnete CDBs NICHT oeffnen** (Error -50, byte 0x40 Protection). Niemals den DLL-Weg fuer berechnete CDBs verwenden.
- **sync_cdb_to_db `--scope result`** ist in der Hilfe gelistet, funktioniert aber nicht ("unknown scope identifier"). Der interne Scope heisst `copy_result`, erfordert aber NATS-Trigger.
- **Loesung:** SPS + RESULTS Modul exportiert Ergebnisse als .erg Text, Parser injiziert in SQLite.
- **RESULTS Syntax:** `NODE TYPE UX,UY,UZ,RX,RY,RZ` (nicht URX), `QUAD TYPE MX,MY,MXY` (nicht MXX), `REPR DLST` (nicht VALS), `LC ALL` (nicht `LC TYPE ALL`)
- **Einheiten:** .erg gibt mm/mrad aus, Parser konvertiert zu m/rad. Spannungen in MPa.
- **Trial-Lizenz:** `BETO`/`STAH` Norm-Materialien funktionieren nicht → `MATE nr E GAM` verwenden
- **RAHM-Syntax:** `KNOT nr X Z` (nur 2 Koordinaten), `STAB` ohne GRP-Keyword
- **Stab-Lasten:** Nicht ueber SOFILOAD (LINE STAB ist ungueltig), sondern als `ELEM` in ASE
- **RESULTS braucht +PROG:** `+PROG RESULTS` mit HEAD/END, nicht `PROG` mit KOPF/ENDE
- **CDB vor Neuberechnung loeschen**, sonst ueberspringt SPS die `urs:`-Module

## Viewer Features

- Gravity-aware Koordinatentransformation (liest gravity_direction aus API)
- Quad-Elemente mit Dicke in 3D (extrudiert entlang Normalen, togglebar)
- Stabquerschnitte als extrudierte Polygone (echte AQUA-Geometrie, togglebar)
- Spannglied-Visualisierung (Girlanden als Linien oder 3D-Huellrohre)
- Auflager-Symbole: Einspannung, Gelenk, Verschieblich, Einzelrichtung (skalierbar)
- Feder- und Koppelungs-Symbole (Zick-Zack + Rauten)
- Gruppen-Toggles mit unterschiedlichen Farben pro Gruppe
- Klick auf Quad zeigt Spannungsverlauf ueber Dicke (togglebar, default off)
- Doppelklick setzt Orbit-Zentrum
- Jet-Colormap fuer Verformungen und Schnittgroessen
- Stab-Schnittgroessen als gefuellte Funktionsgraphen (N, My, Vz)
- Verformungsskalierung mit Slider + Animation
- Legende fuer Lager, Federn, Koppelungen, Spannglieder

## SOFiSTiK Installation

- Pfad: `C:\Program Files\SOFiSTiK\2026\SOFiSTiK 2026\`
- DLL: `...\interfaces\64bit\sof_cdb_w-2026.dll`
- Python Typen: `research/interfaces/sofistik_daten.py`
- Berechnung funktioniert (Trial-Lizenz kann rechnen)
