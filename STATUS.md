# infraFEM / SOFiSTiK Web-Postprozessor — Projektstatus

Stand: 2026-03-17

---

## 1. Projektstruktur

```
sofistik/
├── server/
│   ├── __init__.py                     Leer (Package-Marker)
│   └── app.py                          FastAPI Server (401 Zeilen)
│                                       6 REST-Endpunkte, Pydantic-Modelle
│                                       Direkt auf SOFiSTiK SQLite-Schema
│
├── viewer/
│   └── index.html                      3D Web-Viewer (637 Zeilen)
│                                       Three.js r170, OrbitControls
│                                       Jet-Colormap, Verformungsanimation
│
├── tools/
│   ├── cdb_analyze.py                  CDB-Analyse-Tool (272 Zeilen)
│   │                                   Scannt KWH/KWL, zeigt Stichproben
│   └── cdb_exporter.py                 CDB/SQLite Konverter (766 Zeilen)
│                                       CdbExporter (DLL) + SqliteConverter
│
├── research/
│   ├── interfaces/
│   │   ├── sofistik_daten.py           Python ctypes Strukturen (689 KB, ~12.400 Zeilen)
│   │   ├── cdbase.h                    C++ API-Header (26 KB)
│   │   ├── cdbtypeall.h                Typ-Konstanten
│   │   └── cd_error.h                  Fehlercodes
│   └── examples/
│       ├── connect_to_cdb/             DLL-Verbindungsbeispiel
│       ├── read_nodes/                 Knoten lesen + Test-CDB (50 KB)
│       ├── get_kwl_values/             KWL-Iteration
│       ├── encode_decode_text/         Text-Encoding
│       ├── number2string/              Zahlen-Konvertierung
│       └── single_span_girder/         Vollstaendiges Berechnungsbeispiel
│
├── examples/
│   ├── webblecbuckling.cdb             Stegblechbeulen (1.2 MB, geschuetzt)
│   ├── webblecbuckling.sqlite          SOFiSTiK SQLite MIT Ergebnissen (451 KB)
│   ├── webblecbuckling.dat             CADINP Input (3.1 KB)
│   ├── webblecbuckling_infrafem.sqlite Konvertiertes infraFEM-Schema (258 KB)
│   ├── bemess1_all_sls_design_checks.cdb  Betonplatte Bemessung (1.8 MB, geschuetzt)
│   ├── bemess1_all_sls_design_checks.sqlite  Nur Geometrie, KEINE Ergebnisse (295 KB)
│   ├── bemess1_patched.cdb             Header-gepatchte Kopie (gescheitert)
│   ├── bemess6_design.cdb              Weitere Bemessung (1.8 MB)
│   ├── starb1.cdb                      Kragstuetze — leer, nicht berechnet (512 B)
│   ├── starb1.sqlite                   Minimal (2 Verschiebungen)
│   ├── starb91.cdb                     Weiteres Beispiel (49 KB)
│   ├── read_nodes_infrafem.sqlite      DLL-Export Test (135 KB)
│   ├── export_report.md                Test-Report
│   ├── *.dat                           CADINP Eingabedateien
│   ├── *.erg                           Berechnungs-Logs (Text)
│   ├── *.plb                           Protokolldateien (Binaer)
│   ├── *.prt                           Druckprotokolle
│   └── *.lst                           Fehlerlisten
│
├── SOFISTIK_RESEARCH.md                CDB-Referenz, API-Doku, Architektur (51 KB)
└── STATUS.md                           Diese Datei
```

**Code-Statistik:**

| Datei | Zeilen | Zweck |
|-------|--------|-------|
| server/app.py | 401 | FastAPI REST Server |
| viewer/index.html | 637 | Three.js 3D-Viewer |
| tools/cdb_exporter.py | 766 | CDB/SQLite Konverter |
| tools/cdb_analyze.py | 272 | CDB Analyse-Tool |
| **Gesamt eigener Code** | **2.076** | |

---

## 2. Was funktioniert

### FastAPI Server (server/app.py)
Alle 7 Endpunkte getestet und verifiziert mit webblecbuckling.sqlite:

| Endpunkt | Status | Daten |
|----------|--------|-------|
| `GET /api/info` | OK | System, Metadata, Counts, verfuegbare LCs |
| `GET /api/model/nodes` | OK | 463 Knoten mit xyz + 6 DOF Support |
| `GET /api/model/elements` | OK | 20 Beams + 415 Quads (4 Dicken, Material, Lokalachsen) |
| `GET /api/model/loadcases` | OK | 8 Lastfaelle mit Typ/Name/Quelle |
| `GET /api/results/node-displacements?lc=1` | OK | 463 Knoten, max uz = -15.037 mm |
| `GET /api/results/beam-forces?lc=2002` | OK | 40 Schnitte, max N = 65.29 kN |
| `GET /api/results/quad-forces?lc=1` | OK | Korrekte 404 mit verfuegbaren LCs |

Fehlerbehandlung: 404 mit hilfreicher Meldung bei nicht vorhandenen Lastfaellen.

### 3D Web-Viewer (viewer/index.html)
- QUAD-Flaechen als halbtransparentes Mesh + Wireframe
- Balkenelemente als Zylinder
- Knoten als InstancedMesh-Kugeln
- Aufgelagerte Knoten in Rot
- OrbitControls (Drehen, Zoomen, Verschieben)
- Lastfall-Dropdown (alle 8 LCs waehlbar)
- Ergebnis-Dropdown: uz, uy, ux, |u|, Balkenkraft N/My/Vz
- Jet-Colormap (Blau-Cyan-Gruen-Gelb-Rot) mit Min/Max-Legende
- Verformungs-Skalierung via Slider (0x bis 500x)
- Live-Mesh-Deformation bei Skalierungs-Aenderung
- Info-Panel mit Modell-Statistiken
- API-URL konfigurierbar via URL-Parameter `?api=`
- Kein Build-Tool, kein npm — eine einzige HTML-Datei

### CDB-Analyse (tools/cdb_analyze.py)
- Oeffnet CDB via sof_cdb_w-2026.dll (nur DLL-kompatible CDBs)
- Zaehlt Knoten, Elemente, Lastfaelle
- Listet alle vorhandenen KWH/KWL Records
- Zeigt Stichproben (max. Verformung, max. Schnittgroesse)
- Getestet mit: read_nodes.cdb (121 Knoten, 100 QUADs)

### CDB/SQLite Konverter (tools/cdb_exporter.py)
Zwei Pfade:
1. **CdbExporter** (DLL-Pfad): CDB -> eigenes SQLite
   - Getestet mit read_nodes.cdb: 121 Knoten, 100 QUADs, 242 Knotenkraefte
2. **SqliteConverter** (SQLite-Pfad): SOFiSTiK SQLite -> infraFEM SQLite
   - Getestet mit webblecbuckling.sqlite: 1.877 Zeilen, alle Zahlen 1:1 identisch

### SOFiSTiK Research (SOFISTIK_RESEARCH.md)
- Vollstaendiger KWH/KWL Record-Katalog (200+ Records)
- Alle Elementtypen mit Feldbeschreibungen
- Ergebnistypen mit Einheiten
- Python + C# Code-Beispiele
- Empfohlene Web-Postprozessor-Architektur
- SQLite-Schema-Entwurf

---

## 3. Was NICHT funktioniert / Probleme

### KRITISCH: CDB-Dateien von SOFiSTiK-Modulen nicht lesbar

**Symptom:** `sof_cdb_init()` gibt Fehlercode -50 fuer CDBs die von AQUA, ASE, BEMESS etc. erstellt wurden (webblecbuckling.cdb, bemess1.cdb, starb91.cdb).

**Ursache:** Diese CDBs haben Byte 3 = 0x20 und Byte 0x40 = 0x01 im Header. Die Interface-DLL (`sof_cdb_w-2026.dll`) verweigert das Oeffnen. Patching der Bytes oeffnet die Datei, aber Leseversuche werfen C++ Exceptions (0xe06d7363) — die Daten sind offenbar verschluesselt oder anders strukturiert.

**Konsequenz:** Der direkte DLL-Zugriffspfad funktioniert NUR mit CDBs, die von der Interface-DLL selbst erstellt wurden (z.B. read_nodes.cdb). Fuer "echte" SOFiSTiK-Projekte ist der DLL-Pfad unbrauchbar.

**Workaround:** SOFiSTiK SQLite-Dateien nutzen (via `sync_cdb_to_db.exe`).

### KRITISCH: sync_cdb_to_db exportiert keine Ergebnisse per CLI

**Symptom:** `sync_cdb_to_db.exe` kopiert Modellgeometrie (Knoten, Elemente, Lastfaelle) zuverlaessig, aber Ergebnistabellen (`fe_result_node_displacement`, `fe_result_quad_internal_force`) bleiben leer.

**Getestete Ansaetze (alle gescheitert):**
1. `--scope result` → "unknown scope identifier result" (obwohl in --help gelistet!)
2. `-r "node_displacement:all"` → Wird stillschweigend ignoriert
3. `--scope new_result_available -n "..."` → "0 result types" unabhaengig vom Format
4. Protobuf-Sync-State Hack (s8→s4, s6→s4, s8→s3) → Keine Wirkung
5. Numerische Type-IDs (24, 210) statt Namen → Keine Wirkung

**Ursache:** Der Ergebnis-Sync ist an das SOFiSTiK NATS-Messaging-System gekoppelt. Ohne laufende GUI-Session weiss das Tool nicht, welche Ergebnisse in der CDB existieren. Der `--scope result` Bug ist wahrscheinlich ein Versions-Issue.

**Workaround:** CDB einmal im SOFiSTiK ResultViewer (GUI) oeffnen. Der ResultViewer triggert automatisch den vollstaendigen Sync inkl. Ergebnisse.

### MITTEL: SOFiSTiK 2026 Trial-Lizenz

**Symptom:** `starb1.cdb` bleibt leer nach Berechnung. ERG-Datei zeigt: "Inkompatible Datenbasis: starb1.cdb benoetigt eine Standard-Lizenz".

**Konsequenz:** Kein eigenstaendiges Berechnen von SOFiSTiK-Beispielen moeglich. Abhaengigkeit von vorberechneten CDB-Dateien.

### NIEDRIG: Umlaute in Lastfall-Namen

**Symptom:** "LAENGSSPANNUNGEN" statt "LAENGSSPANNUNGEN", "SCHUBKRAEFTE" statt "SCHUBKRAEFTE" in der API-Ausgabe.

**Ursache:** Die SOFiSTiK SQLite speichert Text in einer Misch-Encoding (wahrscheinlich Latin-1 in UTF-8 Spalten).

### NIEDRIG: Port-Konflikte beim Server-Neustart

**Symptom:** Port 8000 bleibt nach Server-Stop belegt, erfordert manuelles `taskkill`.

**Ursache:** Windows gibt TCP-Ports verzoegert frei (TIME_WAIT). Hintergrundprozesse in Git Bash werden nicht zuverlaessig beendet.

---

## 4. Architektur-Entscheidungen

### Direkt auf SOFiSTiK SQLite statt Konvertierung

**Entscheidung:** Der FastAPI-Server liest direkt aus dem `sync_cdb_to_db`-Format.

**Gruende:**
- Kein Datenverlust (lokale Achsen, variable Dicken, `raw`-Blobs bleiben erhalten)
- Keine zusaetzliche Komplexität (kein Konverter-Pflege)
- SOFiSTiK generiert die SQLite automatisch
- Performance identisch (beides SQLite)

**Risiko:** SOFiSTiK kann das Schema zwischen Releases aendern. Der `cdb_exporter.py` bleibt als Fallback verfuegbar.

### Vanilla JS + Three.js statt React/Vue

**Entscheidung:** Eine einzige HTML-Datei, kein Build-System.

**Gruende:**
- Minimaler Setup-Aufwand fuer Demo
- Keine Abhaengigkeiten ausser CDN
- Einfach erweiterbar
- Fuer Produktiveinsatz auf React + drei/fiber umstellbar

### Python FastAPI statt Node.js

**Entscheidung:** Python-Backend wegen SOFiSTiK-DLL-Kompatibilitaet.

**Gruende:**
- sofistik_daten.py (ctypes) ist nur fuer Python verfuegbar
- SOFiSTiK DLL ist nur unter Windows verfuegbar
- FastAPI hat automatische OpenAPI/Swagger-Dokumentation
- Fuer spaetere CDB-Direkt-Zugriffe brauchen wir Python

---

## 5. Naechste Schritte (priorisiert)

### P0 — CDB-Ergebnis-Export loesen
- [ ] SOFiSTiK ResultViewer einmal oeffnen fuer jede CDB (manueller Schritt)
- [ ] Oder: Python CDB-Binaerparser schreiben (aufwaendig, ~2-3 Tage)
- [ ] Oder: SOFiSTiK Support kontaktieren wegen `--scope result` Bug

### P1 — QUAD-Schnittgroessen im Viewer
- [ ] Endpunkt `/api/results/quad-forces` mit Daten testen (braucht P0)
- [ ] QUAD-Element-Faerbung nach mxx, myy, vx, vy
- [ ] Knotenbasierte Interpolation fuer glatte Farbverlaeufe

### P2 — Bewehrungsergebnisse
- [ ] Endpunkt `/api/results/quad-reinforcement` hinzufuegen
- [ ] SOFiSTiK Tabellen: fe_result_quad_reinforcement (falls vorhanden)
- [ ] Oder CDB KWH 260/261 (CQUAD_REI/CQUAD_NRI) lesen
- [ ] Darstellung: as_oben, as_unten je Richtung als Farbkarte

### P3 — Spannungsergebnisse
- [ ] Endpunkt `/api/results/quad-stresses`
- [ ] CDB KWH 220/221 (CQUAD_STR/CQUAD_NST)
- [ ] Haupt- und Normalspannungen, Schichtauswahl (oben/mitte/unten)

### P4 — Viewer-Verbesserungen
- [ ] Element-Auswahl per Klick (Raycasting)
- [ ] Tooltip mit Elementnummer + Ergebniswerten
- [ ] Schnitte definieren (Schnittlinie durch Platte)
- [ ] Ergebnis-Diagramme entlang Schnitt
- [ ] Element-Gruppen ein-/ausblenden

### P5 — Multi-Projekt
- [ ] Datei-Upload oder Verzeichnis-Scan
- [ ] Projektliste im Viewer
- [ ] Mehrere CDBs gleichzeitig verwalten

---

## 6. Offene Fragen

### An SOFiSTiK zu klaeren
1. **`sync_cdb_to_db --scope result` Bug:** Ist das ein bekannter Bug oder braucht es zusaetzliche Konfiguration? Das Help-Menuen listet "result" als gueltigen Scope, aber die Ausfuehrung sagt "unknown scope identifier".

2. **CDB-Interface-DLL Zugriff auf Berechnungs-CDBs:** Warum gibt die Interface-DLL (`sof_cdb_w-2026.dll`) Error -50 fuer CDBs die von SOFiSTiK-Modulen erstellt wurden? Ist das ein Lizenz-Check, Verschluesselung, oder Formatinkompatibilitaet?

3. **CDB-Header Byte 0x40:** Was bedeutet das Flag an Position 0x40? Passwortschutz? Wenn ja: wie setzt/entfernt man es?

4. **CLI-Ergebnis-Export:** Gibt es einen offiziellen CLI-Weg, Ergebnisse aus der CDB zu exportieren (ohne GUI)? `results.exe` oeffnet ein Fenster.

5. **Bewehrungsergebnisse in SQLite:** Werden Bewehrungsergebnisse (BEMESS KWH 260/261) auch via sync_cdb_to_db in die SQLite exportiert? Wenn ja: in welche Tabelle?

### Technisch unklar
1. **`raw`-BLOB-Spalten:** Enthalten diese die vollstaendigen CDB-Records? Koennen wir daraus Spannungen/Bewehrung extrahieren, die nicht als benannte Spalten existieren?

2. **SOFiSTiK SQLite Schema-Stabilitaet:** Aendert sich das sync_cdb_to_db Schema zwischen Service Packs? Zwischen Major Releases (2026 → 2027)?

3. **Performance bei grossen Modellen:** Wie verhaelt sich der Viewer bei 10.000+ QUADs? Brauchen wir LOD, Chunking, oder WebWorker?

---

## 7. Demo-Anleitung

### Voraussetzungen
- Python 3.11+ mit `fastapi`, `uvicorn` installiert
- SOFiSTiK 2026 installiert (fuer sync_cdb_to_db)
- Browser mit WebGL-Unterstuetzung

### Starten

```bash
cd C:\users\christof\documents\git\sofistik

# Terminal 1: API-Server (nutzt webblecbuckling.sqlite mit Ergebnissen)
python -m server.app

# Terminal 2: Statischer Datei-Server fuer Viewer
python -m http.server 8080 --directory viewer
```

### Im Browser oeffnen

**Standard (webblecbuckling):**
```
http://localhost:8080
```

**Andere Datenbank:**
```
http://localhost:8080?api=http://127.0.0.1:8001/api
```
(Server auf Port 8001 mit anderer SQLite starten)

### Was man zeigen kann

1. **3D-Modell:** Stegblech 4.0 x 1.8 m, 415 QUAD-Elemente, 20 Balken (Laengssteife)
2. **Lastfaelle:** 8 LCs inkl. 5 Beuleigenformen
3. **Verformung uz:** Lastfall 1 waehlen, Ergebnis "Verformung uz", Slider auf ~200x
   → Beulverformung sichtbar, Farbskala zeigt max 15 mm
4. **Balkenkraft N:** Lastfall 2002 waehlen, Ergebnis "Balkenkraft N"
   → Steife eingefaerbt nach Normalkraft (max 65 kN)
5. **Kamera:** Drehen (linke Maustaste), Zoomen (Scrollrad), Verschieben (rechte Maustaste)
6. **API-Docs:** http://localhost:8000/docs (automatische Swagger-UI)

### Was man NICHT zeigen kann

- QUAD-Schnittgroessen (keine Plattenmomente in Beulanalyse)
- Spannungsergebnisse (noch kein Endpunkt)
- Bewehrungsergebnisse (noch kein Endpunkt)
- bemess1-Modell MIT Ergebnissen (Ergebnis-Sync per CLI nicht moeglich)
- Elementauswahl / Tooltips (noch nicht implementiert)

---

## 8. Neues Beispiel: ase13_schalenbeulen (2026-03-17)

### Modell
**Schalenbeulen Silo** — Zylindrische Siloschale
- 625 Knoten, 624 QUADs (576 Vierecke + 48 Dreiecke), keine Balken
- Durchmesser: 10.0 m, Hoehe: 4.8 m, Wanddicke: 50 mm
- 14 Z-Ebenen, 48 aufgelagerte Knoten am Fuss
- 40 Lastfaelle: 1 Primaerlast, nichtlineare Iterationen, 30+ Beuleigenformen
- CDB: 11.7 MB

### Vergleich mit webblecbuckling

| Eigenschaft | webblecbuckling | ase13_silo |
|-------------|-----------------|------------|
| Geometrie | Flach (2D in XZ) | 3D Zylinder |
| Knoten | 463 | 625 |
| QUADs | 415 (nur Vierecke) | 624 (576 Vierecke + 48 Dreiecke) |
| Balken | 20 | 0 |
| Lastfaelle | 8 | 40 |
| Ergebnisse in SQLite | Ja (926 Verschiebungen) | Nein (CLI-Limitation) |
| Dreieckelemente | Nein | Ja (Spitze des Zylinders) |

### Gefundene Probleme

**BUG GEFIXED: Dreieckelemente (node4=0)**
- Symptom: QUADs mit `node_numbers_3=0` verursachten fehlende Dreiecke im Mesh
- Ursache: Viewer versuchte Knoten-Nr. 0 im `nodeIndexInGeo` Map zu finden → `undefined`
- Fix: Pruefe `q.nodes[3] === 0` und erzeuge nur 1 Dreieck statt 2
- Betrifft: 48 von 624 Elementen in ase13

**OFFEN: Keine Ergebnisse (gleiche CLI-Limitation wie bemess1)**
- sync_cdb_to_db exportiert nur Modellgeometrie
- Ergebnistabellen (`fe_result_*`) bleiben leer
- Workaround: CDB im SOFiSTiK ResultViewer (GUI) oeffnen

**OFFEN: 3D-Geometrie korrekt?**
- Modell ist zylindrisch — erste visuelle Pruefung im Browser erforderlich
- Koordinatentransformation SOFiSTiK Z-up → Three.js Y-up muss fuer
  echte 3D-Modelle validiert werden (webblecbuckling war quasi-2D)

### Viewer-Zugriff (ase13)

```bash
# API Server auf Port 8002
SOFISTIK_SQLITE="...\ase13_schalenbeulen.sqlite" python -m uvicorn server.app:app --port 8002

# Viewer
http://localhost:8080?api=http://127.0.0.1:8002/api
```
