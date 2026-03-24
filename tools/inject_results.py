"""
Parse SOFiSTiK RESULTS .erg output and inject into sync_cdb_to_db SQLite.

Workflow:
    1. SPS runs RESULTS export → .erg text file
    2. This script parses .erg → injects into existing .sqlite

Usage:
    python tools/inject_results.py examples/export_results.erg examples/webblecbuckling.sqlite
"""

import os
import re
import sys
import sqlite3
import time


def parse_erg(erg_path: str):
    """Parse SOFiSTiK RESULTS .erg file for node displacements and quad forces."""

    with open(erg_path, "r", encoding="latin-1") as f:
        lines = f.readlines()

    node_displacements = []  # (lc, node_nr, ux, uy, uz, phix, phiy, phiz)
    quad_forces = []  # (lc, elem_nr, mxx, myy, mxy, vx, vy, nx, ny, nxy)

    current_lc = None
    mode = None  # "node_disp" or "quad_force"

    # Unit conversion: mm → m, mrad → rad, kNm/m and kN/m stay as-is
    MM_TO_M = 0.001
    MRAD_TO_RAD = 0.001

    for line in lines:
        stripped = line.strip()

        # Detect section headers
        if "Knotenverschiebung" in line:
            mode = "node_disp"
            continue
        if "Schnittkr" in line or "chnittkr" in line:
            mode = "quad_force"
            continue

        # Skip header/unit lines
        if stripped.startswith("LF LF-Name") or stripped.startswith("["):
            continue
        if not stripped or stripped.startswith("RESULTS"):
            continue
        if stripped.startswith("Meshing") or stripped.startswith("Export"):
            continue
        if stripped.startswith("Seite:"):
            continue

        if mode is None:
            continue

        # Parse data line: either starts with LC number or is continuation
        # Format with LC:  "  1 Beul Ausgangszustand  1001 25.831 ..."
        # Continuation:    "                          1002 25.762 ..."

        # Try to extract LC from line start
        lc_match = re.match(r"\s+(\d+)\s+\S.*?\s+(\d+)\s+([-\d.]+)", line)
        cont_match = re.match(r"\s+(\d+)\s+([-\d.]+)", line)

        if lc_match:
            current_lc = int(lc_match.group(1))
            # Re-parse from the node/element number onward
            # Find where the numeric data starts after the LC name
            rest = line

        if current_lc is None:
            continue

        # Extract all numbers from the line
        # The tricky part: LC lines have "1 Beul Ausgangszustand  1001 25.831..."
        # Continuation lines have "                         1002 25.762..."

        # Find the data portion: starts with the element/node number
        if mode == "node_disp":
            # Look for pattern: node_nr followed by 6 floats
            m = re.search(r"(\d+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*$", line)
            if m:
                node_nr = int(m.group(1))
                vals = [float(m.group(i)) for i in range(2, 8)]
                # Convert mm→m and mrad→rad
                node_displacements.append((
                    current_lc, node_nr,
                    vals[0] * MM_TO_M, vals[1] * MM_TO_M, vals[2] * MM_TO_M,
                    vals[3] * MRAD_TO_RAD, vals[4] * MRAD_TO_RAD, vals[5] * MRAD_TO_RAD,
                ))

        elif mode == "quad_force":
            # Look for pattern: elem_nr followed by 8 floats
            m = re.search(r"(\d+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*$", line)
            if m:
                elem_nr = int(m.group(1))
                vals = [float(m.group(i)) for i in range(2, 10)]
                # Values are already in kNm/m and kN/m — keep as-is
                quad_forces.append((
                    current_lc, elem_nr,
                    vals[0], vals[1], vals[2],
                    vals[3], vals[4],
                    vals[5], vals[6], vals[7],
                ))

    return node_displacements, quad_forces


def inject_into_sqlite(sqlite_path: str, node_displacements, quad_forces):
    """Insert parsed results into existing sync_cdb_to_db SQLite."""
    conn = sqlite3.connect(sqlite_path)
    cur = conn.cursor()

    # Insert node displacements
    cur.executemany(
        "INSERT OR REPLACE INTO fe_result_node_displacement "
        "(load_case_id, element_id, uX, uY, uZ, phiX, phiY, phiZ, phiw) "
        "VALUES (?,?,?,?,?,?,?,?,0)",
        node_displacements,
    )
    n_disp = len(node_displacements)

    # Insert quad forces (element-centered, node_no=0)
    cur.executemany(
        "INSERT OR REPLACE INTO fe_result_quad_internal_force "
        "(load_case_id, element_id, node_no, mxx, myy, mxy, vx, vy, nx, ny, nxy, "
        " vx_v, vy_v, fy) "
        "VALUES (?,?,0, ?,?,?,?,?,?,?,?, 0,0,0)",
        quad_forces,
    )
    n_quad = len(quad_forces)

    conn.commit()
    conn.close()
    return n_disp, n_quad


def main():
    if len(sys.argv) < 3:
        print("Usage: python tools/inject_results.py <export.erg> <existing.sqlite>")
        sys.exit(1)

    erg_path = sys.argv[1]
    sqlite_path = sys.argv[2]

    if not os.path.exists(erg_path):
        print(f"ERROR: {erg_path} not found")
        sys.exit(1)
    if not os.path.exists(sqlite_path):
        print(f"ERROR: {sqlite_path} not found")
        sys.exit(1)

    print(f"=== Inject RESULTS .erg -> SQLite ===")
    print(f"  ERG:    {erg_path}")
    print(f"  SQLite: {sqlite_path} ({os.path.getsize(sqlite_path) / 1024:.0f} KB)")

    t0 = time.time()
    node_disps, quad_forces = parse_erg(erg_path)

    # Stats
    lcs_disp = sorted(set(d[0] for d in node_disps))
    lcs_quad = sorted(set(q[0] for q in quad_forces))
    print(f"\n  Parsed:")
    print(f"    Node displacements: {len(node_disps)} rows, LCs: {lcs_disp}")
    print(f"    Quad forces:        {len(quad_forces)} rows, LCs: {lcs_quad}")

    n_disp, n_quad = inject_into_sqlite(sqlite_path, node_disps, quad_forces)

    dt = time.time() - t0
    print(f"\n  Injected: {n_disp + n_quad} total rows in {dt:.1f}s")
    print(f"  SQLite:   {os.path.getsize(sqlite_path) / 1024:.0f} KB")


if __name__ == "__main__":
    main()
