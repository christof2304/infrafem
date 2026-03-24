"""
Analysiert eine SOFiSTiK CDB-Datei: Knoten, Elemente, Lastfälle, Ergebnisse.
Usage: python cdb_analyze.py <path_to_cdb>
"""
import sys
import os
from ctypes import *

# Pfade
SOFISTIK_DIR = r"C:\Program Files\SOFiSTiK\2026\SOFiSTiK 2026"
DLL_DIR = os.path.join(SOFISTIK_DIR, "interfaces", "64bit")
DATEN_DIR = os.path.join(SOFISTIK_DIR, "interfaces", "examples", "python")

# sofistik_daten.py importieren
sys.path.insert(0, DATEN_DIR)
from sofistik_daten import *

# DLL laden
os.add_dll_directory(DLL_DIR)
os.add_dll_directory(SOFISTIK_DIR)
cdb = cdll.LoadLibrary("sof_cdb_w-2026.dll")

# Wichtig: CD_WANT_RETURN setzen, damit keine Dialoge blockieren
cdb.sof_cdb_msglevel(10)  # CD_WANT_RETURN


def open_cdb(path):
    idx = c_int()
    idx.value = cdb.sof_cdb_init(path.encode("utf-8"), 95)  # read-only
    if idx.value <= 0:
        print(f"FEHLER: CDB konnte nicht geöffnet werden (Code: {idx.value})")
        sys.exit(1)
    return idx


def count_records(idx, kwh, kwl, struct_type):
    """Zählt Records für einen KWH/KWL und gibt sie zurück."""
    records = []
    ie = c_int(0)
    rec = struct_type()
    rl = c_int(sizeof(rec))
    while ie.value < 2:
        ie.value = cdb.sof_cdb_get(idx, kwh, kwl, byref(rec), byref(rl), 1)
        if ie.value < 2:
            records.append(rec)
            rec = struct_type()  # frische Instanz
        rl = c_int(sizeof(rec))
    return records


def list_kwl_values(idx, kwh):
    """Listet alle vorhandenen KWL-Werte für ein KWH."""
    kwh_c = c_int(kwh)
    kwl_c = c_int(0)

    # Min/Max ermitteln
    cdb.sof_cdb_kenq_ex(idx, byref(kwh_c), byref(kwl_c), c_int(-2))
    min_kwl = kwl_c.value

    kwh_c = c_int(kwh)
    kwl_c = c_int(0)
    cdb.sof_cdb_kenq_ex(idx, byref(kwh_c), byref(kwl_c), c_int(+2))
    max_kwl = kwl_c.value

    if min_kwl == 0 and max_kwl == 0:
        # Prüfe ob KWL=0 existiert
        if cdb.sof_cdb_kexist(kwh, 0) > 0:
            return [0]
        return []

    kwls = []
    kwh_c = c_int(kwh)
    kwl_c = c_int(min_kwl - 1)
    safety = 0
    while kwl_c.value < max_kwl and safety < 10000:
        cdb.sof_cdb_kenq_ex(idx, byref(kwh_c), byref(kwl_c), c_int(+1))
        if cdb.sof_cdb_kexist(kwh, kwl_c.value) > 0:
            kwls.append(kwl_c.value)
        safety += 1
        if kwl_c.value >= max_kwl:
            break
    return kwls


def analyze(cdb_path):
    print(f"=== CDB Analyse: {cdb_path} ===\n")
    idx = open_cdb(cdb_path)
    print(f"CDB geöffnet (Index: {idx.value})\n")

    # --- Systeminfo ---
    print("--- SYSTEMINFO (KWH 10/00) ---")
    syst_records = count_records(idx, 10, 0, CSYST)
    if syst_records:
        s = syst_records[0]
        print(f"  Systemtyp (iprob): {s.m_iprob}")
        print(f"  Schwerkraftrichtung (iachs): {s.m_iachs}")
        print(f"  Knoten gesamt (nknot): {s.m_nknot}")
        print(f"  Max. Knotennr. (mknot): {s.m_mknot}")
        print(f"  Gruppendivisor (igdiv): {s.m_igdiv}")

    # --- Knoten ---
    print("\n--- KNOTEN (KWH 20/00) ---")
    nodes = count_records(idx, 20, 0, CNODE)
    print(f"  Anzahl: {len(nodes)}")
    if nodes:
        xs = [n.m_xyz[0] for n in nodes]
        ys = [n.m_xyz[1] for n in nodes]
        zs = [n.m_xyz[2] for n in nodes]
        print(f"  X: {min(xs):.3f} .. {max(xs):.3f}")
        print(f"  Y: {min(ys):.3f} .. {max(ys):.3f}")
        print(f"  Z: {min(zs):.3f} .. {max(zs):.3f}")
        # Aufgelagerte Knoten
        fixed = [n for n in nodes if n.m_kfix != 0]
        print(f"  Aufgelagerte Knoten: {len(fixed)}")

    # --- Balken ---
    print("\n--- BEAM-ELEMENTE (KWH 100/00) ---")
    beams = count_records(idx, 100, 0, CBEAM)
    print(f"  Anzahl: {len(beams)}")
    if beams:
        sects = set(b.m_nrq for b in beams)
        print(f"  Querschnitte verwendet: {sorted(sects)}")

    # --- QUAD-Elemente ---
    print("\n--- QUAD-ELEMENTE (KWH 200/00) ---")
    quads = count_records(idx, 200, 0, CQUAD)
    print(f"  Anzahl: {len(quads)}")
    if quads:
        tri = sum(1 for q in quads if q.m_nul == q.m_nor or q.m_nor == 0)
        print(f"  Davon Dreiecke: {tri}")

    # --- BRIC-Elemente ---
    print("\n--- BRIC-ELEMENTE (KWH 300/00) ---")
    brics = count_records(idx, 300, 0, CBRIC)
    print(f"  Anzahl: {len(brics)}")

    # --- Fachwerkstäbe ---
    print("\n--- TRUS-ELEMENTE (KWH 150/00) ---")
    truss = count_records(idx, 150, 0, CTRUS)
    print(f"  Anzahl: {len(truss)}")

    # --- Seile ---
    print("\n--- CABL-ELEMENTE (KWH 160/00) ---")
    cables = count_records(idx, 160, 0, CCABL)
    print(f"  Anzahl: {len(cables)}")

    # --- Federn ---
    print("\n--- SPRI-ELEMENTE (KWH 170/00) ---")
    springs = count_records(idx, 170, 0, CSPRI)
    print(f"  Anzahl: {len(springs)}")

    # --- Gruppen ---
    print("\n--- GRUPPEN (KWH 11/00) ---")
    groups = count_records(idx, 11, 0, CGRP)
    print(f"  Anzahl: {len(groups)}")
    for g in groups:
        print(f"  Gruppe {g.m_ng}: Typ={g.m_typ}, Elemente={g.m_num}, "
              f"Nr. {g.m_min}..{g.m_max}, Mat={g.m_mnr}")

    # --- Materialien ---
    print("\n--- MATERIALIEN (KWH 1) ---")
    mat_kwls = list_kwl_values(idx, 1)
    print(f"  Material-Nummern: {mat_kwls}")

    # --- Querschnitte ---
    print("\n--- QUERSCHNITTE (KWH 9) ---")
    sect_kwls = list_kwl_values(idx, 9)
    print(f"  Querschnitt-Nummern: {sect_kwls}")

    # --- Lastfälle ---
    print("\n--- LASTFÄLLE (KWH 12) ---")
    lc_kwls = list_kwl_values(idx, 12)
    print(f"  Lastfall-Nummern: {lc_kwls}")
    for lc in lc_kwls[:30]:  # max 30 anzeigen
        recs = count_records(idx, 12, lc, CLC_CTRL)
        if recs:
            r = recs[0]
            # Titel dekodieren
            title_chars = []
            for i in range(17):
                val = r.m_rtex[i]
                if val == 0:
                    continue
                # 2 chars per int (Unicode packed)
                c1 = val & 0xFFFF
                c2 = (val >> 16) & 0xFFFF
                if c1 > 0 and c1 < 65536:
                    title_chars.append(chr(c1))
                if c2 > 0 and c2 < 65536:
                    title_chars.append(chr(c2))
            title = ''.join(title_chars).strip('\x00').strip()
            print(f"  LF {lc:5d}: Titel='{title}'")

    # --- Ergebnisse prüfen ---
    print("\n--- VORHANDENE ERGEBNISSE ---")

    result_types = [
        (24, "Knotenverschiebungen (CN_DISP)"),
        (102, "Balkenschnittgrößen (CBEAM_FOR)"),
        (105, "Balkenspannungen (CBEAM_STR)"),
        (106, "Balkenbewehrung (CBEAM_RFC)"),
        (107, "Balkennachweise (CBEAM_DES)"),
        (112, "Balkenkräfte ohne Platte (CBEAM_FTR)"),
        (210, "QUAD-Schnittgrößen (CQUAD_FOR)"),
        (211, "QUAD-Knotenkräfte (CQUAD_NFO)"),
        (220, "QUAD-Spannungen (CQUAD_STR)"),
        (221, "QUAD-Knotenspannungen (CQUAD_NST)"),
        (250, "QUAD-Bemessungsspannungen (CQUAD_DST)"),
        (260, "QUAD-Bewehrung (CQUAD_REI)"),
        (261, "QUAD-Knotenbewehrung (CQUAD_NRI)"),
        (310, "BRIC-Spannungen (CBRIC_STR)"),
        (360, "BRIC-Bewehrung (CBRIC_REI)"),
        (152, "Fachwerk-Ergebnisse (CTRUS_RES)"),
        (162, "Seil-Ergebnisse (CCABL_RES)"),
    ]

    for kwh, desc in result_types:
        kwls = list_kwl_values(idx, kwh)
        if kwls:
            print(f"  KWH {kwh:4d}: {desc}")
            print(f"           Lastfälle: {kwls[:20]}{'...' if len(kwls) > 20 else ''}")
            print(f"           Anzahl: {len(kwls)} Lastfälle")

    # --- Stichproben der Ergebnisse ---
    print("\n--- STICHPROBEN ---")

    # Verschiebungen
    if 24 in [r[0] for r in result_types]:
        disp_kwls = list_kwl_values(idx, 24)
        if disp_kwls:
            lc = disp_kwls[0]
            disps = count_records(idx, 24, lc, CN_DISP)
            if disps:
                max_uz = max(abs(d.m_uz) for d in disps if hasattr(d, 'm_uz'))
                max_node = [d for d in disps if abs(d.m_uz) == max_uz][0] if max_uz > 0 else None
                print(f"  Verschiebungen LF {lc}: {len(disps)} Knoten")
                if max_node:
                    print(f"    Max |uz| = {max_uz*1000:.3f} mm (Knoten {max_node.m_nr})")

    # Balkenkräfte
    beam_kwls = list_kwl_values(idx, 102)
    if beam_kwls:
        lc = beam_kwls[0]
        forces = count_records(idx, 102, lc, CBEAM_FOR)
        if forces:
            max_my = max(abs(f.m_my) for f in forces)
            max_n = max(abs(f.m_n) for f in forces)
            print(f"  Balkenkräfte LF {lc}: {len(forces)} Schnitte")
            print(f"    Max |My| = {max_my:.2f} kNm")
            print(f"    Max |N|  = {max_n:.2f} kN")

    # QUAD-Kräfte
    quad_kwls = list_kwl_values(idx, 210)
    if quad_kwls:
        lc = quad_kwls[0]
        qforces = count_records(idx, 210, lc, CQUAD_FOR)
        if qforces:
            max_mxx = max(abs(f.m_mxx) for f in qforces)
            max_myy = max(abs(f.m_myy) for f in qforces)
            print(f"  QUAD-Kräfte LF {lc}: {len(qforces)} Elemente")
            print(f"    Max |mxx| = {max_mxx:.2f} kNm/m")
            print(f"    Max |myy| = {max_myy:.2f} kNm/m")

    cdb.sof_cdb_close(0)
    print("\n=== Analyse abgeschlossen ===")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python cdb_analyze.py <path_to_cdb>")
        sys.exit(1)
    analyze(sys.argv[1])
