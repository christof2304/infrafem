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
from pathlib import Path


def create_openfoam_case(mesh_result, wind_speed=20.0, wind_angle=0.0,
                         nu=1.5e-5, turbulence_intensity=0.05,
                         output_dir=None):
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

    _write_of_file(case_dir / "system" / "controlDict", None, None, f"""
FoamFile
{{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      controlDict;
}}
application     simpleFoam;
startFrom       startTime;
startTime       0;
stopAt          endTime;
endTime         500;
deltaT          1;
writeControl    timeStep;
writeInterval   500;
purgeWrite      1;
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

    _write_of_file(case_dir / "system" / "fvSchemes", None, None, """
FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      fvSchemes;
}
ddtSchemes      { default steadyState; }
gradSchemes     { default Gauss linear; }
divSchemes
{
    default             none;
    div(phi,U)          bounded Gauss linearUpwind grad(U);
    div(phi,k)          bounded Gauss upwind;
    div(phi,epsilon)    bounded Gauss upwind;
    div((nuEff*dev2(T(grad(U))))) Gauss linear;
}
laplacianSchemes { default Gauss linear corrected; }
interpolationSchemes { default linear; }
snGradSchemes { default corrected; }
""")

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
    """Write an OpenFOAM file with standard FoamFile header."""
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
        with open(path, "w") as f:
            f.write(header + content)
    else:
        with open(path, "w") as f:
            f.write(content)


def run_openfoam(case_dir, docker_image="openfoam/openfoam2406-dev"):
    """
    Run OpenFOAM simpleFoam in Docker container.

    Args:
        case_dir: Path to the OpenFOAM case directory
        docker_image: Docker image name

    Returns:
        dict with success, log, force_coefficients
    """
    case_dir = Path(case_dir).resolve()

    # Step 1: Convert Gmsh mesh to OpenFOAM polyMesh
    # gmshToFoam is part of OpenFOAM — run in Docker
    gmsh_cmd = f"cd /case && gmshToFoam mesh.msh"

    # First, create Gmsh .msh file from our mesh data
    mesh_data_path = case_dir / "mesh_data.json"
    if mesh_data_path.exists():
        _create_gmsh_msh(case_dir, mesh_data_path)

    # Step 2: Run simpleFoam
    try:
        # Docker command: mount case_dir as /case
        result = subprocess.run(
            ["docker", "run", "--rm",
             "-v", f"{case_dir}:/case",
             "-w", "/case",
             docker_image,
             "/bin/bash", "-c",
             "gmshToFoam mesh.msh 2>&1 && "
             "changeDictionary 2>&1 || true && "
             "simpleFoam 2>&1"],
            capture_output=True, text=True, timeout=300,
        )
        log = result.stdout + result.stderr
        success = "End" in log and result.returncode == 0

        # Parse force coefficients
        force_coeffs = _parse_force_coeffs(case_dir)

        return {
            "success": success,
            "log": log[-2000:],  # last 2000 chars
            "force_coefficients": force_coeffs,
        }
    except FileNotFoundError:
        return {"success": False, "log": "Docker not found. Install Docker Desktop.", "force_coefficients": None}
    except subprocess.TimeoutExpired:
        return {"success": False, "log": "OpenFOAM timed out (300s)", "force_coefficients": None}


def _create_gmsh_msh(case_dir, mesh_data_path):
    """Convert our JSON mesh data to Gmsh .msh format for gmshToFoam."""
    import gmsh

    with open(mesh_data_path) as f:
        mesh_data = json.load(f)

    gmsh.initialize()
    gmsh.option.setNumber("General.Verbosity", 0)
    gmsh.model.add("cfd_export")

    # Re-create the mesh using Gmsh from the polygon
    from tools.cfd_mesh import generate_cfd_mesh
    polygon = mesh_data["section_polygon"]
    mesh_size = 0.2  # TODO: get from mesh_data
    far_field = 15

    # Just re-mesh and export (simpler than reconstructing)
    result = generate_cfd_mesh(polygon, mesh_size=mesh_size, far_field_factor=far_field)

    # Gmsh is still initialized from generate_cfd_mesh... need to re-init
    gmsh.initialize()
    gmsh.option.setNumber("General.Verbosity", 0)

    # Rebuild mesh in Gmsh and export
    # (This is a simplified approach — in production, cache the Gmsh model)

    gmsh.finalize()

    # For now, just save a placeholder
    msh_path = case_dir / "mesh.msh"
    msh_path.touch()


def _parse_force_coeffs(case_dir):
    """Parse OpenFOAM forceCoeffs output."""
    coeffs_file = Path(case_dir) / "postProcessing" / "forces" / "0" / "forceCoeffs.dat"
    if not coeffs_file.exists():
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


def parse_surface_pressure(case_dir):
    """Parse pressure distribution on the section surface."""
    # TODO: Parse OpenFOAM surface sampling output
    # Would use postProcess -func 'patchAverage(p, section)'
    # Or sample along the section boundary
    return None


if __name__ == "__main__":
    from tools.cfd_mesh import generate_cfd_mesh

    # Test: create case for rectangular section
    rect = [[0, 0], [4, 0], [4, 0.5], [0, 0.5]]
    mesh = generate_cfd_mesh(rect, mesh_size=0.2, far_field_factor=10)

    case_dir = create_openfoam_case(mesh, wind_speed=20, wind_angle=0,
                                     output_dir="tests/_output/cfd_case")
    print(f"Case: {case_dir}")
    print(f"Files: {list(Path(case_dir).rglob('*'))[:20]}")
