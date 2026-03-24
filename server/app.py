"""
infraFEM API — Thin adapter on SOFiSTiK sync_cdb_to_db SQLite.

Usage:
    uvicorn server.app:app --reload
    # or
    python -m server.app examples/webblecbuckling.sqlite
"""

import os
import sys
import sqlite3
from pathlib import Path
from contextlib import contextmanager
from typing import Optional

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

# ── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(title="infraFEM API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Static files ─────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent
EDITOR_DIR = PROJECT_ROOT / "editor"
VIEWER_DIR = PROJECT_ROOT / "viewer"

# Serve editor and viewer as static files
app.mount("/editor", StaticFiles(directory=str(EDITOR_DIR), html=True), name="editor")
app.mount("/viewer", StaticFiles(directory=str(VIEWER_DIR), html=True), name="viewer")


@app.get("/")
def root():
    """Redirect root to editor."""
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/editor/")

# Default DB path — overridden via env or CLI
DB_PATH: str = os.environ.get(
    "SOFISTIK_SQLITE",
    str(Path(__file__).resolve().parent.parent / "examples" / "webblecbuckling.sqlite"),
)

# Directory to scan for SQLite files
DB_DIR: str = str(Path(DB_PATH).parent)


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def rows_to_dicts(rows):
    return [dict(r) for r in rows]


# ── Pydantic response models ────────────────────────────────────────────────

class NodeOut(BaseModel):
    nr: int
    x: float
    y: float
    z: float
    support: dict  # {ux:0/1, uy:0/1, ...}


class BeamOut(BaseModel):
    nr: int
    group: int
    node_start: int
    node_end: int
    section_start: int
    section_end: int
    length: float


class QuadOut(BaseModel):
    nr: int
    group: int
    nodes: list[int]
    thickness: list[float]
    material: int


class SpringOut(BaseModel):
    nr: int
    group: int
    node_start: int
    node_end: int
    direction: list[float]  # [dx, dy, dz]
    cp: float               # axial stiffness
    cq: float               # shear stiffness
    cm: float               # moment stiffness


class ConstraintOut(BaseModel):
    nr: int
    group: int
    node: int
    ref_node: int
    type: int


class ElementsOut(BaseModel):
    beams: list[BeamOut]
    quads: list[QuadOut]
    springs: list[SpringOut]
    constraints: list[ConstraintOut]


class GroupOut(BaseModel):
    nr: int
    name: str


class TendonSegmentOut(BaseModel):
    tendon_nr: int
    x0: float
    y0: float
    z0: float
    x1: float
    y1: float
    z1: float


class TendonOut(BaseModel):
    nr: int
    name: str
    diameter: float
    segments: list[TendonSegmentOut]


class LoadcaseOut(BaseModel):
    nr: int
    type: int
    name: str
    source: str


class NodeDisplacementOut(BaseModel):
    node_nr: int
    ux: float
    uy: float
    uz: float
    phix: float
    phiy: float
    phiz: float


class BeamForceOut(BaseModel):
    elem_nr: int
    x: float
    N: float
    Vy: float
    Vz: float
    Mt: float
    My: float
    Mz: float


class QuadForceOut(BaseModel):
    elem_nr: int
    node_nr: int
    mxx: float
    myy: float
    mxy: float
    vx: float
    vy: float
    nx: float
    ny: float
    nxy: float


class QuadStressOut(BaseModel):
    elem_nr: int
    thickness: float
    sxo: float
    syo: float
    sxyo: float
    sxu: float
    syu: float
    sxyu: float


class SectionOut(BaseModel):
    nr: int
    name: str
    width: float            # bounding box width (Y-direction) in meters
    height: float           # bounding box height (Z-direction) in meters
    polygon: list[list[float]]  # [[y0,z0], [y1,z1], ...] outline points


class ResultSummary(BaseModel):
    loadcase: int
    count: int
    data: list


# ── Helper: parse cross-section outline polygon ─────────────────────────────
def _parse_section_polygon(data: bytes) -> list[list[float]]:
    """Extract outline polygon from cross-section blob.

    The blob stores Y/Z coordinate pairs with the pattern:
      0x00 0x08 <double Y> 0x28 <double Z> 0x01
    The trailing 0x01 marks outline polygon points.  Points followed
    by 0x00 belong to reinforcement or other data and are skipped.
    """
    import struct
    pts: list[list[float]] = []
    i = 12  # skip header
    while i < len(data) - 19:
        if data[i] == 0x00 and data[i + 1] == 0x08:
            y = struct.unpack("<d", data[i + 2 : i + 10])[0]
            if data[i + 10] == 0x28:
                z = struct.unpack("<d", data[i + 11 : i + 19])[0]
                post = data[i + 19] if i + 19 < len(data) else 0
                if abs(y) < 50 and abs(z) < 50 and post == 0x01:
                    pts.append([round(y, 6), round(z, 6)])
                    i += 20
                    continue
        i += 1
    # SOFiSTiK may omit the closing vertex for simple polygons (e.g. 3-point
    # rectangles).  If the first and last points share exactly one coordinate,
    # add the missing corner so the polygon closes as a rectangle.
    if len(pts) >= 3:
        p0, pn = pts[0], pts[-1]
        if p0[0] == pn[0] and p0[1] != pn[1]:
            # same Y, different Z → close via (first_Y, last_Z) already there
            pass
        elif p0[1] == pn[1] and p0[0] != pn[0]:
            pass
        else:
            # Check if adding (first_Y, last_Z) completes a rectangle
            missing = [pts[0][0], pts[-1][1]]
            if missing != pts[0] and missing != pts[-1]:
                pts.append(missing)
    return pts


# ── Helper: available loadcases per result type ─────────────────────────────

RESULT_TABLES = {
    "node-displacements": "fe_result_node_displacement",
    "beam-forces": "fe_result_beam_internal_force",
    "quad-forces": "fe_result_quad_internal_force",
    "quad-stresses": "fe_result_quad_stress",
}


def table_exists(table: str) -> bool:
    with get_db() as db:
        r = db.execute(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?", (table,)
        ).fetchone()
        return r[0] > 0


def available_lcs(table: str) -> list[int]:
    if not table_exists(table):
        return []
    with get_db() as db:
        rows = db.execute(
            f"SELECT DISTINCT load_case_id FROM [{table}] ORDER BY load_case_id"
        ).fetchall()
        return [r[0] for r in rows]


# ── Routes ───────────────────────────────────────────────────────────────────

@app.get("/api/info")
def get_info():
    """Project metadata and database overview."""
    with get_db() as db:
        # system_info
        si = db.execute("SELECT * FROM system_info LIMIT 1").fetchone()
        system = dict(si) if si else {}
        # Remove raw blob from response
        system.pop("raw", None)

        # metadata
        meta = {}
        for r in db.execute("SELECT key, value FROM metadata"):
            meta[r["key"]] = r["value"]

        # counts
        counts = {}
        for table in ["fe_node", "fe_quad", "fe_line", "fe_bric", "fe_spring",
                       "load_case", "primary_group", "cross_section"]:
            counts[table] = db.execute(f"SELECT COUNT(*) FROM [{table}]").fetchone()[0]

        # result availability
        results = {}
        for name, table in RESULT_TABLES.items():
            lcs = available_lcs(table)
            results[name] = {"loadcases": lcs, "count": len(lcs)}

    return {
        "db_path": DB_PATH,
        "system": system,
        "metadata": meta,
        "counts": counts,
        "results": results,
    }


@app.get("/api/model/nodes", response_model=list[NodeOut])
def get_nodes():
    """All nodes with coordinates and support conditions."""
    with get_db() as db:
        rows = db.execute("""
            SELECT number, position_x, position_y, position_z,
                   support_ux, support_uy, support_uz,
                   support_phix, support_phiy, support_phiz
            FROM fe_node
            ORDER BY number
        """).fetchall()

    return [
        NodeOut(
            nr=r["number"],
            x=r["position_x"],
            y=r["position_y"],
            z=r["position_z"],
            support={
                "ux": r["support_ux"],
                "uy": r["support_uy"],
                "uz": r["support_uz"],
                "phix": r["support_phix"],
                "phiy": r["support_phiy"],
                "phiz": r["support_phiz"],
            },
        )
        for r in rows
    ]


@app.get("/api/model/elements", response_model=ElementsOut)
def get_elements():
    """All beam and quad elements."""
    with get_db() as db:
        beam_rows = db.execute("""
            SELECT number, primary_group,
                   node_numbers_0, node_numbers_1,
                   cross_section_at_start, cross_section_at_end,
                   length
            FROM fe_line
            ORDER BY number
        """).fetchall()

        quad_rows = db.execute("""
            SELECT number, primary_group,
                   node_numbers_0, node_numbers_1,
                   node_numbers_2, node_numbers_3,
                   thickness_0, thickness_1, thickness_2, thickness_3,
                   material_number
            FROM fe_quad
            ORDER BY number
        """).fetchall()

    beams = [
        BeamOut(
            nr=r["number"],
            group=r["primary_group"],
            node_start=r["node_numbers_0"],
            node_end=r["node_numbers_1"],
            section_start=r["cross_section_at_start"],
            section_end=r["cross_section_at_end"],
            length=r["length"],
        )
        for r in beam_rows
    ]

    quads = [
        QuadOut(
            nr=r["number"],
            group=r["primary_group"],
            nodes=[
                r["node_numbers_0"], r["node_numbers_1"],
                r["node_numbers_2"], r["node_numbers_3"],
            ],
            thickness=[
                r["thickness_0"], r["thickness_1"],
                r["thickness_2"], r["thickness_3"],
            ],
            material=r["material_number"],
        )
        for r in quad_rows
    ]

    with get_db() as db:
        spring_rows = db.execute("""
            SELECT number, primary_group,
                   node_numbers_0, node_numbers_1,
                   direction_x, direction_y, direction_z,
                   cp, cq, cm
            FROM fe_spring
            ORDER BY number
        """).fetchall()

        constraint_rows = db.execute("""
            SELECT number, primary_group,
                   node_number, ref_node_0, type
            FROM fe_kinematic_constraint
            ORDER BY number
        """).fetchall()

    springs = [
        SpringOut(
            nr=r["number"],
            group=r["primary_group"],
            node_start=r["node_numbers_0"],
            node_end=r["node_numbers_1"],
            direction=[
                r["direction_x"] or 0,
                r["direction_y"] or 0,
                r["direction_z"] or 0,
            ],
            cp=r["cp"] or 0,
            cq=r["cq"] or 0,
            cm=r["cm"] or 0,
        )
        for r in spring_rows
    ]

    constraints = [
        ConstraintOut(
            nr=r["number"],
            group=r["primary_group"],
            node=r["node_number"],
            ref_node=r["ref_node_0"],
            type=r["type"],
        )
        for r in constraint_rows
    ]

    return ElementsOut(beams=beams, quads=quads, springs=springs, constraints=constraints)


@app.get("/api/model/sections", response_model=list[SectionOut])
def get_sections():
    """Cross-section outline polygons and bounding-box dimensions."""
    with get_db() as db:
        rows = db.execute("SELECT number, name, data FROM cross_section ORDER BY number").fetchall()
    out = []
    for r in rows:
        poly = _parse_section_polygon(r["data"])
        ys = [p[0] for p in poly]
        zs = [p[1] for p in poly]
        w = (max(ys) - min(ys)) if ys else 0.0
        h = (max(zs) - min(zs)) if zs else 0.0
        out.append(SectionOut(nr=r["number"], name=r["name"] or "", width=w, height=h, polygon=poly))
    return out


@app.get("/api/model/groups", response_model=list[GroupOut])
def get_groups():
    """Primary element groups with names."""
    with get_db() as db:
        rows = db.execute(
            "SELECT number, description FROM primary_group ORDER BY number"
        ).fetchall()
    return [GroupOut(nr=r["number"], name=r["description"] or "") for r in rows]


@app.get("/api/model/tendons", response_model=list[TendonOut])
def get_tendons():
    """Tendon paths as WCS line segments (from quad-tendon intersections)."""
    with get_db() as db:
        # Tendon metadata (duct diameter, name)
        ducts = {}
        for r in db.execute("SELECT number, name, diameter FROM tnd_duct").fetchall():
            ducts[r["number"]] = {"name": r["name"] or "", "diameter": r["diameter"] or 0}

        tendons_meta = {}
        for r in db.execute(
            "SELECT number, duct_number, name FROM tnd_tendon ORDER BY number"
        ).fetchall():
            d = ducts.get(r["duct_number"], {})
            tendons_meta[r["number"]] = {
                "name": r["name"] or d.get("name", ""),
                "diameter": d.get("diameter", 0),
            }

        # Quad-tendon segments (WCS coordinates)
        qt_rows = db.execute("""
            SELECT tendon_number,
                   duct_intersection_start_point_wcs_x,
                   duct_intersection_start_point_wcs_y,
                   duct_intersection_start_point_wcs_z,
                   duct_intersection_end_point_wcs_x,
                   duct_intersection_end_point_wcs_y,
                   duct_intersection_end_point_wcs_z
            FROM tnd_quad_tendon
            ORDER BY tendon_number, quad_number
        """).fetchall()

        # Beam-tendon segments — convert local (beam_x, y, z) to WCS
        # We need beam node positions for interpolation
        node_pos = {}
        for r in db.execute("SELECT number, position_x, position_y, position_z FROM fe_node").fetchall():
            node_pos[r["number"]] = (r["position_x"], r["position_y"], r["position_z"])

        beam_info = {}
        for r in db.execute("SELECT number, node_numbers_0, node_numbers_1, length FROM fe_line").fetchall():
            beam_info[r["number"]] = {
                "n0": r["node_numbers_0"], "n1": r["node_numbers_1"],
                "length": r["length"],
            }

        bt_rows = db.execute("""
            SELECT beam_number, beam_x, tendon_number,
                   duct_intersection_y, duct_intersection_z
            FROM tnd_beam_tendon
            ORDER BY tendon_number, beam_number, beam_x
        """).fetchall()

    # Only use beam-tendon data (girlandenförmig).
    # Quad-tendon entries are just intersection metadata, not separate tendons.
    tendon_segs: dict[int, list] = {}

    # Convert beam-tendon to WCS segments
    # Group by (tendon_nr, beam_nr) and connect consecutive points
    from collections import defaultdict
    bt_points: dict[int, list] = defaultdict(list)
    for r in bt_rows:
        tnr = r["tendon_number"]
        bnr = r["beam_number"]
        bx = r["beam_x"] or 0
        bi = beam_info.get(bnr)
        if not bi:
            continue
        p0 = node_pos.get(bi["n0"])
        p1 = node_pos.get(bi["n1"])
        if not p0 or not p1:
            continue
        blen = bi["length"] or 1
        t = bx / blen  # parameter along beam

        # Beam axis direction
        dx, dy, dz = p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]
        # Point on beam axis
        wx = p0[0] + t * dx
        wy = p0[1] + t * dy
        wz = p0[2] + t * dz
        # Offset by local y, z (approximate: z is vertical offset)
        loc_y = r["duct_intersection_y"] or 0
        loc_z = r["duct_intersection_z"] or 0
        wz += loc_z  # vertical offset
        bt_points[tnr].append((wx, wy, wz))

    for tnr, pts in bt_points.items():
        # Sort points by primary axis (X) to get correct order along beam
        pts.sort(key=lambda p: (p[0], p[1]))
        # Remove near-duplicate consecutive points
        filtered = [pts[0]]
        for p in pts[1:]:
            prev = filtered[-1]
            if abs(p[0] - prev[0]) + abs(p[1] - prev[1]) + abs(p[2] - prev[2]) > 1e-4:
                filtered.append(p)
        for i in range(len(filtered) - 1):
            tendon_segs.setdefault(tnr, []).append(
                TendonSegmentOut(
                    tendon_nr=tnr,
                    x0=filtered[i][0], y0=filtered[i][1], z0=filtered[i][2],
                    x1=filtered[i + 1][0], y1=filtered[i + 1][1], z1=filtered[i + 1][2],
                )
            )

    out = []
    for tnr in sorted(tendon_segs.keys()):
        meta = tendons_meta.get(tnr, {"name": f"Tendon {tnr}", "diameter": 0})
        out.append(TendonOut(
            nr=tnr, name=meta["name"], diameter=meta["diameter"],
            segments=tendon_segs[tnr],
        ))
    return out


class ConstructionStageOut(BaseModel):
    stage_nr: int
    name: str
    new_groups: list[int]
    active_groups: list[int]


@app.get("/api/model/construction-stages", response_model=list[ConstructionStageOut])
def get_construction_stages():
    """Construction stages with cumulative active groups (from CSM .dat)."""
    import json
    if not table_exists("construction_stage"):
        return []
    with get_db() as db:
        rows = db.execute(
            "SELECT stage_nr, name, new_groups, active_groups FROM construction_stage ORDER BY stage_nr"
        ).fetchall()
    return [
        ConstructionStageOut(
            stage_nr=r["stage_nr"],
            name=r["name"] or "",
            new_groups=json.loads(r["new_groups"]),
            active_groups=json.loads(r["active_groups"]),
        )
        for r in rows
    ]


@app.get("/api/model/loadcases", response_model=list[LoadcaseOut])
def get_loadcases():
    """All defined load cases with result availability."""
    with get_db() as db:
        rows = db.execute("""
            SELECT number, type, name, generating_source
            FROM load_case
            ORDER BY number
        """).fetchall()

    return [
        LoadcaseOut(
            nr=r["number"],
            type=r["type"],
            name=r["name"] or "",
            source=r["generating_source"] or "",
        )
        for r in rows
    ]


@app.get("/api/results/node-displacements", response_model=ResultSummary)
def get_node_displacements(lc: int = Query(..., description="Load case number")):
    """Node displacements for a given load case."""
    with get_db() as db:
        rows = db.execute("""
            SELECT element_id, uX, uY, uZ, phiX, phiY, phiZ
            FROM fe_result_node_displacement
            WHERE load_case_id = ?
            ORDER BY element_id
        """, (lc,)).fetchall()

    if not rows:
        avail = available_lcs("fe_result_node_displacement")
        raise HTTPException(
            status_code=404,
            detail=f"No displacements for LC {lc}. Available: {avail}",
        )

    data = [
        NodeDisplacementOut(
            node_nr=r["element_id"],
            ux=r["uX"], uy=r["uY"], uz=r["uZ"],
            phix=r["phiX"], phiy=r["phiY"], phiz=r["phiZ"],
        )
        for r in rows
    ]

    return ResultSummary(loadcase=lc, count=len(data), data=data)


@app.get("/api/results/beam-forces", response_model=ResultSummary)
def get_beam_forces(lc: int = Query(..., description="Load case number")):
    """Beam internal forces for a given load case."""
    with get_db() as db:
        rows = db.execute("""
            SELECT element_id, x, N, Vy, Vz, Mt, My, Mz
            FROM fe_result_beam_internal_force
            WHERE load_case_id = ?
            ORDER BY element_id, x
        """, (lc,)).fetchall()

    if not rows:
        avail = available_lcs("fe_result_beam_internal_force")
        raise HTTPException(
            status_code=404,
            detail=f"No beam forces for LC {lc}. Available: {avail}",
        )

    data = [
        BeamForceOut(
            elem_nr=r["element_id"],
            x=r["x"],
            N=r["N"], Vy=r["Vy"], Vz=r["Vz"],
            Mt=r["Mt"], My=r["My"], Mz=r["Mz"],
        )
        for r in rows
    ]

    return ResultSummary(loadcase=lc, count=len(data), data=data)


@app.get("/api/results/quad-forces", response_model=ResultSummary)
def get_quad_forces(lc: int = Query(..., description="Load case number")):
    """Quad element internal forces (per node) for a given load case."""
    with get_db() as db:
        rows = db.execute("""
            SELECT element_id, node_no, mxx, myy, mxy, vx, vy, nx, ny, nxy
            FROM fe_result_quad_internal_force
            WHERE load_case_id = ?
            ORDER BY element_id, node_no
        """, (lc,)).fetchall()

    if not rows:
        avail = available_lcs("fe_result_quad_internal_force")
        raise HTTPException(
            status_code=404,
            detail=f"No quad forces for LC {lc}. Available: {avail}",
        )

    data = [
        QuadForceOut(
            elem_nr=r["element_id"],
            node_nr=r["node_no"],
            mxx=r["mxx"], myy=r["myy"], mxy=r["mxy"],
            vx=r["vx"], vy=r["vy"],
            nx=r["nx"], ny=r["ny"], nxy=r["nxy"],
        )
        for r in rows
    ]

    return ResultSummary(loadcase=lc, count=len(data), data=data)


@app.get("/api/results/quad-stresses")
def get_quad_stresses(
    lc: int = Query(..., description="Load case number"),
    elem: Optional[int] = Query(None, description="Element number (optional)"),
):
    """Quad element stresses (upper/lower surface) for a given load case."""
    if not table_exists("fe_result_quad_stress"):
        raise HTTPException(status_code=404, detail="No stress data available. Re-run cdb_to_sqlite.py.")

    with get_db() as db:
        if elem is not None:
            rows = db.execute("""
                SELECT s.element_id, s.sxo, s.syo, s.sxyo, s.sxu, s.syu, s.sxyu,
                       q.thickness_0
                FROM fe_result_quad_stress s
                JOIN fe_quad q ON q.number = s.element_id
                WHERE s.load_case_id = ? AND s.element_id = ?
            """, (lc, elem)).fetchall()
        else:
            rows = db.execute("""
                SELECT s.element_id, s.sxo, s.syo, s.sxyo, s.sxu, s.syu, s.sxyu,
                       q.thickness_0
                FROM fe_result_quad_stress s
                JOIN fe_quad q ON q.number = s.element_id
                WHERE s.load_case_id = ?
                ORDER BY s.element_id
            """, (lc,)).fetchall()

    if not rows:
        avail = available_lcs("fe_result_quad_stress")
        raise HTTPException(
            status_code=404,
            detail=f"No quad stresses for LC {lc}. Available: {avail}",
        )

    data = [
        QuadStressOut(
            elem_nr=r["element_id"],
            thickness=r["thickness_0"],
            sxo=r["sxo"], syo=r["syo"], sxyo=r["sxyo"],
            sxu=r["sxu"], syu=r["syu"], sxyu=r["sxyu"],
        )
        for r in rows
    ]

    return ResultSummary(loadcase=lc, count=len(data), data=data)


# ── Database switching ─────────────────────────────────────────────────────

@app.get("/api/databases")
def list_databases():
    """List available SQLite files in the examples directory."""
    files = sorted(Path(DB_DIR).glob("*.sqlite"))
    current = Path(DB_PATH).name
    return {
        "current": current,
        "files": [
            {"name": f.name, "size_kb": round(f.stat().st_size / 1024)}
            for f in files
        ],
    }


@app.post("/api/databases/switch")
def switch_database(name: str = Query(..., description="SQLite filename")):
    """Switch to a different SQLite database."""
    global DB_PATH
    new_path = Path(DB_DIR) / name
    if not new_path.exists() or not name.endswith(".sqlite"):
        raise HTTPException(status_code=404, detail=f"File not found: {name}")
    DB_PATH = str(new_path.resolve())
    return {"ok": True, "db_path": DB_PATH}


# ── Editor endpoints ──────────────────────────────────────────────────────

import json

EDITOR_MODELS_DIR = str(Path(__file__).resolve().parent.parent / "examples" / "editor_models")
os.makedirs(EDITOR_MODELS_DIR, exist_ok=True)


@app.post("/api/editor/save")
def editor_save(payload: dict):
    """Save editor model JSON."""
    name = payload.get("name", "untitled")
    model = payload.get("model", payload)
    safe_name = "".join(c for c in name if c.isalnum() or c in "-_ ").strip()
    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid model name")
    path = Path(EDITOR_MODELS_DIR) / f"{safe_name}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(model, f, indent=2, ensure_ascii=False)
    return {"ok": True, "path": str(path)}


@app.get("/api/editor/load")
def editor_load(name: str = Query(...)):
    """Load editor model JSON."""
    path = Path(EDITOR_MODELS_DIR) / f"{name}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Model not found: {name}")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


@app.get("/api/editor/list")
def editor_list():
    """List saved editor models."""
    files = sorted(Path(EDITOR_MODELS_DIR).glob("*.json"))
    return [f.stem for f in files]


@app.delete("/api/editor/model")
def editor_delete(name: str = Query(...)):
    """Delete saved editor model."""
    path = Path(EDITOR_MODELS_DIR) / f"{name}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Model not found: {name}")
    os.remove(path)
    return {"ok": True}


@app.post("/api/editor/generate-dat")
def editor_generate_dat(model: dict):
    """Generate .dat text from editor model JSON."""
    from tools.run_sofistik import generate_dat
    dat_text = generate_dat(model)
    from fastapi.responses import PlainTextResponse
    return PlainTextResponse(content=dat_text)


@app.post("/api/editor/calculate")
def editor_calculate(model: dict):
    """Full pipeline: JSON → .dat → SPS → CDB → SQLite."""
    global DB_PATH
    from tools.run_sofistik import run_calculation

    name = model.get("meta", {}).get("name", "editor_model")
    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in name).strip("_") or "editor_model"
    output_dir = str(Path(__file__).resolve().parent.parent / "examples")

    result = run_calculation(model, safe_name, output_dir)

    if result["success"]:
        # Auto-switch to the new database
        new_path = Path(output_dir) / result["sqlite"]
        if new_path.exists():
            DB_PATH = str(new_path.resolve())

    return result


# ── CLI entry point ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    if len(sys.argv) > 1:
        resolved = str(Path(sys.argv[1]).resolve())
        os.environ["SOFISTIK_SQLITE"] = resolved
        DB_PATH = resolved

    print(f"Database: {DB_PATH}")
    print(f"Size:     {os.path.getsize(DB_PATH) / 1024:.0f} KB")
    print()
    uvicorn.run("server.app:app", host="127.0.0.1", port=8000)
