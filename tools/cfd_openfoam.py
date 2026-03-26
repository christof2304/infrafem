"""
OpenFOAM case generator for 2D bridge cross-section aerodynamics.

Converts a Gmsh mesh + wind parameters into a complete OpenFOAM case directory:
  - 0/: Initial + boundary conditions (U, p, k, epsilon, nut)
  - constant/: transportProperties, turbulenceProperties
  - system/: controlDict, fvSchemes, fvSolution

Uses simpleFoam (steady RANS) with k-epsilon turbulence model.

Usage:
    from tools.cfd_openfoam import create_openfoam_case, run_openfoam, parse_results
    case_dir = create_openfoam_case(mesh_data, wind_speed=20, wind_angle=0)
    run_openfoam(case_dir)  # requires Docker
    results = parse_results(case_dir)
"""

import json
import math
import os
import shutil
import subprocess
import sys
from pathlib import Path


def create_openfoam_case(mesh_result, wind_speed=20.0, wind_angle=0.0,
                         nu=1.5e-5, turbulence_intensity=0.05,
                         output_dir=None, transient=False, end_time=5.0, dt=0.001,
                         write_interval=100):
    """
    Create an OpenFOAM case directory from a CFD mesh result.

    Args:
        mesh_result: Output from generate_cfd_mesh() — has nodes, triangles, section_polygon
        wind_speed: Free-stream wind velocity [m/s]
        wind_angle: Wind direction [degrees] (0 = from left, +X)
        nu: Kinematic viscosity [m²/s] (air at 20°C = 1.5e-5)
        turbulence_intensity: TI at inlet (typically 0.01-0.10)
        output_dir: Directory for the case (default: temp dir)

    Returns:
        case_dir: Path to the OpenFOAM case directory
    """
    if output_dir is None:
        import tempfile
        output_dir = tempfile.mkdtemp(prefix="cfd_case_")
    case_dir = Path(output_dir)

    # Wind velocity components
    rad = math.radians(wind_angle)
    Ux = wind_speed * math.cos(rad)
    Uy = wind_speed * math.sin(rad)

    # Turbulence parameters (k-epsilon)
    char_dim = mesh_result["stats"]["char_dim"]
    k_inlet = 1.5 * (wind_speed * turbulence_intensity) ** 2
    epsilon_inlet = 0.09 * k_inlet ** 1.5 / (0.1 * char_dim)
    nut_inlet = 0.09 * k_inlet ** 2 / max(epsilon_inlet, 1e-10)

    # Reynolds number
    Re = wind_speed * char_dim / nu
    print(f"  Re = {Re:.0f}, k = {k_inlet:.4f}, epsilon = {epsilon_inlet:.4f}")

    # ── Create directory structure ──
    for d in ["0", "constant", "system", "constant/polyMesh"]:
        (case_dir / d).mkdir(parents=True, exist_ok=True)

    # ── 0/ — Initial and boundary conditions ──

    # U (velocity)
    _write_of_file(case_dir / "0" / "U", "volVectorField", "U", f"""
dimensions      [0 1 -1 0 0 0 0];
internalField   uniform ({Ux} {Uy} 0);
boundaryField
{{
    farfield
    {{
        type            freestreamVelocity;
        freestreamValue uniform ({Ux} {Uy} 0);
    }}
    section
    {{
        type            noSlip;
    }}
    defaultFaces
    {{
        type            empty;
    }}
}}
""")

    # p (pressure)
    _write_of_file(case_dir / "0" / "p", "volScalarField", "p", f"""
dimensions      [0 2 -2 0 0 0 0];
internalField   uniform 0;
boundaryField
{{
    farfield
    {{
        type            freestreamPressure;
        freestreamValue uniform 0;
    }}
    section
    {{
        type            zeroGradient;
    }}
    defaultFaces
    {{
        type            empty;
    }}
}}
""")

    # k (turbulent kinetic energy)
    _write_of_file(case_dir / "0" / "k", "volScalarField", "k", f"""
dimensions      [0 2 -2 0 0 0 0];
internalField   uniform {k_inlet};
boundaryField
{{
    farfield
    {{
        type            freestream;
        freestreamValue uniform {k_inlet};
    }}
    section
    {{
        type            kqRWallFunction;
        value           uniform {k_inlet};
    }}
    defaultFaces
    {{
        type            empty;
    }}
}}
""")

    # epsilon (turbulent dissipation)
    _write_of_file(case_dir / "0" / "epsilon", "volScalarField", "epsilon", f"""
dimensions      [0 2 -3 0 0 0 0];
internalField   uniform {epsilon_inlet};
boundaryField
{{
    farfield
    {{
        type            freestream;
        freestreamValue uniform {epsilon_inlet};
    }}
    section
    {{
        type            epsilonWallFunction;
        value           uniform {epsilon_inlet};
    }}
    defaultFaces
    {{
        type            empty;
    }}
}}
""")

    # nut (turbulent viscosity)
    _write_of_file(case_dir / "0" / "nut", "volScalarField", "nut", f"""
dimensions      [0 2 -1 0 0 0 0];
internalField   uniform {nut_inlet};
boundaryField
{{
    farfield
    {{
        type            freestream;
        freestreamValue uniform {nut_inlet};
    }}
    section
    {{
        type            nutUSpaldingWallFunction;
        value           uniform 0;
    }}
    defaultFaces
    {{
        type            empty;
    }}
}}
""")

    # ── constant/ — Physical properties ──

    _write_of_file(case_dir / "constant" / "transportProperties", None, None, f"""
FoamFile
{{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      transportProperties;
}}
transportModel  Newtonian;
nu              [0 2 -1 0 0 0 0] {nu};
""")

    _write_of_file(case_dir / "constant" / "turbulenceProperties", None, None, f"""
FoamFile
{{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      turbulenceProperties;
}}
simulationType  RAS;
RAS
{{
    RASModel        kEpsilon;
    turbulence      on;
    printCoeffs     on;
}}
""")

    # ── system/ — Solver settings ──

    if transient:
        solver_app = "pimpleFoam"
        delta_t = dt
        end_t = end_time
        write_int = write_interval
        purge = 0  # keep all time steps for animation
    else:
        solver_app = "simpleFoam"
        delta_t = 1
        end_t = 500
        write_int = 500
        purge = 1

    _write_of_file(case_dir / "system" / "controlDict", None, None, f"""
FoamFile
{{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      controlDict;
}}
application     {solver_app};
startFrom       startTime;
startTime       0;
stopAt          endTime;
endTime         {end_t};
deltaT          {delta_t};
writeControl    timeStep;
writeInterval   {write_int};
purgeWrite      {purge};
writeFormat     ascii;
writePrecision  8;
writeCompression off;
timeFormat      general;
timePrecision   6;
runTimeModifiable true;

functions
{{
    forces
    {{
        type            forceCoeffs;
        libs            ("libforces.so");
        writeControl    timeStep;
        writeInterval   1;
        patches         (section);
        rho             rhoInf;
        rhoInf          1.225;
        CofR            (0 0 0);
        liftDir         (0 1 0);
        dragDir         (1 0 0);
        pitchAxis       (0 0 1);
        magUInf         {wind_speed};
        lRef            {char_dim};
        Aref            {char_dim};
    }}
}}
""")

    ddt_scheme = "Euler" if transient else "steadyState"
    _write_of_file(case_dir / "system" / "fvSchemes", None, None, f"""
FoamFile
{{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      fvSchemes;
}}
ddtSchemes      {{ default {ddt_scheme}; }}
gradSchemes     {{ default Gauss linear; }}
divSchemes
{{
    default             none;
    div(phi,U)          bounded Gauss linearUpwind grad(U);
    div(phi,k)          bounded Gauss upwind;
    div(phi,epsilon)    bounded Gauss upwind;
    div((nuEff*dev2(T(grad(U))))) Gauss linear;
}}
laplacianSchemes {{ default Gauss linear corrected; }}
interpolationSchemes {{ default linear; }}
snGradSchemes {{ default corrected; }}
""")

    if transient:
        _write_of_file(case_dir / "system" / "fvSolution", None, None, """
FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      fvSolution;
}
solvers
{
    p   { solver GAMG; smoother GaussSeidel; tolerance 1e-06; relTol 0.01; }
    pFinal { $p; relTol 0; }
    U   { solver smoothSolver; smoother GaussSeidel; tolerance 1e-07; relTol 0.01; }
    UFinal { $U; relTol 0; }
    k   { solver smoothSolver; smoother GaussSeidel; tolerance 1e-07; relTol 0.01; }
    kFinal { $k; relTol 0; }
    epsilon { solver smoothSolver; smoother GaussSeidel; tolerance 1e-07; relTol 0.01; }
    epsilonFinal { $epsilon; relTol 0; }
}
PIMPLE
{
    nNonOrthogonalCorrectors 1;
    nCorrectors 2;
    nOuterCorrectors 1;
    pRefCell 0;
    pRefValue 0;
}
relaxationFactors
{
    equations { ".*" 1; }
}
""")
    else:
        _write_of_file(case_dir / "system" / "fvSolution", None, None, """
FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      fvSolution;
}
solvers
{
    p   { solver GAMG; smoother GaussSeidel; tolerance 1e-06; relTol 0.01; }
    U   { solver smoothSolver; smoother GaussSeidel; tolerance 1e-07; relTol 0.01; }
    k   { solver smoothSolver; smoother GaussSeidel; tolerance 1e-07; relTol 0.01; }
    epsilon { solver smoothSolver; smoother GaussSeidel; tolerance 1e-07; relTol 0.01; }
}
SIMPLE
{
    nNonOrthogonalCorrectors 1;
    pRefCell 0;
    pRefValue 0;
    residualControl { p 1e-4; U 1e-4; k 1e-4; epsilon 1e-4; }
}
relaxationFactors
{
    fields { p 0.3; }
    equations { U 0.7; k 0.7; epsilon 0.7; }
}
""")

    # ── Save mesh data for Gmsh → OpenFOAM conversion ──
    with open(case_dir / "mesh_data.json", "w") as f:
        json.dump(mesh_result, f)

    # Save case metadata
    meta = {
        "wind_speed": wind_speed,
        "wind_angle": wind_angle,
        "Re": Re,
        "char_dim": char_dim,
        "nu": nu,
        "k_inlet": k_inlet,
        "epsilon_inlet": epsilon_inlet,
    }
    with open(case_dir / "case_meta.json", "w") as f:
        json.dump(meta, f, indent=2)

    print(f"  OpenFOAM case created: {case_dir}")
    return str(case_dir)


def _write_of_file(path, class_name, object_name, content):
    """Write an OpenFOAM file with standard FoamFile header (Unix line endings)."""
    path = Path(path)
    if class_name and object_name:
        header = f"""FoamFile
{{
    version     2.0;
    format      ascii;
    class       {class_name};
    object      {object_name};
}}
"""
        with open(path, "w", newline="\n") as f:
            f.write(header + content)
    else:
        with open(path, "w", newline="\n") as f:
            f.write(content)


def generate_gmsh_msh(polygon, msh_path, mesh_size=0.2, far_field_factor=15):
    """Generate a Gmsh .msh file for OpenFOAM (run in subprocess due to signal issues)."""
    script = f"""
import sys, json
sys.path.insert(0, r'{str(Path(__file__).resolve().parent.parent)}')
from tools.cfd_mesh import generate_cfd_mesh
import gmsh

# Generate the mesh (this also initializes gmsh)
polygon = {json.dumps(polygon)}
generate_cfd_mesh(polygon, mesh_size={mesh_size}, far_field_factor={far_field_factor})

# Gmsh is finalized in generate_cfd_mesh, re-init to export
# Actually, let's do it differently: generate mesh and save .msh directly

gmsh.initialize()
gmsh.option.setNumber("General.Verbosity", 0)
gmsh.model.add("cfd")

import math
cx = sum(p[0] for p in polygon) / len(polygon)
cy = sum(p[1] for p in polygon) / len(polygon)
xs = [p[0] for p in polygon]
ys = [p[1] for p in polygon]
char_dim = max(max(xs)-min(xs), max(ys)-min(ys))
ff_r = char_dim * {far_field_factor}
ff_ms = char_dim * 2

# Section points
spts = []
for x, y in polygon:
    spts.append(gmsh.model.geo.addPoint(x, y, 0, {mesh_size}))
slines = []
n = len(spts)
for i in range(n):
    slines.append(gmsh.model.geo.addLine(spts[i], spts[(i+1)%n]))
sloop = gmsh.model.geo.addCurveLoop(slines)

# Far-field circle
ff_pts = []
for i in range(32):
    a = 2*math.pi*i/32
    ff_pts.append(gmsh.model.geo.addPoint(cx+ff_r*math.cos(a), cy+ff_r*math.sin(a), 0, ff_ms))
cpt = gmsh.model.geo.addPoint(cx, cy, 0, ff_ms)
ff_arcs = []
for i in range(4):
    s = ff_pts[i*8]
    e = ff_pts[((i+1)*8)%32]
    ff_arcs.append(gmsh.model.geo.addCircleArc(s, cpt, e))
ff_loop = gmsh.model.geo.addCurveLoop(ff_arcs)

surf = gmsh.model.geo.addPlaneSurface([ff_loop, sloop])
gmsh.model.geo.synchronize()

# Size field
df = gmsh.model.mesh.field.add("Distance")
gmsh.model.mesh.field.setNumbers(df, "CurvesList", slines)
tf = gmsh.model.mesh.field.add("Threshold")
gmsh.model.mesh.field.setNumber(tf, "InField", df)
gmsh.model.mesh.field.setNumber(tf, "SizeMin", {mesh_size})
gmsh.model.mesh.field.setNumber(tf, "SizeMax", ff_ms)
gmsh.model.mesh.field.setNumber(tf, "DistMin", char_dim*0.5)
gmsh.model.mesh.field.setNumber(tf, "DistMax", ff_r*0.5)
gmsh.model.mesh.field.setAsBackgroundMesh(tf)
gmsh.option.setNumber("Mesh.MeshSizeExtendFromBoundary", 0)
gmsh.option.setNumber("Mesh.MeshSizeFromPoints", 0)
gmsh.option.setNumber("Mesh.MeshSizeFromCurvature", 0)

# Physical groups
gmsh.model.addPhysicalGroup(1, slines, tag=1, name="section")
gmsh.model.addPhysicalGroup(1, ff_arcs, tag=2, name="farfield")
gmsh.model.addPhysicalGroup(2, [surf], tag=1, name="fluid")

# Generate 2D mesh
gmsh.model.mesh.generate(2)

# Extrude to thin 3D slab for OpenFOAM
ext = gmsh.model.geo.extrude([(2, surf)], 0, 0, 1.0, numElements=[1], recombine=True)
gmsh.model.geo.synchronize()

# Parse extrude results:
# ext[0] = (2, top_surface)
# ext[1] = (3, volume)
# ext[2..2+n_ff-1] = (2, farfield lateral surfaces) — one per ff_arc
# ext[2+n_ff..] = (2, section lateral surfaces) — one per section line
top_surf = ext[0][1]
vol = ext[1][1]
n_ff = len(ff_arcs)
n_sec = len(slines)
ff_lateral = [ext[2 + i][1] for i in range(n_ff)]
sec_lateral = [ext[2 + n_ff + i][1] for i in range(n_sec)]

# Remove old 2D physical groups and set new 3D ones
gmsh.model.removePhysicalGroups()
gmsh.model.addPhysicalGroup(3, [vol], tag=10, name="internal")
gmsh.model.addPhysicalGroup(2, sec_lateral, tag=1, name="section")
gmsh.model.addPhysicalGroup(2, ff_lateral, tag=2, name="farfield")
gmsh.model.addPhysicalGroup(2, [surf, top_surf], tag=3, name="frontAndBack")

gmsh.model.mesh.generate(3)
gmsh.option.setNumber("Mesh.MshFileVersion", 2.2)
gmsh.write(r'{msh_path}')
print("MSH_OK")
gmsh.finalize()
"""
    result = subprocess.run(
        [sys.executable, "-c", script],
        capture_output=True, text=True, timeout=30,
    )
    if "MSH_OK" not in result.stdout:
        raise RuntimeError(f"Gmsh export failed: {result.stderr[:500]}")


def run_openfoam(case_dir, polygon, mesh_size=0.2, far_field_factor=15):
    """
    Run OpenFOAM simpleFoam via WSL.

    Steps:
    1. Generate Gmsh .msh file
    2. Convert to OpenFOAM polyMesh via gmshToFoam (WSL)
    3. Fix boundary types
    4. Run simpleFoam (WSL)
    5. Parse force coefficients

    Returns:
        dict with success, log, force_coefficients
    """
    case_dir = Path(case_dir).resolve()
    msh_path = str(case_dir / "mesh.msh")

    # Step 1: Generate Gmsh .msh
    print("  [1/4] Generating Gmsh mesh...")
    generate_gmsh_msh(polygon, msh_path, mesh_size, far_field_factor)

    # Convert Windows path to WSL path
    wsl_case = str(case_dir).replace("C:\\", "/mnt/c/").replace("\\", "/")

    # Step 2-4: Run in WSL
    print("  [2/4] Converting mesh + running simpleFoam in WSL...")
    of_script = f"""#!/bin/bash
source /usr/lib/openfoam/openfoam2406/etc/bashrc 2>/dev/null
cd "{wsl_case}"

echo "=== gmshToFoam ==="
gmshToFoam mesh.msh 2>&1 | tail -5

if [ ! -f constant/polyMesh/points ]; then
    echo "ERROR: gmshToFoam failed"
    exit 1
fi

# Fix boundary types for 2D CFD
cd constant/polyMesh
python3 -c "
import re
with open('boundary','r') as f: txt=f.read()
txt = re.sub(r'(section[^{{]*{{[^}}]*type\s+)\w+', r'\g<1>wall', txt)
txt = re.sub(r'(frontAndBack[^{{]*{{[^}}]*type\s+)\w+', r'\g<1>empty', txt)
with open('boundary','w') as f: f.write(txt)
print('Boundary: section=wall, frontAndBack=empty, farfield=patch')
" 2>&1
cd "{wsl_case}"

echo "=== Starting solver ==="
# Detect solver from controlDict (strip Windows CR)
SOLVER=$(grep "application" system/controlDict | awk '{{print $2}}' | tr -d ';\\r\\n')
echo "Solver: $SOLVER"
$SOLVER 2>&1 || true

echo "=== DONE ==="
"""
    script_path = case_dir / "run_of.sh"
    with open(script_path, "w", newline="\n") as f:
        f.write(of_script)

    try:
        result = subprocess.run(
            ["cmd.exe", "/c", f"wsl -d Ubuntu -- bash {wsl_case}/run_of.sh"],
            capture_output=True, timeout=300,
        )
        log = result.stdout.decode("utf-8", errors="replace")
        log += result.stderr.decode("utf-8", errors="replace")
        success = "=== DONE ===" in log and "FOAM FATAL" not in log

        print(f"  [3/4] simpleFoam {'OK' if success else 'FAILED'}")

        # Step 4: Parse results
        force_coeffs = _parse_force_coeffs(case_dir)
        print(f"  [4/4] Force coefficients: {force_coeffs}")

        return {
            "success": success,
            "log": log[-3000:],
            "force_coefficients": force_coeffs,
        }
    except FileNotFoundError:
        return {"success": False, "log": "WSL not found", "force_coefficients": None}
    except subprocess.TimeoutExpired:
        return {"success": False, "log": "simpleFoam timed out (300s)", "force_coefficients": None}


def _parse_force_coeffs(case_dir):
    """Parse OpenFOAM forceCoeffs output."""
    case_dir = Path(case_dir)
    # Try multiple possible file names/paths
    candidates = [
        case_dir / "postProcessing" / "forces" / "0" / "forceCoeffs.dat",
        case_dir / "postProcessing" / "forces" / "0" / "coefficient.dat",
        case_dir / "postProcessing" / "forceCoeffs" / "0" / "forceCoeffs.dat",
        case_dir / "postProcessing" / "forceCoeffs" / "0" / "coefficient.dat",
    ]
    coeffs_file = None
    for c in candidates:
        if c.exists():
            coeffs_file = c
            break
    if not coeffs_file:
        # List what's in postProcessing for debugging
        pp = case_dir / "postProcessing"
        if pp.exists():
            print(f"  postProcessing contents: {list(pp.rglob('*'))[:10]}")
        return None

    try:
        with open(coeffs_file) as f:
            lines = f.readlines()
        # Last non-comment line has the final values
        for line in reversed(lines):
            if not line.startswith("#") and line.strip():
                parts = line.split()
                if len(parts) >= 4:
                    return {
                        "time": float(parts[0]),
                        "Cd": float(parts[1]),
                        "Cl": float(parts[2]),
                        "Cm": float(parts[3]),
                    }
    except Exception:
        pass
    return None


def parse_cfd_results(case_dir):
    """Parse OpenFOAM results: cell centers, pressure, velocity."""
    case_dir = Path(case_dir)

    # Find all time directories
    time_dirs = []
    for d in case_dir.iterdir():
        if d.is_dir():
            try:
                float(d.name)
                time_dirs.append(d)
            except ValueError:
                pass
    if not time_dirs:
        return None
    time_dirs = sorted(time_dirs, key=lambda d: float(d.name))
    latest = time_dirs[-1]

    # Parse points (cell centers via mesh)
    points_file = case_dir / "constant" / "polyMesh" / "points"
    points = _parse_of_vector_field(points_file)
    if not points:
        return None

    # Parse pressure
    p_file = latest / "p"
    pressure = _parse_of_scalar_field(p_file)

    # Parse velocity
    u_file = latest / "U"
    velocity = _parse_of_vector_field(u_file)

    # Compute cell centers from mesh (approximate: average of face centers)
    # For visualization, use the points directly (they're vertex positions)
    # We need cell center values, but p/U are already cell-centered in OpenFOAM

    # Get the 2D slice (z=0 layer only for visualization)
    nodes_2d = []
    p_2d = []
    u_2d = []
    for i, pt in enumerate(points):
        if abs(pt[2]) < 0.01:  # z ≈ 0 (bottom face)
            nodes_2d.append({"id": i, "x": round(pt[0], 4), "y": round(pt[1], 4)})

    # Cell-centered values: need cell→point mapping
    # Simpler: just return all values and let the client filter
    n_cells = len(pressure) if pressure else 0

    # Force coefficients
    force_coeffs = _parse_force_coeffs(case_dir)

    # Pressure range
    pMin = min(pressure) if pressure else 0
    pMax = max(pressure) if pressure else 0

    # Parse faces + owner for cell→node connectivity (2D slice)
    faces_file = case_dir / "constant" / "polyMesh" / "faces"
    owner_file = case_dir / "constant" / "polyMesh" / "owner"
    faces = _parse_of_faces(faces_file)
    owner = _parse_of_int_list(owner_file)

    # Build triangles from faces on z=0 plane
    triangles_2d = []
    if faces and owner and points:
        for i, face in enumerate(faces):
            if len(face) < 3:
                continue
            # Check if face is on z=0 plane
            face_pts = [points[n] for n in face if n < len(points)]
            if not face_pts:
                continue
            avg_z = sum(p[2] for p in face_pts) / len(face_pts)
            if abs(avg_z) > 0.01:
                continue
            # Get cell (owner) pressure value
            cell_id = owner[i] if i < len(owner) else -1
            p_val = pressure[cell_id] if pressure and 0 <= cell_id < len(pressure) else 0
            # Add triangle fan for this face
            for j in range(1, len(face) - 1):
                triangles_2d.append({
                    "nodes": [face[0], face[j], face[j+1]],
                    "p": p_val,
                })

    # Available time steps for animation
    time_steps = [float(d.name) for d in time_dirs if float(d.name) > 0]

    # Force coefficient time series (for transient simulations)
    force_history = _parse_force_history(case_dir)

    return {
        "nodes": nodes_2d,
        "pressure": pressure[:len(nodes_2d)] if pressure else [],
        "velocity": [(v[0], v[1]) for v in (velocity or [])[:len(nodes_2d)]],
        "triangles": triangles_2d[:20000],
        "n_cells": n_cells,
        "n_points": len(points),
        "p_range": [pMin, pMax] if pressure else [0, 0],
        "force_coefficients": force_coeffs,
        "time_steps": time_steps[:200],  # limit for JSON size
        "force_history": force_history,
    }


def _parse_of_faces(filepath):
    """Parse OpenFOAM faces file: list of face→node indices."""
    if not filepath.exists():
        return None
    with open(filepath) as f:
        content = f.read()

    faces = []
    import re
    # Find the data block after the count
    match = re.search(r'(\d+)\s*\(', content)
    if not match:
        return None
    # Extract face definitions: N(n1 n2 n3 ...)
    for m in re.finditer(r'(\d+)\(([^)]+)\)', content[match.start():]):
        n = int(m.group(1))
        indices = [int(x) for x in m.group(2).split()]
        if len(indices) == n:
            faces.append(indices)
    return faces


def _parse_of_int_list(filepath):
    """Parse OpenFOAM integer list (owner, neighbour)."""
    if not filepath.exists():
        return None
    with open(filepath) as f:
        lines = f.readlines()

    values = []
    in_data = False
    for line in lines:
        line = line.strip()
        if line == '(':
            in_data = True
            continue
        if line == ')':
            break
        if in_data:
            try:
                values.append(int(line))
            except ValueError:
                pass
    return values


def _parse_force_history(case_dir):
    """Parse forceCoeffs time series for transient results."""
    case_dir = Path(case_dir)
    candidates = [
        case_dir / "postProcessing" / "forces" / "0" / "coefficient.dat",
        case_dir / "postProcessing" / "forces" / "0" / "forceCoeffs.dat",
        case_dir / "postProcessing" / "forceCoeffs" / "0" / "coefficient.dat",
    ]
    coeffs_file = None
    for c in candidates:
        if c.exists():
            coeffs_file = c
            break
    if not coeffs_file:
        return None

    try:
        times, cds, cls, cms = [], [], [], []
        with open(coeffs_file) as f:
            for line in f:
                if line.startswith("#") or not line.strip():
                    continue
                parts = line.split()
                if len(parts) >= 4:
                    times.append(float(parts[0]))
                    cds.append(float(parts[1]))
                    cls.append(float(parts[2]))
                    cms.append(float(parts[3]))
        # Subsample if too many points
        n = len(times)
        if n > 500:
            step = n // 500
            times = times[::step]
            cds = cds[::step]
            cls = cls[::step]
            cms = cms[::step]
        return {"time": times, "Cd": cds, "Cl": cls, "Cm": cms}
    except Exception:
        return None


def _parse_of_scalar_field(filepath):
    """Parse OpenFOAM scalar field file."""
    if not filepath.exists():
        return None
    with open(filepath) as f:
        lines = f.readlines()

    values = []
    in_data = False
    for line in lines:
        line = line.strip()
        if line == '(':
            in_data = True
            continue
        if line == ')' or line.startswith(');'):
            break
        if in_data:
            try:
                values.append(float(line))
            except ValueError:
                pass
    return values


def _parse_of_vector_field(filepath):
    """Parse OpenFOAM vector field file (points, U)."""
    if not filepath.exists():
        return None
    with open(filepath) as f:
        lines = f.readlines()

    values = []
    in_data = False
    for line in lines:
        line = line.strip()
        if line == '(':
            in_data = True
            continue
        if line == ')' or line.startswith(');'):
            if in_data and values:
                break
            continue
        if in_data and line.startswith('(') and line.endswith(')'):
            parts = line[1:-1].split()
            if len(parts) >= 3:
                try:
                    values.append((float(parts[0]), float(parts[1]), float(parts[2])))
                except ValueError:
                    pass
    return values


if __name__ == "__main__":
    from tools.cfd_mesh import generate_cfd_mesh

    # Test: create case for rectangular section
    rect = [[0, 0], [4, 0], [4, 0.5], [0, 0.5]]
    mesh = generate_cfd_mesh(rect, mesh_size=0.2, far_field_factor=10)

    case_dir = create_openfoam_case(mesh, wind_speed=20, wind_angle=0,
                                     output_dir="tests/_output/cfd_case")
    print(f"Case: {case_dir}")
    print(f"Files: {list(Path(case_dir).rglob('*'))[:20]}")
