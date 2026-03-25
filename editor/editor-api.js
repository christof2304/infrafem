// editor-api.js — Server communication for save/load/calculate
// infraFEM Structural Editor

export class EditorAPI {
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;  // same origin — no CORS needed
    }

    async _fetch(path, opts = {}) {
        const res = await fetch(`${this.baseUrl}${path}`, {
            headers: { 'Content-Type': 'application/json', ...opts.headers },
            ...opts,
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`API ${res.status}: ${text}`);
        }
        return res;
    }

    // ── Model persistence ──────────────────────────────────
    async saveModel(name, modelJson) {
        await this._fetch('/api/editor/save', {
            method: 'POST',
            body: JSON.stringify({ name, model: modelJson }),
        });
    }

    async loadModel(name) {
        const res = await this._fetch(`/api/editor/load?name=${encodeURIComponent(name)}`);
        return res.json();
    }

    async listModels() {
        const res = await this._fetch('/api/editor/list');
        return res.json();
    }

    async deleteModel(name) {
        await this._fetch(`/api/editor/model?name=${encodeURIComponent(name)}`, {
            method: 'DELETE',
        });
    }

    // ── DAT generation ─────────────────────────────────────
    async generateDat(modelJson) {
        const res = await this._fetch('/api/editor/generate-dat', {
            method: 'POST',
            body: JSON.stringify(modelJson),
        });
        return res.text();
    }

    // ── Calculation ────────────────────────────────────────
    async calculate(modelJson) {
        const res = await this._fetch('/api/editor/calculate', {
            method: 'POST',
            body: JSON.stringify(modelJson),
        });
        return res.json(); // { success, sqlite, errors?, log? }
    }

    async getStatus(jobId) {
        const res = await this._fetch(`/api/editor/status/${jobId}`);
        return res.json();
    }

    // ── Open viewer with results ───────────────────────────
    openViewer(sqliteName) {
        this._fetch(`/api/databases/switch?name=${encodeURIComponent(sqliteName)}`, {
            method: 'POST',
        }).then(() => {
            window.open('/viewer/', '_blank');
        });
    }

    // ── Fetch results for deformation display ────────────
    async fetchResults(sqliteName) {
        // Switch DB first
        await this._fetch(`/api/databases/switch?name=${encodeURIComponent(sqliteName)}`, {
            method: 'POST',
        });
        // Fetch nodes, displacements, beam forces, quad forces, and element connectivity
        const [nodesRes, dispsRes, beamRes, quadRes, elemsRes] = await Promise.all([
            this._fetch('/api/model/nodes'),
            this._fetch('/api/results/node-displacements?lc=1'),
            this._fetch('/api/results/beam-forces?lc=1').catch(() => null),
            this._fetch('/api/results/quad-forces?lc=1').catch(() => null),
            this._fetch('/api/model/elements').catch(() => null),
        ]);
        const nodesData = await nodesRes.json();
        const dispsData = await dispsRes.json();
        const beamData = beamRes ? await beamRes.json() : { data: [] };
        const quadData = quadRes ? await quadRes.json() : { data: [] };
        const elemsData = elemsRes ? await elemsRes.json() : {};
        return {
            allNodes: nodesData.map(n => ({ id: n.nr, x: n.x, y: n.y, z: n.z })),
            nodes: dispsData.data.map(d => ({
                id: d.node_nr, uX: d.ux, uY: d.uy, uZ: d.uz,
            })),
            beams: (beamData.data || []).map(f => ({
                id: f.elem_nr, x: f.x, N: f.N, Vz: f.Vz, My: f.My,
            })),
            quads: (quadData.data || []).map(q => ({
                id: q.elem_nr, mxx: q.mxx, myy: q.myy, mxy: q.mxy,
                vx: q.vx, vy: q.vy,
            })),
            quadElements: (elemsData.quads || []).map(q => ({
                nr: q.nr, nodes: q.nodes, thickness: q.thickness?.[0] || 0,
            })),
            beamElements: (elemsData.beams || []).map(b => ({
                nr: b.nr, nodeStart: b.node_start, nodeEnd: b.node_end, length: b.length,
            })),
        };
    }
}
