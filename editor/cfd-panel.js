// cfd-panel.js — CFD wind analysis panel for bridge cross-sections
// Draws cross-section polygon, generates CFD mesh, displays results

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { CFD_TEST_CASES } from './cfd-testcases.js';

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
        this._modelGroup = new THREE.Group();  // persists across _clearMesh
        this.canvas.scene.add(this.cfdGroup);
        this.canvas.scene.add(this._modelGroup);

        this._mode = '2d';
        this._meshData = null;
        this._solveResult = null;
        this._sectionPolygon = null;
    }

    show() {
        if (this.el) this.el.remove();
        this.el = document.createElement('div');
        this.el.id = 'cfd-panel';
        this.el.style.cssText = `
            position: fixed; top: 60px; left: 60px; background: rgba(10,10,30,0.92);
            border: 1px solid #445; border-radius: 8px; padding: 0;
            z-index: 25; min-width: 220px; color: #c8d0e0; font-size: 12px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.4); max-width: 260px;
        `;
        this._minimized = false;
        this._render();
        document.body.appendChild(this.el);
        this._makeDraggable();
    }

    hide() {
        if (this._dragMove) document.removeEventListener('mousemove', this._dragMove);
        if (this._dragUp) document.removeEventListener('mouseup', this._dragUp);
        if (this.el) { this.el.remove(); this.el = null; }
        this._clearMesh();
        this._clearModelGroup();
        document.getElementById('cfd-legend')?.remove();
    }

    _render() {
        if (!this.el) return;
        const min = this._minimized;
        const is3d = this._mode === '3d';
        const filteredCases = CFD_TEST_CASES.filter(tc => is3d ? tc.mode === '3d' : tc.mode !== '3d');
        const bH = this._solveResult?.building_height || this._selectedHeight || 40;
        this.el.innerHTML = `
            <div id="cfd-header" style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;cursor:grab;border-bottom:1px solid #334;user-select:none">
                <span style="color:#7eb8ff;font-weight:600;font-size:13px">CFD Windanalyse</span>
                <div style="display:flex;gap:4px">
                    <button id="cfd-minimize" style="background:none;border:none;color:#8899aa;font-size:14px;cursor:pointer;padding:0 4px" title="${min ? 'Maximieren' : 'Minimieren'}">${min ? '▼' : '▲'}</button>
                    <button id="cfd-close" style="background:none;border:none;color:#667;font-size:16px;cursor:pointer;padding:0 4px">&times;</button>
                </div>
            </div>
            <div id="cfd-body" style="padding:10px 14px;${min ? 'display:none' : ''}">
            <div style="margin-bottom:8px;display:flex;gap:4px">
                <button id="cfd-mode-2d" style="flex:1;padding:4px;border-radius:4px;border:1px solid ${is3d ? '#334' : '#7eb8ff'};background:${is3d ? 'transparent' : 'rgba(126,184,255,0.2)'};color:${is3d ? '#667' : '#7eb8ff'};cursor:pointer;font-size:11px;font-weight:600">2D Querschnitt</button>
                <button id="cfd-mode-3d" style="flex:1;padding:4px;border-radius:4px;border:1px solid ${is3d ? '#7eb8ff' : '#334'};background:${is3d ? 'rgba(126,184,255,0.2)' : 'transparent'};color:${is3d ? '#7eb8ff' : '#667'};cursor:pointer;font-size:11px;font-weight:600">3D Gebäude</button>
            </div>
            <div style="margin-bottom:8px">
                <label style="color:#8899aa;font-size:11px">Test-Case laden:</label>
                <select id="cfd-testcase" style="width:100%;background:#16162b;border:1px solid #334;border-radius:3px;color:#c8d0e0;padding:4px 6px;font-size:11px;margin-top:2px">
                    <option value="">— ${is3d ? 'Gebäude' : 'Querschnitt'} wählen —</option>
                    ${filteredCases.map((tc) => {
                        const origIdx = CFD_TEST_CASES.indexOf(tc);
                        return `<option value="${origIdx}">${tc.name}</option>`;
                    }).join('')}
                </select>
            </div>
            ${is3d ? `
            <div style="margin-bottom:8px">
                <label style="color:#8899aa;font-size:11px">oder 3D-Modell laden (GLB/STL):</label>
                <div style="display:flex;gap:4px;margin-top:3px">
                    <button id="cfd-upload-glb" style="flex:1;padding:4px;border-radius:4px;border:1px solid #445;background:rgba(255,170,68,0.15);color:#ffaa44;cursor:pointer;font-size:11px">
                        GLB/STL Upload
                    </button>
                    <input type="file" id="cfd-glb-input" accept=".glb,.stl" style="display:none">
                    <input type="number" id="cfd-scale" value="${this._stlScale || 1.0}" step="0.1" min="0.01" max="1000" title="Skalierungsfaktor (z.B. 0.001 für mm→m)"
                        style="width:60px;background:#16162b;border:1px solid #334;border-radius:3px;color:#c8d0e0;padding:2px 4px;font-size:11px">
                    <span style="color:#556;font-size:10px;align-self:center">Scale</span>
                    <button id="cfd-scale-apply" style="padding:2px 6px;border-radius:3px;border:1px solid #445;background:rgba(68,170,255,0.15);color:#44aaff;cursor:pointer;font-size:10px"
                        title="Vorschau mit neuem Scale aktualisieren">↻</button>
                </div>
                <div style="display:flex;gap:3px;margin-top:3px;align-items:center">
                    <button id="cfd-gizmo-toggle" style="padding:2px 6px;border-radius:3px;border:1px solid ${this._gizmoActive ? '#4fa' : '#445'};background:${this._gizmoActive ? 'rgba(68,255,136,0.2)' : 'rgba(68,170,255,0.1)'};color:${this._gizmoActive ? '#4fa' : '#8899aa'};cursor:pointer;font-size:10px"
                        title="Rotations-Gizmo ein/aus">⟳ Gizmo</button>
                    <span id="cfd-rot-readout" style="color:#667;font-size:9px">${Math.round(this._stlRotX||0)}° ${Math.round(this._stlRotY||0)}° ${Math.round(this._stlRotZ||0)}°</span>
                    <button id="cfd-rot-reset" style="padding:1px 4px;border-radius:3px;border:1px solid #334;background:none;color:#556;cursor:pointer;font-size:9px" title="Rotation zurücksetzen">0°</button>
                </div>
                ${this._stlFileName && this._stlBounds ? (() => {
                    const s = this._stlScale || 1;
                    const b = this._stlBounds;
                    const dx = ((b.max[0] - b.min[0]) * s).toFixed(1);
                    const dy = ((b.max[1] - b.min[1]) * s).toFixed(1);
                    const dz = ((b.max[2] - b.min[2]) * s).toFixed(1);
                    return `<div style="font-size:10px;color:#44ff44;margin-top:2px">${this._stlFileName} — ${dx}×${dy}×${dz} m (×${s})</div>`;
                })() : this._stlFileName ? `<div style="font-size:10px;color:#44ff44;margin-top:2px">${this._stlFileName}</div>` : ''}
            </div>
            <div style="margin-bottom:6px">
                <label style="color:#8899aa;font-size:11px">Gebäudehöhe [m]</label>
                <input type="number" id="cfd-height" value="${this._selectedHeight || 40}" step="5" min="5" max="500"
                    style="width:60px;background:#16162b;border:1px solid #334;border-radius:3px;color:#c8d0e0;padding:2px 6px;font-size:12px">
            </div>
            <div style="margin-bottom:6px">
                <label style="color:#8899aa;font-size:11px">Rauhigkeit z₀ [m]</label>
                <input type="number" id="cfd-z0" value="${this._selectedZ0 || 0.1}" step="0.05" min="0.001" max="2"
                    style="width:60px;background:#16162b;border:1px solid #334;border-radius:3px;color:#c8d0e0;padding:2px 6px;font-size:12px">
            </div>
            ` : ''}
            <div style="margin-bottom:6px">
                <label style="color:#8899aa;font-size:11px">Berechnungsraum: <span id="cfd-domain-val" style="color:#c8d0e0">${this._domainSize || (is3d ? 3 : 15)}×</span></label>
                <input type="range" id="cfd-domain-size" min="${is3d ? '2' : '8'}" max="${is3d ? '8' : '30'}" value="${this._domainSize || (is3d ? 3 : 15)}" step="1"
                    style="width:100%;height:4px;accent-color:#7eb8ff;cursor:pointer">
                <div style="display:flex;justify-content:space-between;font-size:9px;color:#556">
                    <span>klein</span><span>groß</span>
                </div>
            </div>
            <div style="margin-bottom:6px">
                <label style="color:#8899aa;font-size:11px">Mesh-Dichte: <span id="cfd-mesh-val" style="color:#c8d0e0">${this._meshDensity || 50}%</span></label>
                <input type="range" id="cfd-mesh-density" min="10" max="100" value="${this._meshDensity || 50}" step="5"
                    style="width:100%;height:4px;accent-color:#44ff44;cursor:pointer">
                <div style="display:flex;justify-content:space-between;font-size:9px;color:#556">
                    <span>grob (schnell)</span><span>fein (langsam)</span>
                </div>
            </div>
            <div style="display:flex;gap:8px;margin-bottom:6px">
                <div>
                    <label style="color:#8899aa;font-size:11px">Wind [m/s]</label>
                    <input type="number" id="cfd-windspeed" value="${this._windSpeed || 20}" step="5" min="1" max="200"
                        style="width:55px;background:#16162b;border:1px solid #334;border-radius:3px;color:#c8d0e0;padding:2px 6px;font-size:12px">
                </div>
                <div>
                    <label style="color:#8899aa;font-size:11px">Richtung [°]</label>
                    <input type="number" id="cfd-angle" value="0" step="5"
                        style="width:55px;background:#16162b;border:1px solid #334;border-radius:3px;color:#c8d0e0;padding:2px 6px;font-size:12px">
                </div>
            </div>
            ${!is3d ? `
            <div style="margin-bottom:6px;display:flex;align-items:center;gap:6px">
                <input type="checkbox" id="cfd-transient" style="accent-color:#7eb8ff">
                <label for="cfd-transient" style="color:#8899aa;font-size:11px">Transient (Wirbelablösung)</label>
            </div>
            <div id="cfd-transient-opts" style="display:none;margin-bottom:6px;padding-left:20px">
                <div style="margin-bottom:4px">
                    <label style="color:#667;font-size:10px">Endzeit [s]</label>
                    <input type="number" id="cfd-endtime" value="2" step="0.5" min="0.5" max="20"
                        style="width:50px;background:#16162b;border:1px solid #334;border-radius:3px;color:#c8d0e0;padding:2px 4px;font-size:11px">
                </div>
                <div>
                    <label style="color:#667;font-size:10px">Zeitschritt [s]</label>
                    <input type="number" id="cfd-dt" value="0.002" step="0.001" min="0.0001" max="0.1"
                        style="width:60px;background:#16162b;border:1px solid #334;border-radius:3px;color:#c8d0e0;padding:2px 4px;font-size:11px">
                </div>
            </div>
            ` : ''}
            ${!is3d ? `<button id="cfd-from-area" style="width:100%;padding:5px;background:rgba(126,184,255,0.15);border:1px solid #445;border-radius:4px;color:#7eb8ff;cursor:pointer;font-size:12px;margin-bottom:4px">
                Querschnitt aus Fläche
            </button>
            <button id="cfd-generate" style="width:100%;padding:5px;background:rgba(126,184,255,0.2);border:1px solid #7eb8ff;border-radius:4px;color:#7eb8ff;cursor:pointer;font-size:12px;font-weight:600;margin-bottom:4px">
                CFD Mesh generieren
            </button>` : ''}
            <button id="cfd-solve" style="width:100%;padding:5px;background:rgba(68,255,68,0.15);border:1px solid #4a4;border-radius:4px;color:#4d4;cursor:pointer;font-size:12px;font-weight:600;margin-bottom:8px">
                ▶ OpenFOAM ${is3d ? '3D' : ''} Berechnung starten
            </button>
            ${this._solveResult ? `
            <div style="margin-bottom:6px">
                <label style="color:#8899aa;font-size:11px">Ergebnis-Feld:</label>
                <select id="cfd-field" style="width:100%;background:#16162b;border:1px solid #334;border-radius:3px;color:#c8d0e0;padding:3px 6px;font-size:11px;margin-top:2px">
                    <option value="pressure" ${this._activeField === 'pressure' ? 'selected' : ''}>Druck (p)</option>
                    <option value="speed" ${this._activeField === 'speed' ? 'selected' : ''}>Geschwindigkeit (|U|)</option>
                    ${!is3d ? `<option value="vorticity" ${this._activeField === 'vorticity' ? 'selected' : ''}>Vorticity (ωz)</option>` : ''}
                    <option value="turb_k" ${this._activeField === 'turb_k' ? 'selected' : ''}>Turbulente Energie (k)</option>
                </select>
            </div>` : ''}
            ${this._solveResult && is3d ? `
            <div style="border-top:1px solid #334;padding-top:8px;margin-top:4px">
                <div style="color:#7eb8ff;font-size:11px;font-weight:600;margin-bottom:4px">Schnittebenen</div>
                <div style="margin-bottom:4px">
                    <label style="color:#8899aa;font-size:10px">Horizontal z = <span id="cfd-slice-z-val">${Math.round(bH / 2)}</span> m</label>
                    <input type="range" id="cfd-slice-z" min="1" max="${Math.round(bH * 1.5)}" value="${Math.round(bH / 2)}" step="1"
                        style="width:100%;height:4px;accent-color:#7eb8ff;cursor:pointer">
                </div>
                <div style="margin-bottom:4px">
                    <label style="color:#8899aa;font-size:10px">Vertikal y = <span id="cfd-slice-y-val">0</span> m</label>
                    <input type="range" id="cfd-slice-y" min="${Math.round(-bH * 2)}" max="${Math.round(bH * 2)}" value="0" step="1"
                        style="width:100%;height:4px;accent-color:#ffaa44;cursor:pointer">
                </div>
                <div style="display:flex;gap:4px;margin-bottom:4px">
                    <button id="cfd-slice-hz" style="flex:1;padding:3px;border-radius:3px;border:1px solid #445;background:rgba(126,184,255,0.15);color:#7eb8ff;cursor:pointer;font-size:10px">Horizontal</button>
                    <button id="cfd-slice-vt" style="flex:1;padding:3px;border-radius:3px;border:1px solid #445;background:rgba(255,170,68,0.15);color:#ffaa44;cursor:pointer;font-size:10px">Vertikal</button>
                </div>
            </div>
            ` : ''}
            ${this._solveResult ? `
            <div style="${is3d ? '' : 'border-top:1px solid #334;padding-top:6px;margin-top:4px;'}">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
                    <input type="checkbox" id="cfd-vectors" ${this._showVectors ? 'checked' : ''} style="accent-color:#44ff44">
                    <label for="cfd-vectors" style="color:#8899aa;font-size:10px">Geschwindigkeitsvektoren</label>
                </div>
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
                    <input type="checkbox" id="cfd-streamlines-cb" ${this._showStreamlines ? 'checked' : ''} style="accent-color:#4fa">
                    <label for="cfd-streamlines-cb" style="color:#8899aa;font-size:10px">Stromlinien</label>
                </div>
                <div id="cfd-streamline-opts" style="display:${this._showStreamlines ? 'block' : 'none'};margin-left:18px;margin-bottom:3px">
                    <div style="display:flex;align-items:center;gap:4px;margin-bottom:2px">
                        <label style="color:#667;font-size:9px;white-space:nowrap">Höhe:</label>
                        <input type="range" id="cfd-sl-zmin" min="0" max="100" value="${this._slZminPct || 0}" style="width:40px;accent-color:#4fa" title="Seed Z min">
                        <input type="range" id="cfd-sl-zmax" min="0" max="100" value="${this._slZmaxPct || 100}" style="width:40px;accent-color:#4fa" title="Seed Z max">
                        <span id="cfd-sl-zlabel" style="color:#8899aa;font-size:9px">${this._slZminPct || 0}–${this._slZmaxPct || 100}%H</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:4px">
                        <label style="color:#667;font-size:9px;white-space:nowrap">Anzahl:</label>
                        <input type="range" id="cfd-sl-nseeds" min="10" max="150" step="10" value="${this._slNSeeds || 40}" style="width:80px;accent-color:#4fa">
                        <span id="cfd-sl-nlabel" style="color:#8899aa;font-size:9px">${this._slNSeeds || 40}</span>
                    </div>
                </div>
            </div>
            ` : ''}
            <div id="cfd-status" style="font-size:11px;color:#667"></div>
            ${this._meshData ? this._renderStats() : ''}
            ${this._solveResult ? this._renderForceCoeffs() : ''}
            ${this._solveResult?.field?.force_history ? this._renderForceHistory() : ''}
            ${this._solveResult?.field?.time_steps?.length > 1 ? this._renderAnimationControls() : ''}
            ${this._solveResult?.mesh_stats ? this._render3dStats() : ''}
            </div>
        `;

        this.el.querySelector('#cfd-close').onclick = () => this.hide();
        this.el.querySelector('#cfd-minimize').onclick = () => {
            this._minimized = !this._minimized;
            this._render();
            this._makeDraggable();
        };
        this._makeDraggable();

        if (this._minimized) return; // No body bindings when minimized

        // Mode toggle
        this.el.querySelector('#cfd-mode-2d').onclick = () => { this._mode = '2d'; this._solveResult = null; this._render(); this._makeDraggable(); };
        this.el.querySelector('#cfd-mode-3d').onclick = () => { this._mode = '3d'; this._solveResult = null; this._render(); this._makeDraggable(); };

        // GLB/STL upload
        const uploadBtn = this.el.querySelector('#cfd-upload-glb');
        const glbInput = this.el.querySelector('#cfd-glb-input');
        if (uploadBtn && glbInput) {
            uploadBtn.onclick = () => glbInput.click();
            glbInput.onchange = async () => {
                const file = glbInput.files?.[0];
                if (!file) return;
                this._stlFileName = file.name;
                // Upload to server
                const formData = new FormData();
                formData.append('file', file);
                try {
                    const res = await fetch('/api/cfd/upload-model', { method: 'POST', body: formData });
                    if (!res.ok) throw new Error(await res.text());
                    const data = await res.json();
                    this._stlServerPath = data.path;
                    this._stlBounds = data.bounds;
                    this._stlModelUrl = data.url;
                    this._selectedHeight = data.height;
                    // Show original dimensions so user can judge scale
                    const bb = data.bounds;
                    const dx = (bb.max[0] - bb.min[0]).toFixed(1);
                    const dy = (bb.max[1] - bb.min[1]).toFixed(1);
                    const dz = (bb.max[2] - bb.min[2]).toFixed(1);
                    const status = this.el?.querySelector('#cfd-status');
                    if (status) { status.textContent = `${file.name}: ${dx}×${dy}×${dz} m, ${data.faces} Dreiecke`; status.style.color = '#44ff44'; }
                    // Update height field
                    const hInput = this.el.querySelector('#cfd-height');
                    if (hInput) hInput.value = Math.round(data.height);
                    this._render(); this._makeDraggable();
                    // Show 3D model preview
                    this._visualize3dFromBounds(data.bounds, data.height, data.url);
                } catch (e) {
                    console.error('Upload error:', e);
                    const status = this.el?.querySelector('#cfd-status');
                    if (status) { status.textContent = `Upload-Fehler: ${e.message}`; status.style.color = '#ff4444'; }
                }
            };
        }

        // Scale apply button — reload model with new scale
        const scaleApplyBtn = this.el.querySelector('#cfd-scale-apply');
        if (scaleApplyBtn) {
            scaleApplyBtn.onclick = () => {
                this._stlScale = parseFloat(this.el.querySelector('#cfd-scale')?.value || '1');
                this._detachGizmo();
                this._reloadModelPreview();
            };
        }

        // Gizmo toggle
        const gizmoBtn = this.el.querySelector('#cfd-gizmo-toggle');
        if (gizmoBtn) {
            gizmoBtn.onclick = () => {
                if (this._gizmoActive) {
                    this._detachGizmo();
                } else {
                    this._attachGizmo();
                }
                this._gizmoActive = !this._gizmoActive;
                gizmoBtn.style.borderColor = this._gizmoActive ? '#4fa' : '#445';
                gizmoBtn.style.background = this._gizmoActive ? 'rgba(68,255,136,0.2)' : 'rgba(68,170,255,0.1)';
                gizmoBtn.style.color = this._gizmoActive ? '#4fa' : '#8899aa';
            };
        }

        // Rotation reset
        const rotResetBtn = this.el.querySelector('#cfd-rot-reset');
        if (rotResetBtn) {
            rotResetBtn.onclick = () => {
                this._stlRotX = 0; this._stlRotY = 0; this._stlRotZ = 0;
                this._detachGizmo();
                this._reloadModelPreview();
            };
        }

        // Domain size + mesh density sliders
        const domSlider = this.el.querySelector('#cfd-domain-size');
        const meshSlider = this.el.querySelector('#cfd-mesh-density');
        if (domSlider) {
            domSlider.oninput = () => {
                this._domainSize = parseInt(domSlider.value);
                this.el.querySelector('#cfd-domain-val').textContent = domSlider.value + '×';
            };
        }
        if (meshSlider) {
            meshSlider.oninput = () => {
                this._meshDensity = parseInt(meshSlider.value);
                this.el.querySelector('#cfd-mesh-val').textContent = meshSlider.value + '%';
            };
        }

        // Test case selector
        this.el.querySelector('#cfd-testcase').onchange = (e) => {
            const idx = parseInt(e.target.value);
            if (isNaN(idx)) return;
            const tc = CFD_TEST_CASES[idx];
            if (!tc) return;
            this._sectionPolygon = tc.polygon;
            this._selectedTestCase = tc;
            this._selectedBuildings = tc.buildings || null;
            // Set wind speed from test case
            if (tc.windSpeed) {
                this._windSpeed = tc.windSpeed;
                const wsInput = this.el.querySelector('#cfd-windspeed');
                if (wsInput) wsInput.value = tc.windSpeed;
            }
            // 3D-specific
            if (tc.mode === '3d') {
                this._selectedHeight = tc.buildings ? Math.max(...tc.buildings.map(b => b.height)) : tc.height;
                this._selectedZ0 = tc.z0 || 0.1;
                const hInput = this.el.querySelector('#cfd-height');
                const z0Input = this.el.querySelector('#cfd-z0');
                if (hInput) hInput.value = this._selectedHeight;
                if (z0Input) z0Input.value = tc.z0 || 0.1;
                if (tc.buildings) {
                    this._visualize3dMultiBuilding(tc.buildings);
                } else {
                    this._visualize3dPreview(tc.polygon, tc.height);
                }
            } else {
                this._visualizeSection(tc.polygon);
            }
            const status = this.el.querySelector('#cfd-status');
            if (status) {
                const bldInfo = tc.buildings ? `${tc.buildings.length} Gebäude, H_max=${Math.max(...tc.buildings.map(b=>b.height))}m` : `${tc.polygon.length} Punkte${tc.height ? ', H=' + tc.height + 'm' : ''}`;
                status.textContent = `${tc.name}: ${bldInfo}, v=${tc.windSpeed} m/s`;
                status.style.color = '#44ff44';
            }
        };

        const fromArea = this.el.querySelector('#cfd-from-area');
        if (fromArea) fromArea.onclick = () => this._extractSectionFromArea();

        const genBtn = this.el.querySelector('#cfd-generate');
        if (genBtn) genBtn.onclick = async () => await this._generateMesh();

        this.el.querySelector('#cfd-solve').onclick = async () => {
            if (this._solving) return;
            this._setSolving(true);
            try {
                if (this._mode === '3d' && this._stlServerPath) {
                    await this._runSolverSTL();
                } else if (this._mode === '3d') {
                    await this._runSolver3d();
                } else {
                    await this._runSolver();
                }
            } finally {
                this._setSolving(false);
            }
        };

        // Field selector
        const fieldSel = this.el.querySelector('#cfd-field');
        if (fieldSel && this._solveResult) {
            fieldSel.onchange = () => {
                this._activeField = fieldSel.value;
                if (this._mode === '3d') {
                    this._fetchAndShowSlice(); // Re-fetch slice with new field
                } else if (this._solveResult.field) {
                    this._visualizeField(this._solveResult.field, fieldSel.value);
                }
            };
        }

        // 3D Slice controls
        const sliceZ = this.el.querySelector('#cfd-slice-z');
        const sliceY = this.el.querySelector('#cfd-slice-y');
        if (sliceZ) {
            sliceZ.oninput = () => {
                this.el.querySelector('#cfd-slice-z-val').textContent = sliceZ.value;
            };
        }
        if (sliceY) {
            sliceY.oninput = () => {
                this.el.querySelector('#cfd-slice-y-val').textContent = sliceY.value;
            };
        }
        const sliceHzBtn = this.el.querySelector('#cfd-slice-hz');
        const sliceVtBtn = this.el.querySelector('#cfd-slice-vt');
        if (sliceHzBtn) sliceHzBtn.onclick = () => { this._slicePlane = 'z'; this._fetchAndShowSlice(); };
        if (sliceVtBtn) sliceVtBtn.onclick = () => { this._slicePlane = 'y'; this._fetchAndShowSlice(); };
        const vecCb = this.el?.querySelector('#cfd-vectors');
        if (vecCb) vecCb.onchange = () => {
            this._showVectors = vecCb.checked;
            if (this._mode === '3d') {
                this._fetchAndShowSlice();
            } else {
                this._redraw2dOverlays();
            }
        };
        const slCb = this.el?.querySelector('#cfd-streamlines-cb');
        if (slCb) slCb.onchange = () => {
            this._showStreamlines = slCb.checked;
            const optsDiv = this.el?.querySelector('#cfd-streamline-opts');
            if (optsDiv) optsDiv.style.display = slCb.checked ? 'block' : 'none';
            if (this._mode === '3d') {
                if (slCb.checked) this._fetchStreamlines();
                else { this._streamlineData = null; this._fetchAndShowSlice(); }
            } else {
                this._redraw2dOverlays();
            }
        };
        // Streamline height sliders
        const slZmin = this.el?.querySelector('#cfd-sl-zmin');
        const slZmax = this.el?.querySelector('#cfd-sl-zmax');
        const slZlabel = this.el?.querySelector('#cfd-sl-zlabel');
        const updateSlLabel = () => {
            if (slZmin && slZmax && slZlabel) {
                const lo = parseInt(slZmin.value), hi = parseInt(slZmax.value);
                this._slZminPct = lo; this._slZmaxPct = hi;
                slZlabel.textContent = `${lo}–${hi}%H`;
            }
        };
        if (slZmin) slZmin.oninput = updateSlLabel;
        if (slZmax) { slZmax.oninput = updateSlLabel; slZmax.onchange = () => { if (this._showStreamlines && this._mode === '3d') this._fetchStreamlines(); }; }
        if (slZmin) slZmin.onchange = () => { if (this._showStreamlines && this._mode === '3d') this._fetchStreamlines(); };
        const slNSeeds = this.el?.querySelector('#cfd-sl-nseeds');
        const slNLabel = this.el?.querySelector('#cfd-sl-nlabel');
        if (slNSeeds) {
            slNSeeds.oninput = () => { this._slNSeeds = parseInt(slNSeeds.value); if (slNLabel) slNLabel.textContent = slNSeeds.value; };
            slNSeeds.onchange = () => { if (this._showStreamlines) { if (this._mode === '3d') this._fetchStreamlines(); else this._redraw2dOverlays(); } };
        }

        // Transient toggle
        const transCb = this.el.querySelector('#cfd-transient');
        if (transCb) {
            transCb.onchange = () => {
                const opts = this.el.querySelector('#cfd-transient-opts');
                if (opts) opts.style.display = transCb.checked ? 'block' : 'none';
            };
        }
    }

    _renderForceCoeffs() {
        const fc = this._solveResult?.force_coefficients;
        if (!fc) return '<div style="color:#ff6644;font-size:11px;margin-top:4px">Keine Koeffizienten (Solver-Fehler?)</div>';
        return `
            <div style="border-top:1px solid #334;padding-top:8px;margin-top:4px">
                <div style="color:#44ff44;font-size:11px;font-weight:600;margin-bottom:4px">Windlast-Koeffizienten</div>
                <div style="font-size:12px;color:#c8d0e0">c<sub>D</sub> = ${fc.Cd?.toFixed(4) || '—'}</div>
                <div style="font-size:12px;color:#c8d0e0">c<sub>L</sub> = ${fc.Cl?.toFixed(4) || '—'}</div>
                <div style="font-size:12px;color:#c8d0e0">c<sub>M</sub> = ${fc.Cm?.toFixed(4) || '—'}</div>
            </div>
        `;
    }

    _renderStats() {
        const s = this._meshData.stats;
        const f = this._solveResult?.field;
        const nCells = f?.n_cells || s.n_elements || 0;
        // simpleFoam solves p + U(2 components 2D) + k + epsilon + nut = 6 fields per cell
        const nFields = 6;
        const dof = nCells * nFields;
        return `
            <div style="border-top:1px solid #334;padding-top:8px;margin-top:4px">
                <div style="color:#7eb8ff;font-size:11px;font-weight:600;margin-bottom:4px">Mesh-Statistik</div>
                <div style="font-size:11px;color:#8899aa">Knoten: ${s.n_nodes?.toLocaleString()}</div>
                <div style="font-size:11px;color:#8899aa">Zellen: ${(nCells || s.n_elements)?.toLocaleString()} (${s.n_triangles} Tri, ${s.n_quads} Quad)</div>
                ${dof ? `<div style="font-size:11px;color:#c8d0e0;font-weight:600">DOF: ${dof.toLocaleString()} (${nCells.toLocaleString()} × ${nFields} Felder)</div>` : ''}
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

    _setSolving(active) {
        this._solving = active;
        const btn = this.el?.querySelector('#cfd-solve');
        if (!btn) return;

        if (active) {
            this._solveStart = Date.now();
            btn.disabled = true;
            btn.style.cursor = 'wait';
            btn.style.background = 'rgba(255,170,68,0.25)';
            btn.style.borderColor = '#ffaa44';
            btn.style.color = '#ffaa44';
            // Show DOF estimate if mesh data available
            const nCells = this._meshData?.stats?.n_elements || 0;
            const dofStr = nCells ? ` · ${(nCells * 6).toLocaleString()} DOF` : '';
            btn.innerHTML = `<span class="cfd-spinner"></span> Berechnung läuft…${dofStr} <span id="cfd-timer">0s</span>`;

            // Add spinner CSS if not exists
            if (!document.getElementById('cfd-spinner-style')) {
                const style = document.createElement('style');
                style.id = 'cfd-spinner-style';
                style.textContent = `
                    @keyframes cfd-spin { to { transform: rotate(360deg); } }
                    .cfd-spinner {
                        display: inline-block; width: 12px; height: 12px;
                        border: 2px solid rgba(255,170,68,0.3); border-top-color: #ffaa44;
                        border-radius: 50%; animation: cfd-spin 0.8s linear infinite;
                        vertical-align: middle; margin-right: 4px;
                    }
                    @keyframes cfd-pulse { 0%,100% { box-shadow: 0 0 4px rgba(255,170,68,0.3); } 50% { box-shadow: 0 0 12px rgba(255,170,68,0.6); } }
                    #cfd-solve[disabled] { animation: cfd-pulse 2s ease-in-out infinite; }
                `;
                document.head.appendChild(style);
            }

            // Timer update
            this._solveTimer = setInterval(() => {
                const el = document.getElementById('cfd-timer');
                if (el) {
                    const sec = Math.round((Date.now() - this._solveStart) / 1000);
                    const m = Math.floor(sec / 60), s = sec % 60;
                    el.textContent = m > 0 ? `${m}m ${s}s` : `${s}s`;
                }
            }, 1000);
        } else {
            if (this._solveTimer) { clearInterval(this._solveTimer); this._solveTimer = null; }
            const elapsed = Math.round((Date.now() - (this._solveStart || Date.now())) / 1000);
            const m = Math.floor(elapsed / 60), s = elapsed % 60;
            const timeStr = m > 0 ? `${m}m ${s}s` : `${s}s`;
            btn.disabled = false;
            btn.style.cursor = 'pointer';
            btn.style.background = 'rgba(68,255,68,0.15)';
            btn.style.borderColor = '#4a4';
            btn.style.color = '#4d4';
            btn.style.animation = 'none';
            btn.textContent = `▶ Berechnung starten (${timeStr})`;
        }
    }

    async _generateMesh() {
        if (!this._sectionPolygon || this._sectionPolygon.length < 3) {
            alert('Zuerst Querschnitt extrahieren (Fläche selektieren).');
            return;
        }

        const density = this._meshDensity || 50;
        const meshSize = 0.02 + (100 - density) * 0.005; // 100%→0.02, 50%→0.27, 10%→0.47
        const ffFactor = this._domainSize || 15;
        const angle = parseFloat(this.el?.querySelector('#cfd-angle')?.value || '0');

        const status = this.el?.querySelector('#cfd-status');
        if (status) status.textContent = `Mesh: Größe=${meshSize.toFixed(2)}m, Far-Field=${ffFactor}×`;

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

    async _runSolver() {
        if (!this._sectionPolygon || this._sectionPolygon.length < 3) {
            alert('Zuerst Querschnitt extrahieren und Mesh generieren.');
            return;
        }

        const density = this._meshDensity || 50;
        const meshSize = 0.02 + (100 - density) * 0.005;
        const ffFactor = this._domainSize || 15;
        const angle = parseFloat(this.el?.querySelector('#cfd-angle')?.value || '0');

        const transient = this.el?.querySelector('#cfd-transient')?.checked || false;
        const endTime = parseFloat(this.el?.querySelector('#cfd-endtime')?.value || '2');
        const dt = parseFloat(this.el?.querySelector('#cfd-dt')?.value || '0.002');

        const status = this.el?.querySelector('#cfd-status');
        if (status) {
            status.textContent = transient
                ? `pimpleFoam transient (${endTime}s, dt=${dt})`
                : 'simpleFoam stationär';
            status.style.color = '#ffaa44';
        }

        // Show terminal widget and start log stream
        this._showTerminal();
        this._startLogStream();

        try {
            const res = await fetch('/api/cfd/solve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    polygon: this._sectionPolygon,
                    meshSize,
                    farFieldFactor: ffFactor,
                    windAngle: angle,
                    windSpeed: parseFloat(this.el?.querySelector('#cfd-windspeed')?.value || '20'),
                    transient,
                    endTime,
                    dt,
                }),
            });
            if (!res.ok) throw new Error(await res.text());
            this._solveResult = await res.json();

            if (this._solveResult.success) {
                if (status) { status.textContent = 'OpenFOAM OK!'; status.style.color = '#44ff44'; }
                // Visualize result field
                if (this._solveResult.field) {
                    this._activeField = 'pressure';
                    this._visualizeField(this._solveResult.field, 'pressure');
                }
                // Bind animation controls after render
                setTimeout(() => this._bindAnimationControls(), 100);
            } else {
                if (status) { status.textContent = 'Solver-Fehler (siehe Console)'; status.style.color = '#ff4444'; }
                console.log('OpenFOAM log:', this._solveResult.log);
            }
            this._render();
        } catch (err) {
            if (status) { status.textContent = `Fehler: ${err.message}`; status.style.color = '#ff4444'; }
            console.error('CFD solve error:', err);
        }
    }

    _renderForceHistory() {
        const fh = this._solveResult?.field?.force_history;
        if (!fh || !fh.time || fh.time.length < 2) return '';

        // Draw cL(t) as SVG sparkline
        const w = 190, h = 60;
        const t = fh.time, cl = fh.Cl;
        const tMin = t[0], tMax = t[t.length - 1];
        const clMin = Math.min(...cl), clMax = Math.max(...cl);
        const clRange = Math.max(clMax - clMin, 1e-6);
        const tRange = Math.max(tMax - tMin, 1e-6);

        let path = '';
        for (let i = 0; i < t.length; i++) {
            const x = ((t[i] - tMin) / tRange) * w;
            const y = h - ((cl[i] - clMin) / clRange) * h;
            path += (i === 0 ? 'M' : 'L') + `${x.toFixed(1)},${y.toFixed(1)} `;
        }

        return `
            <div style="border-top:1px solid #334;padding-top:8px;margin-top:4px">
                <div style="color:#7eb8ff;font-size:11px;font-weight:600;margin-bottom:4px">c<sub>L</sub>(t) — Wirbelablösung</div>
                <svg width="${w}" height="${h}" style="background:#16162b;border-radius:4px">
                    <path d="${path}" fill="none" stroke="#44ff44" stroke-width="1.5"/>
                    <text x="2" y="10" fill="#667" font-size="8">${clMax.toFixed(3)}</text>
                    <text x="2" y="${h - 2}" fill="#667" font-size="8">${clMin.toFixed(3)}</text>
                </svg>
                <div style="font-size:10px;color:#667">t: ${tMin.toFixed(2)} — ${tMax.toFixed(2)} s, Δc<sub>L</sub> = ${(clMax - clMin).toFixed(4)}</div>
            </div>
        `;
    }

    _showTerminal() {
        let term = document.getElementById('cfd-terminal');
        if (!term) {
            term = document.createElement('div');
            term.id = 'cfd-terminal';
            term.style.cssText = `
                position: fixed; bottom: 40px; left: 60px; right: 280px;
                height: 150px; background: #0a0a14; border: 1px solid #334;
                border-radius: 6px; font-family: 'Consolas','Monaco',monospace;
                font-size: 11px; color: #44ff44; padding: 8px; overflow-y: auto;
                z-index: 25; box-shadow: 0 -2px 12px rgba(0,0,0,0.4);
                white-space: pre-wrap; line-height: 1.4;
            `;
            term.innerHTML = '<span style="color:#7eb8ff">OpenFOAM Terminal</span>\n';
            document.body.appendChild(term);
        }
        return term;
    }

    _hideTerminal() {
        const term = document.getElementById('cfd-terminal');
        if (term) term.remove();
    }

    _startLogStream() {
        if (this._logEventSource) this._logEventSource.close();
        const term = document.getElementById('cfd-terminal');
        if (!term) return;

        this._logEventSource = new EventSource('/api/cfd/log-stream');
        this._logEventSource.onmessage = (e) => {
            if (e.data === '__DONE__') {
                term.innerHTML += '\n<span style="color:#7eb8ff">--- Berechnung abgeschlossen ---</span>\n';
                this._logEventSource.close();
                this._logEventSource = null;
                // Auto-hide terminal after 3 seconds
                setTimeout(() => this._hideTerminal(), 5000);
                return;
            }
            if (e.data.trim()) {
                // Color-code certain lines
                let line = e.data;
                if (line.includes('Cd:') || line.includes('Cl:') || line.includes('Cm')) {
                    line = `<span style="color:#ffaa44">${line}</span>`;
                } else if (line.includes('FOAM FATAL') || line.includes('Error')) {
                    line = `<span style="color:#ff4444">${line}</span>`;
                } else if (line.includes('===')) {
                    line = `<span style="color:#7eb8ff">${line}</span>`;
                } else if (line.includes('Time =')) {
                    line = `<span style="color:#667">${line}</span>`;
                }
                term.innerHTML += line + '\n';
                term.scrollTop = term.scrollHeight;
            }
        };
        this._logEventSource.onerror = () => {
            if (this._logEventSource) this._logEventSource.close();
            this._logEventSource = null;
        };
    }

    _renderAnimationControls() {
        const ts = this._solveResult?.field?.time_steps || [];
        return `
            <div style="border-top:1px solid #334;padding-top:8px;margin-top:4px">
                <div style="color:#7eb8ff;font-size:11px;font-weight:600;margin-bottom:4px">Animation (${ts.length} Zeitschritte)</div>
                <div style="display:flex;gap:4px;align-items:center;margin-bottom:4px">
                    <button id="cfd-anim-play" style="background:#16162b;border:1px solid #445;border-radius:3px;color:#44ff44;cursor:pointer;padding:2px 8px;font-size:14px">▶</button>
                    <button id="cfd-anim-stop" style="background:#16162b;border:1px solid #445;border-radius:3px;color:#ff4444;cursor:pointer;padding:2px 8px;font-size:14px">⏹</button>
                    <input type="range" id="cfd-anim-slider" min="0" max="${ts.length - 1}" value="0"
                        style="flex:1;height:4px;accent-color:#7eb8ff;cursor:pointer">
                    <span id="cfd-anim-time" style="color:#8899aa;font-size:10px;min-width:40px">t=0</span>
                </div>
            </div>
        `;
    }

    _bindAnimationControls() {
        const playBtn = this.el?.querySelector('#cfd-anim-play');
        const stopBtn = this.el?.querySelector('#cfd-anim-stop');
        const slider = this.el?.querySelector('#cfd-anim-slider');
        if (!playBtn || !slider) return;

        const ts = this._solveResult?.field?.time_steps || [];
        const caseDir = this._solveResult?.case_dir;
        if (!caseDir || ts.length < 2) return;

        // Cache fetched frames
        this._animFrames = this._animFrames || {};
        this._animPlaying = false;

        slider.oninput = async () => {
            const idx = parseInt(slider.value);
            const time = ts[idx];
            this.el.querySelector('#cfd-anim-time').textContent = `t=${time.toFixed(3)}`;
            await this._showFrame(caseDir, time);
        };

        playBtn.onclick = () => {
            this._animPlaying = true;
            playBtn.style.color = '#888';
            this._playAnimation(caseDir, ts, slider);
        };

        stopBtn.onclick = () => {
            this._animPlaying = false;
            playBtn.style.color = '#44ff44';
        };
    }

    async _playAnimation(caseDir, timeSteps, slider) {
        for (let i = parseInt(slider.value); i < timeSteps.length && this._animPlaying; i++) {
            slider.value = i;
            const time = timeSteps[i];
            this.el.querySelector('#cfd-anim-time').textContent = `t=${time.toFixed(3)}`;
            await this._showFrame(caseDir, time);
            await new Promise(r => setTimeout(r, 50)); // ~20 fps
        }
        this._animPlaying = false;
        const playBtn = this.el?.querySelector('#cfd-anim-play');
        if (playBtn) playBtn.style.color = '#44ff44';
    }

    async _showFrame(caseDir, time) {
        const field = this._activeField || 'pressure';
        const key = `${time.toFixed(4)}_${field}`;
        if (!this._animFrames[key]) {
            try {
                const res = await fetch('/api/cfd/timestep', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ caseDir, time, field }),
                });
                if (res.ok) {
                    this._animFrames[key] = await res.json();
                }
            } catch (e) {
                console.error('Frame fetch error:', e);
                return;
            }
        }
        const frame = this._animFrames[key];
        if (frame) {
            this._visualizePressureField(frame);
        }
    }

    _visualizeField(field, fieldName = 'pressure') {
        // Map field name to data array + range + colormap
        const fieldConfig = {
            pressure:  { data: field.pressure,  range: field.p_range,          label: 'p [Pa]',     cmap: 'jet' },
            speed:     { data: field.speed,     range: field.speed_range,      label: '|U| [m/s]',  cmap: 'hot' },
            vorticity: { data: field.vorticity, range: field.vorticity_range,  label: 'ωz [1/s]',   cmap: 'coolwarm' },
            turb_k:    { data: field.turb_k,    range: field.k_range,          label: 'k [m²/s²]',  cmap: 'hot' },
        };
        const cfg = fieldConfig[fieldName] || fieldConfig.pressure;

        // Remap triangle values from cell data if available
        const triangles = field.triangles || [];
        const cellData = cfg.data || [];
        if (cellData.length > 0 && triangles.length > 0) {
            for (const tri of triangles) {
                if (tri.cell_id !== undefined && tri.cell_id >= 0 && tri.cell_id < cellData.length) {
                    tri.p = cellData[tri.cell_id];
                }
            }
        }

        // Call the actual renderer with field-specific colormap
        this._renderContour(field, cfg);
    }

    _visualizePressureField(field) {
        // Legacy: redirect to generic
        this._visualizeField(field, this._activeField || 'pressure');
    }

    _renderContour(field, cfg) {
        this._clearMesh();

        // When streamlines are active in 2D: skip contour, just draw section + streamlines
        if (this._showStreamlines && this._mode !== '3d') {
            if (this._sectionPolygon) {
                const pts = this._sectionPolygon.map(p => new THREE.Vector3(p[0], p[1], 0.02));
                pts.push(pts[0].clone());
                this.cfdGroup.add(new THREE.Line(
                    new THREE.BufferGeometry().setFromPoints(pts),
                    new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 })));
                if (this._sectionPolygon.length >= 3) {
                    const shape = new THREE.Shape();
                    shape.moveTo(this._sectionPolygon[0][0], this._sectionPolygon[0][1]);
                    for (let i = 1; i < this._sectionPolygon.length; i++)
                        shape.lineTo(this._sectionPolygon[i][0], this._sectionPolygon[i][1]);
                    shape.closePath();
                    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape),
                        new THREE.MeshBasicMaterial({ color: 0x1a1a2e, side: THREE.DoubleSide }));
                    m.position.z = 0.01;
                    this.cfdGroup.add(m);
                }
            }
            this._render2dStreamlines();
            if (this._sectionPolygon) this._frameCFDView(this._sectionPolygon);
            return;
        }

        const nodes = field.nodes || [];
        const triangles = field.triangles || [];
        const range = cfg.range || field.p_range || [0, 1];
        const vMin = range[0], vMax = range[1];
        const vSpan = Math.max(vMax - vMin, 1e-6);

        // Colormaps
        const jet = (t) => {
            t = Math.max(0, Math.min(1, t));
            return [
                Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 3))),
                Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 2))),
                Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 1))),
            ];
        };
        const hot = (t) => {
            t = Math.max(0, Math.min(1, t));
            return [Math.min(1, t * 3), Math.min(1, Math.max(0, t * 3 - 1)), Math.min(1, Math.max(0, t * 3 - 2))];
        };
        const coolwarm = (t) => {
            // Blue (t=0) → White (t=0.5) → Red (t=1), good for diverging data like vorticity
            t = Math.max(0, Math.min(1, t));
            if (t < 0.5) {
                const s = t * 2;
                return [s, s, 1];
            } else {
                const s = (t - 0.5) * 2;
                return [1, 1 - s, 1 - s];
            }
        };
        const cmaps = { jet, hot, coolwarm };
        const colormap = cmaps[cfg.cmap] || jet;

        // Build node position map
        const nodePos = {};
        for (const n of nodes) nodePos[n.id] = { x: n.x, y: n.y };

        // Draw filled triangles colored by cell pressure
        if (triangles.length > 0) {
            const positions = new Float32Array(triangles.length * 9);
            const colors = new Float32Array(triangles.length * 9);
            let validCount = 0;

            for (const tri of triangles) {
                const [n1, n2, n3] = tri.nodes;
                const p1 = nodePos[n1], p2 = nodePos[n2], p3 = nodePos[n3];
                if (!p1 || !p2 || !p3) continue;

                const t = (tri.p - vMin) / vSpan;
                const [r, g, b] = colormap(t);
                const off = validCount * 9;

                positions[off]     = p1.x; positions[off + 1] = p1.y; positions[off + 2] = 0;
                positions[off + 3] = p2.x; positions[off + 4] = p2.y; positions[off + 5] = 0;
                positions[off + 6] = p3.x; positions[off + 7] = p3.y; positions[off + 8] = 0;
                for (let j = 0; j < 3; j++) {
                    colors[off + j * 3]     = r;
                    colors[off + j * 3 + 1] = g;
                    colors[off + j * 3 + 2] = b;
                }
                validCount++;
            }

            if (validCount > 0) {
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.Float32BufferAttribute(positions.slice(0, validCount * 9), 3));
                geo.setAttribute('color', new THREE.Float32BufferAttribute(colors.slice(0, validCount * 9), 3));
                geo.computeVertexNormals();
                const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
                this.cfdGroup.add(new THREE.Mesh(geo, mat));
            }
            console.log(`CFD contour: ${validCount} triangles, range=[${vMin.toFixed(2)}, ${vMax.toFixed(2)}] (${cfg.label})`);
        }

        // Draw section outline (bright, on top)
        if (this._sectionPolygon) {
            const pts = this._sectionPolygon.map(p => new THREE.Vector3(p[0], p[1], 0.02));
            pts.push(pts[0].clone());
            const secGeo = new THREE.BufferGeometry().setFromPoints(pts);
            const secMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
            this.cfdGroup.add(new THREE.Line(secGeo, secMat));
        }

        // Section filled black (to block pressure inside the body)
        if (this._sectionPolygon && this._sectionPolygon.length >= 3) {
            const shape = new THREE.Shape();
            shape.moveTo(this._sectionPolygon[0][0], this._sectionPolygon[0][1]);
            for (let i = 1; i < this._sectionPolygon.length; i++) {
                shape.lineTo(this._sectionPolygon[i][0], this._sectionPolygon[i][1]);
            }
            shape.closePath();
            const shapeGeo = new THREE.ShapeGeometry(shape);
            const shapeMat = new THREE.MeshBasicMaterial({ color: 0x1a1a2e, side: THREE.DoubleSide });
            const shapeMesh = new THREE.Mesh(shapeGeo, shapeMat);
            shapeMesh.position.z = 0.01;
            this.cfdGroup.add(shapeMesh);
        }

        // 2D velocity vectors
        if (this._showVectors) this._render2dVectors();
        // 2D streamlines
        if (this._showStreamlines) this._render2dStreamlines();

        // Frame camera on section with correct orientation
        if (this._sectionPolygon) {
            this._frameCFDView(this._sectionPolygon);
        }

        // Color legend (hide when streamlines active)
        if (!this._showStreamlines) this._showColorLegend(cfg.label, vMin, vMax, cfg.cmap);
    }

    _redraw2dOverlays() {
        // Re-render the current 2D field with updated overlay settings
        if (this._solveResult?.field) {
            this._visualizeField(this._solveResult.field, this._activeField || 'pressure');
        }
    }

    _render2dVectors() {
        const field = this._solveResult?.field;
        if (!field?.velocity || !field?.triangles) return;

        const velocity = field.velocity;  // [(vx,vy), ...] per cell
        const triangles = field.triangles;
        const nodes = field.nodes || [];
        const nodePos = {};
        for (const n of nodes) nodePos[n.id] = { x: n.x, y: n.y };

        // Sample cells with velocity — use cell_id from triangles
        const cellVecs = new Map();  // cell_id → {x, y, vx, vy}
        for (const tri of triangles) {
            const cid = tri.cell_id;
            if (cid === undefined || cid < 0 || cid >= velocity.length) continue;
            if (cellVecs.has(cid)) continue;
            const [n1, n2, n3] = tri.nodes;
            const p1 = nodePos[n1], p2 = nodePos[n2], p3 = nodePos[n3];
            if (!p1 || !p2 || !p3) continue;
            const cx = (p1.x + p2.x + p3.x) / 3;
            const cy = (p1.y + p2.y + p3.y) / 3;
            const [vx, vy] = velocity[cid];
            cellVecs.set(cid, { x: cx, y: cy, vx, vy, speed: Math.sqrt(vx*vx + vy*vy) });
        }

        // Subsample to ~600 arrows
        const all = [...cellVecs.values()];
        const step = Math.max(1, Math.floor(all.length / 600));
        const maxSpeed = Math.max(...all.map(v => v.speed), 0.01);

        // Scale arrows relative to section size
        const poly = this._sectionPolygon || [[0,0],[1,0]];
        const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
        const span = Math.max(Math.max(...xs)-Math.min(...xs), Math.max(...ys)-Math.min(...ys), 1);
        const arrowLen = span * 0.08;

        const positions = [];
        const colors = [];
        const hot = (t) => {
            t = Math.max(0, Math.min(1, t));
            return [Math.min(1, t*3), Math.min(1, Math.max(0, t*3-1)), Math.min(1, Math.max(0, t*3-2))];
        };

        for (let i = 0; i < all.length; i += step) {
            const v = all[i];
            if (v.speed < maxSpeed * 0.02) continue;
            const t = v.speed / maxSpeed;
            const [r, g, b] = hot(t);
            const len = arrowLen * (0.3 + 0.7 * t);
            const dx = (v.vx / v.speed) * len;
            const dy = (v.vy / v.speed) * len;
            // Arrow shaft
            positions.push(v.x, v.y, 0.03, v.x + dx, v.y + dy, 0.03);
            colors.push(r, g, b, r, g, b);
            // Arrow head (two short lines)
            const hx = dx * 0.3, hy = dy * 0.3;
            const px = v.x + dx, py = v.y + dy;
            positions.push(px, py, 0.03, px - hx + hy*0.4, py - hy - hx*0.4, 0.03);
            colors.push(r, g, b, r, g, b);
            positions.push(px, py, 0.03, px - hx - hy*0.4, py - hy + hx*0.4, 0.03);
            colors.push(r, g, b, r, g, b);
        }

        if (positions.length > 0) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            this.cfdGroup.add(new THREE.LineSegments(geo,
                new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false })));
        }
    }

    _render2dStreamlines() {
        const field = this._solveResult?.field;
        if (!field?.velocity || !field?.triangles) return;

        const velocity = field.velocity;
        const triangles = field.triangles;
        const nodes = field.nodes || [];
        const nodePos = {};
        for (const n of nodes) nodePos[n.id] = { x: n.x, y: n.y };

        // Build spatial grid for velocity lookup
        const cellVecs = [];
        const seen = new Set();
        for (const tri of triangles) {
            const cid = tri.cell_id;
            if (cid === undefined || cid < 0 || cid >= velocity.length || seen.has(cid)) continue;
            seen.add(cid);
            const [n1, n2, n3] = tri.nodes;
            const p1 = nodePos[n1], p2 = nodePos[n2], p3 = nodePos[n3];
            if (!p1 || !p2 || !p3) continue;
            cellVecs.push({
                x: (p1.x + p2.x + p3.x) / 3,
                y: (p1.y + p2.y + p3.y) / 3,
                vx: velocity[cid][0],
                vy: velocity[cid][1],
            });
        }
        if (cellVecs.length < 10) return;

        // Build a simple grid-based lookup for nearest-neighbor velocity interpolation
        const allX = cellVecs.map(c => c.x), allY = cellVecs.map(c => c.y);
        const xMin = Math.min(...allX), xMax = Math.max(...allX);
        const yMin = Math.min(...allY), yMax = Math.max(...allY);
        const span = Math.max(xMax - xMin, yMax - yMin, 0.1);
        const gridN = 80;
        const cellW = (xMax - xMin) / gridN, cellH = (yMax - yMin) / gridN;
        const grid = new Map();
        for (const cv of cellVecs) {
            const gi = Math.floor((cv.x - xMin) / Math.max(cellW, 1e-6));
            const gj = Math.floor((cv.y - yMin) / Math.max(cellH, 1e-6));
            const key = `${gi},${gj}`;
            if (!grid.has(key)) grid.set(key, []);
            grid.get(key).push(cv);
        }

        const lookupV = (px, py) => {
            const gi = Math.floor((px - xMin) / Math.max(cellW, 1e-6));
            const gj = Math.floor((py - yMin) / Math.max(cellH, 1e-6));
            let best = null, bestDist = Infinity;
            for (let di = -1; di <= 1; di++) {
                for (let dj = -1; dj <= 1; dj++) {
                    const bucket = grid.get(`${gi+di},${gj+dj}`);
                    if (!bucket) continue;
                    for (const cv of bucket) {
                        const d = (cv.x-px)**2 + (cv.y-py)**2;
                        if (d < bestDist) { bestDist = d; best = cv; }
                    }
                }
            }
            return best;
        };

        // Point-in-polygon test for section body (avoid streamlines inside)
        const poly = this._sectionPolygon;
        const inBody = (px, py) => {
            if (!poly || poly.length < 3) return false;
            let inside = false;
            for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                const [xi, yi] = poly[i], [xj, yj] = poly[j];
                if (((yi > py) !== (yj > py)) && (px < (xj-xi)*(py-yi)/(yj-yi)+xi))
                    inside = !inside;
            }
            return inside;
        };

        // Trace streamlines from seed points (upstream of section)
        const secXs = poly ? poly.map(p => p[0]) : [0];
        const secYs = poly ? poly.map(p => p[1]) : [0];
        const secCx = (Math.min(...secXs) + Math.max(...secXs)) / 2;
        const secH = Math.max(...secYs) - Math.min(...secYs) || span * 0.3;
        const nSeeds = this._slNSeeds || 25;
        const seedX = Math.min(...secXs) - secH * 2;
        const seedYmin = Math.min(...secYs) - secH * 1.5;
        const seedYmax = Math.max(...secYs) + secH * 1.5;

        const streamlines = [];
        const dt = span * 0.003;
        const maxSteps = 600;

        for (let s = 0; s < nSeeds; s++) {
            const sy = seedYmin + (seedYmax - seedYmin) * s / (nSeeds - 1);
            const line = [{ x: seedX, y: sy }];
            let px = seedX, py = sy;
            for (let step = 0; step < maxSteps; step++) {
                const v = lookupV(px, py);
                if (!v) break;
                const spd = Math.sqrt(v.vx*v.vx + v.vy*v.vy);
                if (spd < 0.01) break;
                px += (v.vx / spd) * dt;
                py += (v.vy / spd) * dt;
                if (px < xMin || px > xMax || py < yMin || py > yMax) break;
                if (inBody(px, py)) break;
                line.push({ x: px, y: py, speed: spd });
            }
            if (line.length > 5) streamlines.push(line);
        }

        // Render streamlines with speed-based coloring
        const maxSpd = Math.max(...streamlines.flat().map(p => p.speed || 0), 0.01);
        const streamColor = (t) => {
            t = Math.max(0, Math.min(1, t));
            return [t, 1 - 0.5*t, 0.3*(1-t)];  // green→yellow→red
        };

        for (const sl of streamlines) {
            const positions = [];
            const colors = [];
            for (let i = 0; i < sl.length - 1; i++) {
                const a = sl[i], b = sl[i+1];
                const t = (b.speed || 0) / maxSpd;
                const [r, g, bl] = streamColor(t);
                positions.push(a.x, a.y, 0.04, b.x, b.y, 0.04);
                colors.push(r, g, bl, r, g, bl);
            }
            if (positions.length > 0) {
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
                geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
                this.cfdGroup.add(new THREE.LineSegments(geo,
                    new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false })));
            }
        }
    }

    _visualizeSection(polygon) {
        // Draw section polygon as bright outline + filled
        this._clearMesh();
        const points = polygon.map(p => new THREE.Vector3(p[0], p[1], 0.01));
        points.push(points[0].clone());
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({ color: 0xff8844, linewidth: 2 });
        this.cfdGroup.add(new THREE.Line(geo, mat));

        // Fill section
        if (polygon.length >= 3) {
            const shape = new THREE.Shape();
            shape.moveTo(polygon[0][0], polygon[0][1]);
            for (let i = 1; i < polygon.length; i++) shape.lineTo(polygon[i][0], polygon[i][1]);
            shape.closePath();
            const fillGeo = new THREE.ShapeGeometry(shape);
            const fillMat = new THREE.MeshBasicMaterial({ color: 0x334455, side: THREE.DoubleSide });
            this.cfdGroup.add(new THREE.Mesh(fillGeo, fillMat));
        }

        // Fit camera to section — reset up vector for correct orientation
        this._frameCFDView(polygon);
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

    // ── 3D Building CFD methods ──────────────────────────────────

    async _runSolver3d() {
        if (!this._sectionPolygon || this._sectionPolygon.length < 3) {
            alert('Zuerst Gebäude-Grundriss wählen.');
            return;
        }
        const angle = parseFloat(this.el?.querySelector('#cfd-angle')?.value || '0');
        const height = parseFloat(this.el?.querySelector('#cfd-height')?.value || '40');
        const z0 = parseFloat(this.el?.querySelector('#cfd-z0')?.value || '0.1');

        // Derive meshSize from density slider (100% → H/30 fine, 10% → H/5 coarse)
        const density = this._meshDensity || 50;
        const meshSize = height / (5 + density * 0.25);  // 10%→H/7.5, 50%→H/17.5, 100%→H/30
        const domainFactor = this._domainSize || 3;
        // Wind speed from test case or default
        const tc = this._selectedTestCase;
        const windSpeed = parseFloat(this.el?.querySelector('#cfd-windspeed')?.value || '') || tc?.windSpeed || 15;

        this._selectedHeight = height;
        this._selectedZ0 = z0;

        const estCells = Math.round(domainFactor ** 2.5 * (density / 10) ** 1.5 * 5000);
        const status = this.el?.querySelector('#cfd-status');
        if (status) { status.textContent = `3D: H=${height}m, mesh=${meshSize.toFixed(1)}m, domain=${domainFactor}×H (~${(estCells/1000).toFixed(0)}k Zellen)`; status.style.color = '#ffaa44'; }

        this._showTerminal();
        this._startLogStream();

        try {
            const payload = {
                    footprint: this._sectionPolygon,
                    height, windSpeed, windAngle: angle,
                    z0, meshSize, nIterations: 500, nProcs: 4,
                    domainFactor: domainFactor,
            };
            // Multi-building: use buildings from testcase or explicit selection
            const blds = this._selectedBuildings || this._selectedTestCase?.buildings;
            if (blds && blds.length > 0) {
                payload.buildings = blds;
                payload.height = Math.max(...blds.map(b => b.height));
                console.log(`CFD 3D: sending ${blds.length} buildings, H_max=${payload.height}`);
            }
            const res = await fetch('/api/cfd/solve3d', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error(await res.text());
            this._solveResult = await res.json();

            if (this._solveResult.success) {
                if (status) { status.textContent = '3D OpenFOAM OK!'; status.style.color = '#44ff44'; }
                this._activeField = 'pressure';
                this._slicePlane = 'z';
                this._render();
                this._makeDraggable();
                // Fetch initial horizontal slice at H/2
                setTimeout(() => this._fetchAndShowSlice(), 100);
            } else {
                if (status) { status.textContent = 'Solver-Fehler'; status.style.color = '#ff4444'; }
                console.log('3D log:', this._solveResult.log);
            }
        } catch (err) {
            if (status) { status.textContent = `Fehler: ${err.message}`; status.style.color = '#ff4444'; }
            console.error('3D solve error:', err);
        }
    }

    async _runSolverSTL() {
        if (!this._stlServerPath) { alert('Zuerst GLB/STL hochladen.'); return; }

        const z0 = parseFloat(this.el?.querySelector('#cfd-z0')?.value || '0.03');
        const scale = parseFloat(this.el?.querySelector('#cfd-scale')?.value || '1');
        const density = this._meshDensity || 50;
        const domainFactor = this._domainSize || 2;
        const height = this._selectedHeight || 100;
        // Surface target mesh size: density 10%→H/5, 50%→H/15, 100%→H/30
        const meshSize = Math.max(height / (5 + density * 0.25), 0.5);

        this._stlScale = scale;
        const status = this.el?.querySelector('#cfd-status');
        if (status) { status.textContent = `STL CFD: ${this._stlFileName}, mesh=${meshSize.toFixed(0)}m`; status.style.color = '#ffaa44'; }

        this._showTerminal();
        this._startLogStream();

        try {
            const res = await fetch('/api/cfd/solve3d-stl', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stlFile: this._stlServerPath,
                    scale,
                    windSpeed: parseFloat(this.el?.querySelector('#cfd-windspeed')?.value || '20'),
                    z0, meshSize,
                    domainFactor, nProcs: 4, nIterations: 500,
                    rotX: this._stlRotX || 0,
                    rotY: this._stlRotY || 0,
                    rotZ: this._stlRotZ || 0,
                }),
            });
            if (!res.ok) throw new Error(await res.text());
            this._solveResult = await res.json();

            if (this._solveResult.success) {
                if (status) { status.textContent = 'STL CFD OK!'; status.style.color = '#44ff44'; }
                this._activeField = 'speed';
                this._slicePlane = 'z';
                this._selectedHeight = this._solveResult.building_height || height;
                this._render(); this._makeDraggable();
                setTimeout(() => this._fetchAndShowSlice(), 100);
            } else {
                if (status) { status.textContent = 'Solver-Fehler'; status.style.color = '#ff4444'; }
                console.log('STL log:', this._solveResult.log);
            }
        } catch (err) {
            if (status) { status.textContent = `Fehler: ${err.message}`; status.style.color = '#ff4444'; }
            console.error('STL solve error:', err);
        }
    }

    async _fetchAndShowSlice() {
        const caseDir = this._solveResult?.case_dir;
        if (!caseDir) return;

        const plane = this._slicePlane || 'z';
        const slider = this.el?.querySelector(plane === 'z' ? '#cfd-slice-z' : '#cfd-slice-y');
        const value = parseFloat(slider?.value || '0');
        const field = this._activeField || 'pressure';
        const key = `${plane}_${value}_${field}`;

        // Cache
        this._sliceCache = this._sliceCache || {};
        if (!this._sliceCache[key]) {
            try {
                const res = await fetch('/api/cfd/slice3d', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ caseDir, plane, value, field }),
                });
                if (res.ok) this._sliceCache[key] = await res.json();
            } catch (e) {
                console.error('Slice error:', e);
                return;
            }
        }

        const sliceData = this._sliceCache[key];
        if (sliceData) {
            // Use _renderContour to draw the slice
            const cfg = {
                pressure:  { range: sliceData.p_range, label: 'p [Pa]', cmap: 'jet' },
                speed:     { range: sliceData.p_range, label: '|U| [m/s]', cmap: 'hot' },
                turb_k:    { range: sliceData.p_range, label: 'k [m²/s²]', cmap: 'hot' },
            }[field] || { range: sliceData.p_range, label: field, cmap: 'jet' };

            this._renderContour3d(sliceData, cfg, plane, value);
        }
    }

    _renderContour3d(sliceData, cfg, plane, value) {
        this._clearMesh();
        // Make GLB model semi-transparent so slice is visible through it
        this._modelGroup.traverse((child) => {
            if (child.isMesh) {
                child.material.transparent = true;
                child.material.opacity = 0.3;
                child.material.depthWrite = false;
            }
        });
        const nodes = sliceData.nodes || [];
        const triangles = sliceData.triangles || [];
        const range = cfg.range || [0, 1];
        const vMin = range[0], vMax = range[1];
        const vSpan = Math.max(vMax - vMin, 1e-6);

        const cmaps = {
            jet: (t) => { t = Math.max(0, Math.min(1, t)); return [Math.min(1, Math.max(0, 1.5 - Math.abs(4*t-3))), Math.min(1, Math.max(0, 1.5 - Math.abs(4*t-2))), Math.min(1, Math.max(0, 1.5 - Math.abs(4*t-1)))]; },
            hot: (t) => { t = Math.max(0, Math.min(1, t)); return [Math.min(1, t*3), Math.min(1, Math.max(0, t*3-1)), Math.min(1, Math.max(0, t*3-2))]; },
        };
        const colormap = cmaps[cfg.cmap] || cmaps.jet;

        const nodePos = {};
        for (const n of nodes) nodePos[n.id] = { x: n.x, y: n.y };

        if (triangles.length > 0) {
            const positions = new Float32Array(triangles.length * 9);
            const colors = new Float32Array(triangles.length * 9);
            let vc = 0;

            for (const tri of triangles) {
                const [n1, n2, n3] = tri.nodes;
                const p1 = nodePos[n1], p2 = nodePos[n2], p3 = nodePos[n3];
                if (!p1 || !p2 || !p3) continue;

                const t = (tri.p - vMin) / vSpan;
                const [r, g, b] = colormap(t);
                const off = vc * 9;

                // Map 2D slice coords to 3D position based on slice plane
                if (plane === 'z') {
                    // Horizontal: slice axes are x,y → place at z=value
                    positions[off]   = p1.x; positions[off+1] = p1.y; positions[off+2] = value;
                    positions[off+3] = p2.x; positions[off+4] = p2.y; positions[off+5] = value;
                    positions[off+6] = p3.x; positions[off+7] = p3.y; positions[off+8] = value;
                } else if (plane === 'y') {
                    // Vertical Y: slice axes are x,z → map to x,y=value,z
                    positions[off]   = p1.x; positions[off+1] = value; positions[off+2] = p1.y;
                    positions[off+3] = p2.x; positions[off+4] = value; positions[off+5] = p2.y;
                    positions[off+6] = p3.x; positions[off+7] = value; positions[off+8] = p3.y;
                } else {
                    // Vertical X: slice axes are y,z → map to x=value,y,z
                    positions[off]   = value; positions[off+1] = p1.x; positions[off+2] = p1.y;
                    positions[off+3] = value; positions[off+4] = p2.x; positions[off+5] = p2.y;
                    positions[off+6] = value; positions[off+7] = p3.x; positions[off+8] = p3.y;
                }
                for (let j = 0; j < 3; j++) { colors[off+j*3]=r; colors[off+j*3+1]=g; colors[off+j*3+2]=b; }
                vc++;
            }

            if (vc > 0) {
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.Float32BufferAttribute(positions.slice(0, vc*9), 3));
                geo.setAttribute('color', new THREE.Float32BufferAttribute(colors.slice(0, vc*9), 3));
                const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
                this.cfdGroup.add(new THREE.Mesh(geo, mat));
            }
            console.log(`3D slice ${plane}=${value}: ${vc} triangles, range=[${vMin.toFixed(2)}, ${vMax.toFixed(2)}]`);
        }

        // Draw velocity vectors if enabled
        if (this._showVectors && sliceData.vectors && sliceData.vectors.length > 0) {
            this._renderVectors(sliceData.vectors, plane, value);
        }

        // Draw building footprint(s) as 3D box(es)
        const blds = this._selectedBuildings || this._selectedTestCase?.buildings;
        if (blds && blds.length > 0) {
            for (const b of blds) this._drawBuildingWireframe(b.footprint, b.height);
        } else if (this._sectionPolygon && this._selectedHeight) {
            this._drawBuildingWireframe(this._sectionPolygon, this._selectedHeight);
        }

        // Draw ground plane at z=0 (XY plane) — size from slice extent
        const bH = this._selectedHeight || 40;
        let ext = bH * 4;
        if (nodes.length > 0) {
            const sliceXs = nodes.map(n => n.x);
            const sliceYs = nodes.map(n => n.y);
            ext = Math.max(Math.max(...sliceXs) - Math.min(...sliceXs), Math.max(...sliceYs) - Math.min(...sliceYs)) / 2 * 1.2;
        }
        const groundGeo = new THREE.PlaneGeometry(ext * 2, ext * 2);
        const groundMat = new THREE.MeshBasicMaterial({ color: 0x223322, transparent: true, opacity: 0.15, side: THREE.DoubleSide });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.position.set(0, 0, -0.5);
        this.cfdGroup.add(ground);

        // Frame camera — encompass all buildings or default
        if (blds && blds.length > 0) {
            const allXs = blds.flatMap(b => b.footprint.map(p => p[0]));
            const allYs = blds.flatMap(b => b.footprint.map(p => p[1]));
            const maxH = Math.max(...blds.map(b => b.height));
            const cx = (Math.min(...allXs) + Math.max(...allXs)) / 2;
            const cy = (Math.min(...allYs) + Math.max(...allYs)) / 2;
            const span = Math.max(Math.max(...allXs) - Math.min(...allXs), Math.max(...allYs) - Math.min(...allYs), maxH);
            this.canvas.camera.up.set(0, 0, 1);
            const dist = span * 2.5;
            this.canvas.camera.position.set(cx - dist * 0.8, cy - dist * 0.6, maxH * 0.8 + dist * 0.5);
            this.canvas.controls.target.set(cx, cy, maxH * 0.3);
            this.canvas.controls.update();
        } else {
            this._frame3dView(bH);
        }

        // Color legend overlay
        this._showColorLegend(cfg.label, vMin, vMax, cfg.cmap);
    }

    _showColorLegend(label, vMin, vMax, cmapName) {
        // Remove old legend
        document.getElementById('cfd-legend')?.remove();

        const legend = document.createElement('div');
        legend.id = 'cfd-legend';
        legend.style.cssText = `
            position:fixed; bottom:20px; right:20px; background:rgba(10,10,30,0.85);
            border:1px solid #445; border-radius:6px; padding:8px 12px;
            z-index:30; font-size:11px; color:#c8d0e0; min-width:40px;
        `;

        // Generate gradient CSS from colormap
        const cmaps = {
            jet: (t) => { t=Math.max(0,Math.min(1,t)); const r=Math.min(1,Math.max(0,1.5-Math.abs(4*t-3))),g=Math.min(1,Math.max(0,1.5-Math.abs(4*t-2))),b=Math.min(1,Math.max(0,1.5-Math.abs(4*t-1))); return `rgb(${r*255|0},${g*255|0},${b*255|0})`; },
            hot: (t) => { t=Math.max(0,Math.min(1,t)); return `rgb(${Math.min(255,t*765)|0},${Math.min(255,Math.max(0,t*765-255))|0},${Math.min(255,Math.max(0,t*765-510))|0})`; },
        };
        const cmap = cmaps[cmapName] || cmaps.jet;
        const stops = [];
        for (let i = 0; i <= 10; i++) stops.push(cmap(i / 10));

        const fmt = (v) => Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(1) : v.toFixed(3);

        legend.innerHTML = `
            <div style="font-weight:600;margin-bottom:4px;text-align:center">${label}</div>
            <div style="display:flex;align-items:stretch;gap:6px">
                <div style="width:16px;height:120px;border-radius:2px;
                    background:linear-gradient(to bottom,${stops.reverse().join(',')})"></div>
                <div style="display:flex;flex-direction:column;justify-content:space-between;font-size:10px;color:#8899aa">
                    <span>${fmt(vMax)}</span>
                    <span>${fmt((vMin+vMax)/2)}</span>
                    <span>${fmt(vMin)}</span>
                </div>
            </div>
        `;
        document.body.appendChild(legend);
    }

    _drawBuildingWireframe(footprint, height) {
        const pts = footprint.map(p => new THREE.Vector3(p[0], p[1], 0));
        const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false });
        const edgeMat = new THREE.LineBasicMaterial({ color: 0x8899aa });

        // Bottom outline
        const bottom = [...pts, pts[0].clone()];
        this.cfdGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(bottom), lineMat));

        // Top outline
        const top = pts.map(p => new THREE.Vector3(p.x, p.y, height));
        top.push(top[0].clone());
        this.cfdGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(top), lineMat));

        // Vertical edges
        for (const p of pts) {
            const edge = [p.clone(), new THREE.Vector3(p.x, p.y, height)];
            this.cfdGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(edge), edgeMat));
        }

        // Semi-transparent building fill (ExtrudeGeometry goes along Z = correct for Z-up)
        if (footprint.length >= 3) {
            const shape = new THREE.Shape();
            shape.moveTo(footprint[0][0], footprint[0][1]);
            for (let i = 1; i < footprint.length; i++) shape.lineTo(footprint[i][0], footprint[i][1]);
            shape.closePath();
            const extGeo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
            const extMat = new THREE.MeshBasicMaterial({
                color: 0x334455, transparent: true, opacity: 0.3,
                side: THREE.DoubleSide, depthWrite: false,
            });
            this.cfdGroup.add(new THREE.Mesh(extGeo, extMat));
        }
    }

    _frame3dView(buildingHeight) {
        const H = buildingHeight || 40;
        const xs = this._sectionPolygon ? this._sectionPolygon.map(p => p[0]) : [0];
        const ys = this._sectionPolygon ? this._sectionPolygon.map(p => p[1]) : [0];
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), H);
        // Z is up in 3D CFD data
        this.canvas.camera.up.set(0, 0, 1);
        // Elevated view from upstream-left, looking at building center
        const dist = span * 3;
        this.canvas.camera.position.set(cx - dist * 0.8, cy - dist * 0.6, H * 0.8 + dist * 0.5);
        this.canvas.controls.target.set(cx, cy, H * 0.4);
        this.canvas.controls.update();
    }

    _visualize3dPreview(footprint, height) {
        this._clearMesh();
        this._drawBuildingWireframe(footprint, height);
        // Wind arrow
        const xs = footprint.map(p => p[0]);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const arrowStart = new THREE.Vector3(cx - height * 3, 0, height / 2);
        const arrowEnd = new THREE.Vector3(cx - height * 0.5, 0, height / 2);
        const arrowGeo = new THREE.BufferGeometry().setFromPoints([arrowStart, arrowEnd]);
        this.cfdGroup.add(new THREE.Line(arrowGeo, new THREE.LineBasicMaterial({ color: 0x44aaff })));
        this._frame3dView(height);
    }

    _visualize3dMultiBuilding(buildings) {
        this._clearMesh();
        const colors = [0x4488cc, 0x44cc88, 0xcc8844, 0xcc4488, 0x88cc44, 0x8844cc];
        let allXs = [], allYs = [];
        let maxH = 0;
        buildings.forEach((b, i) => {
            const color = colors[i % colors.length];
            // Wireframe
            this._drawBuildingWireframe(b.footprint, b.height);
            // Colored fill
            if (b.footprint.length >= 3) {
                const shape = new THREE.Shape();
                shape.moveTo(b.footprint[0][0], b.footprint[0][1]);
                for (let j = 1; j < b.footprint.length; j++) shape.lineTo(b.footprint[j][0], b.footprint[j][1]);
                shape.closePath();
                const geo = new THREE.ExtrudeGeometry(shape, { depth: b.height, bevelEnabled: false });
                const mat = new THREE.MeshBasicMaterial({
                    color, transparent: true, opacity: 0.25,
                    side: THREE.DoubleSide, depthWrite: false,
                });
                this.cfdGroup.add(new THREE.Mesh(geo, mat));
            }
            b.footprint.forEach(p => { allXs.push(p[0]); allYs.push(p[1]); });
            if (b.height > maxH) maxH = b.height;
        });
        // Wind arrow
        const cx = (Math.min(...allXs) + Math.max(...allXs)) / 2;
        const cy = (Math.min(...allYs) + Math.max(...allYs)) / 2;
        const span = Math.max(Math.max(...allXs) - Math.min(...allXs), Math.max(...allYs) - Math.min(...allYs), maxH);
        const arrowStart = new THREE.Vector3(Math.min(...allXs) - span * 0.5, cy, maxH / 2);
        const arrowEnd = new THREE.Vector3(Math.min(...allXs) - span * 0.05, cy, maxH / 2);
        this.cfdGroup.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([arrowStart, arrowEnd]),
            new THREE.LineBasicMaterial({ color: 0x44aaff })
        ));
        // Frame camera
        this.canvas.camera.up.set(0, 0, 1);
        const dist = span * 2.5;
        this.canvas.camera.position.set(cx - dist * 0.8, cy - dist * 0.6, maxH * 0.8 + dist * 0.5);
        this.canvas.controls.target.set(cx, cy, maxH * 0.4);
        this.canvas.controls.update();
    }

    _visualize3dFromBounds(bounds, height, modelUrl) {
        this._clearMesh();
        const mn = bounds.min, mx = bounds.max;
        const cx = (mn[0] + mx[0]) / 2;
        const cy = (mn[1] + mx[1]) / 2;
        const cz = (mn[2] + mx[2]) / 2;

        // Load actual GLB/STL model if URL available
        if (modelUrl) {
            const scale = this._stlScale || 1;
            const loader = new GLTFLoader();
            loader.load(modelUrl, (gltf) => {
                const model = gltf.scene;

                // Apply scale
                if (scale !== 1) model.scale.setScalar(scale);

                // Apply user rotation (in degrees) — use a wrapper to rotate around model center
                const rotX = (this._stlRotX || 0) * Math.PI / 180;
                const rotY = (this._stlRotY || 0) * Math.PI / 180;
                const rotZ = (this._stlRotZ || 0) * Math.PI / 180;
                if (rotX || rotY || rotZ) {
                    // First compute center, rotate around it
                    model.updateMatrixWorld(true);
                    const preBox = new THREE.Box3().setFromObject(model);
                    const preCenter = preBox.getCenter(new THREE.Vector3());
                    // Move to origin, rotate, move back
                    const pivot = new THREE.Group();
                    pivot.position.copy(preCenter);
                    pivot.rotation.set(rotX, rotY, rotZ, 'XYZ');
                    model.position.sub(preCenter);
                    pivot.add(model);
                    // Bake the transform: replace model with the pivot
                    pivot.updateMatrixWorld(true);
                    // We'll add pivot instead of model
                    var modelToAdd = pivot;
                } else {
                    var modelToAdd = model;
                }
                modelToAdd.updateMatrixWorld(true);

                // Compute bounding box, then center at origin with Z_min=0
                const box = new THREE.Box3().setFromObject(modelToAdd);
                const size = box.getSize(new THREE.Vector3());
                const center = box.getCenter(new THREE.Vector3());

                // Shift so center XY = (0,0) and bottom Z = 0
                const offset = new THREE.Vector3(-center.x, -center.y, -box.min.z);
                modelToAdd.position.add(offset);
                modelToAdd.updateMatrixWorld(true);

                // Recompute box after centering
                const box2 = new THREE.Box3().setFromObject(modelToAdd);
                const size2 = box2.getSize(new THREE.Vector3());

                // Semi-transparent material for all meshes
                modelToAdd.traverse((child) => {
                    if (child.isMesh) {
                        child.material = child.material.clone();
                        child.material.transparent = true;
                        child.material.opacity = 0.85;
                        child.material.side = THREE.DoubleSide;
                    }
                });
                // Add to persistent model group (survives _clearMesh)
                this._clearModelGroup();
                this._modelGroup.add(modelToAdd);

                // Store centered bounds for solver
                this._stlCenteredBounds = {
                    min: [box2.min.x, box2.min.y, box2.min.z],
                    max: [box2.max.x, box2.max.y, box2.max.z],
                };

                // Bounding box wireframe at origin
                const center2 = box2.getCenter(new THREE.Vector3());
                const boxEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(size2.x, size2.y, size2.z));
                const boxLine = new THREE.LineSegments(boxEdges,
                    new THREE.LineBasicMaterial({ color: 0x445566, transparent: true, opacity: 0.5 }));
                boxLine.position.copy(center2);
                this.cfdGroup.add(boxLine);

                // Dimension lines (orange)
                const lineMat = new THREE.LineBasicMaterial({ color: 0xffaa44, depthTest: false });
                const dimOff = Math.max(size2.x, size2.y, size2.z) * 0.05;
                const bMin = box2.min, bMax = box2.max;
                this.cfdGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(bMin.x, bMin.y - dimOff, 0),
                    new THREE.Vector3(bMax.x, bMin.y - dimOff, 0)]), lineMat));
                this.cfdGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(bMax.x + dimOff, bMin.y, 0),
                    new THREE.Vector3(bMax.x + dimOff, bMax.y, 0)]), lineMat));
                this.cfdGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(bMax.x + dimOff, bMax.y, 0),
                    new THREE.Vector3(bMax.x + dimOff, bMax.y, bMax.z)]), lineMat));

                // Ground plane at z=0
                const gndSize = Math.max(size2.x, size2.y) * 2;
                const gndGeo = new THREE.PlaneGeometry(gndSize, gndSize);
                const gndMat = new THREE.MeshBasicMaterial({ color: 0x223322, transparent: true, opacity: 0.1, side: THREE.DoubleSide });
                const gnd = new THREE.Mesh(gndGeo, gndMat);
                gnd.rotation.x = -Math.PI / 2;  // XZ plane
                gnd.position.y = 0;
                this.cfdGroup.add(gnd);

                // Origin axes (small, subtle)
                const axLen = Math.max(size2.x, size2.y, size2.z) * 0.15;
                this.cfdGroup.add(new THREE.Line(
                    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(axLen,0,0)]),
                    new THREE.LineBasicMaterial({ color: 0xff4444 })));
                this.cfdGroup.add(new THREE.Line(
                    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,axLen,0)]),
                    new THREE.LineBasicMaterial({ color: 0x44ff44 })));
                this.cfdGroup.add(new THREE.Line(
                    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,axLen)]),
                    new THREE.LineBasicMaterial({ color: 0x4444ff })));

                // Update status
                const status = this.el?.querySelector('#cfd-status');
                if (status) {
                    status.textContent = `${this._stlFileName}: ${size2.x.toFixed(1)}×${size2.y.toFixed(1)}×${size2.z.toFixed(1)} m @ Ursprung`;
                    status.style.color = '#44ff44';
                }

                // Update height field with actual Z-extent
                this._selectedHeight = size2.z;
                const hInput = this.el?.querySelector('#cfd-height');
                if (hInput) hInput.value = Math.round(size2.z);

                // Frame camera
                const span = Math.max(size2.x, size2.y, size2.z);
                this.canvas.camera.up.set(0, 0, 1);
                const dist = span * 2.5;
                this.canvas.camera.position.set(-dist * 0.7, -dist * 0.6, span * 0.8);
                this.canvas.controls.target.set(0, 0, size2.z * 0.4);
                this.canvas.controls.update();
            }, undefined, (err) => {
                console.warn('GLB load failed, showing bounding box only:', err);
                this._showBoundsOnly(mn, mx, height);
            });
        } else {
            this._showBoundsOnly(mn, mx, height);
        }
    }

    _showBoundsOnly(mn, mx, height) {
        const footprint = [
            [mn[0], mn[1]], [mx[0], mn[1]],
            [mx[0], mx[1]], [mn[0], mx[1]],
        ];
        this._drawBuildingWireframe(footprint, height);
        const cx = (mn[0] + mx[0]) / 2;
        const cy = (mn[1] + mx[1]) / 2;
        const span = Math.max(mx[0]-mn[0], mx[1]-mn[1], height);
        this.canvas.camera.up.set(0, 0, 1);
        const dist = span * 3;
        this.canvas.camera.position.set(cx - dist*0.8, cy - dist*0.6, height*0.8 + dist*0.5);
        this.canvas.controls.target.set(cx, cy, height * 0.4);
        this.canvas.controls.update();
    }

    _renderVectors(vectors, plane, sliceValue) {
        if (!vectors || vectors.length === 0) return;

        // Find max speed for scaling
        const maxSpeed = Math.max(...vectors.map(v => v.speed), 0.01);
        const bH = this._selectedHeight || 40;
        const arrowScale = bH * 0.15; // Arrow length relative to building size

        // hot colormap for speed
        const hot = (t) => {
            t = Math.max(0, Math.min(1, t));
            return new THREE.Color(Math.min(1, t * 3), Math.min(1, Math.max(0, t * 3 - 1)), Math.min(1, Math.max(0, t * 3 - 2)));
        };

        // Build line segments: each arrow = shaft line + two small head lines
        const positions = [];
        const colors = [];

        for (const v of vectors) {
            const spd = v.speed;
            if (spd < maxSpeed * 0.01) continue; // Skip near-zero

            const t = spd / maxSpeed;
            const len = arrowScale * t;
            const col = hot(t);

            // Normalize direction
            const mag = Math.sqrt(v.vx * v.vx + v.vy * v.vy + v.vz * v.vz);
            if (mag < 1e-8) continue;
            const dx = v.vx / mag, dy = v.vy / mag, dz = v.vz / mag;

            // Start/end in 3D based on slice plane
            let sx, sy, sz, ex, ey, ez;
            if (plane === 'z') {
                sx = v.x; sy = v.y; sz = sliceValue + 0.5;
                ex = sx + dx * len; ey = sy + dy * len; ez = sz + dz * len;
            } else if (plane === 'y') {
                sx = v.x; sy = sliceValue; sz = v.y;
                ex = sx + dx * len; ey = sy + dy * len; ez = sz + dz * len;
            } else {
                sx = sliceValue; sy = v.x; sz = v.y;
                ex = sx + dx * len; ey = sy + dy * len; ez = sz + dz * len;
            }

            // Shaft line
            positions.push(sx, sy, sz, ex, ey, ez);
            colors.push(col.r, col.g, col.b, col.r, col.g, col.b);

            // Arrowhead (two short lines at 25° from tip)
            const headLen = len * 0.25;
            // Perpendicular in the slice plane
            let px, py, pz;
            if (plane === 'z') {
                px = -dy; py = dx; pz = 0;
            } else if (plane === 'y') {
                px = -dz; py = 0; pz = dx;
            } else {
                px = 0; py = -dz; pz = dy;
            }
            const hx1 = ex - dx * headLen + px * headLen * 0.5;
            const hy1 = ey - dy * headLen + py * headLen * 0.5;
            const hz1 = ez - dz * headLen + pz * headLen * 0.5;
            const hx2 = ex - dx * headLen - px * headLen * 0.5;
            const hy2 = ey - dy * headLen - py * headLen * 0.5;
            const hz2 = ez - dz * headLen - pz * headLen * 0.5;

            positions.push(ex, ey, ez, hx1, hy1, hz1);
            colors.push(col.r, col.g, col.b, col.r, col.g, col.b);
            positions.push(ex, ey, ez, hx2, hy2, hz2);
            colors.push(col.r, col.g, col.b, col.r, col.g, col.b);
        }

        if (positions.length > 0) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            const mat = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false });
            this.cfdGroup.add(new THREE.LineSegments(geo, mat));
            console.log(`Vectors: ${vectors.length} arrows on ${plane}=${sliceValue}`);
        }
    }

    async _fetchStreamlines() {
        const caseDir = this._solveResult?.case_dir;
        if (!caseDir) return;

        const status = this.el?.querySelector('#cfd-status');
        const btn = this.el?.querySelector('#cfd-streamlines');
        if (btn) { btn.textContent = 'Stromlinien werden berechnet...'; btn.style.color = '#ffaa44'; }

        try {
            const zMinPct = (this._slZminPct || 0) / 100;
            const zMaxPct = (this._slZmaxPct ?? 100) / 100;
            const nSeeds = this._slNSeeds || 40;
            const res = await fetch('/api/cfd/streamlines3d', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ caseDir, nSeeds, seedZmin: zMinPct, seedZmax: zMaxPct }),
            });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();

            if (data.streamlines && data.streamlines.length > 0) {
                this._streamlineData = data.streamlines;
                this._renderStreamlines(data.streamlines);
                if (btn) { btn.textContent = `${data.count} Stromlinien`; btn.style.color = '#4fa'; }
            } else {
                if (btn) { btn.textContent = 'Keine Stromlinien'; btn.style.color = '#ff6644'; }
            }
        } catch (err) {
            console.error('Streamline error:', err);
            if (btn) { btn.textContent = 'Fehler (Console)'; btn.style.color = '#ff4444'; }
        }
    }

    _renderStreamlines(streamlines) {
        // Clear contour mesh — show only streamlines + building wireframes + ground
        this._clearMesh();

        // Redraw building wireframes
        const blds = this._selectedBuildings || this._selectedTestCase?.buildings;
        if (blds && blds.length > 0) {
            for (const b of blds) this._drawBuildingWireframe(b.footprint, b.height);
        } else if (this._sectionPolygon && this._selectedHeight) {
            this._drawBuildingWireframe(this._sectionPolygon, this._selectedHeight);
        }

        // Ground plane
        const bH = this._selectedHeight || 40;
        let ext = bH * 4;
        if (blds && blds.length > 0) {
            const allXs = blds.flatMap(b => b.footprint.map(p => p[0]));
            const allYs = blds.flatMap(b => b.footprint.map(p => p[1]));
            ext = Math.max(Math.max(...allXs) - Math.min(...allXs), Math.max(...allYs) - Math.min(...allYs)) * 1.5;
        }
        const groundGeo = new THREE.PlaneGeometry(ext * 2, ext * 2);
        const groundMat = new THREE.MeshBasicMaterial({ color: 0x223322, transparent: true, opacity: 0.15, side: THREE.DoubleSide });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.position.set(0, 0, -0.5);
        this.cfdGroup.add(ground);

        // Find global speed range
        let maxSpeed = 0.01;
        for (const sl of streamlines) {
            for (const s of sl.speed) maxSpeed = Math.max(maxSpeed, s);
        }

        // Colormap: cool green→yellow→red (like the reference image)
        const streamColor = (t) => {
            t = Math.max(0, Math.min(1, t));
            if (t < 0.33) {
                const s = t / 0.33;
                return new THREE.Color(0.1, 0.4 + 0.5 * s, 0.3 * (1 - s));
            } else if (t < 0.66) {
                const s = (t - 0.33) / 0.33;
                return new THREE.Color(0.2 + 0.6 * s, 0.9 - 0.2 * s, 0.05);
            } else {
                const s = (t - 0.66) / 0.34;
                return new THREE.Color(0.8 + 0.2 * s, 0.7 - 0.5 * s, 0.05);
            }
        };

        // Get canvas resolution for LineMaterial
        const canvas = this.canvas.renderer.domElement;
        const resolution = new THREE.Vector2(canvas.clientWidth, canvas.clientHeight);

        for (const sl of streamlines) {
            const pts = sl.points;
            const spd = sl.speed;
            if (pts.length < 2) continue;

            // Build fat line with per-vertex colors (Line2)
            const positions = [];
            const colors = [];

            for (let i = 0; i < pts.length; i++) {
                positions.push(pts[i][0], pts[i][1], pts[i][2]);
                const t = (spd[i] || 0) / maxSpeed;
                const col = streamColor(t);
                colors.push(col.r, col.g, col.b);
            }

            const geo = new LineGeometry();
            geo.setPositions(positions);
            geo.setColors(colors);
            const mat = new LineMaterial({
                vertexColors: true,
                linewidth: 3,  // pixels
                resolution,
                worldUnits: false,
            });
            const line = new Line2(geo, mat);
            line.computeLineDistances();
            line.userData.isStreamline = true;
            this.cfdGroup.add(line);
        }

        // Color legend for streamline speed
        this._showColorLegend('|U| [m/s]', 0, maxSpeed, 'hot');

        // Frame camera
        this._frame3dView(this._selectedHeight || 40);
        console.log(`Streamlines rendered: ${streamlines.length} lines, max speed=${maxSpeed.toFixed(2)} m/s`);
    }

    _render3dStats() {
        const ms = this._solveResult?.mesh_stats;
        if (!ms) return '';
        const nCells = ms.n_cells || 0;
        // 3D simpleFoam: p + U(3) + k + epsilon + nut = 7 fields per cell
        const nFields = 7;
        const dof = nCells * nFields;
        return `
            <div style="border-top:1px solid #334;padding-top:8px;margin-top:4px">
                <div style="color:#7eb8ff;font-size:11px;font-weight:600;margin-bottom:4px">3D Mesh</div>
                <div style="font-size:11px;color:#8899aa">Knoten: ${ms.n_nodes?.toLocaleString()}</div>
                <div style="font-size:11px;color:#8899aa">Zellen: ${nCells.toLocaleString()}</div>
                ${dof ? `<div style="font-size:11px;color:#c8d0e0;font-weight:600">DOF: ${dof.toLocaleString()} (${nCells.toLocaleString()} × ${nFields} Felder)</div>` : ''}
                <div style="font-size:11px;color:#8899aa">H = ${ms.building_height || ms.char_dim} m</div>
            </div>
        `;
    }

    _frameCFDView(polygon) {
        if (!polygon || polygon.length < 2) return;
        const xs = polygon.map(p => p[0]), ys = polygon.map(p => p[1]);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 2);
        // Reset camera to XY plane top-down view with correct up vector
        this.canvas.camera.up.set(0, 1, 0);
        this.canvas.camera.position.set(cx, cy, span * 2);
        this.canvas.controls.target.set(cx, cy, 0);
        this.canvas.controls.update();
    }

    _clearMesh() {
        while (this.cfdGroup.children.length > 0) {
            const child = this.cfdGroup.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
            this.cfdGroup.remove(child);
        }
    }

    _clearModelGroup() {
        this._detachGizmo();
        while (this._modelGroup.children.length > 0) {
            const child = this._modelGroup.children[0];
            child.traverse?.((c) => {
                if (c.geometry) c.geometry.dispose();
                if (c.material) c.material.dispose();
            });
            this._modelGroup.remove(child);
        }
    }

    _attachGizmo() {
        if (this._gizmoCtrl) return;
        const target = this._modelGroup.children[0];
        if (!target) return;

        const gizmo = new TransformControls(this.canvas.camera, this.canvas.renderer.domElement);
        gizmo.setMode('rotate');
        gizmo.setSpace('world');
        gizmo.setSize(1.2);

        // Position gizmo at model center
        const box = new THREE.Box3().setFromObject(target);
        const center = box.getCenter(new THREE.Vector3());
        // Wrap target in a pivot so rotation is around center
        this._gizmoPivot = new THREE.Group();
        this._gizmoPivot.position.copy(center);
        // Reparent target under pivot
        const origPos = target.position.clone();
        this._modelGroup.remove(target);
        target.position.sub(center);
        this._gizmoPivot.add(target);
        this._modelGroup.add(this._gizmoPivot);

        gizmo.attach(this._gizmoPivot);
        this.canvas.scene.add(gizmo.getHelper());

        // Disable orbit while dragging gizmo
        gizmo.addEventListener('dragging-changed', (e) => {
            this.canvas.controls.enabled = !e.value;
        });

        // Update rotation readout on change
        gizmo.addEventListener('change', () => {
            const r = this._gizmoPivot.rotation;
            this._stlRotX = Math.round(THREE.MathUtils.radToDeg(r.x));
            this._stlRotY = Math.round(THREE.MathUtils.radToDeg(r.y));
            this._stlRotZ = Math.round(THREE.MathUtils.radToDeg(r.z));
            const readout = this.el?.querySelector('#cfd-rot-readout');
            if (readout) readout.textContent = `${this._stlRotX}° ${this._stlRotY}° ${this._stlRotZ}°`;

            // Update bounding box display
            const box2 = new THREE.Box3().setFromObject(this._gizmoPivot);
            const size2 = box2.getSize(new THREE.Vector3());
            this._selectedHeight = size2.z;
            const hInput = this.el?.querySelector('#cfd-height');
            if (hInput) hInput.value = Math.round(size2.z);
        });

        this._gizmoCtrl = gizmo;
        this._gizmoTarget = target;
    }

    _detachGizmo() {
        if (!this._gizmoCtrl) return;
        this.canvas.scene.remove(this._gizmoCtrl.getHelper());
        this._gizmoCtrl.detach();
        this._gizmoCtrl.dispose();
        this._gizmoCtrl = null;
        this._gizmoActive = false;

        // Unwrap pivot: bake rotation back into model position
        if (this._gizmoPivot && this._gizmoTarget) {
            this._gizmoPivot.updateMatrixWorld(true);
            this._gizmoTarget.applyMatrix4(this._gizmoPivot.matrixWorld);
            this._modelGroup.remove(this._gizmoPivot);
            this._gizmoTarget.position.set(0, 0, 0);
            this._gizmoTarget.rotation.set(0, 0, 0);
            this._gizmoTarget.scale.set(1, 1, 1);
            // Don't re-add — model will be reloaded via _reloadModelPreview
        }
        this._gizmoPivot = null;
        this._gizmoTarget = null;
        this.canvas.controls.enabled = true;
    }

    _reloadModelPreview() {
        if (this._stlModelUrl && this._stlBounds) {
            const s = this._stlScale || 1;
            const b = this._stlBounds;
            const scaledBounds = {
                min: b.min.map(v => v * s),
                max: b.max.map(v => v * s),
            };
            const scaledH = (b.max[2] - b.min[2]) * s;
            this._selectedHeight = scaledH;
            const hInput = this.el?.querySelector('#cfd-height');
            if (hInput) hInput.value = Math.round(scaledH);
            this._render(); this._makeDraggable();
            this._visualize3dFromBounds(scaledBounds, scaledH, this._stlModelUrl);
        }
    }

    _makeDraggable() {
        if (!this.el) return;
        const header = this.el.querySelector('#cfd-header');
        if (!header) return;
        let dragging = false, ox = 0, oy = 0;
        const panel = this.el;
        header.onmousedown = (e) => {
            if (e.target.tagName === 'BUTTON') return;
            dragging = true;
            ox = e.clientX - panel.offsetLeft;
            oy = e.clientY - panel.offsetTop;
            header.style.cursor = 'grabbing';
            e.preventDefault();
        };
        // Remove old listeners before adding new ones
        if (this._dragMove) document.removeEventListener('mousemove', this._dragMove);
        if (this._dragUp) document.removeEventListener('mouseup', this._dragUp);
        this._dragMove = (e) => {
            if (!dragging) return;
            panel.style.left = (e.clientX - ox) + 'px';
            panel.style.top = (e.clientY - oy) + 'px';
        };
        this._dragUp = () => {
            dragging = false;
            header.style.cursor = 'grab';
        };
        document.addEventListener('mousemove', this._dragMove);
        document.addEventListener('mouseup', this._dragUp);
    }
}
