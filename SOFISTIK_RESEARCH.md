# SOFiSTiK 2026 - Vollständige technische Referenz

> Erstellt durch Analyse der SOFiSTiK 2026 Installation unter
> `C:\Program Files\SOFiSTiK\2026\SOFiSTiK 2026\`

---

## Inhaltsverzeichnis

1. [CDB Struktur (Central Database)](#1-cdb-struktur-central-database)
2. [KWH/KWL Record-Katalog](#2-kwhkwl-record-katalog)
3. [Elementtypen](#3-elementtypen)
4. [Ergebnistypen mit Einheiten](#4-ergebnistypen-mit-einheiten)
5. [Materialtypen](#5-materialtypen)
6. [Querschnitte](#6-querschnitte)
7. [Lastfälle und Lastkombinationen](#7-lastfälle-und-lastkombinationen)
8. [Python-Schnittstelle zur CDB](#8-python-schnittstelle-zur-cdb)
9. [C#-Schnittstelle zur CDB](#9-c-schnittstelle-zur-cdb)
10. [SQL/SQLite-Export (sync_cdb_to_db)](#10-sqlsqlite-export-sync_cdb_to_db)
11. [Empfohlene Architektur Web-Postprozessor](#11-empfohlene-architektur-web-postprozessor)
12. [Dateipfade und Referenzen](#12-dateipfade-und-referenzen)

---

## 1. CDB Struktur (Central Database)

### Grundprinzip

Die CDB (Central Database) ist SOFiSTiKs binäres Dateiformat (`.cdb`). Alle Module lesen und schreiben in dieselbe CDB-Datei. Die Daten sind als **Records** organisiert, adressiert durch ein Schlüsselpaar:

| Schlüssel | Bedeutung | Beispiel |
|-----------|-----------|---------|
| **KWH** (Keyword Header) | Hauptkategorie / Datentyp | `20` = Knoten, `200` = QUAD-Elemente |
| **KWL** (Keyword Lower) | Unterkategorie / Lastfall / Nummer | `0` = Geometrie, `LC` = Lastfall-Nr. |

### Datenbankorganisation

```
CDB-Datei (.cdb)
├── Systemdaten (KWH 0, 10)         → Steuerung, Einheiten, Designcode
├── Materialien (KWH 1)              → Beton, Stahl, Holz, Mauerwerk
├── Bodenprofile (KWH 2)             → Bodenschichten, Bettungsmoduln
├── Achsgeometrie (KWH 3)            → Brückenachsen, NURBS-Kurven
├── Spannglieder (KWH 4, 40-44)      → Spannverfahren, Hüllrohre
├── Flächengeometrie (KWH 5)          → NURBS-Flächen
├── Verbindungen (KWH 8)             → Schrauben, Schweißnähte
├── Querschnitte (KWH 9, 1009)       → Werte, Spannungspunkte, Bewehrung
├── System (KWH 10)                   → Systeminfo, Normcode
├── Gruppen (KWH 11)                  → Element-Gruppen
├── Lastfälle (KWH 12-14)            → Definition, Lasten, Aktionen
├── Bauzustände (KWH 15)             → CSM Construction Stages
├── Performance (KWH 16)             → Nachweiskategorien
├── Massen (KWH 17)                   → Totalmassen
├── KNOTEN (KWH 20-29)               → Geometrie + Verschiebungen
├── Strukturlinien (KWH 31, 39)       → Bauteile, Stützungen
├── BEAM-Elemente (KWH 100-116)      → Stäbe + Ergebnisse
├── DSLN-Elemente (KWH 120-127)      → Bemessungselemente
├── BSCT-Elemente (KWH 140-147)      → Externe Querschnitte
├── TRUS-Elemente (KWH 150-157)      → Fachwerk + Ergebnisse
├── CABL-Elemente (KWH 160-166)      → Seile + Ergebnisse
├── SPRI/LINK (KWH 170-175)          → Federn, Dämpfer, Links
├── BOUN-Elemente (KWH 180-183)      → Randelemente
├── PIPE-Elemente (KWH 190)          → Rohre
├── QUAD-Elemente (KWH 200-271)      → Flächen + Ergebnisse
├── BRIC-Elemente (KWH 300-391)      → Volumen + Ergebnisse
└── Einflussliniendaten (KWH -1)      → ELLA-Ergebnisse
```

### Speicherformat

- Binärformat mit Hash-Table-Lookup
- Jeder Record besteht aus Integer- und Float-Daten
- 64-Bit-Indizierung
- Concurrent Access mit Locking-Mechanismus
- Nur Lesezugriff benötigt **keine** SOFiSTiK-Lizenz

### Dateitypen

| Endung | Bedeutung |
|--------|-----------|
| `.cdb` | Hauptdatenbank (niemals löschen!) |
| `.sdb` | Schattendatenbank (temporär) |
| `.cde` | Eigenformen dynamischer Analyse |
| `.sqlite` | ResultViewer-optimierte SQLite-DB |

---

## 2. KWH/KWL Record-Katalog

### Systemdaten

| KWH | KWL | Structure | Beschreibung |
|-----|-----|-----------|-------------|
| 0 | 01:999 | `CCTRL_010` | AccessInfo letztes Programm |
| 0 | 01:? | `CCTRL_011` | Fehlermeldungen |
| 0 | 99 | `CCTRL` | Drucksteuerung, Sprache, Einheiten |
| 0 | 99:0 | `CCTRL_0` | Zugriffsinformation |
| 0 | 99:1 | `CCTRL_1` | Zugriffstitel |
| 0 | 100 | `CCTRL_VAR` | Globale CADINP-Variablen |
| 0 | 101 | `CCTRL_DIM` | Einheitendefinitionen |

### Materialien (KWH 1)

| KWH | KWL | Structure | Beschreibung |
|-----|-----|-----------|-------------|
| 1 | NR:0 | `CMAT` | Materialtitel |
| 1 | NR:1 | `CMAT_CONS` | Materialkonstanten (allgemein) |
| 1 | NR:1 | `CMAT_CONC` | Beton |
| 1 | NR:1 | `CMAT_STEE` | Stahl |
| 1 | NR:1 | `CMAT_TIMB` | Holz |
| 1 | NR:1 | `CMAT_BRIC` | Mauerwerk |
| 1 | NR:2 | `CMAT_SERV` | Spannungs-Dehnungs-Linie (GZG) |
| 1 | NR:3 | `CMAT_ULTI` | Spannungs-Dehnungs-Linie (GZT) |
| 1 | NR:4 | `CMAT_NONL` | Nichtlineare Mittelwerte |
| 1 | NR:7 | `CMAT_BED` | Bettungsmaterial |
| 1 | NR:8 | `CMAT_LAY` | Schichtaufbau |
| 1 | NR:9 | `CMAT_HYD` | Wärmeleitfähigkeit |
| 1 | NR:90 | `CMAT_SPE` | Spezial (Kriechen, Schwinden) |
| 1 | NR:91 | `CMAT_GWP` | CO2-Äquivalente (GWP) |

### Querschnitte (KWH 9)

| KWH | KWL | Structure | Beschreibung |
|-----|-----|-----------|-------------|
| 9 | NR:0 | `CSECT` | Querschnittswerte (gesamt) |
| 9 | NR:1 | `CSECT_EFF` | Effektive Querschnittswerte |
| 9 | NR:2 | `CSECT_PAR` | Teilquerschnittswerte |
| 9 | NR:4 | `CSECT_ADD` | Schub- und Temperaturwerte |
| 9 | NR:5 | `CSECT_WAR` | Verwölbungswerte |
| 9 | NR:6 | `CSECT_PLA` | Plastische Schnittgrößen |
| 9 | NR:7 | `CSECT_DES` | Bemessungswerte |
| 9 | NR:8 | `CSECT_PRE` | Vorspannkräfte |
| 9 | NR:9 | `CSECT_LAY` | Bewehrungslagen |
| 9 | NR:10 | `CSECT_REC` | Rechteck, Plattenbalken |
| 9 | NR:11 | `CSECT_ANN` | Kreis, Kreisring |
| 9 | NR:12 | `CSECT_PRO` | Walzprofile |
| 9 | NR:100 | `CSECT_SPT` | Spannungspunkte |
| 9 | NR:200 | `CSECT_PRF` | Punktbewehrung |
| 9 | NR:201 | `CSECT_LRF` | Linienbewehrung |
| 9 | NR:202 | `CSECT_CRF` | Kreisbewehrung |
| 9 | NR:210 | `CSECT_URF` | Umfangsbewehrung |
| 9 | NR:301 | `CSECT_CUT` | Schubschnitt |

### Knoten (KWH 20-29)

| KWH | KWL | Structure | Beschreibung |
|-----|-----|-----------|-------------|
| 20 | 00 | `CNODE` | **Knotenkoordinaten** (NR, INR, KFIX, NCOD, XYZ[3]) |
| 21 | 00:+ | `CNODE_KIN` | Kinematische Zwangsbedingungen |
| 22 | LC:0 | `CNODE_KFC` | Max. Zwangskräfte |
| 22 | LC:+ | `CNODE_KFO` | Zwangskräfte |
| 23 | LC:* | `CNODE_L` | Knotenlasten |
| 24 | LC:0 | `CN_DISPC` | **Max. Verschiebungen + Auflagerkräfte** |
| 24 | LC:+ | `CN_DISP` | **Verschiebungen + Auflagerkräfte je Knoten** |
| 25 | LC:0 | `CN_VELOC` | Max. Geschwindigkeiten + Beschleunigungen |
| 25 | LC:+ | `CN_VELO` | Geschwindigkeiten + Beschleunigungen |
| 26 | LC:+ | `CN_DISPI` | Verschiebungsinkremente |
| 27 | LC:+ | `CN_DISPT` | Koordinatenoffsets |
| 28 | LC:+ | `CN_FLOW` | Strömungswerte |

### Lastfallsteuerung (KWH 12-14)

| KWH | KWL | Structure | Beschreibung |
|-----|-----|-----------|-------------|
| 12 | LC:? | `CLC_CTRL` | Lastfallinformation |
| 12 | LC:2 | `CLC_SUPE` | Überlagerungslastfall |
| 12 | LC:4 | `CLC_EIGE` | Eigenwertlastfall |
| 12 | LC:10? | `CLC_POIN` | Freie Punktlasten |
| 12 | LC:11? | `CLC_LINE` | Freie Linienlasten |
| 12 | LC:12? | `CLC_AREA` | Freie Flächenlasten |
| 12 | LC:13? | `CLC_VOLU` | Freie Volumenlasten |
| 12 | LC:300 | `CLC_TRAI` | Lastenzugdefinition |
| 12 | LC:400 | `CLC_WIND` | Windbelastung |
| 14 | NR:1 | `CLC_ACT1` | Aktionsmitglied |
| 14 | NR:2 | `CLC_ACT_L` | Lastfälle einer Aktion |
| 14 | ID:1 | `CLC_ACT` | Aktions-Defaults |

### System (KWH 10-11)

| KWH | KWL | Structure | Beschreibung |
|-----|-----|-----------|-------------|
| 10 | 00 | `CSYST` | Systeminfo (Typ, Achsen, Knoten-Anzahl) |
| 10 | 1:0 | `CSYST_DES` | Designcode (Norm, Land, Jahr) |
| 10 | 1:1 | `CSYST_ACT` | Vordefinierte Aktionen |
| 10 | 1:2 | `CSYST_COM` | Kombinationsregeln |
| 11 | 00 | `CGRP` | Primäre Gruppendaten |
| 11 | LC | `CGRP_LC` | Lastfallspezifische Gruppendaten |

### BEAM-Elemente (KWH 100-116)

| KWH | KWL | Structure | Beschreibung |
|-----|-----|-----------|-------------|
| 100 | 00:+ | `CBEAM` | **Balkendefinition** (NR, NOG, NUG, NRQ...) |
| 100 | 00:0 | `CBEAM_SCT` | Balkenabschnitte |
| 100 | 01 | `CBEAM_TRA` | Transformationsmatrix |
| 100 | 05 | `CBEAM_TND` | Spannglieder in Balken |
| 101 | LC:* | `CBEAM_SL` | Einzellasten auf Balken |
| 101 | LC:* | `CBEAM_DL` | Streckenlasten auf Balken |
| **102** | **LC:0** | **`CBEAM_FOC`** | **Max. Balkenschnittgrößen** |
| **102** | **LC:Z!** | **`CBEAM_FOR`** | **Balkenschnittgrößen** (N, VY, VZ, MT, MY, MZ + Verformungen) |
| 103 | LC | `CBEAM_STI` | Steifigkeiten |
| 104 | LC:Z! | `CBEAM_CRF` | Kriech-Umlagerungskräfte |
| **105** | **LC:0** | **`CBEAM_STC`** | **Max. Querschnittsspannungen** |
| **105** | **LC:Z!** | **`CBEAM_STR`** | **Querschnittsspannungen** |
| **106** | **DC:0** | **`CBEAM_RF0`** | **Max. Bewehrung** |
| **106** | **DC:+** | **`CBEAM_RFC`** | **Bewehrung je Punkt** |
| **107** | **LC:0** | **`CBEAM_DE0`** | **Max. Traglast-/Plastische Nachweise** |
| **107** | **LC:Z!** | **`CBEAM_DES`** | **Tragfähigkeitsnachweise** |
| 108 | LC | `CBEAM_PIF` | Steifigkeitsabminderung |
| 111 | LC:+ | `CBEAM_HRC` | Gelenkreaktionen |
| 115 | LC:+ | `CBEAM_MPT` | Materialpunktreaktionen |
| 116 | LC:0 | `CBEAM_TF` | Spanngliedkräfte in Balken |
| 1105 | LC:Z! | `CBEAM_CST` | Verbund-Spannungen |
| 1107 | LC:0 | `CBEAM_UC0` | Max. Ausnutzungsgrade |
| 1107 | LC:Z! | `CBEAM_UCD` | Verbund-Ausnutzungsgrade |

### QUAD-Elemente (KWH 200-271)

| KWH | KWL | Structure | Beschreibung |
|-----|-----|-----------|-------------|
| 200 | 00 | `CQUAD` | **QUAD-Definition** (NR, NOG, NUG, DET, T, MRF...) |
| 200 | 1:Z+ | `CQUAD_NOD` | Knoteneigenschaften |
| 200 | 5 | `CQUAD_TEN` | Spannglieder in QUADs |
| 200 | 6 | `CQUAD_RIM` | Vorgegebene Bewehrung |
| 200 | 7:+ | `CQUAD_RIL` | Bewehrungslagen |
| 202 | LC | `CQUAD_LOA` | QUAD-Lasten |
| **210** | **LC:0** | **`CQUAD_FOC`** | **Max. QUAD-Schnittgrößen** |
| **210** | **LC:+** | **`CQUAD_FOR`** | **QUAD-Schnittgrößen** (mxx, myy, mxy, vx, vy, nxx, nyy, nxy) |
| **211** | **LC:0** | **`CQUAD_NFC`** | **Max. Knotenkräfte** |
| **211** | **LC:Z+** | **`CQUAD_NFO`** | **Knotenkräfte** |
| 212 | LC:+ | `CQUAD_EFO` | Fehlerabschätzung |
| 213 | LC:+ | `CQUAD_BED` | Bettungsspannungen |
| 215 | LC:+ | `CQUAD_RNO` | Nichtlineare Ergebnisse |
| **220** | **LC:0** | **`CQUAD_STC`** | **Max. QUAD-Spannungen** |
| **220** | **LC:+** | **`CQUAD_STR`** | **QUAD-Spannungen** (pro Schicht / Gauß-Punkt) |
| **221** | **LC:0** | **`CQUAD_NSC`** | **Max. Knotenspannungen** |
| **221** | **LC:Z+** | **`CQUAD_NST`** | **Knotenspannungen** |
| 225 | LC:+ | `CQUAD_RLA` | Layer-Spannungen |
| 230 | LC:+ | `CQUAD_RTS` | Spanngliedspannungen |
| **250** | **DC:0** | **`CQUAD_DSC`** | **Max. Bemessungsspannungen** |
| **250** | **DC:+** | **`CQUAD_DST`** | **Bemessungsspannungen** |
| **251** | **DC:0** | **`CQUAD_NDC`** | **Max. Bemessungsspannungen (Knoten)** |
| **251** | **DC:Z+** | **`CQUAD_NDS`** | **Bemessungsspannungen (Knoten)** |
| **260** | **DC:0** | **`CQUAD_RIC`** | **Max. QUAD-Bewehrung** |
| **260** | **DC:+** | **`CQUAD_REI`** | **QUAD-Bewehrung** |
| **261** | **DC:0** | **`CQUAD_NRC`** | **Max. Knotenbewehrung** |
| **261** | **DC:Z+** | **`CQUAD_NRI`** | **Knotenbewehrung** |
| 262 | DC:+ | `CQUAD_NRP` | Durchstanzbewehrung |
| 270 | DC:Z+ | `CQUAD_REA` | Allg. Betonnachweise |
| 270 | DC:Z+ | `CQUAD_RER` | Bewehrungslage-Nachweise |
| 271 | DC:Z+ | `CQUAD_RNA` | Allg. Betonnachweise (Knoten) |
| 291 | LC | `CQUAD_TMP` | Temperaturergebnisse |

### BRIC-Elemente (KWH 300-391)

| KWH | KWL | Structure | Beschreibung |
|-----|-----|-----------|-------------|
| 300 | 00 | `CBRIC` | **BRIC-Definition** (NR, NOG, NUG, DET...) |
| 300 | 02:+ | `CBRIC_SUR` | Oberflächen und Nachbarn |
| 302 | LC | `CBRIC_LOA` | BRIC-Lasten |
| **310** | **LC:0** | **`CBRIC_STC`** | **Max. BRIC-Spannungen** |
| **310** | **LC:+** | **`CBRIC_STR`** | **3D-Spannungen** (SXX,SYY,SZZ,SXY,SXZ,SYZ + Hauptspannungen) |
| **311** | **LC:0** | **`CBRIC_NSC`** | **Max. Knotenspannungen** |
| **311** | **LC:Z+** | **`CBRIC_NST`** | **Knotenspannungen** |
| 312 | LC:+ | `CBRIC_EST` | Fehlerabschätzung |
| 325 | LC | `CBRIC_NOR` | Nichtlineare Bewehrungsergebnisse |
| **360** | **DC:0** | **`CBRIC_REC`** | **Max. BRIC-Bewehrung** |
| **360** | **DC:+** | **`CBRIC_REI`** | **BRIC-Bewehrung** |
| **361** | **DC:0** | **`CBRIC_NRC`** | **Max. Knotenbewehrung** |
| **361** | **DC:Z+** | **`CBRIC_NRI`** | **Knotenbewehrung** |
| 391 | LC | `CBRIC_TMP` | Temperaturergebnisse |

### Weitere Elementtypen

| KWH | KWL | Structure | Beschreibung |
|-----|-----|-----------|-------------|
| 150 | 00 | `CTRUS` | Fachwerkstäbe |
| 152 | LC:+ | `CTRUS_RES` | Fachwerk-Ergebnisse |
| 155 | LC:+ | `CTRUS_STR` | Fachwerk-Spannungen |
| 160 | 00 | `CCABL` | Seilelemente |
| 162 | LC:+ | `CCABL_RES` | Seil-Ergebnisse |
| 165 | LC:+ | `CCABL_STR` | Seil-Spannungen |
| 170 | 00 | `CSPRI` | Federelemente |
| 170 | LC:+ | `CSPRI_RES` | Feder-Ergebnisse |
| 1170 | 00:+ | `CLINK` | Link-Elemente |
| 1170 | LC:+ | `CLINK_RES` | Link-Reaktionen |
| 180 | 00:+ | `CBOUN` | Randelemente |
| 180 | LC:Z! | `CBOUN_RES` | Rand-Ergebnisse |
| 190 | 00 | `CPIPE` | Rohrelemente |
| 190 | LC | `CPIPE_RES` | Rohr-Ergebnisse |

### Designcases (KWH 61-68)

| KWH | KWL | Structure | Beschreibung |
|-----|-----|-----------|-------------|
| 61 | LC:0 | `CDC_BEAM` | Designcase Beam |
| 62 | LC:0 | `CDC_DSLN` | Designcase Design-Element |
| 64 | LC:0 | `CDC_BSCT` | Designcase ext. Querschnitt |
| 65 | LC:0 | `CDC_TRUS` | Designcase Fachwerk |
| 66 | LC:0 | `CDC_CABL` | Designcase Seil |
| 67 | LC:0 | `CDC_QUAD` | Designcase QUAD |
| 68 | LC:0 | `CDC_BRIC` | Designcase BRIC |

---

## 3. Elementtypen

### Übersicht

| Element | KWH | Knoten | Beschreibung |
|---------|-----|--------|-------------|
| **BEAM** (STAB) | 100 | 2 | Allgemeiner Balken mit Schubverformung, Wölbkrafttorsion (7. FHG) |
| **DSLN** | 120 | 2 | Bemessungselement (Design-Stablinie) |
| **BSCT** | 140 | 2 | Externe Querschnitte |
| **TRUS** (FACH) | 150 | 2 | Fachwerkstab (nur Normalkraft) |
| **CABL** (SEIL) | 160 | 2 | Seilelement (nur Zug) |
| **SPRI** (FEDE) | 170 | 1-2 | Federelement (6 DOF) |
| **LINK** | 1170 | 2 | Link-Element |
| **BOUN** (RAND) | 180 | 2+ | Randelement |
| **PIPE** (ROHR) | 190 | 2 | Rohrelement |
| **QUAD** | 200 | 3-4 | Flächenelement (Platte + Scheibe + Schale) |
| **BRIC** | 300 | 4-20 | Volumenelement (3D-Kontinuum) |

### BEAM-Felder (Record `CBEAM`, KWH 100/00)

```
m_nr      : int    → Elementnummer
m_nog     : int    → Knoten oben (Anfang)
m_nug     : int    → Knoten unten (Ende)
m_nrq     : int    → Querschnittsnummer
m_km      : int    → Gelenkbedingungen
m_dl      : float  → Balkenlänge [m]
m_chi     : float  → Krümmung
m_ktyp    : int    → Elementtyp-Kennung
```

### QUAD-Felder (Record `CQUAD`, KWH 200/00)

```
m_nr      : int    → Elementnummer
m_nog     : int    → Knoten 1 (Anfang)
m_nug     : int    → Knoten 2
m_nul     : int    → Knoten 3
m_nor     : int    → Knoten 4 (0 bei Dreieck)
m_det     : float  → Fläche [m²]
m_t       : float  → Dicke [m]
m_mrf     : int    → Material-/Bewehrungsfaktor
```

### BRIC-Felder (Record `CBRIC`, KWH 300/00)

```
m_nr      : int    → Elementnummer
m_nog     : int    → Knoten 1
m_nug     : int    → Knoten 2-8 (Tetraeder: 4 Knoten, Hexaeder: 8, bis 20)
m_det     : float  → Volumen [m³]
```

---

## 4. Ergebnistypen mit Einheiten

### 4.1 Knotenverschiebungen (KWH 24, `CN_DISP`)

| Feld | Bedeutung | Einheit |
|------|-----------|---------|
| `m_ux` | Verschiebung X | m |
| `m_uy` | Verschiebung Y | m |
| `m_uz` | Verschiebung Z | m |
| `m_urx` | Verdrehung X | rad |
| `m_ury` | Verdrehung Y | rad |
| `m_urz` | Verdrehung Z | rad |
| `m_px` | Auflagerkraft X | kN |
| `m_py` | Auflagerkraft Y | kN |
| `m_pz` | Auflagerkraft Z | kN |
| `m_mx` | Auflagermoment X | kNm |
| `m_my` | Auflagermoment Y | kNm |
| `m_mz` | Auflagermoment Z | kNm |

### 4.2 Balkenschnittgrößen (KWH 102, `CBEAM_FOR`)

| Feld | Bedeutung | Einheit |
|------|-----------|---------|
| `m_n` | Normalkraft N | kN |
| `m_vy` | Querkraft Vy | kN |
| `m_vz` | Querkraft Vz | kN |
| `m_mt` | Torsionsmoment MT | kNm |
| `m_my` | Biegemoment My | kNm |
| `m_mz` | Biegemoment Mz | kNm |
| `m_mb` | Wölb-Bimoment | kNm² |
| `m_dl` | Position auf Stab (x/L) | - |
| `m_ux` | Verformung ux | m |
| `m_uy` | Verformung uy | m |
| `m_uz` | Verformung uz | m |
| `m_urx` | Verdrehung ϕx | rad |
| `m_ury` | Verdrehung ϕy | rad |
| `m_urz` | Verdrehung ϕz | rad |

### 4.3 QUAD-Schnittgrößen (KWH 210, `CQUAD_FOR`)

| Feld | Bedeutung | Einheit |
|------|-----------|---------|
| `m_mxx` | Biegemoment mxx | kNm/m |
| `m_myy` | Biegemoment myy | kNm/m |
| `m_mxy` | Drillmoment mxy | kNm/m |
| `m_vx` | Querkraft vx | kN/m |
| `m_vy` | Querkraft vy | kN/m |
| `m_nxx` | Normalkraft nxx | kN/m |
| `m_nyy` | Normalkraft nyy | kN/m |
| `m_nxy` | Schubkraft nxy | kN/m |

### 4.4 QUAD-Spannungen (KWH 220, `CQUAD_STR`)

| Feld | Bedeutung | Einheit |
|------|-----------|---------|
| `m_sig_x` | Normalspannung σx | kN/m² (= kPa) |
| `m_sig_y` | Normalspannung σy | kN/m² |
| `m_sig_xy` | Schubspannung τxy | kN/m² |
| `m_sig_vx` | Querschubspannung τxz | kN/m² |
| `m_sig_vy` | Querschubspannung τyz | kN/m² |
| `m_sig_1` | 1. Hauptspannung | kN/m² |
| `m_sig_2` | 2. Hauptspannung | kN/m² |
| `m_ang` | Winkel Hauptspannungsrichtung | ° |

### 4.5 BRIC-Spannungen (KWH 310, `CBRIC_STR`)

| Feld | Bedeutung | Einheit |
|------|-----------|---------|
| `m_sxx` | Normalspannung σxx | kN/m² |
| `m_syy` | Normalspannung σyy | kN/m² |
| `m_szz` | Normalspannung σzz | kN/m² |
| `m_sxy` | Schubspannung τxy | kN/m² |
| `m_sxz` | Schubspannung τxz | kN/m² |
| `m_syz` | Schubspannung τyz | kN/m² |
| `m_s1` | 1. Hauptspannung | kN/m² |
| `m_s2` | 2. Hauptspannung | kN/m² |
| `m_s3` | 3. Hauptspannung | kN/m² |

### 4.6 Balkenspannungen (KWH 105, `CBEAM_STR`)

| Feld | Bedeutung | Einheit |
|------|-----------|---------|
| `m_sigc` | Betonrandspannung | kN/m² |
| `m_sigt` | Stahl-/Zugspannung | kN/m² |
| `m_tao` | Schubspannung | kN/m² |
| `m_sigv` | Vergleichsspannung | kN/m² |

### 4.7 Bewehrung Balken (KWH 106, `CBEAM_RFC`)

| Feld | Bedeutung | Einheit |
|------|-----------|---------|
| `m_as` | Längsbewehrung | cm² |
| `m_asb` | Bügelbewehrung | cm²/m |

### 4.8 Bewehrung QUAD (KWH 260, `CQUAD_REI`)

| Feld | Bedeutung | Einheit |
|------|-----------|---------|
| `m_aso` | Obere Bewehrung (Richtung 1) | cm²/m |
| `m_asu` | Untere Bewehrung (Richtung 1) | cm²/m |
| `m_as2o` | Obere Bewehrung (Richtung 2) | cm²/m |
| `m_as2u` | Untere Bewehrung (Richtung 2) | cm²/m |
| `m_asq` | Querkraftbewehrung | cm²/m² |

### 4.9 Tragfähigkeit/Nachweise (KWH 107, `CBEAM_DES`)

| Feld | Bedeutung | Einheit |
|------|-----------|---------|
| `m_eta_n` | Ausnutzung Normalkraft | - (Verhältnis) |
| `m_eta_m` | Ausnutzung Biegung | - |
| `m_eta_v` | Ausnutzung Querkraft | - |
| `m_eta_t` | Ausnutzung Torsion | - |
| `m_eta` | Gesamtausnutzung | - |

### 4.10 Nichtlineare Ergebnisse QUAD (KWH 215, `CQUAD_RNO`)

| Feld | Bedeutung | Einheit |
|------|-----------|---------|
| `m_epsxo` | Dehnung oben X | ‰ |
| `m_epsyo` | Dehnung oben Y | ‰ |
| `m_epsxu` | Dehnung unten X | ‰ |
| `m_epsyu` | Dehnung unten Y | ‰ |
| `m_w` | Rissbreite | mm |
| `m_dsig` | Stahllängsspannung | N/mm² |

---

## 5. Materialtypen

### AQUA Material-Records (Input)

| AQUA Keyword | CDB-Typ | Beschreibung |
|-------------|---------|-------------|
| `BETO` | Beton | EC2, DIN 1045, SIA, etc. |
| `STAH` | Stahl | Baustahl, Bewehrung, Spannstahl |
| `HOLZ` | Holz | EC5 Festigkeitsklassen |
| `MAUE` | Mauerwerk | Mauerwerkstypen |
| `NMAT` | Nichtlinear | VMIS, DRUC, MOHR, GRAN, SWEL, LADE, MEMB |
| `HMAT` | Hydraulik | Thermisches Material |
| `BMAT` | Bettung | Bettungsmoduln |
| `SMAT` | Feder | Feder-/Gelenkmaterial |

### Materialfelder in CDB (`CMAT_CONC`)

```
m_fc      : float  → Druckfestigkeit fck      [N/mm²]
m_ft      : float  → Zugfestigkeit fctm       [N/mm²]
m_e       : float  → E-Modul Ecm              [N/mm²]
m_mu      : float  → Querdehnzahl ν           [-]
m_gam     : float  → Wichte γ                 [kN/m³]
m_alfa    : float  → Wärmedehnzahl αT         [1/K]
```

---

## 6. Querschnitte

### Querschnittstypen in AQUA

| Typ | Keyword | Beschreibung |
|-----|---------|-------------|
| Rechteck / Plattenbalken | `SREC` / `CSECT_REC` | b, h, ho, bo, hu, bu |
| Kreis / Kreisring | `SCIT` / `CSECT_ANN` | D, t |
| Rohr | `TUBE` / `CSECT_TUB` | D, t |
| Seil | `CABL` / `CSECT_CAB` | A |
| Walzprofil | `PROF` / `CSECT_PRO` | IPE, HEA, HEB, etc. |
| Freier Querschnitt | `QPOL` / `CSECT_PPT` | Polygonpunkte |
| Dünnwandig | `PLAT` / `WAND` | Wände, Bleche |

### Querschnittswerte (`CSECT`, KWH 9/NR:0)

```
m_a       : float  → Fläche A                [m²]
m_ay      : float  → Schubfläche Ay          [m²]
m_az      : float  → Schubfläche Az          [m²]
m_iy      : float  → Trägheitsmoment Iy      [m⁴]
m_iz      : float  → Trägheitsmoment Iz      [m⁴]
m_iyz     : float  → Deviationsmoment Iyz    [m⁴]
m_it      : float  → Torsionsträgheitsmoment  [m⁴]
m_iw      : float  → Wölbwiderstand          [m⁶]
m_ys      : float  → Schubmittelpunkt y      [m]
m_zs      : float  → Schubmittelpunkt z      [m]
```

---

## 7. Lastfälle und Lastkombinationen

### Lastfall-Typen

| Typ | Beschreibung |
|-----|-------------|
| Primärlastfall | Direkte Lastdefinition (LF 1, 2, 3...) |
| Überlagerung (`CLC_SUPE`) | Kombination aus Primärlastfällen mit Faktoren |
| Eigenform (`CLC_EIGE`) | Eigenwert-Lastfall |
| MAXIMA-Ergebnis | Hüllkurven-Lastfall |
| CSM-Lastfall | Bauzustandsberechnung |

### Aktionen (Actions) für Kombinationen

| Aktion | Beschreibung | γ_G,sup | γ_G,inf | ψ₀ | ψ₁ | ψ₂ |
|--------|-------------|---------|---------|----|----|-----|
| G (Eigengewicht) | Ständig | 1.35 | 1.00 | - | - | - |
| Q (Verkehr) | Veränderlich | 1.50 | 0.00 | 0.70 | 0.50 | 0.30 |
| W (Wind) | Veränderlich | 1.50 | 0.00 | 0.60 | 0.20 | 0.00 |
| S (Schnee) | Veränderlich | 1.50 | 0.00 | 0.50 | 0.20 | 0.00 |
| T (Temperatur) | Veränderlich | 1.50 | 0.00 | 0.60 | 0.50 | 0.00 |
| A (Außergewöhnlich) | Außergew. | 1.00 | - | - | - | - |
| E (Erdbeben) | Seismisch | 1.00 | - | - | - | - |

### MAXIMA Kombinationstypen

| Typ | Beschreibung |
|-----|-------------|
| `GAMU` | GZT (Ultimate Limit State) |
| `GAMF` | GZG (Serviceability) |
| `AG1` | Alternative Lastgruppen (sich ausschließend) |
| `NONL` | Nichtlinear berechnete Lastfälle |
| `DESI` | Bemessungskombinationen |
| `FIRE` | Brandsituation |
| `ACCI` | Außergewöhnliche Kombination |
| `SEQU` | Erdbebenkombination |

### Unterstützte Normen

EC 1990/1992/1993/1995/1999, DIN 1045/4227/18800, ACI, AASHTO, BS, SIA, ÖNORM, NTC, NF, AS, CAN/CSA

---

## 8. Python-Schnittstelle zur CDB

### Installation

```
DLL-Pfad:  C:\Program Files\SOFiSTiK\2026\SOFiSTiK 2026\interfaces\64bit\
Datendatei: C:\Program Files\SOFiSTiK\2026\SOFiSTiK 2026\interfaces\examples\python\sofistik_daten.py
```

Die `sofistik_daten.py` enthält ~400+ ctypes-Strukturen für alle CDB-Records (12.400+ Zeilen, automatisch generiert).

### API-Funktionen

| Funktion | Signatur | Beschreibung |
|----------|----------|-------------|
| `sof_cdb_init` | `(filename: bytes, index: int) → int` | CDB öffnen/erstellen |
| `sof_cdb_close` | `(index: int) → void` | CDB schließen (0=alle) |
| `sof_cdb_status` | `(index: int) → int` | Status abfragen |
| `sof_cdb_get` | `(index, kwh, kwl, data_ptr, reclen_ptr, pos) → int` | Record lesen |
| `sof_cdb_flush` | `(index: int) → int` | Locks freigeben |
| `sof_cdb_kenq` | `(kwh_ptr, kwl_ptr, request: int) → void` | KWL-Werte abfragen |
| `sof_cdb_kenq_ex` | `(index, kwh_ptr, kwl_ptr, request: int) → void` | KWL erweitert |
| `sof_cdb_kexist` | `(kwh, kwl) → int` | Key-Existenz prüfen |

### Index-Werte für `sof_cdb_init`

| Index | Bedeutung |
|-------|-----------|
| 99 | Öffnen/Erstellen (Standard) |
| 95 | Nur-Lesen (Read-Only) |
| 94 | Neue Datenbank erstellen |
| 96 | Scratch-Datenbank |

### Rückgabewerte `sof_cdb_get`

| Wert | Bedeutung |
|------|-----------|
| 0 | Erfolg |
| 1 | Record länger als Puffer |
| 2 | Ende der Daten erreicht |
| 3 | Key existiert nicht |

### `sof_cdb_kenq` Request-Werte

| Request | Bedeutung |
|---------|-----------|
| +1 | Nächsthöherer KWL |
| -1 | Nächstniedrigerer KWL |
| +2 | Maximaler KWL |
| -2 | Minimaler KWL |

### Vollständiges Beispiel: CDB verbinden und Knoten lesen

```python
"""SOFiSTiK CDB Zugriff - Knoten lesen"""
from sofistik_daten import *
import os
from ctypes import *

# DLL laden
os.add_dll_directory(r"C:\Program Files\SOFiSTiK\2026\SOFiSTiK 2026\interfaces\64bit")
os.add_dll_directory(r"C:\Program Files\SOFiSTiK\2026\SOFiSTiK 2026")

cdb_dll = cdll.LoadLibrary("sof_cdb_w-2026.dll")

# CDB öffnen (Read-Only)
cdb_index = c_int()
filename = r"C:\Projekt\modell.cdb"
cdb_index.value = cdb_dll.sof_cdb_init(filename.encode("utf-8"), 95)

if cdb_index.value <= 0:
    print(f"FEHLER: CDB konnte nicht geöffnet werden (Code: {cdb_index.value})")
    exit(1)

print(f"CDB geöffnet, Index: {cdb_index.value}")

# Alle Knoten lesen (KWH=20, KWL=0)
ie = c_int(0)
rec_len = c_int(sizeof(cnode))

print(f"{'Nr':>8} {'INR':>8} {'X':>12} {'Y':>12} {'Z':>12}")
while ie.value < 2:
    ie.value = cdb_dll.sof_cdb_get(
        cdb_index, 20, 0, byref(cnode), byref(rec_len), 1
    )
    if ie.value < 2:
        print(f"{cnode.m_nr:8d} {cnode.m_inr:8d} "
              f"{cnode.m_xyz[0]:12.4f} {cnode.m_xyz[1]:12.4f} {cnode.m_xyz[2]:12.4f}")
    rec_len = c_int(sizeof(cnode))

# CDB schließen
cdb_dll.sof_cdb_close(0)
print("CDB geschlossen.")
```

### Beispiel: Balkenschnittgrößen lesen

```python
"""Balkenschnittgrößen für Lastfall 1 lesen"""
from sofistik_daten import *
from ctypes import *

# ... (DLL laden und CDB öffnen wie oben) ...

# Balkenschnittgrößen lesen (KWH=102, KWL=Lastfall)
lastfall = 1
ie = c_int(0)
rec_len = c_int(sizeof(cbeam_for))

print(f"{'Elem':>6} {'x/L':>6} {'N[kN]':>10} {'Vy[kN]':>10} "
      f"{'Vz[kN]':>10} {'MT[kNm]':>10} {'My[kNm]':>10} {'Mz[kNm]':>10}")

while ie.value < 2:
    ie.value = cdb_dll.sof_cdb_get(
        cdb_index, 102, lastfall, byref(cbeam_for), byref(rec_len), 1
    )
    if ie.value < 2:
        print(f"{cbeam_for.m_nr:6d} {cbeam_for.m_x:6.3f} "
              f"{cbeam_for.m_n:10.2f} {cbeam_for.m_vy:10.2f} "
              f"{cbeam_for.m_vz:10.2f} {cbeam_for.m_mt:10.2f} "
              f"{cbeam_for.m_my:10.2f} {cbeam_for.m_mz:10.2f}")
    rec_len = c_int(sizeof(cbeam_for))

cdb_dll.sof_cdb_close(0)
```

### Beispiel: Alle vorhandenen KWL-Werte abfragen

```python
"""Alle Lastfälle für KWH=102 (Balkenkräfte) auflisten"""
from ctypes import *

# ... (DLL laden und CDB öffnen) ...

kwh = c_int(102)
kwl = c_int(0)

# Minimalen KWL ermitteln
cdb_dll.sof_cdb_kenq_ex(cdb_index, byref(kwh), byref(kwl), -2)
min_kwl = kwl.value

# Maximalen KWL ermitteln
cdb_dll.sof_cdb_kenq_ex(cdb_index, byref(kwh), byref(kwl), +2)
max_kwl = kwl.value

print(f"Lastfälle für Balkenkräfte (KWH=102): {min_kwl} bis {max_kwl}")

# Alle KWL durchiterieren
kwl = c_int(min_kwl - 1)
while kwl.value < max_kwl:
    cdb_dll.sof_cdb_kenq_ex(cdb_index, byref(kwh), byref(kwl), +1)
    if cdb_dll.sof_cdb_kexist(102, kwl.value) > 0:
        print(f"  Lastfall {kwl.value}")

cdb_dll.sof_cdb_close(0)
```

### Beispiel: QUAD-Schnittgrößen lesen

```python
"""QUAD-Schnittgrößen für Lastfall 1 lesen"""
from sofistik_daten import *
from ctypes import *

# ... (DLL laden und CDB öffnen) ...

lastfall = 1
ie = c_int(0)
rec_len = c_int(sizeof(cquad_for))

print(f"{'Elem':>6} {'mxx':>10} {'myy':>10} {'mxy':>10} "
      f"{'vx':>10} {'vy':>10} {'nxx':>10} {'nyy':>10} {'nxy':>10}")

while ie.value < 2:
    ie.value = cdb_dll.sof_cdb_get(
        cdb_index, 210, lastfall, byref(cquad_for), byref(rec_len), 1
    )
    if ie.value < 2:
        print(f"{cquad_for.m_nr:6d} "
              f"{cquad_for.m_mxx:10.2f} {cquad_for.m_myy:10.2f} "
              f"{cquad_for.m_mxy:10.2f} {cquad_for.m_vx:10.2f} "
              f"{cquad_for.m_vy:10.2f} {cquad_for.m_nxx:10.2f} "
              f"{cquad_for.m_nyy:10.2f} {cquad_for.m_nxy:10.2f}")
    rec_len = c_int(sizeof(cquad_for))

cdb_dll.sof_cdb_close(0)
```

---

## 9. C#-Schnittstelle zur CDB

### DLL-Import

```csharp
using System.Runtime.InteropServices;

// Core CDB Functions
[DllImport("sof_cdb_w-2026.dll", CallingConvention = CallingConvention.Cdecl)]
public static extern int sof_cdb_init(string name, int initType);

[DllImport("sof_cdb_w-2026.dll", CallingConvention = CallingConvention.Cdecl)]
public static extern void sof_cdb_close(int index);

[DllImport("sof_cdb_w-2026.dll", CallingConvention = CallingConvention.Cdecl)]
public static extern int sof_cdb_status(int index);

[DllImport("sof_cdb_w-2026.dll", CallingConvention = CallingConvention.Cdecl)]
public static extern int sof_cdb_flush(int index);

[DllImport("sof_cdb_w-2026.dll", CallingConvention = CallingConvention.Cdecl)]
public static extern unsafe int sof_cdb_get(
    int index, int kwh, int kwl, void* type, ref int recLen, int pos);

[DllImport("sof_cdb_w-2026.dll", CallingConvention = CallingConvention.Cdecl)]
public static extern void sof_cdb_kenq_ex(
    int index, ref int kwh, ref int kwl, int request);
```

### Struct-Definitionen (aus `sofistik_daten.cs`)

```csharp
// Knotenstruktur (KWH 20/00)
[StructLayout(LayoutKind.Sequential)]
public unsafe struct cs_node {
    public int m_nr;       // Knotennummer
    public int m_inr;      // Interne Nummer
    public int m_kfix;     // Freiheitsgrade
    public int m_ncod;     // Bit-Code
    public fixed float m_xyz[3]; // X,Y,Z Koordinaten [m]
}

// Balkenkräfte (KWH 102/LC)
[StructLayout(LayoutKind.Sequential)]
public unsafe struct cs_beam_for {
    public int m_nr;       // Elementnummer
    public float m_x;     // Position x/L
    public float m_n;     // Normalkraft [kN]
    public float m_vy;    // Querkraft Vy [kN]
    public float m_vz;    // Querkraft Vz [kN]
    public float m_mt;    // Torsion [kNm]
    public float m_my;    // Moment My [kNm]
    public float m_mz;    // Moment Mz [kNm]
    // ... weitere Felder
}
```

### Vollständiges C#-Beispiel

```csharp
using System;
using System.Runtime.InteropServices;

class CdbReader
{
    [DllImport("sof_cdb_w-2026.dll", CallingConvention = CallingConvention.Cdecl)]
    static extern int sof_cdb_init(string name, int initType);

    [DllImport("sof_cdb_w-2026.dll", CallingConvention = CallingConvention.Cdecl)]
    static extern void sof_cdb_close(int index);

    [DllImport("sof_cdb_w-2026.dll", CallingConvention = CallingConvention.Cdecl)]
    static extern unsafe int sof_cdb_get(
        int index, int kwh, int kwl, void* type, ref int recLen, int pos);

    static unsafe void Main()
    {
        // PATH setzen
        string path = Environment.GetEnvironmentVariable("path");
        path = @"C:\Program Files\SOFiSTiK\2026\SOFiSTiK 2026\interfaces\64bit"
             + ";" + @"C:\Program Files\SOFiSTiK\2026\SOFiSTiK 2026"
             + ";" + path;
        Environment.SetEnvironmentVariable("path", path);

        // CDB öffnen (Read-Only = 95)
        int index = sof_cdb_init(@"C:\Projekt\modell.cdb", 95);
        if (index <= 0) { Console.WriteLine("Fehler!"); return; }

        // Knoten lesen
        cs_node data;
        int datalen = Marshal.SizeOf(typeof(cs_node));

        while (sof_cdb_get(index, 20, 0, &data, ref datalen, 1) == 0)
        {
            Console.WriteLine($"Knoten {data.m_nr}: ({data.m_xyz[0]}, {data.m_xyz[1]}, {data.m_xyz[2]})");
            datalen = Marshal.SizeOf(typeof(cs_node));
        }

        sof_cdb_close(0);
    }
}
```

### Verfügbare Dateien

| Datei | Pfad | Beschreibung |
|-------|------|-------------|
| `sofistik_daten.cs` | `interfaces\examples\c#\` | Unsafe Struct-Definitionen |
| `SOFiSTiKManagedTypes.cs` | `interfaces\examples\c#\` | Managed Wrapper mit ICdbElement |
| `sofistik_daten.py` | `interfaces\examples\python\` | Python ctypes Definitionen |
| `sofistik_daten.vb` | `interfaces\examples\vb.net\` | VB.NET Definitionen |
| `cdbase.h` | `interfaces\examples\c++\` | C++ API-Header |
| `cdbtypeall.h` | `interfaces\examples\c++\` | C++ alle Datentypen |

---

## 10. SQL/SQLite-Export (sync_cdb_to_db)

### Tool: `sync_cdb_to_db.exe`

**Pfad:** `C:\Program Files\SOFiSTiK\2026\SOFiSTiK 2026\sync_cdb_to_db.exe`

**Funktion:** Konvertiert die binäre CDB-Datei in eine SQLite-Datenbank für den ResultViewer.

### Funktionsweise

1. Beim ersten Öffnen eines Projekts im ResultViewer wird automatisch `projekt.sqlite` aus `projekt.cdb` generiert
2. Die SQLite-DB enthält optimierte Tabellen für schnelle Abfrage und Visualisierung
3. Bei Änderungen an der CDB kann die SQLite-DB manuell re-synchronisiert werden
4. Die SQLite-DB ist **versioniert** pro SOFiSTiK-Release (inkl. Service Packs)

### Technische Details

| Eigenschaft | Wert |
|-------------|------|
| Datenbanktyp | SQLite 3 |
| DLL | `sqlite3.dll` (mitgeliefert), `PocoDataSQLite.dll` |
| Input | `.cdb` (SOFiSTiK CDB) |
| Output | `.sqlite` |
| Versionierung | Pro Release + Service Pack |

### Warnung

- Das Löschen der `.sqlite`-Datei entfernt auch alle benutzerdefinierten Views
- Bei Versionskonflikten wird die DB automatisch neu generiert
- Die SQLite-DB ist **nicht als stabiles API** gedacht — das Schema kann sich zwischen Releases ändern

### Alternative Export-Wege

| Methode | Format | Beschreibung |
|---------|--------|-------------|
| ResultViewer → Excel | `.xlsx` | Tabellenexport mit Filtern |
| ResultViewer → CSV | `.csv` | Ab SP 2022-1 |
| Export to DAT | `.dat` | CADINP-Textformat |
| IFC Export | `.ifc` | Industry Foundation Classes |
| SAF Export | `.saf` | Structural Analysis Format |
| **Python CDB API** | **beliebig** | **Empfohlen für Web-Postprozessor** |

### Empfohlener Weg für eigenen DB-Export

Da das SQLite-Schema von `sync_cdb_to_db` nicht dokumentiert ist und sich ändern kann, ist der **empfohlene Weg** die direkte CDB-Abfrage via Python-API:

```python
"""CDB → SQLite Export (eigenes Schema)"""
import sqlite3
from sofistik_daten import *
from ctypes import *

def export_cdb_to_sqlite(cdb_path: str, sqlite_path: str):
    """Exportiert SOFiSTiK CDB-Ergebnisse in eigene SQLite-DB"""

    # CDB öffnen
    os.add_dll_directory(r"C:\Program Files\SOFiSTiK\2026\SOFiSTiK 2026\interfaces\64bit")
    os.add_dll_directory(r"C:\Program Files\SOFiSTiK\2026\SOFiSTiK 2026")
    cdb = cdll.LoadLibrary("sof_cdb_w-2026.dll")

    idx = c_int()
    idx.value = cdb.sof_cdb_init(cdb_path.encode("utf-8"), 95)

    # SQLite erstellen
    conn = sqlite3.connect(sqlite_path)
    cur = conn.cursor()

    # Knoten-Tabelle
    cur.execute("""CREATE TABLE IF NOT EXISTS nodes (
        nr INTEGER PRIMARY KEY, inr INTEGER,
        x REAL, y REAL, z REAL, kfix INTEGER)""")

    ie = c_int(0)
    rl = c_int(sizeof(cnode))
    while ie.value < 2:
        ie.value = cdb.sof_cdb_get(idx, 20, 0, byref(cnode), byref(rl), 1)
        if ie.value < 2:
            cur.execute("INSERT OR REPLACE INTO nodes VALUES (?,?,?,?,?,?)",
                (cnode.m_nr, cnode.m_inr,
                 cnode.m_xyz[0], cnode.m_xyz[1], cnode.m_xyz[2], cnode.m_kfix))
        rl = c_int(sizeof(cnode))

    # Balkenergebnisse je Lastfall
    cur.execute("""CREATE TABLE IF NOT EXISTS beam_forces (
        loadcase INTEGER, elem_nr INTEGER, x_pos REAL,
        N REAL, Vy REAL, Vz REAL, Mt REAL, My REAL, Mz REAL,
        PRIMARY KEY (loadcase, elem_nr, x_pos))""")

    # Alle Lastfälle durchiterieren
    kwh = c_int(102)
    kwl = c_int(0)
    cdb.sof_cdb_kenq_ex(idx, byref(kwh), byref(kwl), -2)
    min_lc = kwl.value
    cdb.sof_cdb_kenq_ex(idx, byref(kwh), byref(kwl), +2)
    max_lc = kwl.value

    kwl = c_int(min_lc - 1)
    while kwl.value < max_lc:
        cdb.sof_cdb_kenq_ex(idx, byref(kwh), byref(kwl), +1)
        lc = kwl.value

        ie = c_int(0)
        rl = c_int(sizeof(cbeam_for))
        while ie.value < 2:
            ie.value = cdb.sof_cdb_get(idx, 102, lc, byref(cbeam_for), byref(rl), 1)
            if ie.value < 2:
                cur.execute("INSERT OR REPLACE INTO beam_forces VALUES (?,?,?,?,?,?,?,?,?)",
                    (lc, cbeam_for.m_nr, cbeam_for.m_x,
                     cbeam_for.m_n, cbeam_for.m_vy, cbeam_for.m_vz,
                     cbeam_for.m_mt, cbeam_for.m_my, cbeam_for.m_mz))
            rl = c_int(sizeof(cbeam_for))

    conn.commit()
    conn.close()
    cdb.sof_cdb_close(0)
```

---

## 11. Empfohlene Architektur Web-Postprozessor

### Architekturübersicht

```
┌─────────────────────────────────────────────────────────────────┐
│                        Web-Browser (Frontend)                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ 3D-View  │  │ Tabellen │  │ Diagramme│  │ Bewehrungs-   │  │
│  │ Three.js │  │ AG-Grid  │  │ Plotly   │  │ pläne         │  │
│  └──────────┘  └──────────┘  └──────────┘  └───────────────┘  │
│                    React / Vue.js / Svelte                       │
└────────────────────────────┬────────────────────────────────────┘
                             │ REST API / WebSocket / gRPC-Web
┌────────────────────────────┴────────────────────────────────────┐
│                     Backend (Python / C#)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │ CDB Reader   │  │ Result Cache │  │ Export Engine      │    │
│  │ (ctypes/DLL) │  │ (SQLite/     │  │ (Excel, CSV, IFC)  │    │
│  │              │  │  Redis)      │  │                    │    │
│  └──────┬───────┘  └──────────────┘  └────────────────────┘    │
│         │                                                        │
│  ┌──────┴───────┐                                                │
│  │ sof_cdb_w-   │                                                │
│  │ 2026.dll     │                                                │
│  └──────────────┘                                                │
│                     FastAPI / ASP.NET Core                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────┴────────────────────────────────────┐
│                     Datenbank-Schicht                             │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │ SOFiSTiK     │  │ SQLite Cache │  │ PostgreSQL (opt.)  │    │
│  │ .cdb Datei   │  │ (eigenes     │  │ (Multi-Projekt)    │    │
│  │ (Quelle)     │  │  Schema)     │  │                    │    │
│  └──────────────┘  └──────────────┘  └────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Empfohlener Technology Stack

#### Backend (Python — empfohlen)

| Komponente | Technologie | Begründung |
|------------|-------------|------------|
| Web-Framework | **FastAPI** | Async, schnell, automatische API-Docs |
| CDB-Zugriff | **ctypes + sof_cdb_w-2026.dll** | Direkt, ohne Umwege |
| Daten-Cache | **SQLite** (eigenes Schema) | Schnelle Abfragen, kein Server nötig |
| Serialisierung | **Pydantic** | Typensicher, automatisch |
| Task Queue | **Celery** (optional) | Für große CDB-Imports |

#### Frontend

| Komponente | Technologie | Begründung |
|------------|-------------|------------|
| Framework | **React** oder **Vue.js** | Ökosystem, Komponenten |
| 3D-Visualisierung | **Three.js** / **vtk.js** | FE-Mesh-Darstellung |
| Tabellen | **AG-Grid** | Große Datenmengen, Export |
| Diagramme | **Plotly.js** / **D3.js** | Interaktive Charts |
| State Management | **Zustand** / **Pinia** | Leichtgewichtig |

### Empfohlenes SQLite-Schema für Cache

```sql
-- Projektmetadaten
CREATE TABLE project (
    id INTEGER PRIMARY KEY,
    name TEXT,
    cdb_path TEXT,
    norm_code TEXT,
    last_sync TIMESTAMP
);

-- Knoten
CREATE TABLE nodes (
    nr INTEGER PRIMARY KEY,
    x REAL NOT NULL,
    y REAL NOT NULL,
    z REAL NOT NULL,
    kfix INTEGER DEFAULT 0
);

-- Elemente (Balken)
CREATE TABLE beams (
    nr INTEGER PRIMARY KEY,
    node_start INTEGER REFERENCES nodes(nr),
    node_end INTEGER REFERENCES nodes(nr),
    section_nr INTEGER,
    group_nr INTEGER,
    length REAL
);

-- Elemente (QUAD)
CREATE TABLE quads (
    nr INTEGER PRIMARY KEY,
    n1 INTEGER, n2 INTEGER, n3 INTEGER, n4 INTEGER,
    thickness REAL,
    material_nr INTEGER,
    group_nr INTEGER,
    area REAL
);

-- Elemente (BRIC)
CREATE TABLE brics (
    nr INTEGER PRIMARY KEY,
    nodes TEXT,  -- JSON: [n1,n2,...,n8]
    material_nr INTEGER,
    group_nr INTEGER,
    volume REAL
);

-- Lastfälle
CREATE TABLE loadcases (
    nr INTEGER PRIMARY KEY,
    type TEXT,       -- 'primary', 'combination', 'eigenvalue'
    title TEXT,
    action TEXT      -- 'G', 'Q', 'W', 'S', etc.
);

-- Knotenverschiebungen
CREATE TABLE node_displacements (
    loadcase INTEGER,
    node_nr INTEGER,
    ux REAL, uy REAL, uz REAL,
    rx REAL, ry REAL, rz REAL,
    px REAL, py REAL, pz REAL,  -- Auflagerkräfte
    mx REAL, my REAL, mz REAL,
    PRIMARY KEY (loadcase, node_nr)
);

-- Balkenschnittgrößen
CREATE TABLE beam_forces (
    loadcase INTEGER,
    elem_nr INTEGER,
    x_pos REAL,     -- Position auf Stab (0..1)
    N REAL,         -- Normalkraft [kN]
    Vy REAL,        -- Querkraft Y [kN]
    Vz REAL,        -- Querkraft Z [kN]
    Mt REAL,        -- Torsion [kNm]
    My REAL,        -- Moment Y [kNm]
    Mz REAL,        -- Moment Z [kNm]
    PRIMARY KEY (loadcase, elem_nr, x_pos)
);

-- QUAD-Schnittgrößen
CREATE TABLE quad_forces (
    loadcase INTEGER,
    elem_nr INTEGER,
    mxx REAL, myy REAL, mxy REAL,   -- Momente [kNm/m]
    vx REAL, vy REAL,               -- Querkräfte [kN/m]
    nxx REAL, nyy REAL, nxy REAL,   -- Normalkräfte [kN/m]
    PRIMARY KEY (loadcase, elem_nr)
);

-- QUAD-Knotenkräfte
CREATE TABLE quad_node_forces (
    loadcase INTEGER,
    node_nr INTEGER,
    mxx REAL, myy REAL, mxy REAL,
    vx REAL, vy REAL,
    nxx REAL, nyy REAL, nxy REAL,
    PRIMARY KEY (loadcase, node_nr)
);

-- Bewehrung (Balken)
CREATE TABLE beam_reinforcement (
    design_case INTEGER,
    elem_nr INTEGER,
    x_pos REAL,
    as_long REAL,   -- Längsbewehrung [cm²]
    as_stir REAL,   -- Bügelbewehrung [cm²/m]
    PRIMARY KEY (design_case, elem_nr, x_pos)
);

-- Bewehrung (QUAD)
CREATE TABLE quad_reinforcement (
    design_case INTEGER,
    elem_nr INTEGER,
    as_top_1 REAL,     -- Obere Bewehrung Ri.1 [cm²/m]
    as_bot_1 REAL,     -- Untere Bewehrung Ri.1 [cm²/m]
    as_top_2 REAL,     -- Obere Bewehrung Ri.2 [cm²/m]
    as_bot_2 REAL,     -- Untere Bewehrung Ri.2 [cm²/m]
    as_shear REAL,     -- Querkraftbewehrung [cm²/m²]
    PRIMARY KEY (design_case, elem_nr)
);

-- Spannungen (QUAD)
CREATE TABLE quad_stresses (
    loadcase INTEGER,
    elem_nr INTEGER,
    layer TEXT,         -- 'top', 'mid', 'bot'
    sig_x REAL,
    sig_y REAL,
    tau_xy REAL,
    sig_1 REAL,
    sig_2 REAL,
    angle REAL,
    PRIMARY KEY (loadcase, elem_nr, layer)
);

-- Indizes für Performance
CREATE INDEX idx_node_disp_lc ON node_displacements(loadcase);
CREATE INDEX idx_beam_forces_lc ON beam_forces(loadcase);
CREATE INDEX idx_quad_forces_lc ON quad_forces(loadcase);
CREATE INDEX idx_quad_reinf_dc ON quad_reinforcement(design_case);
```

### REST API Design

```
GET  /api/projects                       → Projektliste
GET  /api/projects/{id}/model            → Geometrie (Knoten, Elemente)
GET  /api/projects/{id}/loadcases        → Lastfallliste
GET  /api/projects/{id}/results/nodes?lc=1&type=displacement
GET  /api/projects/{id}/results/beams?lc=1&type=forces
GET  /api/projects/{id}/results/quads?lc=1&type=forces
GET  /api/projects/{id}/results/quads?lc=1&type=stresses&layer=top
GET  /api/projects/{id}/design/beams?dc=1&type=reinforcement
GET  /api/projects/{id}/design/quads?dc=1&type=reinforcement
GET  /api/projects/{id}/export/excel?lc=1&elements=quads
POST /api/projects/{id}/sync             → CDB neu einlesen
```

### Workflow

1. **Import:** CDB-Datei wird über Python-API gelesen → SQLite-Cache befüllt
2. **Query:** Frontend fragt REST-API → Backend liest aus SQLite-Cache
3. **Visualisierung:** Frontend rendert 3D-Mesh + Ergebnisfarben
4. **Export:** Backend generiert Excel/CSV aus Cache

### Wichtige Hinweise

- CDB-DLL ist **nur unter Windows** verfügbar (64-Bit)
- Read-Only-Zugriff auf CDB benötigt **keine** SOFiSTiK-Lizenz
- `sofistik_daten.py` wird bei jedem Release neu generiert → bei Update kopieren
- Für Linux/Docker: CDB auf Windows-Worker lesen → SQLite-Cache bereitstellen

---

## 12. Dateipfade und Referenzen

### Installationsverzeichnis

```
C:\Program Files\SOFiSTiK\2026\SOFiSTiK 2026\
```

### Wichtige Dokumentationen

| Datei | Inhalt |
|-------|--------|
| `cdbase.chm` | **Vollständige CDB-Referenz** (alle Records) |
| `ase_0.pdf` / `ase_1.pdf` | FE-Statik (ASE) Manual |
| `aqua_0.pdf` / `aqua_1.pdf` | Materialien & Querschnitte |
| `bemess_0.pdf` / `bemess_1.pdf` | Flächenbemessung |
| `aqb_0.pdf` / `aqb_1.pdf` | Querschnittsbemessung |
| `maxima_0.pdf` / `maxima_1.pdf` | Lastkombination |
| `sofiload_0.pdf` / `sofiload_1.pdf` | Lastdefinition |
| `ella_0.pdf` / `ella_1.pdf` | Verkehrslasten / Einflusslinien |
| `wingraf_0.pdf` / `wingraf_1.pdf` | Grafische Ausgabe |
| `resultviewer_0.pdf` / `resultviewer_1.pdf` | Ergebnisdarstellung |
| `dyna_0.pdf` / `dyna_1.pdf` | Dynamik |
| `csm_0.pdf` / `csm_1.pdf` | Bauzustände |
| `ifc_export.pdf` | IFC-Export |
| `saf_export.pdf` | SAF-Export |
| `dbmerg_0.pdf` / `dbmerg_1.pdf` | Datenbank-Merge |

### Interface-Verzeichnis

```
C:\Program Files\SOFiSTiK\2026\SOFiSTiK 2026\interfaces\
├── 64bit\
│   ├── sof_cdb_w-2026.dll        → Haupt-DLL
│   ├── sof_cdb_w_dll.lib         → Link-Library
│   ├── sof_cdb_w_edu-2026.dll    → Edu-Version
│   └── sof_cdb_w_edu_dll.lib
└── examples\
    ├── python\
    │   ├── sofistik_daten.py      → Alle CDB-Strukturen (ctypes)
    │   └── python_3.x\
    │       ├── connect_to_cdb\
    │       ├── read_nodes\
    │       ├── get_kwl_values\
    │       ├── encode_decode_text\
    │       ├── number2string\
    │       └── single_span_girder\
    ├── c#\
    │   ├── sofistik_daten.cs      → Unsafe Structs
    │   ├── SOFiSTiKManagedTypes.cs → Managed Wrapper
    │   ├── connect_to_cdb\
    │   ├── read_nodes\
    │   ├── get_kwl_values\
    │   ├── decode_text\
    │   └── single_span_girder\
    ├── c++\
    │   ├── cdbase.h               → API-Definitionen
    │   ├── cdbtypeall.h           → Alle Datentypen
    │   ├── cdbtypemat.h           → Material-Typen
    │   ├── cdbtypegeo.h           → Geometrie-Typen
    │   ├── cdbtypesct.h           → Querschnitt-Typen
    │   ├── cdbtypesys.h           → System-Typen
    │   ├── cdbtypelfc.h           → Lastfall-Typen
    │   ├── cdbtypecon.h           → Verbindungs-Typen
    │   ├── cdbtypeten.h           → Spannglied-Typen
    │   └── cd_error.h             → Fehlercodes
    ├── fortran\
    │   └── (connect_to_cdb, read_nodes, single_span_girder)
    └── vb.net\
        ├── sofistik_daten.vb
        └── (connect_to_cdb, read_nodes, single_span_girder)
```

### Online-Dokumentation

- `https://docs.sofistik.com/2026/en/cdb_interfaces/`
- `https://docs.sofistik.com/2026/en/fea/`

### Fehlercodes (cd_error.h)

| Code | Konstante | Bedeutung |
|------|-----------|-----------|
| 0 | `CD_ERR_NONE` | Kein Fehler |
| 1 | `CD_ERR_TOOLONG` | Record zu lang für Puffer |
| 2 | `CD_ERR_DATAEND` | Ende der Daten |
| 3 | `CD_ERR_NOTFOUND` | Key nicht gefunden |
| 4 | `CD_ERR_NOLOCK` | Kein Lock vorhanden |
| 5 | `CD_ERR_CDB_ERROR` | CDB-Fehler |
| 10 | `CD_ERR_NOFILE` | Datei nicht gefunden |
| 99 | `CD_ERR_CORRUPT` | Datenbank korrupt |

### CDB-Init Fehlercodes

| Code | Bedeutung |
|------|-----------|
| >0 | Erfolg (Index-Wert) |
| 0 | Datei ist keine CDB |
| -16 | Unbekannter Fehler |
| -17 | Pfad nicht gefunden |
| -27 | Datei nicht gefunden |
| -28 | Keine Berechtigung zum Erstellen |
| -38 | Keine Schreibberechtigung |
| -47 | Falsche CDB-Version |
| -48 | Kein CDB-Format |

### Status-Bit-Flags

| Bit | Konstante | Bedeutung |
|-----|-----------|-----------|
| 0x0001 | `CD_STATUS_AKTIV` | CDBASE ist aktiv |
| 0x0002 | `CD_STATUS_OPEN` | Index mit Datei verbunden |
| 0x0004 | `CD_STATUS_SWAP` | Byte-Swap nötig |
| 0x0008 | `CD_STATUS_READ` | Datei wurde gelesen |
| 0x0010 | `CD_STATUS_WRITE` | Datei wurde geschrieben |
| 0x0020 | `CD_STATUS_LOCK` | Locks existieren |
| 0x0100 | `CD_STATUS_READONLY` | Read-Only geöffnet |
