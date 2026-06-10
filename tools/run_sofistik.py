"""
Run SOFiSTiK calculation from editor model JSON.

Pipeline: JSON → .dat → SPS → .cdb → sync_cdb_to_db → SQLite (+ RESULTS → .erg → inject)

Usage:
    python tools/run_sofistik.py model.json
    python tools/run_sofistik.py model.json -o output_name
"""

import json
import os
import subprocess
import sys
from pathlib import Path

SOFISTIK_DIR = r"C:\Program Files\SOFiSTiK\2026\SOFiSTiK 2026"
SPS_EXE = os.path.join(SOFISTIK_DIR, "sps.exe")

# Reuse cdb_to_sqlite for the post-calculation pipeline
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from tools.cdb_to_sqlite import sync_geometry, export_results, parse_erg, inject


# ─── Support mapping ────────────────────────────────────────────────────────

SUPPORT_FIX = {
    "NONE": "",
    "FIXED": "F",
    "PINNED": "PP",       # Fix UX + UY (both in-plane translations)
    "ROLLER_X": "XP",     # Fix only UY (vertical), UX free → horizontal roller
    "ROLLER_Z": "PX",     # Fix only UX (horizontal), UY free → vertical roller
    "SPRING": "",         # Elastic spring — handled separately via SPT CA
}


# ─── .dat Generator (Python-side, mirrors editor-dat.js) ────────────────────

def _generate_dat_with_areas(model: dict, meta: dict, lines: list, node_map: dict) -> str:
    """Generate .dat for models with areas using SOFIMSHC."""
    from collections import defaultdict

    # ── SOFIMSHC (needs +prog and HEAD/END syntax)
    lines.append("+prog sofimshc urs:2")
    lines.append("HEAD Tragwerk")
    lines.append("SYST SPAC GDIR NEGZ")
    hmin = model.get("meshSettings", {}).get("hmin", 0.5)
    lines.append("CTRL MESH 1")
    lines.append(f"CTRL HMIN {hmin:.2f}")
    lines.append("")

    # SPT: all nodes — editor coords (x, z) → SOFIMSHC (X=x, Y=z, Z=0) for plate in XY plane
    lines.append("$ Structural Points")
    lines.append("SPT NO       X         Y         Z         FIX")
    for node in model.get("nodes", []):
        support = node.get("support", "NONE")
        if support == "SPRING":
            # Spring support: SPT with PZ fix, then CA stiffness
            lines.append(
                f"    {node['id']:>4}{node['x']:>10.3f}{node['z']:>10.3f}{'0.000':>10}     PZ"
            )
            stiffness = node.get("springStiffness", 1e6)
            lines.append(f"SPT {node['id']} FIX PZ CA {stiffness:.0f}")
        else:
            fix = SUPPORT_FIX.get(support, "")
            lines.append(
                f"    {node['id']:>4}{node['x']:>10.3f}{node['z']:>10.3f}{'0.000':>10}     {fix}"
            )
    lines.append("")

    # SLN: boundary lines from areas + opening boundaries + beam lines
    next_sln_id = 1
    area_sln_map = {}  # area_id → [sln_ids]
    beam_sln_map = {}  # beam_id → sln_id
    opening_sln_map = {}  # opening_id → [sln_ids]

    edge_fix_map = {
        "NONE": "", "FIXED": "F", "PINNED": "PP", "ROLLER_X": "XP", "ROLLER_Z": "PX",
    }

    for area in model.get("areas", []):
        sln_ids = []
        boundary = area["boundaryNodeIds"]
        edge_supports = area.get("edgeSupports", [])
        for i in range(len(boundary)):
            n1 = boundary[i]
            n2 = boundary[(i + 1) % len(boundary)]
            sln_id = next_sln_id
            next_sln_id += 1
            edge_sup = edge_supports[i] if i < len(edge_supports) else "NONE"
            fix_code = edge_fix_map.get(edge_sup, "")
            sln_line = f"SLN {sln_id}  {n1}  {n2}"
            if fix_code:
                sln_line += f" ; SLNS FIX {fix_code}"
            lines.append(sln_line)
            sln_ids.append(sln_id)
        area_sln_map[area["id"]] = sln_ids

    # SLN for opening boundaries
    for opening in model.get("openings", []):
        sln_ids = []
        boundary = opening["boundaryNodeIds"]
        for i in range(len(boundary)):
            n1 = boundary[i]
            n2 = boundary[(i + 1) % len(boundary)]
            sln_id = next_sln_id
            next_sln_id += 1
            lines.append(f"SLN {sln_id}  {n1}  {n2}")
            sln_ids.append(sln_id)
        opening_sln_map[opening["id"]] = sln_ids

    # SLN for beams with SNO + STYP B
    # Skip beams that overlap with area boundary or opening edges (same node pairs)
    boundary_edges = set()
    for area in model.get("areas", []):
        bnd = area["boundaryNodeIds"]
        for i in range(len(bnd)):
            edge = tuple(sorted([bnd[i], bnd[(i + 1) % len(bnd)]]))
            boundary_edges.add(edge)
    for opening in model.get("openings", []):
        bnd = opening["boundaryNodeIds"]
        for i in range(len(bnd)):
            edge = tuple(sorted([bnd[i], bnd[(i + 1) % len(bnd)]]))
            boundary_edges.add(edge)

    for beam in model.get("beams", []):
        edge = tuple(sorted([beam["nodeStart"], beam["nodeEnd"]]))
        if edge in boundary_edges:
            continue  # skip — already covered by area/opening boundary SLN
        sln_id = next_sln_id
        next_sln_id += 1
        beam_sln_map[beam["id"]] = sln_id
        if beam.get("isStructLine"):
            # Pure geometry constraint line (no beam element)
            lines.append(f"SLN {sln_id}  {beam['nodeStart']}  {beam['nodeEnd']}")
        else:
            # Beam element with section
            lines.append(f"SLN {sln_id}  {beam['nodeStart']}  {beam['nodeEnd']}  SNO {beam.get('sectionId', 1)} STYP B")
    lines.append("")

    # SAR: structural areas with openings as inner boundaries
    for area in model.get("areas", []):
        sln_ids = area_sln_map.get(area["id"], [])
        lines.append(
            f"SAR {area['id']}  T {area['thickness'] * 1000:.0f}[mm] "
            f"GRP {area.get('groupId', 0)} MNO {area.get('materialId', 1)}"
        )
        # Collect opening SLN IDs for this area
        area_openings = [o for o in model.get("openings", []) if o.get("areaId") == area["id"]]
        lines.append(f"SARB OUT {','.join(str(s) for s in sln_ids)}")
        if area_openings:
            for o in area_openings:
                o_slns = opening_sln_map.get(o["id"], [])
                if o_slns:
                    lines.append(f"SARB IN {','.join(str(s) for s in o_slns)}")

    lines.append("END")
    lines.append("")

    # ── SOFILOAD
    all_node_forces = []
    has_area_loads = False
    sofiload_lines = []

    for lc in model.get("loadcases", []):
        lc_node_loads = []
        lc_area_loads = []
        lc_beam_loads = []
        for load in lc.get("loads", []):
            if load["type"] == "NODE_FORCE":
                direction = load["direction"]
                value = load["value"]
                nid = load["nodeId"]
                if direction in ("PZ", "PZZ"):
                    lc_node_loads.append((nid, 0, value))
                elif direction in ("PX", "PXX"):
                    lc_node_loads.append((nid, value, 0))
            elif load["type"] == "AREA_LOAD":
                area = None
                for a in model.get("areas", []):
                    if a["id"] == load["areaId"]:
                        area = a
                        break
                grp = area.get("groupId", 0) if area else 0
                lc_area_loads.append((grp, load["direction"], load["value"]))
                has_area_loads = True
            elif load["type"] == "BEAM_LINE":
                sln_id = beam_sln_map.get(load["elementId"])
                if sln_id:
                    lc_beam_loads.append((sln_id, load["direction"], load["p1"], load.get("p2", load["p1"])))

        if lc_node_loads or lc_area_loads or lc_beam_loads:
            sofiload_lines.append(f"LC {lc['id']}")
            for nid, fx, fz in lc_node_loads:
                sofiload_lines.append(f"  KNOT {nid} P1 {fx:.3f} P2 {fz:.3f}")
            for grp, direction, value in lc_area_loads:
                sofiload_lines.append(f"  QUAD GRP {grp} TYPE {direction} P {value:.3f}")
            for sln_id, direction, p1, p2 in lc_beam_loads:
                sofiload_lines.append(f"  LINE SLN {sln_id} TYPE {direction} P1 {p1:.3f} P2 {p2:.3f}")

    if sofiload_lines:
        lines.append("+PROG SOFILOAD urs:3")
        lines.append("HEAD Lasten")
        lines.extend(sofiload_lines)
        lines.append("END")
        lines.append("")

    # ── ASE
    analysis = model.get("analysisSettings", {})
    lines.append("+PROG ASE urs:4")
    lines.append("HEAD Berechnung")
    for lc in model.get("loadcases", []):
        fakg = "FAKG 1.0" if lc.get("name", "").lower() in ("eigengewicht", "dead load", "g") else ""
        lines.append(f"LC {lc['id']} {fakg}".strip())
    lines.append("END")
    lines.append("")

    # ── RESULTS (separate blocks — RESULTS can only handle one type per run)
    lines.append("+PROG RESULTS urs:99")
    lines.append("HEAD Export Knotenverschiebungen")
    lines.append("PAGE UNII 0")
    lines.append("LC ALL")
    lines.append("NODE TYPE UX,UY,UZ,RX,RY,RZ REPR DLST")
    lines.append("END")
    lines.append("")

    if model.get("beams"):
        lines.append("+PROG RESULTS urs:100")
        lines.append("HEAD Export Stabkraefte")
        lines.append("PAGE UNII 0")
        lines.append("LC ALL")
        lines.append("BEAM TYPE N,VY,VZ,MT,MY,MZ REPR DLST")
        lines.append("END")
        lines.append("")

    if model.get("areas"):
        lines.append("+PROG RESULTS urs:101")
        lines.append("HEAD Export Flaechenschnittkraefte")
        lines.append("PAGE UNII 0")
        lines.append("LC ALL")
        lines.append("QUAD TYPE MX,MY,MXY,VX,VY,NX,NY,NXY REPR DLST")
        lines.append("END")
        lines.append("")

    lines.append("+PROG RESULTS urs:102")
    lines.append("HEAD Export Support Reactions")
    lines.append("PAGE UNII 0")
    lines.append("LC ALL")
    lines.append("NODE TYPE PX,PY,PZ,MX,MY,MZ REPR DLST")
    lines.append("END")

    return "\n".join(lines)


def generate_dat(model: dict) -> str:
    """Convert editor model JSON to SOFiSTiK .dat text."""
    lines = []
    meta = model.get("meta", {})

    lines.append("$ Generated by infraFEM Editor")
    lines.append("")

    # ── AQUA
    lines.append("PROG AQUA urs:1")
    lines.append("KOPF Material und Querschnitte")
    lines.append("NORM EN 199X-200X")

    for mat in model.get("materials", []):
        if mat["type"] == "BETO":
            lines.append(f"MATE {mat['id']} 30000 GAM 25")
        elif mat["type"] == "STAH":
            # STAH (not MATE) required for QNR+PROF TYP catalog profiles.
            # No norm keywords (S355/EC3) to stay Trial-license compatible.
            lines.append(f"STAH {mat['id']} S")

    for sec in model.get("sections", []):
        mat_ref = f"MNR {sec['materialId']}"
        if sec["type"] == "SREC":
            lines.append(
                f"QB {sec['id']} {mat_ref} "
                f"B {sec['params']['B']:.3f}[m] "
                f"H {sec['params']['H']:.3f}[m]"
            )
        elif sec["type"] == "SCIR":
            lines.append(
                f"QC {sec['id']} {mat_ref} "
                f"D {sec['params']['D']:.3f}[m]"
            )
        elif sec["type"] == "TUBE":
            lines.append(
                f"QC {sec['id']} {mat_ref} "
                f"D {sec['params']['D']:.3f}[m] "
                f"T {sec['params']['T'] * 1000:.1f}[mm]"
            )
        elif sec["type"] == "QPRO":
            profile = sec.get("profile", "")  # e.g. "HEM 700", "IPE 500"
            lines.append(f"QNR {sec['id']} {mat_ref}")
            lines.append(f"PROF TYP {profile}")

    lines.append("ENDE")
    lines.append("")

    # Build node map: editor_id → (x, z, support)
    node_map = {}
    for node in model.get("nodes", []):
        node_map[node["id"]] = node

    # Check if model has areas → use SOFIMSHC, otherwise SOFIMSHA
    has_areas = len(model.get("areas", [])) > 0

    if has_areas:
        return _generate_dat_with_areas(model, meta, lines, node_map)

    # ── SOFIMSHA (with automatic beam subdivision for intermediate results)
    N_DIV = 8  # subdivide each beam into N_DIV elements

    lines.append("PROG SOFIMSHA urs:2")
    lines.append("KOPF Tragwerk")
    lines.append(f"SYST {meta.get('systemType', 'RAHM')}")

    # ── Hinge handling: create duplicate nodes + stiff springs ──
    next_hinge_node = 9000
    next_fede_id = 9000
    hinge_node_map = {}   # key: f"{beam_id}_start" or f"{beam_id}_end" → duplicate_node_id
    hinge_dup_nodes = []  # (id, x, z)
    hinge_springs = []    # (nodeA, nodeB)

    for beam in model.get("beams", []):
        if beam.get("hingeStart"):
            orig = node_map.get(beam["nodeStart"])
            if orig:
                dup_id = next_hinge_node
                next_hinge_node += 1
                hinge_node_map[f"{beam['id']}_start"] = dup_id
                hinge_dup_nodes.append((dup_id, orig["x"], orig["z"]))
                hinge_springs.append((beam["nodeStart"], dup_id))
        if beam.get("hingeEnd"):
            orig = node_map.get(beam["nodeEnd"])
            if orig:
                dup_id = next_hinge_node
                next_hinge_node += 1
                hinge_node_map[f"{beam['id']}_end"] = dup_id
                hinge_dup_nodes.append((dup_id, orig["x"], orig["z"]))
                hinge_springs.append((beam["nodeEnd"], dup_id))

    # Emit user-defined nodes
    for node in model.get("nodes", []):
        fix = SUPPORT_FIX.get(node.get("support", "NONE"), "")
        fix_str = f"  FIX {fix}" if fix else ""
        lines.append(
            f"KNOT {node['id']:>4}{node['x']:>10.3f}{node['z']:>10.3f}{fix_str}"
        )

    # Emit hinge duplicate nodes
    for dup_id, dx, dz in hinge_dup_nodes:
        lines.append(f"KNOT {dup_id:>4}{dx:>10.3f}{dz:>10.3f}  $ Gelenk-Duplikat")

    # Generate intermediate nodes and sub-beams
    # Use high node/beam IDs to avoid clashing with user IDs
    max_node_id = max((n["id"] for n in model.get("nodes", [])), default=0)
    max_node_id = max(max_node_id, next_hinge_node)  # account for hinge nodes
    max_beam_id = max((b["id"] for b in model.get("beams", [])), default=0)
    next_node = max_node_id + 1000  # start intermediate nodes at high offset
    next_beam = max_beam_id + 1000

    # Track node chain and sub-beam IDs for each original beam
    beam_node_chain = {}  # original_beam_id → [node_start, mid1, mid2, ..., node_end]
    beam_subelems = {}    # original_beam_id → [sub_beam_id1, ..., sub_beam_idN]

    lines.append("")

    for beam in model.get("beams", []):
        # Use hinge duplicate nodes as beam endpoints if applicable
        beam_start = hinge_node_map.get(f"{beam['id']}_start", beam["nodeStart"])
        beam_end = hinge_node_map.get(f"{beam['id']}_end", beam["nodeEnd"])

        n1 = node_map.get(beam["nodeStart"])
        n2 = node_map.get(beam["nodeEnd"])
        if not n1 or not n2:
            continue

        chain = [beam_start]
        sub_ids = []
        prev_node_id = beam_start

        for i in range(1, N_DIV):
            t = i / N_DIV
            ix = n1["x"] + t * (n2["x"] - n1["x"])
            iz = n1["z"] + t * (n2["z"] - n1["z"])
            mid_id = next_node
            next_node += 1
            chain.append(mid_id)
            lines.append(f"KNOT {mid_id:>4}{ix:>10.3f}{iz:>10.3f}")

            sb_id = next_beam
            next_beam += 1
            sub_ids.append(sb_id)
            lines.append(
                f"STAB {sb_id:>4} {prev_node_id:>4} {mid_id:>4} "
                f"QNR {beam['sectionId']}"
            )
            prev_node_id = mid_id

        # Last sub-beam to end node
        chain.append(beam_end)
        sb_id = next_beam
        next_beam += 1
        sub_ids.append(sb_id)
        lines.append(
            f"STAB {sb_id:>4} {prev_node_id:>4} {beam_end:>4} "
            f"QNR {beam['sectionId']}"
        )
        beam_node_chain[beam["id"]] = chain
        beam_subelems[beam["id"]] = sub_ids

    # Hinge springs (stiff translation coupling, no rotation → moment hinge)
    for nodeA, nodeB in hinge_springs:
        fid1 = next_fede_id
        next_fede_id += 1
        fid2 = next_fede_id
        next_fede_id += 1
        lines.append(f"FEDE {fid1} {nodeA:>4} {nodeB:>4} DX 1 0  CP 1E12  $ Gelenk X")
        lines.append(f"FEDE {fid2} {nodeA:>4} {nodeB:>4} DX 0 1  CP 1E12  $ Gelenk Z")

    lines.append("ENDE")
    lines.append("")

    # ── SOFILOAD — node forces + beam line loads
    # SOFILOAD STAB syntax: STAB nr TYP PYY value  (SYST RAHM: vertical = Y axis)
    from collections import defaultdict
    sofiload_lc_data = defaultdict(lambda: {"node": [], "beam": []})

    for lc in model.get("loadcases", []):
        for load in lc.get("loads", []):
            if load["type"] == "NODE_FORCE":
                nid = load["nodeId"]
                fx = load["value"] if load["direction"] in ("PX", "PXX") else 0.0
                fz = load["value"] if load["direction"] in ("PZ", "PZZ") else 0.0
                sofiload_lc_data[lc["id"]]["node"].append((nid, fx, fz))
            elif load["type"] == "BEAM_LINE":
                subs = beam_subelems.get(load["elementId"], [])
                if not subs:
                    continue
                # SYST RAHM: vertical=Y → PYY for gravity loads; PXX for horizontal
                type_code = "PYY" if load["direction"] in ("PZ", "PZZ") else "PXX"
                p1 = load["p1"]
                p2 = load.get("p2", p1)
                n = len(subs)
                for idx, sub_id in enumerate(subs):
                    t = idx / (n - 1) if n > 1 else 0
                    pe = p1 + t * (p2 - p1)
                    sofiload_lc_data[lc["id"]]["beam"].append((sub_id, type_code, pe))

    if any(d["node"] or d["beam"] for d in sofiload_lc_data.values()):
        lines.append("PROG SOFILOAD urs:3")
        lines.append("KOPF Lasten")
        for lc_id in sorted(sofiload_lc_data):
            lc_data = sofiload_lc_data[lc_id]
            if not lc_data["node"] and not lc_data["beam"]:
                continue
            lines.append(f"LF {lc_id}")
            for nid, fx, fz in lc_data["node"]:
                if abs(fx) > 1e-10 or abs(fz) > 1e-10:
                    lines.append(f"  KNOT {nid} TYP PP P1 {fx:.3f} P2 {fz:.3f}")
            for sub_id, type_code, pe in lc_data["beam"]:
                lines.append(f"  STAB {sub_id} TYP {type_code} {pe:.3f}")
        lines.append("ENDE")
        lines.append("")

    # ── ASE — load case list only (loads are in SOFILOAD)
    lines.append("PROG ASE urs:4")
    lines.append("KOPF Berechnung")
    lines.append("STEU WARN 398")

    for lc in model.get("loadcases", []):
        # SOFIMSHA RAHM: default gravity direction is EG-YY (+Y = upward) → -1.0 flips to downward.
        fakg = "FAKG -1.0" if lc.get("name", "").lower() in ("eigengewicht", "dead load", "g") else ""
        lines.append(f"LF {lc['id']} {fakg}".strip())

    lines.append("ENDE")
    lines.append("")

    # ── RESULTS (for auto-export — uses +PROG syntax required by RESULTS)
    lines.append("+PROG RESULTS urs:99")
    lines.append("HEAD Export Knotenverschiebungen")
    lines.append("PAGE UNII 0")
    lines.append("LC ALL")
    lines.append("NODE TYPE UX,UY,UZ,RX,RY,RZ REPR DLST")
    lines.append("END")
    lines.append("")

    if model.get("beams"):
        lines.append("+PROG RESULTS urs:100")
        lines.append("HEAD Export Stabkraefte")
        lines.append("PAGE UNII 0")
        lines.append("LC ALL")
        lines.append("BEAM TYPE N,VY,VZ,MT,MY,MZ REPR DLST")
        lines.append("END")
        lines.append("")

    # Support reactions for RAHM are parsed from the ASE "Knotenverschiebungen und Kraefte"
    # block by parse_erg(). NODE TYPE PX/PY/MZ via RESULTS causes Warnung 409 + STOP in
    # SYST RAHM — omit the RESULTS block and rely on the ASE output parsing instead.

    return "\n".join(lines)


# ─── Full calculation pipeline ──────────────────────────────────────────────

def run_calculation(model_json: dict, output_name: str, output_dir: str = None) -> dict:
    """
    Full pipeline: model JSON → .dat → SPS → CDB → SQLite.

    Returns dict with success, sqlite path, errors, log.
    """
    if output_dir is None:
        output_dir = str(Path(__file__).resolve().parent.parent / "examples")
    output_dir = str(Path(output_dir).resolve())

    dat_text = generate_dat(model_json)
    dat_path = os.path.join(output_dir, f"{output_name}.dat")
    cdb_path = os.path.join(output_dir, f"{output_name}.cdb")
    sqlite_path = os.path.join(output_dir, f"{output_name}.sqlite")

    # 1. Write .dat
    with open(dat_path, "w", encoding="utf-8") as f:
        f.write(dat_text)
    print(f"[1/4] .dat written: {dat_path}")

    # 2. Run SPS to create .cdb
    # Remove ALL old output files so SPS starts fresh (CDB vor Neuberechnung löschen).
    # sync_cdb_to_db.exe may hold a Windows file lock briefly after exit — retry up to 5s.
    import glob as _glob
    import time as _time
    for old in _glob.glob(os.path.join(output_dir, f"{output_name}.*")):
        if old.endswith(".dat"):
            continue  # keep the .dat we just wrote
        for attempt in range(10):
            try:
                os.remove(old)
                break
            except OSError:
                if attempt < 9:
                    _time.sleep(0.5)
                else:
                    print(f"[2/4] Warning: could not delete {old} (locked)")

    result = subprocess.run(
        [SPS_EXE, "-B", dat_path],
        capture_output=True,
        cwd=output_dir,
    )
    log = (result.stdout or b"").decode("latin-1") + (result.stderr or b"").decode("latin-1")

    if not os.path.exists(cdb_path):
        print(f"[2/4] ERROR: SPS failed to create .cdb")
        print(log)
        return {
            "success": False,
            "errors": ["SPS failed to create CDB file"],
            "log": log,
        }
    print(f"[2/4] CDB created: {cdb_path}")

    # 3. sync_cdb_to_db → geometry SQLite
    ok = sync_geometry(cdb_path, sqlite_path)
    if not ok:
        return {
            "success": False,
            "errors": ["sync_cdb_to_db failed"],
            "log": log,
        }
    print(f"[3/4] SQLite geometry synced: {sqlite_path}")

    # 4. Parse .erg results (RESULTS blocks are included in generated .dat)
    erg_path = os.path.join(output_dir, f"{output_name}.erg")
    try:
        if os.path.exists(erg_path) and os.path.getsize(erg_path) > 100:
            node_disps, quad_forces, beam_forces, quad_stresses, support_reactions = parse_erg(erg_path)
            inject(sqlite_path, node_disps, quad_forces, beam_forces, quad_stresses, support_reactions)
            print(f"[4/4] Results injected from: {erg_path} "
                  f"(nd={len(node_disps)}, bf={len(beam_forces)}, sr={len(support_reactions)})")
        else:
            # Fallback: separate RESULTS export via export_results()
            erg_path2 = export_results(cdb_path, output_dir)
            if erg_path2:
                node_disps, quad_forces, beam_forces, quad_stresses, support_reactions = parse_erg(erg_path2)
                inject(sqlite_path, node_disps, quad_forces, beam_forces, quad_stresses, support_reactions)
                print(f"[4/4] Results injected from: {erg_path2} "
                      f"(nd={len(node_disps)}, bf={len(beam_forces)}, sr={len(support_reactions)})")
            else:
                print(f"[4/4] No results exported (geometry only)")
    except Exception as e:
        print(f"[4/4] Warning: result parse/inject failed: {e}")
        import traceback; traceback.print_exc()

    return {
        "success": True,
        "sqlite": f"{output_name}.sqlite",
        "dat_path": dat_path,
        "log": log,
    }


# ─── Mesh-only pipeline ─────────────────────────────────────────────────────

def run_mesh_only(model_json: dict, output_name: str, output_dir: str = None) -> dict:
    """
    Mesh-only pipeline: model JSON → .dat (AQUA + SOFIMSHC) → SPS → CDB → SQLite.
    Returns dict with success, nodes, quads as lists of dicts.
    """
    if output_dir is None:
        output_dir = str(Path(__file__).resolve().parent.parent / "examples")
    output_dir = str(Path(output_dir).resolve())

    has_areas = len(model_json.get("areas", [])) > 0
    if not has_areas:
        return {"success": False, "errors": ["Vernetzung nur für Plattenmodelle (areas) möglich"]}

    # ── Build mesh-only .dat ──────────────────────────────────
    lines = []
    lines.append("$ infraFEM — Vernetzung (ohne Berechnung)")
    lines.append("")

    # AQUA
    lines.append("PROG AQUA urs:1")
    lines.append("KOPF Material und Querschnitte")
    lines.append("NORM EN 199X-200X")
    for mat in model_json.get("materials", []):
        if mat["type"] == "BETO":
            lines.append(f"MATE {mat['id']} 30000 GAM 25")
        elif mat["type"] == "STAH":
            lines.append(f"STAH {mat['id']} S")
    for sec in model_json.get("sections", []):
        mat_ref = f"MNR {sec['materialId']}"
        if sec["type"] == "SREC":
            lines.append(f"QB {sec['id']} {mat_ref} B {sec['params']['B']:.3f}[m] H {sec['params']['H']:.3f}[m]")
        elif sec["type"] == "SCIR":
            lines.append(f"QC {sec['id']} {mat_ref} D {sec['params']['D']:.3f}[m]")
        elif sec["type"] == "TUBE":
            lines.append(f"QC {sec['id']} {mat_ref} D {sec['params']['D']:.3f}[m] T {sec['params']['T'] * 1000:.1f}[mm]")
        elif sec["type"] == "QPRO":
            profile = sec.get("profile", "")
            lines.append(f"QNR {sec['id']} {mat_ref}")
            lines.append(f"PROF TYP {profile}")
    lines.append("ENDE")
    lines.append("")

    # SOFIMSHC
    hmin = model_json.get("meshSettings", {}).get("hmin", 0.5)
    lines.append("+prog sofimshc urs:2")
    lines.append("HEAD Tragwerk")
    lines.append("SYST SPAC GDIR NEGZ")
    lines.append("CTRL MESH 1")
    lines.append(f"CTRL HMIN {hmin:.2f}")
    lines.append("")
    lines.append("$ Structural Points")
    lines.append("SPT NO       X         Y         Z         FIX")
    for node in model_json.get("nodes", []):
        support = node.get("support", "NONE")
        if support == "SPRING":
            lines.append(f"    {node['id']:>4}{node['x']:>10.3f}{node['z']:>10.3f}{'0.000':>10}     PZ")
            lines.append(f"SPT {node['id']} FIX PZ CA {node.get('springStiffness', 1e6):.0f}")
        else:
            fix = SUPPORT_FIX.get(support, "")
            lines.append(f"    {node['id']:>4}{node['x']:>10.3f}{node['z']:>10.3f}{'0.000':>10}     {fix}")
    lines.append("")

    edge_fix_map = {"NONE": "", "FIXED": "F", "PINNED": "PP", "ROLLER_X": "XP", "ROLLER_Z": "PX"}
    next_sln_id = 1
    area_sln_map = {}
    opening_sln_map = {}

    for area in model_json.get("areas", []):
        sln_ids = []
        boundary = area["boundaryNodeIds"]
        edge_supports = area.get("edgeSupports", [])
        for i in range(len(boundary)):
            n1 = boundary[i]
            n2 = boundary[(i + 1) % len(boundary)]
            sln_id = next_sln_id; next_sln_id += 1
            edge_sup = edge_supports[i] if i < len(edge_supports) else "NONE"
            fix_code = edge_fix_map.get(edge_sup, "")
            sln_line = f"SLN {sln_id}  {n1}  {n2}"
            if fix_code:
                sln_line += f" ; SLNS FIX {fix_code}"
            lines.append(sln_line)
            sln_ids.append(sln_id)
        area_sln_map[area["id"]] = sln_ids

    for opening in model_json.get("openings", []):
        sln_ids = []
        boundary = opening["boundaryNodeIds"]
        for i in range(len(boundary)):
            n1 = boundary[i]; n2 = boundary[(i + 1) % len(boundary)]
            sln_id = next_sln_id; next_sln_id += 1
            lines.append(f"SLN {sln_id}  {n1}  {n2}")
            sln_ids.append(sln_id)
        opening_sln_map[opening["id"]] = sln_ids

    # Beams as SLN structural lines
    boundary_edges = set()
    for area in model_json.get("areas", []):
        bnd = area["boundaryNodeIds"]
        for i in range(len(bnd)):
            boundary_edges.add(tuple(sorted([bnd[i], bnd[(i + 1) % len(bnd)]])))
    for opening in model_json.get("openings", []):
        bnd = opening["boundaryNodeIds"]
        for i in range(len(bnd)):
            boundary_edges.add(tuple(sorted([bnd[i], bnd[(i + 1) % len(bnd)]])))
    for beam in model_json.get("beams", []):
        edge = tuple(sorted([beam["nodeStart"], beam["nodeEnd"]]))
        if edge in boundary_edges:
            continue
        sln_id = next_sln_id; next_sln_id += 1
        if beam.get("isStructLine"):
            lines.append(f"SLN {sln_id}  {beam['nodeStart']}  {beam['nodeEnd']}")
        else:
            lines.append(f"SLN {sln_id}  {beam['nodeStart']}  {beam['nodeEnd']}  SNO {beam.get('sectionId', 1)} STYP B")
    lines.append("")

    for area in model_json.get("areas", []):
        sln_ids = area_sln_map.get(area["id"], [])
        lines.append(
            f"SAR {area['id']}  T {area['thickness'] * 1000:.0f}[mm] "
            f"GRP {area.get('groupId', 0)} MNO {area.get('materialId', 1)}"
        )
        area_openings = [o for o in model_json.get("openings", []) if o.get("areaId") == area["id"]]
        lines.append(f"SARB OUT {','.join(str(s) for s in sln_ids)}")
        for o in area_openings:
            o_slns = opening_sln_map.get(o["id"], [])
            if o_slns:
                lines.append(f"SARB IN {','.join(str(s) for s in o_slns)}")
    lines.append("END")

    dat_text = "\n".join(lines)
    mesh_name = f"_mesh_{output_name}"
    dat_path = os.path.join(output_dir, f"{mesh_name}.dat")
    cdb_path = os.path.join(output_dir, f"{mesh_name}.cdb")
    sqlite_path = os.path.join(output_dir, f"{mesh_name}.sqlite")

    with open(dat_path, "w", encoding="utf-8") as f:
        f.write(dat_text)

    import glob as _glob
    import time as _time
    for old in _glob.glob(os.path.join(output_dir, f"{mesh_name}.*")):
        if old.endswith(".dat"):
            continue
        for attempt in range(3):
            try:
                os.remove(old)
                break
            except OSError:
                _time.sleep(0.5)

    result = subprocess.run(
        [SPS_EXE, "-B", dat_path],
        capture_output=True,
        cwd=output_dir,
    )
    log = (result.stdout or b"").decode("latin-1") + (result.stderr or b"").decode("latin-1")

    if not os.path.exists(cdb_path):
        return {"success": False, "errors": ["SPS Vernetzung fehlgeschlagen — CDB nicht erstellt"], "log": log}

    ok = sync_geometry(cdb_path, sqlite_path)
    if not ok:
        return {"success": False, "errors": ["sync_cdb_to_db fehlgeschlagen"], "log": log}

    # Read mesh from SQLite
    import sqlite3 as _sqlite3
    try:
        conn = _sqlite3.connect(sqlite_path)
        conn.row_factory = _sqlite3.Row
        node_rows = conn.execute(
            "SELECT number, position_x, position_y FROM fe_node ORDER BY number"
        ).fetchall()
        quad_rows = conn.execute(
            "SELECT number, node_numbers_0, node_numbers_1, node_numbers_2, node_numbers_3 "
            "FROM fe_quad ORDER BY number"
        ).fetchall()
        conn.close()
    except Exception as e:
        return {"success": False, "errors": [f"SQLite Lesefehler: {e}"], "log": log}

    nodes_out = [{"id": r["number"], "x": r["position_x"], "y": r["position_y"]} for r in node_rows]
    quads_out = [
        {"id": r["number"], "nodes": [r["node_numbers_0"], r["node_numbers_1"],
                                       r["node_numbers_2"], r["node_numbers_3"]]}
        for r in quad_rows
    ]

    return {
        "success": True,
        "nodes": nodes_out,
        "quads": quads_out,
        "n_nodes": len(nodes_out),
        "n_quads": len(quads_out),
        "log": log,
    }


# ─── CLI ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python tools/run_sofistik.py model.json [-o output_name]")
        sys.exit(1)

    json_path = sys.argv[1]
    output_name = None

    if "-o" in sys.argv:
        idx = sys.argv.index("-o")
        output_name = sys.argv[idx + 1]

    with open(json_path, "r") as f:
        model = json.load(f)

    if not output_name:
        output_name = Path(json_path).stem

    result = run_calculation(model, output_name)
    if result["success"]:
        print(f"\nDone! SQLite: {result['sqlite']}")
    else:
        print(f"\nFailed: {result['errors']}")
        sys.exit(1)
