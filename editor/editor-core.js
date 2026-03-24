// editor-core.js — Parametric data model, Undo/Redo, EventBus
// infraFEM Structural Editor

// ─── EventBus ────────────────────────────────────────────────
export class EventBus {
    constructor() {
        this._listeners = {};
    }
    on(event, fn) {
        (this._listeners[event] ||= []).push(fn);
        return () => this.off(event, fn);
    }
    off(event, fn) {
        const arr = this._listeners[event];
        if (arr) this._listeners[event] = arr.filter(f => f !== fn);
    }
    emit(event, data) {
        for (const fn of this._listeners[event] || []) fn(data);
    }
}

// ─── Undo/Redo Stack ────────────────────────────────────────
export class UndoStack {
    constructor(maxSize = 100) {
        this._stack = [];
        this._index = -1;
        this._maxSize = maxSize;
    }
    push(snapshot) {
        // discard redo history
        this._stack.length = this._index + 1;
        this._stack.push(snapshot);
        if (this._stack.length > this._maxSize) this._stack.shift();
        this._index = this._stack.length - 1;
    }
    undo() {
        if (this._index > 0) return this._stack[--this._index];
        return null;
    }
    redo() {
        if (this._index < this._stack.length - 1) return this._stack[++this._index];
        return null;
    }
    get canUndo() { return this._index > 0; }
    get canRedo() { return this._index < this._stack.length - 1; }
}

// ─── Support Type Mapping ───────────────────────────────────
export const SUPPORT_TYPES = {
    NONE:     { fix: '',   label: 'Frei',           dofs: {} },
    FIXED:    { fix: 'F',  label: 'Einspannung',    dofs: { ux:true, uz:true, phiy:true } },
    PINNED:   { fix: 'PP', label: 'Gelenk',         dofs: { ux:true, uz:true } },
    ROLLER_X: { fix: 'XP', label: 'Verschieblich X', dofs: { uz:true } },
    ROLLER_Z: { fix: 'PX', label: 'Verschieblich Z', dofs: { ux:true } },
};

// ─── Section Type Definitions ───────────────────────────────
export const SECTION_TYPES = {
    SREC: { label: 'Rechteck', params: ['H', 'B'], units: ['m', 'm'] },
    SCIR: { label: 'Kreis',    params: ['D'],       units: ['m'] },
    TUBE: { label: 'Rohr',     params: ['D', 'T'],  units: ['m', 'mm'] },
};

// ─── Default Model ──────────────────────────────────────────
function createDefaultModel() {
    return {
        version: 1,
        meta: {
            name: 'Neues Modell',
            systemType: 'RAHM',
            gravityDirection: 'NEGZ',
        },
        materials: [
            { id: 1, type: 'BETO', grade: 'C 30', label: 'Beton C30' },
        ],
        sections: [
            { id: 1, type: 'SREC', materialId: 1, params: { H: 0.5, B: 0.3 }, label: '30/50' },
        ],
        nodes: [],
        groups: [
            { id: 1, name: 'Gruppe 1', color: '#5599dd' },
        ],
        beams: [],
        areas: [],
        loadcases: [
            { id: 1, name: 'Lastfall 1', type: 'NONE', loads: [] },
        ],
        analysisSettings: { type: 'LINE' },
        meshSettings: { hmin: 0.5 },
    };
}

// ─── EditorModel ────────────────────────────────────────────
export class EditorModel {
    constructor() {
        this.bus = new EventBus();
        this._undo = new UndoStack();
        this.data = createDefaultModel();
        this._selection = { type: null, id: null }; // {type:'node'|'beam'|'area', id:number}
        this._mode = 'SELECT'; // SELECT, NODE, BEAM, RECT, POLY, AREA, SUPPORT, LOAD, DELETE
        this._activeLoadcase = 1;
        this._saveSnapshot();

        // Result state
        this._resultData = null;      // { allNodes, nodes, beams } from fetchResults
        this._resultValid = false;     // true after successful calculation
        this._resultSqlite = null;     // sqlite file name for re-fetching
    }

    // ── Serialization ──────────────────────────────────────
    toJSON() { return JSON.parse(JSON.stringify(this.data)); }

    loadJSON(json) {
        this.data = JSON.parse(JSON.stringify(json));
        this._undo = new UndoStack();
        this._saveSnapshot();
        this._selection = { type: null, id: null };
        this.clearResults();
        this.bus.emit('model:loaded');
        this.bus.emit('model:changed');
        this.bus.emit('selection:changed', this._selection);
    }

    reset() {
        this.data = createDefaultModel();
        this._undo = new UndoStack();
        this._saveSnapshot();
        this._selection = { type: null, id: null };
        this._mode = 'SELECT';
        this.clearResults();
        this.bus.emit('model:loaded');
        this.bus.emit('model:changed');
        this.bus.emit('selection:changed', this._selection);
    }

    // ── Undo/Redo ──────────────────────────────────────────
    _saveSnapshot() {
        this._undo.push(JSON.stringify(this.data));
    }
    _commit() {
        this._saveSnapshot();
        // Invalidate results when model changes
        if (this._resultValid) {
            this._resultValid = false;
            this.bus.emit('results:invalidated');
        }
        this.bus.emit('model:changed');
    }

    // ── Result State ───────────────────────────────────────
    setResults(resultData, sqliteName) {
        this._resultData = resultData;
        this._resultSqlite = sqliteName;
        this._resultValid = true;
        this.bus.emit('results:loaded', resultData);
    }

    clearResults() {
        this._resultData = null;
        this._resultValid = false;
        this._resultSqlite = null;
        this.bus.emit('results:cleared');
    }

    get resultData() { return this._resultData; }
    get hasResults() { return this._resultValid && this._resultData !== null; }
    undo() {
        const snap = this._undo.undo();
        if (snap) {
            this.data = JSON.parse(snap);
            this.bus.emit('model:changed');
        }
    }
    redo() {
        const snap = this._undo.redo();
        if (snap) {
            this.data = JSON.parse(snap);
            this.bus.emit('model:changed');
        }
    }
    get canUndo() { return this._undo.canUndo; }
    get canRedo() { return this._undo.canRedo; }

    // ── Mode ───────────────────────────────────────────────
    get mode() { return this._mode; }
    set mode(m) {
        this._mode = m;
        this.bus.emit('mode:changed', m);
    }

    // ── Selection ──────────────────────────────────────────
    get selection() { return this._selection; }
    select(type, id) {
        this._selection = { type, id };
        this.bus.emit('selection:changed', this._selection);
    }
    selectMulti(nodeIds, beamIds) {
        this._selection = {
            type: 'multi',
            id: null,
            nodeIds: new Set(nodeIds),
            beamIds: new Set(beamIds),
        };
        this.bus.emit('selection:changed', this._selection);
    }
    toggleSelection(type, id) {
        // If already a multi-selection, add/remove from it
        const sel = this._selection;
        if (sel.type === 'multi') {
            const nodeIds = new Set(sel.nodeIds);
            const beamIds = new Set(sel.beamIds);
            if (type === 'node') {
                if (nodeIds.has(id)) nodeIds.delete(id); else nodeIds.add(id);
            } else if (type === 'beam') {
                if (beamIds.has(id)) beamIds.delete(id); else beamIds.add(id);
            }
            if (nodeIds.size === 0 && beamIds.size === 0) {
                this.deselect();
            } else {
                this.selectMulti(nodeIds, beamIds);
            }
        } else if (sel.type === 'node' || sel.type === 'beam') {
            // Convert single selection to multi
            const nodeIds = new Set();
            const beamIds = new Set();
            if (sel.type === 'node') nodeIds.add(sel.id);
            else if (sel.type === 'beam') beamIds.add(sel.id);
            if (type === 'node') {
                if (nodeIds.has(id)) nodeIds.delete(id); else nodeIds.add(id);
            } else if (type === 'beam') {
                if (beamIds.has(id)) beamIds.delete(id); else beamIds.add(id);
            }
            if (nodeIds.size === 0 && beamIds.size === 0) {
                this.deselect();
            } else {
                this.selectMulti(nodeIds, beamIds);
            }
        } else {
            // No selection yet, start fresh
            this.select(type, id);
        }
    }
    deselect() {
        this._selection = { type: null, id: null };
        this.bus.emit('selection:changed', this._selection);
    }

    isSelected(type, id) {
        const sel = this._selection;
        if (sel.type === 'multi') {
            if (type === 'node') return sel.nodeIds.has(id);
            if (type === 'beam') return sel.beamIds.has(id);
            return false;
        }
        return sel.type === type && sel.id === id;
    }

    // ── Active Loadcase ────────────────────────────────────
    get activeLoadcase() { return this._activeLoadcase; }
    set activeLoadcase(id) {
        this._activeLoadcase = id;
        this.bus.emit('loadcase:changed', id);
    }

    // ── ID Generation ──────────────────────────────────────
    _nextId(arr) {
        if (arr.length === 0) return 1;
        return Math.max(...arr.map(e => e.id)) + 1;
    }

    // ── Nodes ──────────────────────────────────────────────
    addNode(x, z, support = 'NONE') {
        const id = this._nextId(this.data.nodes);
        const node = { id, x: Math.round(x * 1000) / 1000, z: Math.round(z * 1000) / 1000, support };
        this.data.nodes.push(node);
        this._commit();
        return node;
    }
    updateNode(id, props) {
        const node = this.data.nodes.find(n => n.id === id);
        if (!node) return;
        Object.assign(node, props);
        if (node.x !== undefined) node.x = Math.round(node.x * 1000) / 1000;
        if (node.z !== undefined) node.z = Math.round(node.z * 1000) / 1000;
        this._commit();
    }
    deleteNode(id) {
        // also delete connected beams
        this.data.beams = this.data.beams.filter(b => b.nodeStart !== id && b.nodeEnd !== id);
        // also delete areas referencing this node (and their loads)
        const areaIdsToDelete = this.data.areas
            .filter(a => a.boundaryNodeIds.includes(id))
            .map(a => a.id);
        for (const areaId of areaIdsToDelete) {
            this.deleteArea(areaId);
        }
        // also delete node loads in all loadcases
        for (const lc of this.data.loadcases) {
            lc.loads = lc.loads.filter(l => !(l.type === 'NODE_FORCE' && l.nodeId === id));
        }
        this.data.nodes = this.data.nodes.filter(n => n.id !== id);
        this._commit();
    }
    getNode(id) { return this.data.nodes.find(n => n.id === id); }

    // ── Beams ──────────────────────────────────────────────
    addBeam(nodeStart, nodeEnd, sectionId = null, groupId = null) {
        if (nodeStart === nodeEnd) return null;
        // check for duplicate
        const dup = this.data.beams.find(b =>
            (b.nodeStart === nodeStart && b.nodeEnd === nodeEnd) ||
            (b.nodeStart === nodeEnd && b.nodeEnd === nodeStart));
        if (dup) return null;
        const id = this._nextId(this.data.beams);
        sectionId = sectionId || (this.data.sections[0]?.id || 1);
        groupId = groupId || (this.data.groups[0]?.id || 1);
        const beam = { id, nodeStart, nodeEnd, sectionId, groupId, hingeStart: false, hingeEnd: false };
        this.data.beams.push(beam);
        this._commit();
        return beam;
    }
    updateBeam(id, props) {
        const beam = this.data.beams.find(b => b.id === id);
        if (!beam) return;
        Object.assign(beam, props);
        this._commit();
    }
    deleteBeam(id) {
        // also delete beam loads
        for (const lc of this.data.loadcases) {
            lc.loads = lc.loads.filter(l => !(l.type === 'BEAM_LINE' && l.elementId === id));
        }
        this.data.beams = this.data.beams.filter(b => b.id !== id);
        this._commit();
    }
    getBeam(id) { return this.data.beams.find(b => b.id === id); }

    // ── Areas ──────────────────────────────────────────────
    addArea(boundaryNodeIds, thickness = 0.25, materialId = null, groupId = 0) {
        if (boundaryNodeIds.length < 3) return null;
        const id = this._nextId(this.data.areas);
        materialId = materialId || (this.data.materials[0]?.id || 1);
        // edgeSupports: per-edge support type, edge i = node[i]→node[(i+1)%n]
        const edgeSupports = boundaryNodeIds.map(() => 'PINNED');
        const area = { id, boundaryNodeIds: [...boundaryNodeIds], edgeSupports, thickness, materialId, groupId };
        this.data.areas.push(area);
        this._commit();
        return area;
    }
    updateArea(id, props) {
        const area = this.data.areas.find(a => a.id === id);
        if (!area) return;
        Object.assign(area, props);
        this._commit();
    }
    deleteArea(id) {
        // also delete AREA_LOAD loads referencing this area
        for (const lc of this.data.loadcases) {
            lc.loads = lc.loads.filter(l => !(l.type === 'AREA_LOAD' && l.areaId === id));
        }
        this.data.areas = this.data.areas.filter(a => a.id !== id);
        this._commit();
    }
    getArea(id) { return this.data.areas.find(a => a.id === id); }

    areaSize(areaId) {
        const area = this.getArea(areaId);
        if (!area || area.boundaryNodeIds.length < 3) return 0;
        // Shoelace formula
        let sum = 0;
        const ids = area.boundaryNodeIds;
        for (let i = 0; i < ids.length; i++) {
            const n1 = this.getNode(ids[i]);
            const n2 = this.getNode(ids[(i + 1) % ids.length]);
            if (!n1 || !n2) return 0;
            sum += n1.x * n2.z - n2.x * n1.z;
        }
        return Math.abs(sum) / 2;
    }

    beamLength(beamId) {
        const b = this.getBeam(beamId);
        if (!b) return 0;
        const n1 = this.getNode(b.nodeStart);
        const n2 = this.getNode(b.nodeEnd);
        if (!n1 || !n2) return 0;
        return Math.sqrt((n2.x - n1.x) ** 2 + (n2.z - n1.z) ** 2);
    }

    // ── Materials ──────────────────────────────────────────
    addMaterial(type, grade, label) {
        const id = this._nextId(this.data.materials);
        const mat = { id, type, grade, label };
        this.data.materials.push(mat);
        this._commit();
        return mat;
    }
    updateMaterial(id, props) {
        const mat = this.data.materials.find(m => m.id === id);
        if (!mat) return;
        Object.assign(mat, props);
        this._commit();
    }
    deleteMaterial(id) {
        // don't delete if referenced by section
        if (this.data.sections.some(s => s.materialId === id)) return false;
        this.data.materials = this.data.materials.filter(m => m.id !== id);
        this._commit();
        return true;
    }

    // ── Sections ───────────────────────────────────────────
    addSection(type, materialId, params, label) {
        const id = this._nextId(this.data.sections);
        const sec = { id, type, materialId, params: { ...params }, label };
        this.data.sections.push(sec);
        this._commit();
        return sec;
    }
    updateSection(id, props) {
        const sec = this.data.sections.find(s => s.id === id);
        if (!sec) return;
        if (props.params) props.params = { ...sec.params, ...props.params };
        Object.assign(sec, props);
        this._commit();
    }
    deleteSection(id) {
        if (this.data.beams.some(b => b.sectionId === id)) return false;
        this.data.sections = this.data.sections.filter(s => s.id !== id);
        this._commit();
        return true;
    }

    // ── Groups ─────────────────────────────────────────────
    addGroup(name, color) {
        const id = this._nextId(this.data.groups);
        const grp = { id, name, color };
        this.data.groups.push(grp);
        this._commit();
        return grp;
    }
    updateGroup(id, props) {
        const grp = this.data.groups.find(g => g.id === id);
        if (!grp) return;
        Object.assign(grp, props);
        this._commit();
    }
    deleteGroup(id) {
        if (this.data.beams.some(b => b.groupId === id)) return false;
        this.data.groups = this.data.groups.filter(g => g.id !== id);
        this._commit();
        return true;
    }

    // ── Loadcases ──────────────────────────────────────────
    addLoadcase(name, type = 'NONE') {
        const id = this._nextId(this.data.loadcases);
        const lc = { id, name, type, loads: [] };
        this.data.loadcases.push(lc);
        this._commit();
        return lc;
    }
    updateLoadcase(id, props) {
        const lc = this.data.loadcases.find(l => l.id === id);
        if (!lc) return;
        Object.assign(lc, props);
        this._commit();
    }
    deleteLoadcase(id) {
        if (this.data.loadcases.length <= 1) return false;
        this.data.loadcases = this.data.loadcases.filter(l => l.id !== id);
        if (this._activeLoadcase === id) {
            this._activeLoadcase = this.data.loadcases[0].id;
        }
        this._commit();
        return true;
    }

    // ── Loads ──────────────────────────────────────────────
    addLoad(loadcaseId, load) {
        const lc = this.data.loadcases.find(l => l.id === loadcaseId);
        if (!lc) return null;
        const id = lc.loads.length > 0 ? Math.max(...lc.loads.map(l => l.id || 0)) + 1 : 1;
        load = { id, ...load };
        lc.loads.push(load);
        this._commit();
        return load;
    }
    updateLoad(loadcaseId, loadId, props) {
        const lc = this.data.loadcases.find(l => l.id === loadcaseId);
        if (!lc) return;
        const load = lc.loads.find(l => l.id === loadId);
        if (!load) return;
        Object.assign(load, props);
        this._commit();
    }
    deleteLoad(loadcaseId, loadId) {
        const lc = this.data.loadcases.find(l => l.id === loadcaseId);
        if (!lc) return;
        lc.loads = lc.loads.filter(l => l.id !== loadId);
        this._commit();
    }

    // Get all loads for active loadcase
    getActiveLoads() {
        const lc = this.data.loadcases.find(l => l.id === this._activeLoadcase);
        return lc ? lc.loads : [];
    }

    // ── Find node near position ────────────────────────────
    findNodeNear(x, z, radius = 0.5) {
        let best = null, bestDist = radius;
        for (const n of this.data.nodes) {
            const d = Math.sqrt((n.x - x) ** 2 + (n.z - z) ** 2);
            if (d < bestDist) { best = n; bestDist = d; }
        }
        return best;
    }
}
