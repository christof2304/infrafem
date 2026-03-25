// editor-dat.js — JSON Model → SOFiSTiK .dat Generator
// infraFEM Structural Editor

import { SUPPORT_TYPES } from './editor-core.js';

// ─── Format helpers ─────────────────────────────────────────
function fmtNum(v, decimals = 3) {
    return Number(v).toFixed(decimals);
}

function fmtCoord(v) {
    return fmtNum(v, 3).padStart(10);
}

function datComment(text) {
    return `$ ${text}`;
}

function today() {
    return new Date().toISOString().slice(0, 10);
}

// ─── AQUA Block ─────────────────────────────────────────────
function generateAQUA(model) {
    const lines = [];
    lines.push('PROG AQUA urs:1');
    lines.push('KOPF Material und Querschnitte');
    lines.push('NORM EN 199X-200X');

    // Materials — use MATE for Trial license compatibility
    for (const mat of model.materials) {
        if (mat.type === 'BETO') {
            lines.push(`MATE ${mat.id} 30000 GAM 25`);
        } else if (mat.type === 'STAH') {
            lines.push(`MATE ${mat.id} 210000 GAM 78.5`);
        }
    }

    // Sections — QB (Rechteck), QC (Kreis/Rohr) in m
    for (const sec of model.sections) {
        const matRef = `MNR ${sec.materialId}`;
        if (sec.type === 'SREC') {
            lines.push(`QB ${sec.id} ${matRef} B ${fmtNum(sec.params.B)}[m] H ${fmtNum(sec.params.H)}[m]`);
        } else if (sec.type === 'SCIR') {
            lines.push(`QC ${sec.id} ${matRef} D ${fmtNum(sec.params.D)}[m]`);
        } else if (sec.type === 'TUBE') {
            lines.push(`QC ${sec.id} ${matRef} D ${fmtNum(sec.params.D)}[m] T ${fmtNum(sec.params.T * 1000, 1)}[mm]`);
        }
    }

    lines.push('ENDE');
    return lines;
}

// ─── SOFIMSHC Block (for models with areas) ────────────────
function generateSOFIMSHC(model) {
    const lines = [];
    lines.push('+prog sofimshc urs:2');
    lines.push('HEAD Tragwerk');
    lines.push('SYST SPAC GDIR NEGZ');
    const hmin = model.meshSettings?.hmin || 0.5;
    lines.push('CTRL MESH 1');
    lines.push(`CTRL HMIN ${hmin.toFixed(2)}`);
    lines.push('');

    // SPT: all nodes — editor coords (x, z) → SOFIMSHC (X=x, Y=z, Z=0) for plate in XY plane
    lines.push(datComment('Structural Points'));
    lines.push('SPT NO       X         Y         Z         FIX');
    for (const node of model.nodes) {
        const sup = SUPPORT_TYPES[node.support];
        if (node.support === 'SPRING') {
            // Spring support: SPT with PZ fix, then CA stiffness
            lines.push(`    ${String(node.id).padStart(4)}${fmtCoord(node.x)}${fmtCoord(node.z)}${fmtCoord(0)}     PZ`);
            const stiffness = node.springStiffness || 1e6;
            lines.push(`SPT ${node.id} FIX PZ CA ${fmtNum(stiffness, 0)}`);
        } else {
            const fix = (sup && sup.fix) ? sup.fix : '';
            lines.push(`    ${String(node.id).padStart(4)}${fmtCoord(node.x)}${fmtCoord(node.z)}${fmtCoord(0)}     ${fix}`);
        }
    }
    lines.push('');

    // SLN: generate boundary lines from areas + beam lines + opening boundaries
    let nextSlnId = 1;
    const areaSlnMap = {}; // areaId → [slnIds]
    const beamSlnMap = {}; // beamId → slnId

    const edgeFixMap = { NONE: '', FIXED: 'F', PINNED: 'PP', ROLLER_X: 'XP', ROLLER_Z: 'PX' };

    // Boundary lines from areas (with edge supports)
    for (const area of (model.areas || [])) {
        const slnIds = [];
        const ids = area.boundaryNodeIds;
        const edgeSups = area.edgeSupports || [];
        for (let i = 0; i < ids.length; i++) {
            const n1 = ids[i];
            const n2 = ids[(i + 1) % ids.length];
            const slnId = nextSlnId++;
            const fix = edgeFixMap[edgeSups[i] || 'NONE'] || '';
            let slnLine = `SLN ${slnId}  ${n1}  ${n2}`;
            if (fix) slnLine += ` ; SLNS FIX ${fix}`;
            lines.push(slnLine);
            slnIds.push(slnId);
        }
        areaSlnMap[area.id] = slnIds;
    }

    // SLN for opening boundaries
    const openingSlnMap = {}; // openingId → [slnIds]
    for (const opening of (model.openings || [])) {
        const slnIds = [];
        const ids = opening.boundaryNodeIds;
        for (let i = 0; i < ids.length; i++) {
            const n1 = ids[i];
            const n2 = ids[(i + 1) % ids.length];
            const slnId = nextSlnId++;
            lines.push(`SLN ${slnId}  ${n1}  ${n2}`);
            slnIds.push(slnId);
        }
        openingSlnMap[opening.id] = slnIds;
    }

    // SLN for beams with SNO + STYP B (skip if edge overlaps area/opening boundary)
    const boundaryEdges = new Set();
    for (const area of (model.areas || [])) {
        const ids = area.boundaryNodeIds;
        for (let i = 0; i < ids.length; i++) {
            const e = [ids[i], ids[(i+1) % ids.length]].sort((a,b) => a-b).join(',');
            boundaryEdges.add(e);
        }
    }
    for (const opening of (model.openings || [])) {
        const ids = opening.boundaryNodeIds;
        for (let i = 0; i < ids.length; i++) {
            const e = [ids[i], ids[(i+1) % ids.length]].sort((a,b) => a-b).join(',');
            boundaryEdges.add(e);
        }
    }
    for (const beam of model.beams) {
        const e = [beam.nodeStart, beam.nodeEnd].sort((a,b) => a-b).join(',');
        if (boundaryEdges.has(e)) continue; // skip — already an area/opening boundary
        const slnId = nextSlnId++;
        beamSlnMap[beam.id] = slnId;
        if (beam.isStructLine) {
            lines.push(`SLN ${slnId}  ${beam.nodeStart}  ${beam.nodeEnd}`);
        } else {
            lines.push(`SLN ${slnId}  ${beam.nodeStart}  ${beam.nodeEnd}  SNO ${beam.sectionId} STYP B`);
        }
    }
    lines.push('');

    // SAR: structural areas with openings as inner boundaries
    for (const area of (model.areas || [])) {
        const slnIds = areaSlnMap[area.id] || [];
        lines.push(`SAR ${area.id}  T ${fmtNum(area.thickness)} GRP ${area.groupId} MNO ${area.materialId}`);
        // Collect opening SLN IDs for this area
        lines.push(`SARB OUT ${slnIds.join(',')}`);
        const areaOpenings = (model.openings || []).filter(o => o.areaId === area.id);
        for (const o of areaOpenings) {
            const oSlns = openingSlnMap[o.id] || [];
            if (oSlns.length > 0) {
                lines.push(`SARB IN ${oSlns.join(',')}`);
            }
        }
    }

    lines.push('END');
    return { lines, beamSlnMap };
}

// ─── SOFIMSHA Block ─────────────────────────────────────────
function generateSOFIMSHA(model) {
    const lines = [];
    lines.push('PROG SOFIMSHA urs:2');
    lines.push('KOPF Tragwerk');
    lines.push(`SYST ${model.meta.systemType}`);

    // Build node lookup
    const nodeMap = {};
    for (const node of model.nodes) nodeMap[node.id] = node;

    // Hinge handling: create duplicate nodes and springs
    let nextHingeNode = 9000;
    let nextFedeId = 9000;
    const hingeNodeMap = {}; // key: `${beamId}_start` or `${beamId}_end` → duplicateNodeId
    const hingeDuplicateNodes = []; // {id, x, z}
    const hingeSprings = []; // {id, nodeA, nodeB}

    for (const beam of model.beams) {
        if (beam.hingeStart) {
            const origNode = nodeMap[beam.nodeStart];
            if (origNode) {
                const dupId = nextHingeNode++;
                hingeNodeMap[`${beam.id}_start`] = dupId;
                hingeDuplicateNodes.push({ id: dupId, x: origNode.x, z: origNode.z });
                hingeSprings.push({ nodeA: beam.nodeStart, nodeB: dupId });
            }
        }
        if (beam.hingeEnd) {
            const origNode = nodeMap[beam.nodeEnd];
            if (origNode) {
                const dupId = nextHingeNode++;
                hingeNodeMap[`${beam.id}_end`] = dupId;
                hingeDuplicateNodes.push({ id: dupId, x: origNode.x, z: origNode.z });
                hingeSprings.push({ nodeA: beam.nodeEnd, nodeB: dupId });
            }
        }
    }

    // Nodes — RAHM: KNOT nr X Z (2D, no Y)
    for (const node of model.nodes) {
        let line = `KNOT ${String(node.id).padStart(4)}`;
        line += fmtCoord(node.x);
        line += fmtCoord(node.z);
        const sup = SUPPORT_TYPES[node.support];
        if (sup && sup.fix) {
            line += `  FIX ${sup.fix}`;
        }
        lines.push(line);
    }

    // Hinge duplicate nodes
    for (const dn of hingeDuplicateNodes) {
        lines.push(`KNOT ${String(dn.id).padStart(4)}${fmtCoord(dn.x)}${fmtCoord(dn.z)}  $ Gelenk-Duplikat`);
    }

    // Beams — substitute hinge duplicate node IDs
    for (const beam of model.beams) {
        const nStart = hingeNodeMap[`${beam.id}_start`] || beam.nodeStart;
        const nEnd = hingeNodeMap[`${beam.id}_end`] || beam.nodeEnd;
        let line = `STAB ${String(beam.id).padStart(4)}`;
        line += ` ${String(nStart).padStart(4)}`;
        line += ` ${String(nEnd).padStart(4)}`;
        line += ` QNR ${beam.sectionId}`;
        lines.push(line);
    }

    // Hinge springs (stiff translation coupling, no rotation)
    for (const sp of hingeSprings) {
        const fId1 = nextFedeId++;
        const fId2 = nextFedeId++;
        lines.push(`FEDE ${fId1} ${String(sp.nodeA).padStart(4)} ${String(sp.nodeB).padStart(4)} DX 1 0  CP 1E12  $ Gelenk X`);
        lines.push(`FEDE ${fId2} ${String(sp.nodeA).padStart(4)} ${String(sp.nodeB).padStart(4)} DX 0 1  CP 1E12  $ Gelenk Z`);
    }

    lines.push('ENDE');
    return lines;
}

// ─── SOFILOAD Block ─────────────────────────────────────────
function generateSOFILOAD(model, beamSlnMap = {}) {
    const hasAreas = (model.areas || []).length > 0;
    const lcEntries = [];
    for (const lc of model.loadcases) {
        const nodeLoads = lc.loads.filter(l => l.type === 'NODE_FORCE');
        const areaLoads = lc.loads.filter(l => l.type === 'AREA_LOAD');
        const beamLoads = lc.loads.filter(l => l.type === 'BEAM_LINE');
        if (nodeLoads.length > 0 || areaLoads.length > 0 || beamLoads.length > 0) {
            lcEntries.push({ lc, nodeLoads, areaLoads, beamLoads });
        }
    }
    if (lcEntries.length === 0) return [];

    const lines = [];
    lines.push('PROG SOFILOAD urs:3');
    lines.push('KOPF Lasten');

    for (const { lc, nodeLoads, areaLoads, beamLoads } of lcEntries) {
        lines.push(`LF ${lc.id}`);
        for (const load of nodeLoads) {
            const dir = load.direction;
            const val = fmtNum(load.value);
            if (dir === 'PZ' || dir === 'PZZ') {
                lines.push(`  KNOT ${load.nodeId} TYP PP P1 0 P2 ${val}`);
            } else {
                lines.push(`  KNOT ${load.nodeId} TYP PP P1 ${val} P2 0`);
            }
        }
        for (const load of areaLoads) {
            const area = (model.areas || []).find(a => a.id === load.areaId);
            const grp = area ? area.groupId : 0;
            lines.push(`  QUAD GRP ${grp} TYPE ${load.direction} P ${fmtNum(load.value)}`);
        }
        for (const load of beamLoads) {
            const slnId = beamSlnMap[load.elementId];
            if (slnId) {
                lines.push(`  LINE SLN ${slnId} TYPE ${load.direction} P1 ${fmtNum(load.p1)} P2 ${fmtNum(load.p2)}`);
            }
        }
    }

    lines.push('ENDE');
    return lines;
}

// ─── ASE Block (with beam loads via ELEM) ───────────────────
function generateASE(model) {
    const lines = [];
    lines.push('PROG ASE urs:4');
    lines.push('KOPF Berechnung');

    for (const lc of model.loadcases) {
        const beamLoads = lc.loads.filter(l => l.type === 'BEAM_LINE');
        const name = (lc.name || '').toLowerCase();
        const fakg = ['eigengewicht', 'dead load', 'g'].includes(name) ? ' FAKG 1.0' : '';
        lines.push(`LF ${lc.id}${fakg}`);
        for (const load of beamLoads) {
            lines.push(`  ELEM ${load.elementId} TYP ${load.direction} P1 ${fmtNum(load.p1)} P2 ${fmtNum(load.p2)}`);
        }
    }

    lines.push('ENDE');
    return lines;
}

// ─── RESULTS Block ──────────────────────────────────────────
function generateRESULTS(model) {
    const lines = [];
    const hasBeams = model.beams.length > 0;
    const hasAreas = (model.areas || []).length > 0;

    // Separate RESULTS blocks (RESULTS can only handle one type per run)
    lines.push('+PROG RESULTS urs:99');
    lines.push('HEAD Export Knotenverschiebungen');
    lines.push('PAGE UNII 0');
    lines.push('LC ALL');
    lines.push('NODE TYPE UX,UY,UZ,RX,RY,RZ REPR DLST');
    lines.push('END');
    lines.push('');

    if (hasBeams) {
        lines.push('+PROG RESULTS urs:100');
        lines.push('HEAD Export Stabkraefte');
        lines.push('PAGE UNII 0');
        lines.push('LC ALL');
        lines.push('BEAM TYPE N,VY,VZ,MT,MY,MZ REPR DLST');
        lines.push('END');
        lines.push('');
    }

    if (hasAreas) {
        lines.push('+PROG RESULTS urs:101');
        lines.push('HEAD Export Flaechenschnittkraefte');
        lines.push('PAGE UNII 0');
        lines.push('LC ALL');
        lines.push('QUAD TYPE MX,MY,MXY,VX,VY,NX,NY,NXY REPR DLST');
        lines.push('END');
    }

    return lines;
}

// ─── Main Generator ─────────────────────────────────────────
export function generateDat(model) {
    const lines = [];

    // Header
    lines.push(datComment('Generated by infraFEM Editor'));
    lines.push(datComment(today()));
    lines.push('');

    const hasAreas = (model.areas || []).length > 0;
    let beamSlnMap = {};

    // AQUA
    lines.push(...generateAQUA(model));
    lines.push('');

    // Mesh generator: SOFIMSHC for areas, SOFIMSHA for beams-only
    if (hasAreas) {
        const result = generateSOFIMSHC(model);
        lines.push(...result.lines);
        beamSlnMap = result.beamSlnMap;
    } else {
        lines.push(...generateSOFIMSHA(model));
    }
    lines.push('');

    // SOFILOAD (pass beamSlnMap for LINE SLN loads in SOFIMSHC models)
    const sofiloadLines = generateSOFILOAD(model, beamSlnMap);
    if (sofiloadLines.length > 0) {
        lines.push(...sofiloadLines);
        lines.push('');
    }

    // ASE
    lines.push(...generateASE(model));
    lines.push('');

    // RESULTS
    lines.push(...generateRESULTS(model));

    return lines.join('\n');
}

// ─── Download helper ────────────────────────────────────────
export function downloadDat(model) {
    const text = generateDat(model);
    const name = (model.meta.name || 'model').replace(/[^a-zA-Z0-9_-]/g, '_');
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.dat`;
    a.click();
    URL.revokeObjectURL(a.href);
}
