"""
CDB → SQLite: Complete pipeline for SOFiSTiK web postprocessor.

1. sync_cdb_to_db --scope full  → geometry SQLite
2. sps + RESULTS                → .erg text export
3. Parse .erg                   → inject results into SQLite

Usage:
    python tools/cdb_to_sqlite.py examples/webblecbuckling.cdb
    python tools/cdb_to_sqlite.py examples/webblecbuckling.cdb -o output.sqlite
"""

import os
import re
import sys
import sqlite3
import subprocess
import tempfile
import time
from pathlib import Path

SOFISTIK_DIR = r"C:\Program Files\SOFiSTiK\2026\SOFiSTiK 2026"
SYNC_EXE = os.path.join(SOFISTIK_DIR, "sync_cdb_to_db.exe")
SPS_EXE = os.path.join(SOFISTIK_DIR, "sps.exe")


# ─── Step 1: Geometry via sync_cdb_to_db ─────────────────────────────────────

def sync_geometry(cdb_path: str, sqlite_path: str):
    """Run sync_cdb_to_db to create SQLite with geometry."""
    # Remove existing sqlite to get clean state.
    # On Windows the server may hold a shared lock on the file — retry briefly.
    if os.path.exists(sqlite_path):
        for attempt in range(5):
            try:
                os.remove(sqlite_path)
                break
            except PermissionError:
                time.sleep(0.4)

    result = subprocess.run(
        [SYNC_EXE, "-f", cdb_path, "--scope", "full"],
        capture_output=True, text=True,
    )
    output = result.stdout + result.stderr

    if not os.path.exists(sqlite_path):
        print(f"  ERROR: sync_cdb_to_db failed to create {sqlite_path}")
        print(output)
        return False

    # Count what we got
    conn = sqlite3.connect(sqlite_path)
    c = conn.cursor()
    counts = {}
    for table in ["fe_node", "fe_line", "fe_quad", "fe_bric", "load_case"]:
        c.execute(f"SELECT COUNT(*) FROM [{table}]")
        cnt = c.fetchone()[0]
        if cnt > 0:
            counts[table] = cnt
    conn.close()

    print(f"  Geometry: {counts}")
    return True


# ─── Step 2: RESULTS export via SPS ──────────────────────────────────────────

RESULTS_DAT = """\
+PROG RESULTS urs:1
HEAD Export Node Displacements
PAGE UNII 0
LC ALL
NODE TYPE UX,UY,UZ,RX,RY,RZ REPR DLST
END

+PROG RESULTS urs:2
HEAD Export Quad Forces
PAGE UNII 0
LC ALL
QUAD TYPE MX,MY,MXY,VX,VY,NX,NY,NXY REPR DLST
END

+PROG RESULTS urs:3
HEAD Export Beam Forces
PAGE UNII 0
LC ALL
BEAM TYPE N,VY,VZ,MT,MY,MZ REPR DLST
END

+PROG RESULTS urs:4
HEAD Export Quad Stresses
PAGE UNII 0
LC ALL
QUAD TYPE SXU,SYU,TXYU,SXL,SYL,TXYL REPR DLST
END

"""
# Note: Support reactions are parsed from the ASE "Knotenverschiebungen und Kräfte"
# section in the main .erg rather than via a separate RESULTS export, because
# NODE TYPE PX,PY,PZ,MX,MY,MZ causes Warnung 409 + STOP for RAHM (2D) models.


def export_results(cdb_path: str, work_dir: str) -> str | None:
    """Run SPS with RESULTS module to export .erg text."""
    work_dir = str(Path(work_dir).resolve())
    cdb_path = str(Path(cdb_path).resolve())
    dat_path = os.path.join(work_dir, "_export_results.dat")
    erg_path = os.path.join(work_dir, "_export_results.erg")

    with open(dat_path, "w") as f:
        f.write(RESULTS_DAT)

    result = subprocess.run(
        [SPS_EXE, "-B", f"-cdb:{cdb_path}", dat_path],
        capture_output=True, text=True,
        cwd=work_dir,
    )

    if os.path.exists(erg_path) and os.path.getsize(erg_path) > 100:
        return erg_path

    # Try without beam forces (model might not have beams)
    dat_no_beam = RESULTS_DAT.split("+PROG RESULTS urs:3")[0]
    with open(dat_path, "w") as f:
        f.write(dat_no_beam)

    result = subprocess.run(
        [SPS_EXE, "-B", f"-cdb:{cdb_path}", dat_path],
        capture_output=True, text=True,
        cwd=work_dir,
    )

    if os.path.exists(erg_path) and os.path.getsize(erg_path) > 100:
        return erg_path

    print(f"  ERROR: SPS failed to create .erg")
    print(result.stdout + result.stderr)
    return None


# ─── Step 3: Parse .erg and inject ────────────────────────────────────────────

MM_TO_M = 0.001
MRAD_TO_RAD = 0.001


def parse_erg(erg_path: str):
    """Parse RESULTS .erg for node displacements, quad forces, beam forces."""
    with open(erg_path, "r", encoding="latin-1") as f:
        lines = f.readlines()

    node_disps = []
    quad_forces = []
    beam_forces = []
    quad_stresses = []
    support_reactions = []

    current_lc = None
    current_beam = None
    mode = None

    for line in lines:
        stripped = line.strip()

        # Detect section headers (order matters: beam before quad)
        # Support both German and English output
        line_lower = line.lower()

        # ASE "Knotenverschiebungen und Kräfte  Lastfall N" — combined disp+reactions block.
        # Must be checked BEFORE the generic node_disp check (shares "knotenverschiebung" + "lastfall").
        # Distinguish from RESULTS "Knotenverschiebungen  Lastfall N" by requiring "und" before "lastfall"
        # (only the ASE section has "und Kräfte"; RESULTS sections do not).
        lf_idx = line_lower.find("lastfall")
        _has_und_before_lf = lf_idx > 0 and "und" in line_lower[:lf_idx]
        if "knotenverschiebung" in line_lower and lf_idx >= 0 and _has_und_before_lf:
            mode = "ase_forces"
            m = re.search(r'lastfall\s+(\d+)', line_lower)
            if m:
                current_lc = int(m.group(1))
            continue

        if "knotenverschiebung" in line_lower or "node displacements" in line_lower:
            mode = "node_disp"
            current_lc = None
            continue
        if ("spannung" in line_lower and ("oben" in line_lower or "unten" in line_lower)) or \
           ("stress" in line_lower and ("upper" in line_lower or "lower" in line_lower)):
            mode = "quad_stress"
            current_lc = None
            continue
        if ("stabelement" in line_lower and "chnittkr" in line_lower) or \
           "beam elements forces" in line_lower:
            mode = "beam_force"
            current_lc = None
            continue
        if "chnittkr" in line_lower or "quad elements forces" in line_lower:
            mode = "quad_force"
            current_lc = None
            continue
        if "auflagerkraft" in line_lower or "support reaction" in line_lower or \
           "knotenlasten" in line_lower or \
           ("knotenla" in line_lower and "reaktion" in line_lower):
            mode = "support_reaction"
            current_lc = None
            continue

        # Skip non-data lines
        if stripped.startswith("LF LF-Name") or stripped.startswith("["):
            continue
        if not stripped or stripped.startswith("RESULTS") or stripped.startswith("Seite:"):
            continue
        if "Export" in stripped or "Trial Version" in stripped:
            continue

        if mode is None:
            continue

        # Extract LC from lines starting with LC number
        lc_match = re.match(r"\s+(\d+)\s+\S", line)
        if lc_match and not re.match(r"\s+\d+\s+[-\d.]", line):
            current_lc = int(lc_match.group(1))

        if current_lc is None:
            continue

        if mode == "node_disp":
            m = re.search(
                r"(\d+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+"
                r"([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*$", line)
            if m:
                node_nr = int(m.group(1))
                vals = [float(m.group(i)) for i in range(2, 8)]
                node_disps.append((
                    current_lc, node_nr,
                    vals[0] * MM_TO_M, vals[1] * MM_TO_M, vals[2] * MM_TO_M,
                    vals[3] * MRAD_TO_RAD, vals[4] * MRAD_TO_RAD, vals[5] * MRAD_TO_RAD,
                ))

        elif mode == "quad_force":
            # Format B first: "... nx ny nxy QUAD mxx myy mxy vx vy"
            # (SOFIMSHC combined knot+quad output — has 11+ values per line)
            m = re.search(
                r"[-\d.]+\s+[-\d.]+\s+[-\d.]+\s+"
                r"(\d+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+"
                r"([-\d.]+)\s+([-\d.]+)\s*$", line)
            if m and len(line.split()) >= 8:  # Format B: nx ny nxy + quad_nr + 5 values
                elem_nr = int(m.group(1))
                mxx = float(m.group(2))
                myy = float(m.group(3))
                mxy = float(m.group(4))
                vx = float(m.group(5))
                vy = float(m.group(6))
                quad_forces.append((
                    current_lc, elem_nr,
                    mxx, myy, mxy, vx, vy,
                    0, 0, 0,
                ))
            else:
                # Format A: "elem mxx myy mxy vx vy nx ny nxy" (9 values)
                m = re.search(
                    r"^\s*(\d+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+"
                    r"([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*$", line)
                if m:
                    elem_nr = int(m.group(1))
                    vals = [float(m.group(i)) for i in range(2, 10)]
                    quad_forces.append((
                        current_lc, elem_nr,
                        vals[0], vals[1], vals[2],
                        vals[3], vals[4],
                        vals[5], vals[6], vals[7],
                    ))

        elif mode == "beam_force":
            # Format: STAB X Xi N VY VZ MT MY MZ (elem_nr + 8 values)
            m = re.search(
                r"(\d+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+"
                r"([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*$", line)
            if m:
                current_beam = int(m.group(1))
                vals = [float(m.group(i)) for i in range(2, 10)]
                # vals: x, xi, N, Vy, Vz, Mt, My, Mz
                beam_forces.append((
                    current_lc, current_beam,
                    vals[0], vals[2], vals[3], vals[4],
                    vals[5], vals[6], vals[7],
                ))
                continue
            # Continuation: X Xi N VY VZ MT MY MZ (8 values, no elem_nr)
            if current_beam is not None:
                m = re.search(
                    r"^\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+"
                    r"([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*$", line)
                if m:
                    vals = [float(m.group(i)) for i in range(1, 9)]
                    beam_forces.append((
                        current_lc, current_beam,
                        vals[0], vals[2], vals[3], vals[4],
                        vals[5], vals[6], vals[7],
                    ))

        elif mode == "quad_stress":
            # Format: QUAD sxo syo sxyo sxu syu sxyu (elem_nr + 6 values)
            m = re.search(
                r"(\d+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+"
                r"([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*$", line)
            if m:
                elem_nr = int(m.group(1))
                vals = [float(m.group(i)) for i in range(2, 8)]
                quad_stresses.append((
                    current_lc, elem_nr,
                    vals[0], vals[1], vals[2],
                    vals[3], vals[4], vals[5],
                ))

        elif mode == "support_reaction":
            # Format: node_nr PX PY PZ MX MY MZ (6 values, kN / kNm)
            m = re.search(
                r"(\d+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+"
                r"([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*$", line)
            if m:
                node_nr = int(m.group(1))
                vals = [float(m.group(i)) for i in range(2, 8)]
                # Skip rows where all reactions are zero (unsupported nodes)
                if any(abs(v) > 1e-6 for v in vals):
                    support_reactions.append((
                        current_lc, node_nr,
                        vals[0], vals[1], vals[2],   # PX, PY, PZ [kN]
                        vals[3], vals[4], vals[5],   # MX, MY, MZ [kNm]
                    ))

        elif mode == "ase_forces":
            # ASE "Knotenverschiebungen und Kräfte" block.
            # Format per node:
            #   with moment reaction:    node uX uY phiZ PX PY MZ  (7 values)
            #   pinned support:          node uX uY phiZ PX PY     (6 values, MZ column blank)
            #   without reactions:       node uX uY phiZ            (4 values, force cols blank)
            # Reactions are in kN / kNm — same units as the RESULTS export.
            # Lines with 9+ parts are ASE beam-section lines (grp elem x N Vy Vz Mt My Mz)
            # that must be excluded to prevent spurious node-0 entries.
            parts = line.split()
            if 6 <= len(parts) <= 7:
                try:
                    node_nr = int(parts[0])
                    px = float(parts[4])
                    py = float(parts[5])
                    mz = float(parts[6]) if len(parts) >= 7 else 0.0
                    if any(abs(v) > 1e-6 for v in [px, py, mz]):
                        support_reactions.append((
                            current_lc, node_nr,
                            px, 0.0, py,   # PX=horizontal, PZ=vertical (SOFIMSHA-Y→pz for canvas)
                            0.0, 0.0, mz,  # MX, MY, MZ
                        ))
                except (ValueError, IndexError):
                    pass

    return node_disps, quad_forces, beam_forces, quad_stresses, support_reactions


def inject(sqlite_path: str, node_disps, quad_forces, beam_forces, quad_stresses, support_reactions=None):
    """Insert parsed results into SQLite."""
    conn = sqlite3.connect(sqlite_path)
    cur = conn.cursor()

    # Detect schema variant: new sync_cdb_to_db uses load_case_id/element_id,
    # older versions use load_case_no/node_no/beam_no/quad_no.
    cols = {r[1] for r in cur.execute(
        "PRAGMA table_info(fe_result_node_displacement)"
    ).fetchall()}
    lc  = "load_case_id" if "load_case_id" in cols else "load_case_no"
    nid = "element_id"   if "element_id"   in cols else "node_no"
    bid = "element_id"   if "element_id"   in cols else "beam_no"
    qid = "element_id"   if "element_id"   in cols else "quad_no"

    if node_disps:
        cur.executemany(
            f"INSERT OR REPLACE INTO fe_result_node_displacement "
            f"({lc}, {nid}, uX, uY, uZ, phiX, phiY, phiZ, phiw) "
            "VALUES (?,?,?,?,?,?,?,?,0)",
            node_disps,
        )

    if quad_forces:
        cur.executemany(
            f"INSERT OR REPLACE INTO fe_result_quad_internal_force "
            f"({lc}, {qid}, node_no, mxx, myy, mxy, vx, vy, nx, ny, nxy, "
            " vx_v, vy_v, fy) "
            "VALUES (?,?,0, ?,?,?,?,?,?,?,?, 0,0,0)",
            quad_forces,
        )

    if beam_forces:
        cur.executemany(
            f"INSERT OR REPLACE INTO fe_result_beam_internal_force "
            f"({lc}, {bid}, x, N, Vy, Vz, Mt, My, Mz) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            beam_forces,
        )

    if quad_stresses:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS fe_result_quad_stress (
                load_case_id INTEGER,
                element_id INTEGER,
                sxo REAL, syo REAL, sxyo REAL,
                sxu REAL, syu REAL, sxyu REAL,
                PRIMARY KEY (load_case_id, element_id)
            )
        """)
        cur.executemany(
            "INSERT OR REPLACE INTO fe_result_quad_stress "
            "(load_case_id, element_id, sxo, syo, sxyo, sxu, syu, sxyu) "
            "VALUES (?,?,?,?,?,?,?,?)",
            quad_stresses,
        )

    if support_reactions:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS fe_result_support_reaction (
                load_case_id INTEGER,
                node_id INTEGER,
                px REAL, py REAL, pz REAL,
                mx REAL, my REAL, mz REAL,
                PRIMARY KEY (load_case_id, node_id)
            )
        """)
        cur.executemany(
            "INSERT OR REPLACE INTO fe_result_support_reaction "
            "(load_case_id, node_id, px, py, pz, mx, my, mz) "
            "VALUES (?,?,?,?,?,?,?,?)",
            support_reactions,
        )

    conn.commit()
    conn.close()
    return len(node_disps), len(quad_forces), len(beam_forces), len(quad_stresses), len(support_reactions or [])


# ─── Step 4: Parse CSM .dat for construction stages ──────────────────────────

def find_csm_dat(cdb_path: str) -> str | None:
    """Find *_csm.dat alongside the CDB file."""
    import glob
    d = os.path.dirname(cdb_path)
    base = Path(cdb_path).stem  # e.g. "csm6_freivorbau_gross"
    # Try exact match first, then glob
    exact = os.path.join(d, base + "_csm.dat")
    if os.path.exists(exact):
        return exact
    matches = glob.glob(os.path.join(d, base + "*_csm.dat"))
    return matches[0] if matches else None


def parse_csm_dat(csm_path: str) -> list[dict]:
    """Parse CSM .dat to extract construction stages with active groups.

    Handles two construction types:
    - Freivorbau (cantilever): groups added incrementally via PLF 0
    - Taktschieben (incremental launching): all groups active from start, moved via TAKT GRP

    Returns list of {stage_nr, name, load_case_nr, new_groups, active_groups}.
    """
    with open(csm_path, "r", encoding="latin-1") as f:
        text = f.read()

    stages = {}
    current_stage = None

    for line in text.split("\n"):
        m = re.search(r"Construction Stage\s+(\d+)", line)
        if m:
            current_stage = int(m.group(1))
            stages.setdefault(current_stage, {"name": "", "load_case_nr": None, "new_groups": [], "all_groups": []})
            continue

        if current_stage is None:
            continue

        # Load case number and name from LF line
        m = re.search(r'LF\s+(\d+)\s+TYP\s+\S+\s+BEZ\s+"([^"]+)"', line)
        if m:
            stages[current_stage]["load_case_nr"] = int(m.group(1))
            stages[current_stage]["name"] = m.group(2).strip()
            continue

        # Group activation
        m = re.match(r"\s*GRUP\s+(\d+)\s+BA\s+\d+\s+FAKG\s+\d+(.*)", line)
        if m:
            grp = int(m.group(1))
            rest = m.group(2)
            if grp not in stages[current_stage]["all_groups"]:
                stages[current_stage]["all_groups"].append(grp)
            if "PLF 0" in rest:  # erste Aktivierung (Freivorbau)
                stages[current_stage]["new_groups"].append(grp)

    sorted_nrs = sorted(stages.keys())

    # active_groups = exactly the groups listed in each stage's GRUP lines.
    # new_groups = groups appearing for the first time vs. previous stage.
    # This handles both Freivorbau (incremental) and Taktschieben (sliding)
    # as well as hybrid models.
    prev_all: set[int] = set()
    result = []
    for sn in sorted_nrs:
        s = stages[sn]
        current_all = set(s["all_groups"])
        new_groups = sorted(current_all - prev_all)
        result.append({
            "stage_nr": sn,
            "name": s["name"],
            "load_case_nr": s["load_case_nr"],
            "new_groups": new_groups,
            "active_groups": sorted(current_all),
        })
        prev_all = current_all

    return result


def inject_csm_stages(sqlite_path: str, stages: list[dict]):
    """Create construction_stage table in SQLite."""
    import json
    conn = sqlite3.connect(sqlite_path)
    cur = conn.cursor()
    cur.execute("DROP TABLE IF EXISTS construction_stage")
    cur.execute("""
        CREATE TABLE construction_stage (
            stage_nr INTEGER PRIMARY KEY,
            name TEXT,
            load_case_nr INTEGER,
            new_groups TEXT,
            active_groups TEXT
        )
    """)
    for s in stages:
        cur.execute(
            "INSERT INTO construction_stage (stage_nr, name, load_case_nr, new_groups, active_groups) VALUES (?,?,?,?,?)",
            (s["stage_nr"], s["name"], s.get("load_case_nr"), json.dumps(s["new_groups"]), json.dumps(s["active_groups"])),
        )
    conn.commit()
    conn.close()


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print("Usage: python tools/cdb_to_sqlite.py <input.cdb> [-o output.sqlite]")
        sys.exit(1)

    cdb_path = os.path.abspath(sys.argv[1])
    if not os.path.exists(cdb_path):
        print(f"ERROR: {cdb_path} not found")
        sys.exit(1)

    # Output path: same name, .sqlite extension
    if "-o" in sys.argv:
        sqlite_path = os.path.abspath(sys.argv[sys.argv.index("-o") + 1])
    else:
        sqlite_path = str(Path(cdb_path).with_suffix(".sqlite"))

    work_dir = str(Path(cdb_path).parent)

    print(f"=== CDB -> SQLite ===")
    print(f"  Input:  {cdb_path} ({os.path.getsize(cdb_path) / 1024:.0f} KB)")
    print(f"  Output: {sqlite_path}")

    t0 = time.time()

    # Step 1: Geometry
    print("\n[1/3] Syncing geometry...")
    if not sync_geometry(cdb_path, sqlite_path):
        sys.exit(1)

    # Step 2: Export results — prefer the main .erg (same name as CDB) if it exists,
    # since it contains both RESULTS blocks AND the ASE "Knotenverschiebungen und Kräfte"
    # section needed for support reactions.
    print("[2/3] Exporting results via SPS...")
    main_erg = str(Path(cdb_path).with_suffix(".erg"))
    if os.path.exists(main_erg) and os.path.getsize(main_erg) > 100:
        erg_path = main_erg
        print(f"  Using existing .erg: {os.path.basename(erg_path)}")
    else:
        erg_path = export_results(cdb_path, work_dir)
    if not erg_path:
        print("  WARNING: No results exported. SQLite has geometry only.")
    else:
        # Step 3: Parse and inject
        print("[3/3] Parsing and injecting results...")
        node_disps, quad_forces, beam_forces, quad_stresses, support_reactions = parse_erg(erg_path)

        lcs = sorted(set(
            [d[0] for d in node_disps] +
            [q[0] for q in quad_forces] +
            [b[0] for b in beam_forces] +
            [s[0] for s in quad_stresses]
        ))

        n_nd, n_qf, n_bf, n_qs, n_sr = inject(sqlite_path, node_disps, quad_forces, beam_forces, quad_stresses, support_reactions)
        print(f"  Node displacements: {n_nd} rows")
        print(f"  Quad forces:        {n_qf} rows")
        print(f"  Beam forces:        {n_bf} rows")
        print(f"  Quad stresses:      {n_qs} rows")
        print(f"  Support reactions:  {n_sr} rows")
        print(f"  Load cases:         {lcs}")

        # Cleanup temp files
        for ext in [".dat", ".erg", ".plb", ".prt", ".lst", ".error_positions"]:
            p = os.path.join(work_dir, f"_export_results{ext}")
            if os.path.exists(p):
                os.remove(p)

    # Step 4: CSM construction stages (optional)
    csm_path = find_csm_dat(cdb_path)
    if csm_path:
        print(f"[4/4] Parsing CSM stages from {os.path.basename(csm_path)}...")
        stages = parse_csm_dat(csm_path)
        inject_csm_stages(sqlite_path, stages)
        print(f"  Construction stages: {len(stages)}")
        # Show summary
        for s in stages:
            new = s["new_groups"]
            print(f"    BA {s['stage_nr']:4d}: {s['name']:<35s} +{len(new)} groups -> {len(s['active_groups'])} total")

    dt = time.time() - t0
    print(f"\nDone in {dt:.1f}s")
    print(f"  {sqlite_path} ({os.path.getsize(sqlite_path) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
