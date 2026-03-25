// stabileo-bridge.js — Bridge between infraFEM editor model and Stabileo WASM solver
// Converts editor JSON → Stabileo input → solve → convert results back

let wasmModule = null;
let wasmSolve2d = null;
let wasmSolve3d = null;
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
        wasmSolve3d = wasm.solve_3d;
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

// ─── 3D Plate Solver ──────────────────────────────────────────────

/**
 * Simple rectangular mesh generator for a quadrilateral area.
 * Returns { nodes: [{id,x,y}], quads: [{id, nodes:[n1,n2,n3,n4]}] }
 */
function meshQuadArea(corners, meshSize, startNodeId, startElemId) {
    // corners = [{x,y}, {x,y}, {x,y}, {x,y}] in CCW order
    // For a general quad, use transfinite interpolation
    const c = corners;
    const Lx = Math.max(
        Math.sqrt((c[1].x-c[0].x)**2 + (c[1].y-c[0].y)**2),
        Math.sqrt((c[2].x-c[3].x)**2 + (c[2].y-c[3].y)**2)
    );
    const Ly = Math.max(
        Math.sqrt((c[3].x-c[0].x)**2 + (c[3].y-c[0].y)**2),
        Math.sqrt((c[2].x-c[1].x)**2 + (c[2].y-c[1].y)**2)
    );
    const nx = Math.max(2, Math.round(Lx / meshSize));
    const ny = Math.max(2, Math.round(Ly / meshSize));

    const nodes = [];
    const quads = [];
    const nodeGrid = []; // [iy][ix] = nodeId

    let nid = startNodeId;
    for (let iy = 0; iy <= ny; iy++) {
        nodeGrid[iy] = [];
        const v = iy / ny;
        for (let ix = 0; ix <= nx; ix++) {
            const u = ix / nx;
            // Transfinite interpolation for general quad
            const x = (1-u)*(1-v)*c[0].x + u*(1-v)*c[1].x + u*v*c[2].x + (1-u)*v*c[3].x;
            const y = (1-u)*(1-v)*c[0].y + u*(1-v)*c[1].y + u*v*c[2].y + (1-u)*v*c[3].y;
            nodes.push({ id: nid, x, y, z: 0 });
            nodeGrid[iy][ix] = nid;
            nid++;
        }
    }

    let eid = startElemId;
    for (let iy = 0; iy < ny; iy++) {
        for (let ix = 0; ix < nx; ix++) {
            quads.push({
                id: eid++,
                nodes: [
                    nodeGrid[iy][ix],
                    nodeGrid[iy][ix+1],
                    nodeGrid[iy+1][ix+1],
                    nodeGrid[iy+1][ix],
                ],
            });
        }
    }

    return { nodes, quads, nodeGrid, nx, ny };
}

/**
 * Convert editor model with areas to Stabileo 3D input.
 */
function editorToStabileo3DInput(model) {
    const nodes = {};
    const materials = {};
    const sections = {};
    const elements = {};
    const supports = {};
    const loads = [];
    const quadElems = {};

    const meshSize = model.meshSettings?.hmin || 0.5;

    // Materials
    for (const mat of model.materials) {
        let E = 30000;
        if (mat.type === 'STAH') E = 210000;
        materials[String(mat.id)] = { id: mat.id, e: E, nu: 0.2 };
    }

    // Sections (for beams in combined systems)
    for (const sec of model.sections) {
        let a = 0, iy = 0, iz = 0, j = 0;
        if (sec.type === 'SREC') {
            const B = sec.params.B || 0.3, H = sec.params.H || 0.5;
            a = B * H;
            iy = H * B * B * B / 12;
            iz = B * H * H * H / 12;
            j = iy + iz; // approximate torsion
        } else if (sec.type === 'SCIR') {
            const r = (sec.params.D || 0.4) / 2;
            a = Math.PI * r * r;
            iy = iz = Math.PI * r * r * r * r / 4;
            j = iy + iz;
        }
        sections[String(sec.id)] = { id: sec.id, a, iy, iz, j };
    }

    // Start IDs for mesh-generated nodes/elements
    let nextNodeId = 10000;
    let nextElemId = 10000;

    // Map editor node IDs to 3D nodes
    // Editor coords: x = horizontal, z = vertical (screen Y)
    // For plate in XY plane: x → X, z → Y, Z = 0
    for (const node of model.nodes) {
        nodes[String(node.id)] = { id: node.id, x: node.x, y: node.z, z: 0 };
    }

    // Track boundary node IDs for support assignment
    const boundaryNodeIds = new Set();

    // Mesh each area
    const areaQuadMap = {}; // areaId → [quadElemIds]
    for (const area of (model.areas || [])) {
        const bnd = area.boundaryNodeIds;
        if (bnd.length < 3) continue;

        // Get corner positions
        const corners = bnd.map(nid => {
            const n = model.nodes.find(nd => nd.id === nid);
            return n ? { x: n.x, y: n.z } : null;
        }).filter(Boolean);
        if (corners.length < 3) continue;

        // For 3-node areas, duplicate last corner to make a quad
        while (corners.length < 4) corners.push(corners[corners.length - 1]);

        const mesh = meshQuadArea(corners, meshSize, nextNodeId, nextElemId);
        nextNodeId += mesh.nodes.length;
        nextElemId += mesh.quads.length;

        // Add mesh nodes (skip corners that overlap with editor nodes)
        for (const mn of mesh.nodes) {
            // Check if close to an existing editor node
            const existingNode = model.nodes.find(n =>
                Math.abs(n.x - mn.x) < 0.001 && Math.abs(n.z - mn.y) < 0.001);
            if (existingNode) {
                // Remap mesh node to editor node
                for (const q of mesh.quads) {
                    q.nodes = q.nodes.map(nid => nid === mn.id ? existingNode.id : nid);
                }
            } else {
                nodes[String(mn.id)] = mn;
            }
        }

        // Add quad elements with thickness and material
        const matId = area.materialId || 1;
        const thickness = area.thickness || 0.25;
        const quadIds = [];
        for (const q of mesh.quads) {
            quadElems[String(q.id)] = {
                id: q.id,
                nodes: q.nodes,
                materialId: matId,
                thickness: thickness,
            };
            quadIds.push(q.id);
        }
        areaQuadMap[area.id] = quadIds;

        // Mark boundary nodes for supports
        // Edge nodes: iy=0, iy=ny, ix=0, ix=nx
        const edgeSups = area.edgeSupports || bnd.map(() => 'PINNED');
        // Bottom edge (iy=0) = edge 0 (node[0] → node[1])
        // Right edge (ix=nx) = edge 1 (node[1] → node[2])
        // Top edge (iy=ny) = edge 2 (node[2] → node[3])
        // Left edge (ix=0) = edge 3 (node[3] → node[0])
        const edges = [
            { iy: 0, type: edgeSups[0] || 'NONE' },        // bottom
            { ix: mesh.nx, type: edgeSups[1] || 'NONE' },   // right
            { iy: mesh.ny, type: edgeSups[2] || 'NONE' },   // top
            { ix: 0, type: edgeSups[3] || 'NONE' },         // left
        ];
        for (const edge of edges) {
            if (edge.type === 'NONE') continue;
            for (let iy = 0; iy <= mesh.ny; iy++) {
                for (let ix = 0; ix <= mesh.nx; ix++) {
                    let onEdge = false;
                    if (edge.iy !== undefined && iy === edge.iy) onEdge = true;
                    if (edge.ix !== undefined && ix === edge.ix) onEdge = true;
                    if (onEdge) {
                        const nid = mesh.nodeGrid[iy][ix];
                        // Find the actual node ID (may have been remapped)
                        const actualNid = Object.keys(nodes).find(k => {
                            const n = nodes[k];
                            const mn = mesh.nodes.find(m => m.id === parseInt(k));
                            return mn || n.id === nid;
                        });
                        boundaryNodeIds.add(nid);
                    }
                }
            }
        }

        // Apply supports to boundary nodes
        let supId = 1;
        for (const edge of edges) {
            if (edge.type === 'NONE') continue;
            for (let iy = 0; iy <= mesh.ny; iy++) {
                for (let ix = 0; ix <= mesh.nx; ix++) {
                    let onEdge = false;
                    if (edge.iy !== undefined && iy === edge.iy) onEdge = true;
                    if (edge.ix !== undefined && ix === edge.ix) onEdge = true;
                    if (!onEdge) continue;
                    const nid = mesh.nodeGrid[iy][ix];
                    // Find actual nid (might have been remapped)
                    let actualNid = nid;
                    for (const q of mesh.quads) {
                        // nid might have been remapped in the quads
                    }
                    const sup = { nodeId: actualNid, rx: false, ry: false, rz: false, rrx: false, rry: false, rrz: false };
                    switch (edge.type) {
                        case 'FIXED': sup.rx = sup.ry = sup.rz = sup.rrx = sup.rry = sup.rrz = true; break;
                        case 'PINNED': sup.rz = true; break; // plate: only vertical
                        case 'ROLLER_X': sup.rz = true; break;
                        default: sup.rz = true; break;
                    }
                    if (!supports[String(actualNid)]) {
                        supports[String(actualNid)] = sup;
                    }
                }
            }
        }
    }

    // Also add supports from editor nodes
    for (const node of model.nodes) {
        if (!node.support || node.support === 'NONE') continue;
        const sup = { nodeId: node.id, rx: false, ry: false, rz: false, rrx: false, rry: false, rrz: false };
        switch (node.support) {
            case 'FIXED': sup.rx = sup.ry = sup.rz = sup.rrx = sup.rry = sup.rrz = true; break;
            case 'PINNED': sup.rz = true; break;
            case 'ROLLER_X': sup.rz = true; break;
            case 'SPRING': sup.kz = node.springStiffness || 1e6; sup.rz = true; break;
        }
        supports[String(node.id)] = sup;
    }

    // Loads
    for (const lc of model.loadcases) {
        for (const load of lc.loads) {
            if (load.type === 'AREA_LOAD') {
                // Apply pressure to all quads of this area
                const quadIds = areaQuadMap[load.areaId] || [];
                for (const qid of quadIds) {
                    loads.push({
                        type: 'quadPressure',
                        data: { elementId: qid, pressure: load.value },
                    });
                }
            } else if (load.type === 'NODE_FORCE') {
                const data = { nodeId: load.nodeId, fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 };
                if (load.direction === 'PZ' || load.direction === 'PZZ') data.fz = load.value;
                else if (load.direction === 'PX' || load.direction === 'PXX') data.fx = load.value;
                loads.push({ type: 'nodal', data });
            }
        }
    }

    return { nodes, materials, sections, elements, supports, loads, quads: quadElems };
}

/**
 * Convert Stabileo 3D results to infraFEM format.
 */
function stabileo3DResultsToEditor(results, model) {
    const nodes = (results.displacements || []).map(d => ({
        id: d.nodeId,
        uX: d.ux || 0,
        uY: d.uy || 0,
        uZ: d.uz || 0,
    }));

    const allNodes = [];
    // Collect all nodes from the input (including mesh nodes)
    for (const d of (results.displacements || [])) {
        allNodes.push({ id: d.nodeId, x: 0, y: 0, z: 0 }); // positions filled below
    }

    // Quad forces from quad_stresses
    const quads = (results.quadStresses || results.quad_stresses || []).map(qs => ({
        id: qs.elementId || qs.element_id,
        mxx: qs.mx || 0,
        myy: qs.my || 0,
        mxy: qs.mxy || 0,
        vx: 0,
        vy: 0,
    }));

    // Beam forces
    const beams = [];
    for (const ef of (results.elementForces || results.element_forces || [])) {
        const elemId = ef.elementId || ef.element_id;
        beams.push({ id: elemId, x: 0, N: ef.nStart || 0, Vz: ef.vyStart || 0, My: ef.mzStart || 0 });
        beams.push({ id: elemId, x: ef.length || 1, N: ef.nEnd || 0, Vz: ef.vyEnd || 0, My: ef.mzEnd || 0 });
    }

    return {
        allNodes,
        nodes,
        beams,
        quads,
        quadElements: [], // TODO: pass quad connectivity for color display
        beamElements: [],
        _solver: 'stabileo-3d',
    };
}

/**
 * Solve plate model using Stabileo 3D solver with WASM.
 */
export function solveWithStabileo3D(model) {
    if (!wasmSolve3d) throw new Error('Stabileo 3D WASM not initialized');

    const input = editorToStabileo3DInput(model);
    const inputJson = JSON.stringify(input);
    console.log('Stabileo 3D input:', JSON.parse(inputJson));
    console.log(`Mesh: ${Object.keys(input.nodes).length} nodes, ${Object.keys(input.quads).length} quads`);

    try {
        const resultJson = wasmSolve3d(inputJson);
        const results = JSON.parse(resultJson);

        if (results.diagnostics?.length > 0) {
            const errors = results.diagnostics.filter(d => d.severity === 'Error');
            if (errors.length > 0) throw new Error(errors.map(e => e.message).join('; '));
        }

        // Fill in node positions from input
        const editorResult = stabileo3DResultsToEditor(results, model);
        for (const an of editorResult.allNodes) {
            const n = input.nodes[String(an.id)];
            if (n) { an.x = n.x; an.y = n.y; an.z = n.z; }
        }

        // Add quad connectivity for visualization
        editorResult.quadElements = Object.values(input.quads).map(q => ({
            nr: q.id,
            nodes: q.nodes,
            thickness: q.thickness || 0.25,
        }));

        return editorResult;
    } catch (err) {
        throw new Error(`Stabileo 3D error: ${err.message || err}`);
    }
}
