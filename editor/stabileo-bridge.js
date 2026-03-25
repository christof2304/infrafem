// stabileo-bridge.js — Bridge between infraFEM editor model and Stabileo WASM solver
// Converts editor JSON → Stabileo input → solve → convert results back

let wasmModule = null;
let wasmSolve2d = null;
let wasmInitialized = false;

/**
 * Initialize the Stabileo WASM solver.
 * Must be called once before solving.
 */
export async function initStabileo() {
    if (wasmInitialized) return true;
    try {
        const wasm = await import('./stabileo/dedaliano_engine.js');
        await wasm.default(); // Initialize WASM module
        wasmSolve2d = wasm.solve_2d;
        wasmModule = wasm;
        wasmInitialized = true;
        console.log('Stabileo WASM solver initialized');
        return true;
    } catch (err) {
        console.error('Failed to initialize Stabileo WASM:', err);
        return false;
    }
}

/**
 * Check if Stabileo is available.
 */
export function isStabileoAvailable() {
    return wasmInitialized && wasmSolve2d !== null;
}

/**
 * Convert infraFEM editor model to Stabileo 2D input format.
 */
function editorToStabileoInput(model) {
    const nodes = {};
    const materials = {};
    const sections = {};
    const elements = {};
    const supports = {};
    const loads = [];

    // Nodes: Stabileo 2D uses x, y (not x, z!) — y = vertical
    for (const node of model.nodes) {
        nodes[String(node.id)] = { id: node.id, x: node.x, y: node.z };
    }

    // Materials: E in MPa
    for (const mat of model.materials) {
        let E = 30000;
        if (mat.type === 'STAH') E = 210000;
        materials[String(mat.id)] = { id: mat.id, e: E, nu: 0.2 };
    }

    // Sections: area, inertia in m²/m⁴
    for (const sec of model.sections) {
        let a = 0, iz = 0, asY = 0;
        if (sec.type === 'SREC') {
            const B = sec.params.B || 0.3, H = sec.params.H || 0.5;
            a = B * H;
            iz = B * H * H * H / 12;
            asY = a * 5 / 6;
        } else if (sec.type === 'SCIR') {
            const r = (sec.params.D || 0.4) / 2;
            a = Math.PI * r * r;
            iz = Math.PI * r * r * r * r / 4;
            asY = a * 0.9;
        }
        sections[String(sec.id)] = { id: sec.id, a, iz, asY };
    }

    // Elements: camelCase (nodeI, nodeJ, materialId, sectionId, hingeStart, hingeEnd)
    for (const beam of model.beams) {
        if (beam.isStructLine) continue;
        const matId = model.sections.find(s => s.id === beam.sectionId)?.materialId || 1;
        elements[String(beam.id)] = {
            id: beam.id,
            type: 'frame',
            nodeI: beam.nodeStart,
            nodeJ: beam.nodeEnd,
            materialId: matId,
            sectionId: beam.sectionId || 1,
            hingeStart: beam.hingeStart || false,
            hingeEnd: beam.hingeEnd || false,
        };
    }

    // Supports: camelCase (nodeId, type, kz)
    let supId = 1;
    for (const node of model.nodes) {
        if (!node.support || node.support === 'NONE') continue;
        const sup = { id: supId++, nodeId: node.id };
        switch (node.support) {
            case 'FIXED': sup.type = 'fixed'; break;
            case 'PINNED': sup.type = 'pinned'; break;
            case 'ROLLER_X': sup.type = 'rollerX'; break;
            case 'ROLLER_Z': sup.type = 'rollerZ'; break;
            case 'SPRING': sup.type = 'spring'; sup.kz = node.springStiffness || 1e6; break;
            default: continue;
        }
        supports[String(sup.id)] = sup;
    }

    // Loads: camelCase (nodeId, elementId, qI, qJ)
    for (const lc of model.loadcases) {
        for (const load of lc.loads) {
            if (load.type === 'NODE_FORCE') {
                // Stabileo 2D: fy = vertical, fx = horizontal, mz = moment
                const data = { nodeId: load.nodeId, fx: 0, fy: 0, mz: 0 };
                if (load.direction === 'PZ' || load.direction === 'PZZ') data.fy = load.value;
                else if (load.direction === 'PX' || load.direction === 'PXX') data.fx = load.value;
                loads.push({ type: 'nodal', data });
            } else if (load.type === 'BEAM_LINE') {
                loads.push({
                    type: 'distributed',
                    data: { elementId: load.elementId, qI: load.p1, qJ: load.p2, a: 0, b: 0 },
                });
            }
        }
    }

    return { nodes, materials, sections, elements, supports, loads };
}

/**
 * Convert Stabileo results to infraFEM result format.
 */
function stabileoResultsToEditor(results, model) {
    // Node displacements (Stabileo 2D: nodeId, ux, uy, rz)
    const nodes = (results.displacements || []).map(d => ({
        id: d.nodeId,
        uX: d.ux || 0,
        uY: d.uy || 0, // Stabileo uy = vertical = our uY (screen Y)
        uZ: 0,
    }));

    // All nodes with positions
    const allNodes = model.nodes.map(n => ({
        id: n.id,
        x: n.x,
        y: n.z, // editor z = screen y
        z: 0,
    }));

    // Beam forces (Stabileo camelCase: elementId, nStart, vStart, mStart etc.)
    const beams = [];
    for (const ef of (results.elementForces || results.element_forces || [])) {
        const elemId = ef.elementId || ef.element_id;
        beams.push({
            id: elemId,
            x: 0,
            N: ef.nStart || ef.n_start || 0,
            Vz: ef.vStart || ef.v_start || 0,
            My: ef.mStart || ef.m_start || 0,
        });
        beams.push({
            id: elemId,
            x: ef.length || 1,
            N: ef.nEnd || ef.n_end || 0,
            Vz: ef.vEnd || ef.v_end || 0,
            My: ef.mEnd || ef.m_end || 0,
        });
    }

    return {
        allNodes,
        nodes,
        beams,
        quads: [],
        quadElements: [],
        beamElements: [],
        _solver: 'stabileo',
        _solveTime: results.solver_run_meta?.solve_time_ms || 0,
    };
}

/**
 * Solve the editor model using Stabileo WASM.
 * Returns results in infraFEM format or throws on error.
 */
export function solveWithStabileo(model) {
    if (!isStabileoAvailable()) {
        throw new Error('Stabileo WASM not initialized');
    }

    const input = editorToStabileoInput(model);
    const inputJson = JSON.stringify(input);

    try {
        console.log('Stabileo input JSON:', inputJson);
        const resultJson = wasmSolve2d(inputJson);
        const results = JSON.parse(resultJson);

        // Check for errors
        if (results.diagnostics && results.diagnostics.length > 0) {
            const errors = results.diagnostics.filter(d => d.severity === 'Error');
            if (errors.length > 0) {
                throw new Error(errors.map(e => e.message).join('; '));
            }
        }

        return stabileoResultsToEditor(results, model);
    } catch (err) {
        if (err.message?.includes('not initialized')) throw err;
        throw new Error(`Stabileo solver error: ${err.message || err}`);
    }
}
