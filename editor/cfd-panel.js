// cfd-panel.js — CFD wind analysis panel for bridge cross-sections
// Draws cross-section polygon, generates CFD mesh, displays results

import * as THREE from 'three';

/**
 * CFD Panel — floating panel for wind analysis setup and results.
 */
export class CFDPanel {
    constructor(model, canvas, api) {
        this.model = model;
        this.canvas = canvas;
        this.api = api;
        this.el = null;
        this.cfdGroup = new THREE.Group();
        this.canvas.scene.add(this.cfdGroup);

        this._meshData = null;
        this._sectionPolygon = null;
    }

    show() {
        if (this.el) this.el.remove();
        this.el = document.createElement('div');
        this.el.id = 'cfd-panel';
        this.el.style.cssText = `
            position: fixed; top: 60px; left: 60px; background: rgba(10,10,30,0.92);
            border: 1px solid #445; border-radius: 8px; padding: 14px 18px;
            z-index: 25; min-width: 220px; color: #c8d0e0; font-size: 12px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        `;
        this._render();
        document.body.appendChild(this.el);
    }

    hide() {
        if (this.el) { this.el.remove(); this.el = null; }
        this._clearMesh();
    }

    _render() {
        if (!this.el) return;
        this.el.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                <span style="color:#7eb8ff;font-weight:600;font-size:13px">CFD Windanalyse</span>
                <button id="cfd-close" style="background:none;border:none;color:#667;font-size:16px;cursor:pointer">&times;</button>
            </div>
            <div style="margin-bottom:8px;color:#8899aa;font-size:11px">
                Querschnitt aus selektierter Fläche oder Stäben extrahieren, dann CFD-Mesh generieren.
            </div>
            <div style="margin-bottom:6px">
                <label style="color:#8899aa;font-size:11px">Mesh-Größe [m]</label>
                <input type="number" id="cfd-mesh-size" value="0.2" step="0.05" min="0.05" max="2"
                    style="width:60px;background:#16162b;border:1px solid #334;border-radius:3px;color:#c8d0e0;padding:2px 6px;font-size:12px">
            </div>
            <div style="margin-bottom:6px">
                <label style="color:#8899aa;font-size:11px">Far-Field Faktor</label>
                <input type="number" id="cfd-ff" value="15" step="1" min="5" max="30"
                    style="width:60px;background:#16162b;border:1px solid #334;border-radius:3px;color:#c8d0e0;padding:2px 6px;font-size:12px">
            </div>
            <div style="margin-bottom:6px">
                <label style="color:#8899aa;font-size:11px">Windrichtung [°]</label>
                <input type="number" id="cfd-angle" value="0" step="5"
                    style="width:60px;background:#16162b;border:1px solid #334;border-radius:3px;color:#c8d0e0;padding:2px 6px;font-size:12px">
            </div>
            <button id="cfd-from-area" style="width:100%;padding:5px;background:rgba(126,184,255,0.15);border:1px solid #445;border-radius:4px;color:#7eb8ff;cursor:pointer;font-size:12px;margin-bottom:4px">
                Querschnitt aus Fläche
            </button>
            <button id="cfd-generate" style="width:100%;padding:5px;background:rgba(126,184,255,0.2);border:1px solid #7eb8ff;border-radius:4px;color:#7eb8ff;cursor:pointer;font-size:12px;font-weight:600;margin-bottom:8px">
                CFD Mesh generieren
            </button>
            <div id="cfd-status" style="font-size:11px;color:#667"></div>
            ${this._meshData ? this._renderStats() : ''}
        `;

        this.el.querySelector('#cfd-close').onclick = () => this.hide();

        this.el.querySelector('#cfd-from-area').onclick = () => {
            this._extractSectionFromArea();
        };

        this.el.querySelector('#cfd-generate').onclick = async () => {
            await this._generateMesh();
        };
    }

    _renderStats() {
        const s = this._meshData.stats;
        return `
            <div style="border-top:1px solid #334;padding-top:8px;margin-top:4px">
                <div style="color:#7eb8ff;font-size:11px;font-weight:600;margin-bottom:4px">Mesh-Statistik</div>
                <div style="font-size:11px;color:#8899aa">Knoten: ${s.n_nodes}</div>
                <div style="font-size:11px;color:#8899aa">Elemente: ${s.n_elements} (${s.n_triangles} Tri, ${s.n_quads} Quad)</div>
                <div style="font-size:11px;color:#8899aa">Oberfläche: ${s.n_section_nodes} Knoten</div>
                <div style="font-size:11px;color:#8899aa">Far-Field: R = ${s.far_field_r} m</div>
            </div>
        `;
    }

    _extractSectionFromArea() {
        const sel = this.model.selection;
        let polygon = null;

        if (sel.type === 'area') {
            const area = this.model.getArea(sel.id);
            if (area) {
                polygon = area.boundaryNodeIds.map(nid => {
                    const n = this.model.getNode(nid);
                    return n ? [n.x, n.z] : null;
                }).filter(Boolean);
            }
        }

        if (!polygon || polygon.length < 3) {
            // Try to use all nodes as polygon
            const nodes = this.model.data.nodes;
            if (nodes.length >= 3) {
                polygon = nodes.map(n => [n.x, n.z]);
            }
        }

        if (polygon && polygon.length >= 3) {
            this._sectionPolygon = polygon;
            this._visualizeSection(polygon);
            const status = this.el?.querySelector('#cfd-status');
            if (status) status.textContent = `Querschnitt: ${polygon.length} Punkte`;
        } else {
            alert('Keine Fläche selektiert oder zu wenige Knoten.');
        }
    }

    async _generateMesh() {
        if (!this._sectionPolygon || this._sectionPolygon.length < 3) {
            alert('Zuerst Querschnitt extrahieren (Fläche selektieren).');
            return;
        }

        const meshSize = parseFloat(this.el?.querySelector('#cfd-mesh-size')?.value || '0.2');
        const ffFactor = parseFloat(this.el?.querySelector('#cfd-ff')?.value || '15');
        const angle = parseFloat(this.el?.querySelector('#cfd-angle')?.value || '0');

        const status = this.el?.querySelector('#cfd-status');
        if (status) status.textContent = 'Mesh wird generiert...';

        try {
            const res = await fetch('/api/cfd/mesh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    polygon: this._sectionPolygon,
                    meshSize,
                    farFieldFactor: ffFactor,
                    windAngle: angle,
                }),
            });
            if (!res.ok) throw new Error(await res.text());
            this._meshData = await res.json();
            this._visualizeMesh(this._meshData);
            this._render(); // re-render to show stats
        } catch (err) {
            if (status) status.textContent = `Fehler: ${err.message}`;
            console.error('CFD mesh error:', err);
        }
    }

    _visualizeSection(polygon) {
        // Draw section polygon as bright outline
        this._clearMesh();
        const points = polygon.map(p => new THREE.Vector3(p[0], p[1], 0.01));
        points.push(points[0].clone()); // close
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({ color: 0xff8844, linewidth: 2 });
        this.cfdGroup.add(new THREE.Line(geo, mat));
    }

    _visualizeMesh(meshData) {
        this._clearMesh();
        const nodeMap = {};
        for (const n of meshData.nodes) {
            nodeMap[n.id] = new THREE.Vector3(n.x, n.y, 0);
        }

        // Draw triangles as wireframe
        const triPositions = [];
        for (const tri of meshData.triangles) {
            const [n1, n2, n3] = tri.nodes;
            const p1 = nodeMap[n1], p2 = nodeMap[n2], p3 = nodeMap[n3];
            if (!p1 || !p2 || !p3) continue;
            triPositions.push(p1.x, p1.y, 0, p2.x, p2.y, 0);
            triPositions.push(p2.x, p2.y, 0, p3.x, p3.y, 0);
            triPositions.push(p3.x, p3.y, 0, p1.x, p1.y, 0);
        }
        if (triPositions.length > 0) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(triPositions, 3));
            const mat = new THREE.LineBasicMaterial({ color: 0x334455, transparent: true, opacity: 0.4 });
            this.cfdGroup.add(new THREE.LineSegments(geo, mat));
        }

        // Draw quads as wireframe
        const quadPositions = [];
        for (const quad of (meshData.quads || [])) {
            const [n1, n2, n3, n4] = quad.nodes;
            const p1 = nodeMap[n1], p2 = nodeMap[n2], p3 = nodeMap[n3], p4 = nodeMap[n4];
            if (!p1 || !p2 || !p3 || !p4) continue;
            quadPositions.push(p1.x, p1.y, 0, p2.x, p2.y, 0);
            quadPositions.push(p2.x, p2.y, 0, p3.x, p3.y, 0);
            quadPositions.push(p3.x, p3.y, 0, p4.x, p4.y, 0);
            quadPositions.push(p4.x, p4.y, 0, p1.x, p1.y, 0);
        }
        if (quadPositions.length > 0) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(quadPositions, 3));
            const mat = new THREE.LineBasicMaterial({ color: 0x445566, transparent: true, opacity: 0.5 });
            this.cfdGroup.add(new THREE.LineSegments(geo, mat));
        }

        // Highlight section boundary
        const sectionNodes = new Set(meshData.boundary_section);
        const sectionPts = meshData.section_polygon.map(p => new THREE.Vector3(p[0], p[1], 0.02));
        sectionPts.push(sectionPts[0].clone());
        const secGeo = new THREE.BufferGeometry().setFromPoints(sectionPts);
        const secMat = new THREE.LineBasicMaterial({ color: 0xff6644, linewidth: 2 });
        this.cfdGroup.add(new THREE.Line(secGeo, secMat));

        // Fit camera to mesh
        const bounds = meshData.stats;
        this.canvas._fitCamera();
    }

    _clearMesh() {
        while (this.cfdGroup.children.length > 0) {
            const child = this.cfdGroup.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
            this.cfdGroup.remove(child);
        }
    }
}
