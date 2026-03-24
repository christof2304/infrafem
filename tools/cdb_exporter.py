"""
CDB → SQLite Exporter für infraFEM Web-Postprozessor

Liest SOFiSTiK CDB via sof_cdb_w-2026.dll und exportiert in eigenes SQLite-Schema.
Alternativ kann auch eine vorhandene SOFiSTiK .sqlite Datei als Quelle dienen.

Usage:
    python cdb_exporter.py <input.cdb|input.sqlite> <output.sqlite>
"""

import os
import sys
import sqlite3
import time
from ctypes import *
from pathlib import Path

# ─── Configuration ──────────────────────────────────────────────────────────

SOFISTIK_DIR = r"C:\Program Files\SOFiSTiK\2026\SOFiSTiK 2026"
DLL_DIR = os.path.join(SOFISTIK_DIR, "interfaces", "64bit")
DATEN_DIR = os.path.join(SOFISTIK_DIR, "interfaces", "examples", "python")

# ─── SQLite Schema ──────────────────────────────────────────────────────────

SCHEMA = """
-- Project metadata
CREATE TABLE IF NOT EXISTS project_info (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- Materials
CREATE TABLE IF NOT EXISTS materials (
    nr INTEGER PRIMARY KEY,
    type TEXT,
    e_modul REAL,
    nu REAL,
    gamma REAL,
    fc REAL,
    fy REAL,
    name TEXT
);

-- Cross sections
CREATE TABLE IF NOT EXISTS sections (
    nr INTEGER PRIMARY KEY,
    name TEXT,
    area REAL,
    iy REAL,
    iz REAL,
    it REAL,
    material_nr INTEGER
);

-- Nodes
CREATE TABLE IF NOT EXISTS nodes (
    nr INTEGER PRIMARY KEY,
    x REAL NOT NULL,
    y REAL NOT NULL,
    z REAL NOT NULL,
    kfix INTEGER DEFAULT 0,
    support_px REAL DEFAULT 0,
    support_py REAL DEFAULT 0,
    support_pz REAL DEFAULT 0
);

-- Groups
CREATE TABLE IF NOT EXISTS groups (
    nr INTEGER PRIMARY KEY,
    type INTEGER,
    num_elements INTEGER,
    material_nr INTEGER,
    description TEXT
);

-- Beam elements
CREATE TABLE IF NOT EXISTS beams (
    nr INTEGER PRIMARY KEY,
    node_start INTEGER,
    node_end INTEGER,
    section_nr INTEGER,
    group_nr INTEGER,
    length REAL
);

-- QUAD elements
CREATE TABLE IF NOT EXISTS quads (
    nr INTEGER PRIMARY KEY,
    n1 INTEGER,
    n2 INTEGER,
    n3 INTEGER,
    n4 INTEGER,
    thickness REAL,
    group_nr INTEGER
);

-- BRIC elements
CREATE TABLE IF NOT EXISTS brics (
    nr INTEGER PRIMARY KEY,
    n1 INTEGER, n2 INTEGER, n3 INTEGER, n4 INTEGER,
    n5 INTEGER, n6 INTEGER, n7 INTEGER, n8 INTEGER,
    group_nr INTEGER
);

-- Load cases
CREATE TABLE IF NOT EXISTS loadcases (
    nr INTEGER PRIMARY KEY,
    type INTEGER,
    name TEXT,
    source TEXT
);

-- Node displacements
CREATE TABLE IF NOT EXISTS node_displacements (
    loadcase INTEGER,
    node_nr INTEGER,
    ux REAL, uy REAL, uz REAL,
    rx REAL, ry REAL, rz REAL,
    px REAL, py REAL, pz REAL,
    mx REAL, my REAL, mz REAL,
    PRIMARY KEY (loadcase, node_nr)
);

-- Beam forces
CREATE TABLE IF NOT EXISTS beam_forces (
    loadcase INTEGER,
    elem_nr INTEGER,
    x_pos REAL,
    N REAL, Vy REAL, Vz REAL,
    Mt REAL, My REAL, Mz REAL,
    PRIMARY KEY (loadcase, elem_nr, x_pos)
);

-- QUAD forces (element-centered)
CREATE TABLE IF NOT EXISTS quad_forces (
    loadcase INTEGER,
    elem_nr INTEGER,
    mxx REAL, myy REAL, mxy REAL,
    vx REAL, vy REAL,
    nxx REAL, nyy REAL, nxy REAL,
    PRIMARY KEY (loadcase, elem_nr)
);

-- QUAD nodal forces
CREATE TABLE IF NOT EXISTS quad_node_forces (
    loadcase INTEGER,
    node_nr INTEGER,
    mxx REAL, myy REAL, mxy REAL,
    vx REAL, vy REAL,
    nxx REAL, nyy REAL, nxy REAL,
    PRIMARY KEY (loadcase, node_nr)
);

-- Beam reinforcement
CREATE TABLE IF NOT EXISTS beam_reinforcement (
    design_case INTEGER,
    elem_nr INTEGER,
    x_pos REAL,
    as_long REAL,
    as_stir REAL,
    PRIMARY KEY (design_case, elem_nr, x_pos)
);

-- QUAD reinforcement
CREATE TABLE IF NOT EXISTS quad_reinforcement (
    design_case INTEGER,
    elem_nr INTEGER,
    as_top_1 REAL, as_bot_1 REAL,
    as_top_2 REAL, as_bot_2 REAL,
    as_shear REAL,
    PRIMARY KEY (design_case, elem_nr)
);

-- Beam stresses
CREATE TABLE IF NOT EXISTS beam_stresses (
    loadcase INTEGER,
    elem_nr INTEGER,
    x_pos REAL,
    sig_max REAL,
    sig_min REAL,
    tau_max REAL,
    PRIMARY KEY (loadcase, elem_nr, x_pos)
);

-- QUAD stresses
CREATE TABLE IF NOT EXISTS quad_stresses (
    loadcase INTEGER,
    elem_nr INTEGER,
    layer TEXT,
    sig_x REAL, sig_y REAL, tau_xy REAL,
    sig_1 REAL, sig_2 REAL, angle REAL,
    PRIMARY KEY (loadcase, elem_nr, layer)
);

-- Performance indices
CREATE INDEX IF NOT EXISTS idx_node_disp_lc ON node_displacements(loadcase);
CREATE INDEX IF NOT EXISTS idx_beam_forces_lc ON beam_forces(loadcase);
CREATE INDEX IF NOT EXISTS idx_quad_forces_lc ON quad_forces(loadcase);
CREATE INDEX IF NOT EXISTS idx_quad_nf_lc ON quad_node_forces(loadcase);
"""


# ─── CDB Reader (via DLL) ──────────────────────────────────────────────────

class CdbReader:
    """Reads SOFiSTiK CDB via sof_cdb_w-2026.dll"""

    def __init__(self, cdb_path: str):
        # Import sofistik_daten
        sys.path.insert(0, DATEN_DIR)
        import sofistik_daten as sd
        self.sd = sd

        # Load DLL
        os.add_dll_directory(DLL_DIR)
        os.add_dll_directory(SOFISTIK_DIR)
        self.dll = cdll.LoadLibrary("sof_cdb_w-2026.dll")
        self.dll.sof_cdb_msglevel(10)  # CD_WANT_RETURN

        # Open CDB
        self.idx = c_int()
        self.idx.value = self.dll.sof_cdb_init(
            os.path.abspath(cdb_path).encode("utf-8"), 95
        )
        if self.idx.value <= 0:
            raise RuntimeError(f"Cannot open CDB: error code {self.idx.value}")
        print(f"  CDB geöffnet: Index={self.idx.value}, "
              f"Status={bin(self.dll.sof_cdb_status(self.idx.value))}")

    def close(self):
        self.dll.sof_cdb_close(0)

    def read_all(self, kwh: int, kwl: int, struct_type):
        """Read all records for a KWH/KWL pair."""
        records = []
        ie = c_int(0)
        rec = struct_type()
        rl = c_int(sizeof(rec))
        while ie.value < 2:
            ie.value = self.dll.sof_cdb_get(
                self.idx, kwh, kwl, byref(rec), byref(rl), 1
            )
            if ie.value < 2:
                records.append(rec)
                rec = struct_type()
            rl = c_int(sizeof(rec))
        return records

    def list_kwl(self, kwh: int):
        """List all KWL values for a given KWH."""
        kwh_c = c_int(kwh)
        kwl_c = c_int(0)
        self.dll.sof_cdb_kenq_ex(self.idx, byref(kwh_c), byref(kwl_c), c_int(-2))
        min_kwl = kwl_c.value

        kwh_c = c_int(kwh)
        kwl_c = c_int(0)
        self.dll.sof_cdb_kenq_ex(self.idx, byref(kwh_c), byref(kwl_c), c_int(+2))
        max_kwl = kwl_c.value

        if min_kwl == 0 and max_kwl == 0:
            if self.dll.sof_cdb_kexist(kwh, 0) > 0:
                return [0]
            return []

        kwls = []
        kwh_c = c_int(kwh)
        kwl_c = c_int(min_kwl - 1)
        safety = 0
        while kwl_c.value < max_kwl and safety < 50000:
            self.dll.sof_cdb_kenq_ex(self.idx, byref(kwh_c), byref(kwl_c), c_int(+1))
            if self.dll.sof_cdb_kexist(kwh, kwl_c.value) > 0:
                kwls.append(kwl_c.value)
            safety += 1
            if kwl_c.value >= max_kwl:
                break
        return kwls

    def key_exists(self, kwh: int, kwl: int) -> bool:
        return self.dll.sof_cdb_kexist_ex(self.idx.value, kwh, kwl) > 0


# ─── CDB Exporter ──────────────────────────────────────────────────────────

class CdbExporter:
    """Exports SOFiSTiK CDB data to our SQLite schema."""

    def __init__(self, cdb_path: str):
        self.cdb_path = cdb_path
        self.reader = CdbReader(cdb_path)
        self.sd = self.reader.sd
        self.stats = {}

    def export(self, sqlite_path: str):
        """Full export: geometry + all available results."""
        if os.path.exists(sqlite_path):
            os.remove(sqlite_path)

        self.conn = sqlite3.connect(sqlite_path)
        self.cur = self.conn.cursor()
        self.cur.executescript(SCHEMA)

        t0 = time.time()
        print("\nExporting...")

        self._export_project_info()
        self._export_nodes()
        self._export_groups()
        self._export_loadcases()
        self._export_beams()
        self._export_quads()
        self._export_brics()
        self._export_node_displacements()
        self._export_beam_forces()
        self._export_quad_forces()
        self._export_quad_node_forces()

        self.conn.commit()
        self.conn.close()
        self.reader.close()

        dt = time.time() - t0
        print(f"\nExport fertig in {dt:.1f}s -> {sqlite_path}")
        print(f"  Datei: {os.path.getsize(sqlite_path) / 1024:.0f} KB")
        self._print_stats()

    def _stat(self, table: str, count: int):
        self.stats[table] = count

    def _export_project_info(self):
        self.cur.execute(
            "INSERT INTO project_info VALUES (?,?)",
            ("source_cdb", os.path.abspath(self.cdb_path)),
        )
        self.cur.execute(
            "INSERT INTO project_info VALUES (?,?)",
            ("export_time", time.strftime("%Y-%m-%d %H:%M:%S")),
        )

        # System info (KWH 10/0)
        syst = self.reader.read_all(10, 0, self.sd.CSYST)
        if syst:
            s = syst[0]
            self.cur.execute(
                "INSERT INTO project_info VALUES (?,?)",
                ("system_type", str(s.m_iprob)),
            )
            self.cur.execute(
                "INSERT INTO project_info VALUES (?,?)",
                ("gravity_axis", str(s.m_iachs)),
            )
            self.cur.execute(
                "INSERT INTO project_info VALUES (?,?)",
                ("num_nodes", str(s.m_nknot)),
            )
        self._stat("project_info", 2 + (3 if syst else 0))
        print(f"  project_info: OK")

    def _export_nodes(self):
        nodes = self.reader.read_all(20, 0, self.sd.CNODE)
        count = 0
        for n in nodes:
            self.cur.execute(
                "INSERT OR REPLACE INTO nodes VALUES (?,?,?,?,?,?,?,?)",
                (n.m_nr, n.m_xyz[0], n.m_xyz[1], n.m_xyz[2],
                 n.m_kfix, 0, 0, 0),
            )
            count += 1
        self._stat("nodes", count)
        print(f"  nodes: {count}")

    def _export_groups(self):
        groups = self.reader.read_all(11, 0, self.sd.CGRP)
        count = 0
        for g in groups:
            self.cur.execute(
                "INSERT OR REPLACE INTO groups VALUES (?,?,?,?,?)",
                (g.m_ng, g.m_typ, g.m_num, g.m_mnr, ""),
            )
            count += 1
        self._stat("groups", count)
        print(f"  groups: {count}")

    def _export_loadcases(self):
        lc_kwls = self.reader.list_kwl(12)
        count = 0
        for lc in lc_kwls:
            recs = self.reader.read_all(12, lc, self.sd.CLC_CTRL)
            name = ""
            if recs:
                # Decode title from packed text
                chars = []
                for i in range(17):
                    val = recs[0].m_rtex[i]
                    if val == 0:
                        continue
                    c1 = val & 0xFFFF
                    c2 = (val >> 16) & 0xFFFF
                    if 0 < c1 < 65536:
                        chars.append(chr(c1))
                    if 0 < c2 < 65536:
                        chars.append(chr(c2))
                name = "".join(chars).strip("\x00").strip()
            self.cur.execute(
                "INSERT OR REPLACE INTO loadcases VALUES (?,?,?,?)",
                (lc, 0, name, ""),
            )
            count += 1
        self._stat("loadcases", count)
        print(f"  loadcases: {count}")

    def _export_beams(self):
        beams = self.reader.read_all(100, 0, self.sd.CBEAM)
        count = 0
        for b in beams:
            self.cur.execute(
                "INSERT OR REPLACE INTO beams VALUES (?,?,?,?,?,?)",
                (b.m_nr, b.m_node[0], b.m_node[1], b.m_np, 0, b.m_dl),
            )
            count += 1
        self._stat("beams", count)
        print(f"  beams: {count}")

    def _export_quads(self):
        quads = self.reader.read_all(200, 0, self.sd.CQUAD)
        count = 0
        for q in quads:
            self.cur.execute(
                "INSERT OR REPLACE INTO quads VALUES (?,?,?,?,?,?,?)",
                (q.m_nr, q.m_node[0], q.m_node[1], q.m_node[2], q.m_node[3],
                 q.m_thick[0], 0),
            )
            count += 1
        self._stat("quads", count)
        print(f"  quads: {count}")

    def _export_brics(self):
        brics = self.reader.read_all(300, 0, self.sd.CBRIC)
        count = 0
        for b in brics:
            self.cur.execute(
                "INSERT OR REPLACE INTO brics VALUES (?,?,?,?,?,?,?,?,?,?)",
                (b.m_nr,
                 b.m_node[0], b.m_node[1], b.m_node[2], b.m_node[3],
                 b.m_node[4], b.m_node[5], b.m_node[6], b.m_node[7], 0),
            )
            count += 1
        self._stat("brics", count)
        print(f"  brics: {count}")

    def _export_node_displacements(self):
        disp_lcs = self.reader.list_kwl(24)
        count = 0
        for lc in disp_lcs:
            recs = self.reader.read_all(24, lc, self.sd.CN_DISP)
            for d in recs:
                if d.m_nr == 0:
                    continue  # Skip max-record (KWL:0)
                self.cur.execute(
                    "INSERT OR REPLACE INTO node_displacements VALUES "
                    "(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (lc, d.m_nr,
                     d.m_ux, d.m_uy, d.m_uz,
                     d.m_urx, d.m_ury, d.m_urz,
                     d.m_px, d.m_py, d.m_pz,
                     d.m_mx, d.m_my, d.m_mz),
                )
                count += 1
        self._stat("node_displacements", count)
        print(f"  node_displacements: {count}")

    def _export_beam_forces(self):
        force_lcs = self.reader.list_kwl(102)
        count = 0
        for lc in force_lcs:
            recs = self.reader.read_all(102, lc, self.sd.CBEAM_FOR)
            for f in recs:
                if f.m_nr == 0:
                    continue  # Skip max-record
                self.cur.execute(
                    "INSERT OR REPLACE INTO beam_forces VALUES "
                    "(?,?,?,?,?,?,?,?,?)",
                    (lc, f.m_nr, f.m_x,
                     f.m_n, f.m_vy, f.m_vz,
                     f.m_mt, f.m_my, f.m_mz),
                )
                count += 1
        self._stat("beam_forces", count)
        print(f"  beam_forces: {count}")

    def _export_quad_forces(self):
        force_lcs = self.reader.list_kwl(210)
        count = 0
        for lc in force_lcs:
            recs = self.reader.read_all(210, lc, self.sd.CQUAD_FOR)
            for f in recs:
                if f.m_nr == 0:
                    continue
                self.cur.execute(
                    "INSERT OR REPLACE INTO quad_forces VALUES "
                    "(?,?,?,?,?,?,?,?,?,?)",
                    (lc, f.m_nr,
                     f.m_mxx, f.m_myy, f.m_mxy,
                     f.m_vx, f.m_vy,
                     f.m_nx, f.m_ny, f.m_nxy),
                )
                count += 1
        self._stat("quad_forces", count)
        print(f"  quad_forces: {count}")

    def _export_quad_node_forces(self):
        nf_lcs = self.reader.list_kwl(211)
        count = 0
        for lc in nf_lcs:
            recs = self.reader.read_all(211, lc, self.sd.CQUAD_NFO)
            for f in recs:
                if f.m_nr == 0:
                    continue
                self.cur.execute(
                    "INSERT OR REPLACE INTO quad_node_forces VALUES "
                    "(?,?,?,?,?,?,?,?,?,?)",
                    (lc, f.m_nr,
                     f.m_mxx, f.m_myy, f.m_mxy,
                     f.m_vx, f.m_vy,
                     f.m_nx, f.m_ny, f.m_nxy),
                )
                count += 1
        self._stat("quad_node_forces", count)
        print(f"  quad_node_forces: {count}")

    def _print_stats(self):
        print("\n--- Export-Statistik ---")
        total = 0
        for table, count in sorted(self.stats.items()):
            print(f"  {table:30s}: {count:>8d} Zeilen")
            total += count
        print(f"  {'GESAMT':30s}: {total:>8d} Zeilen")


# ─── SQLite-to-SQLite Converter ─────────────────────────────────────────────

class SqliteConverter:
    """Converts SOFiSTiK sync_cdb_to_db SQLite to our schema."""

    def __init__(self, src_path: str):
        self.src = sqlite3.connect(src_path)
        self.stats = {}

    def export(self, dst_path: str):
        if os.path.exists(dst_path):
            os.remove(dst_path)

        self.dst = sqlite3.connect(dst_path)
        self.cur = self.dst.cursor()
        self.cur.executescript(SCHEMA)

        t0 = time.time()
        print("\nConverting SOFiSTiK SQLite -> infraFEM SQLite...")

        self._convert_project_info()
        self._convert_nodes()
        self._convert_groups()
        self._convert_loadcases()
        self._convert_beams()
        self._convert_quads()
        self._convert_node_displacements()
        self._convert_beam_forces()
        self._convert_quad_forces()

        self.dst.commit()
        self.dst.close()
        self.src.close()

        dt = time.time() - t0
        print(f"\nConversion fertig in {dt:.1f}s -> {dst_path}")
        print(f"  Datei: {os.path.getsize(dst_path) / 1024:.0f} KB")
        self._print_stats()

    def _stat(self, table: str, count: int):
        self.stats[table] = count

    def _src_query(self, sql):
        return self.src.execute(sql).fetchall()

    def _convert_project_info(self):
        self.cur.execute("INSERT INTO project_info VALUES (?,?)",
                         ("export_time", time.strftime("%Y-%m-%d %H:%M:%S")))
        rows = self._src_query("SELECT name, system_type, gravity_orientation FROM system_info")
        if rows:
            r = rows[0]
            self.cur.execute("INSERT INTO project_info VALUES (?,?)",
                             ("system_name", str(r[0])))
            self.cur.execute("INSERT INTO project_info VALUES (?,?)",
                             ("system_type", str(r[1])))
        self._stat("project_info", 3)
        print(f"  project_info: OK")

    def _convert_nodes(self):
        rows = self._src_query(
            "SELECT number, position_x, position_y, position_z, "
            "support_ux, support_uy, support_uz FROM fe_node"
        )
        for r in rows:
            kfix = 0
            if r[4]: kfix |= 1
            if r[5]: kfix |= 2
            if r[6]: kfix |= 4
            self.cur.execute(
                "INSERT OR REPLACE INTO nodes VALUES (?,?,?,?,?,?,?,?)",
                (r[0], r[1], r[2], r[3], kfix, 0, 0, 0),
            )
        self._stat("nodes", len(rows))
        print(f"  nodes: {len(rows)}")

    def _convert_groups(self):
        rows = self._src_query(
            "SELECT number, description, construction_stage_birth, "
            "construction_stage_death FROM primary_group"
        )
        for r in rows:
            self.cur.execute(
                "INSERT OR REPLACE INTO groups VALUES (?,?,?,?,?)",
                (r[0], 0, 0, 0, r[1] or ""),
            )
        self._stat("groups", len(rows))
        print(f"  groups: {len(rows)}")

    def _convert_loadcases(self):
        rows = self._src_query(
            "SELECT number, type, name, generating_source FROM load_case"
        )
        for r in rows:
            self.cur.execute(
                "INSERT OR REPLACE INTO loadcases VALUES (?,?,?,?)",
                (r[0], r[1], r[2] or "", r[3] or ""),
            )
        self._stat("loadcases", len(rows))
        print(f"  loadcases: {len(rows)}")

    def _convert_beams(self):
        rows = self._src_query(
            "SELECT number, primary_group, node_numbers_0, node_numbers_1 FROM fe_line"
        )
        for r in rows:
            self.cur.execute(
                "INSERT OR REPLACE INTO beams VALUES (?,?,?,?,?,?)",
                (r[0], r[2], r[3], 0, r[1], 0),
            )
        self._stat("beams", len(rows))
        print(f"  beams: {len(rows)}")

    def _convert_quads(self):
        rows = self._src_query(
            "SELECT number, primary_group, node_numbers_0, node_numbers_1, "
            "node_numbers_2, node_numbers_3, thickness_0 FROM fe_quad"
        )
        for r in rows:
            self.cur.execute(
                "INSERT OR REPLACE INTO quads VALUES (?,?,?,?,?,?,?)",
                (r[0], r[2], r[3], r[4], r[5], r[6], r[1]),
            )
        self._stat("quads", len(rows))
        print(f"  quads: {len(rows)}")

    def _convert_node_displacements(self):
        rows = self._src_query(
            "SELECT load_case_id, element_id, uX, uY, uZ, phiX, phiY, phiZ "
            "FROM fe_result_node_displacement"
        )
        for r in rows:
            self.cur.execute(
                "INSERT OR REPLACE INTO node_displacements VALUES "
                "(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7],
                 0, 0, 0, 0, 0, 0),
            )
        self._stat("node_displacements", len(rows))
        print(f"  node_displacements: {len(rows)}")

    def _convert_beam_forces(self):
        rows = self._src_query(
            "SELECT load_case_id, element_id, x, N, Vy, Vz, Mt, My, Mz "
            "FROM fe_result_beam_internal_force"
        )
        for r in rows:
            self.cur.execute(
                "INSERT OR REPLACE INTO beam_forces VALUES "
                "(?,?,?,?,?,?,?,?,?)",
                r,
            )
        self._stat("beam_forces", len(rows))
        print(f"  beam_forces: {len(rows)}")

    def _convert_quad_forces(self):
        # SOFiSTiK stores node-based quad results
        rows = self._src_query(
            "SELECT load_case_id, element_id, node_no, mxx, myy, mxy, vx, vy, "
            "nx, ny, nxy FROM fe_result_quad_internal_force"
        )
        # Group by element and average for element-centered
        from collections import defaultdict
        elem_data = defaultdict(list)
        for r in rows:
            elem_data[(r[0], r[1])].append(r[2:])

        count = 0
        for (lc, elem), vals in elem_data.items():
            n = len(vals)
            if n == 0:
                continue
            avg = [sum(v[i] for v in vals) / n for i in range(1, 9)]
            self.cur.execute(
                "INSERT OR REPLACE INTO quad_forces VALUES "
                "(?,?,?,?,?,?,?,?,?,?)",
                (lc, elem, *avg),
            )
            count += 1
        self._stat("quad_forces", count)
        print(f"  quad_forces: {count}")

    def _print_stats(self):
        print("\n--- Export-Statistik ---")
        total = 0
        for table, count in sorted(self.stats.items()):
            print(f"  {table:30s}: {count:>8d} Zeilen")
            total += count
        print(f"  {'GESAMT':30s}: {total:>8d} Zeilen")


# ─── Main ───────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 3:
        print("Usage: python cdb_exporter.py <input.cdb|input.sqlite> <output.sqlite>")
        print()
        print("Input kann sein:")
        print("  .cdb    → Liest direkt via SOFiSTiK DLL")
        print("  .sqlite → Konvertiert von SOFiSTiK sync_cdb_to_db Format")
        sys.exit(1)

    src = sys.argv[1]
    dst = sys.argv[2]

    if not os.path.exists(src):
        print(f"FEHLER: {src} nicht gefunden")
        sys.exit(1)

    ext = Path(src).suffix.lower()
    print(f"=== CDB Exporter ===")
    print(f"  Input:  {src} ({os.path.getsize(src) / 1024:.0f} KB)")
    print(f"  Output: {dst}")

    if ext == ".cdb":
        exporter = CdbExporter(src)
        exporter.export(dst)
    elif ext == ".sqlite":
        converter = SqliteConverter(src)
        converter.export(dst)
    else:
        print(f"FEHLER: Unbekanntes Format {ext}")
        sys.exit(1)


if __name__ == "__main__":
    main()
