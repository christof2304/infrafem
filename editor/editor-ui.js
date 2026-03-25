// editor-ui.js — Toolbar, Properties Panel, Dialogs, Status Bar
// infraFEM Structural Editor

import { SUPPORT_TYPES, SECTION_TYPES } from './editor-core.js';
import { generateDat, downloadDat } from './editor-dat.js';

// ─── Toolbar ────────────────────────────────────────────────
export class Toolbar {
    constructor(container, model, api, canvas) {
        this.model = model;
        this.canvas = canvas;
        this.api = api;
        this.el = container;
        this._build();
        this.model.bus.on('mode:changed', () => this._updateActive());
    }

    _build() {
        this.el.innerHTML = '';
        const modes = [
            { mode: 'SELECT',  icon: '⬚', label: 'Auswahl (Esc)', key: 'S' },
            { mode: 'NODE',    icon: '●', label: 'Knoten (N)',     key: 'N' },
            { mode: 'BEAM',    icon: '─', label: 'Stab (B)',       key: 'B' },
            { mode: 'RECT',    icon: '▭', label: 'Rechteck (R)',   key: 'R' },
            { mode: 'POLY',    icon: '⬠', label: 'Polylinie (P)',  key: 'P' },
            { mode: 'AREA',    icon: '▢', label: 'Fläche (F)',     key: 'F' },
            { mode: 'SUPPORT', icon: '▽', label: 'Auflager (A)',   key: 'A' },
            { mode: 'LOAD',    icon: '↓', label: 'Last (L)',       key: 'L' },
            { mode: 'DELETE',  icon: '✕', label: 'Löschen (D)',    key: 'D' },
        ];

        for (const m of modes) {
            const btn = document.createElement('button');
            btn.className = 'tool-btn';
            btn.dataset.mode = m.mode;
            btn.title = m.label;
            btn.innerHTML = `<span class="tool-icon">${m.icon}</span><span class="tool-label">${m.key}</span>`;
            btn.onclick = () => this.model.mode = m.mode;
            this.el.appendChild(btn);
        }

        // Separator
        const sep = document.createElement('div');
        sep.className = 'tool-sep';
        this.el.appendChild(sep);

        // Action buttons
        const actions = [
            { icon: '▶', label: 'Berechnen', action: () => this._calculate() },
            { icon: '🔍', label: 'Im Viewer öffnen', action: () => this._openViewer() },
            { icon: '⬇', label: '.dat Export', action: () => downloadDat(this.model.data) },
            { icon: '💾', label: 'Speichern', action: () => this._save() },
            { icon: '📂', label: 'Laden', action: () => this._load() },
            { icon: '🗑', label: 'Neu', action: () => { if (confirm('Modell zurücksetzen?')) this.model.reset(); } },
        ];

        for (const a of actions) {
            const btn = document.createElement('button');
            btn.className = 'tool-btn action-btn';
            btn.title = a.label;
            btn.innerHTML = `<span class="tool-icon">${a.icon}</span>`;
            btn.onclick = a.action;
            this.el.appendChild(btn);
        }

        // Keyboard shortcuts
        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
            const keyMap = { s: 'SELECT', n: 'NODE', b: 'BEAM', r: 'RECT', p: 'POLY', f: 'AREA', a: 'SUPPORT', l: 'LOAD', d: 'DELETE' };
            if (keyMap[e.key.toLowerCase()] && !e.ctrlKey) {
                this.model.mode = keyMap[e.key.toLowerCase()];
            }
        });

        this._updateActive();
    }

    _updateActive() {
        for (const btn of this.el.querySelectorAll('.tool-btn[data-mode]')) {
            btn.classList.toggle('active', btn.dataset.mode === this.model.mode);
        }
    }

    async _calculate() {
        const statusEl = document.getElementById('status-msg');
        try {
            statusEl.textContent = 'Berechnung läuft...';
            const result = await this.api.calculate(this.model.data);
            if (result.success) {
                statusEl.textContent = `Berechnung OK — lade Ergebnisse...`;
                try {
                    const resultData = await this.api.fetchResults(result.sqlite);
                    this.model.setResults(resultData, result.sqlite);
                    const nForces = resultData.beams.length + resultData.quads.length;
                    statusEl.textContent = `Berechnung OK — ${resultData.nodes.length} Knoten, ${nForces} Schnittgrößen`;
                } catch (e) {
                    statusEl.textContent = `Berechnung OK — Ergebnisse nicht ladbar: ${e.message}`;
                }
            } else {
                statusEl.textContent = `Fehler: ${result.errors?.join(', ') || 'Unbekannt'}`;
                alert('Berechnung fehlgeschlagen:\n' + (result.log || result.errors?.join('\n') || 'Unbekannter Fehler'));
            }
        } catch (err) {
            statusEl.textContent = `API-Fehler: ${err.message}`;
        }
    }

    _openViewer() {
        if (this.model._resultSqlite) {
            this.api.openViewer(this.model._resultSqlite);
        } else {
            alert('Erst berechnen — keine Ergebnisse vorhanden.');
        }
    }

    async _save() {
        const name = prompt('Modellname:', this.model.data.meta.name);
        if (!name) return;
        this.model.data.meta.name = name;
        try {
            await this.api.saveModel(name, this.model.data);
            document.getElementById('status-msg').textContent = `Gespeichert: ${name}`;
        } catch (err) {
            alert('Speichern fehlgeschlagen: ' + err.message);
        }
    }

    async _load() {
        try {
            const models = await this.api.listModels();
            if (models.length === 0) { alert('Keine gespeicherten Modelle.'); return; }
            const name = prompt('Modell laden:\n' + models.map((m, i) => `${i + 1}. ${m}`).join('\n') + '\n\nName eingeben:');
            if (!name) return;
            const data = await this.api.loadModel(name);
            this.model.loadJSON(data);
            document.getElementById('status-msg').textContent = `Geladen: ${name}`;
        } catch (err) {
            alert('Laden fehlgeschlagen: ' + err.message);
        }
    }
}

// ─── Properties Panel ───────────────────────────────────────
export class PropertiesPanel {
    constructor(container, model) {
        this.model = model;
        this.el = container;
        this.model.bus.on('selection:changed', () => this._render());
        this.model.bus.on('model:changed', () => this._render());
        // Results are handled by ResultWidget now
        this.model.bus.on('support:requested', (nodeId) => this._showSupportDialog(nodeId));
        this.model.bus.on('load:requested', (info) => this._showLoadDialog(info));
        this._render();
    }

    _render() {
        const sel = this.model.selection;
        if (sel.type === 'multi') this._renderMultiProps(sel);
        else if (sel.type === 'node') this._renderNodeProps(sel.id);
        else if (sel.type === 'beam') this._renderBeamProps(sel.id);
        else if (sel.type === 'area') this._renderAreaProps(sel.id);
        else this._renderModelProps();
    }

    // ── Model Properties (default view) ────────────────────
    _renderModelProps() {
        const d = this.model.data;
        this.el.innerHTML = `
            <h3>Modell</h3>
            <div class="prop-group">
                <label>Name</label>
                <input type="text" id="prop-name" value="${d.meta.name}">
            </div>
            <div class="prop-group">
                <label>System</label>
                <select id="prop-system">
                    <option value="RAHM" ${d.meta.systemType === 'RAHM' ? 'selected' : ''}>2D Rahmen</option>
                    <option value="PLATTE" ${d.meta.systemType === 'PLATTE' ? 'selected' : ''}>2D Platte</option>
                    <option value="SCHEIBE" ${d.meta.systemType === 'SCHEIBE' ? 'selected' : ''}>2D Scheibe</option>
                    <option value="ROST" ${d.meta.systemType === 'ROST' ? 'selected' : ''}>2D Rost</option>
                    <option value="3D" ${d.meta.systemType === '3D' ? 'selected' : ''}>3D</option>
                </select>
            </div>

            <h3>Materialien <button class="btn-sm" id="add-mat">+</button></h3>
            <div id="mat-list">
                ${d.materials.map(m => `
                    <div class="list-item" data-id="${m.id}">
                        <span>${m.id}: ${m.label || m.type + ' ' + m.grade}</span>
                        <button class="btn-sm btn-del" data-action="del-mat" data-id="${m.id}">×</button>
                    </div>
                `).join('')}
            </div>

            <h3>Querschnitte <button class="btn-sm" id="add-sec">+</button></h3>
            <div id="sec-list">
                ${d.sections.map(s => `
                    <div class="list-item" data-id="${s.id}">
                        <span>${s.id}: ${s.label || s.type}</span>
                        <button class="btn-sm btn-del" data-action="del-sec" data-id="${s.id}">×</button>
                    </div>
                `).join('')}
            </div>

            <h3>Lastfälle <button class="btn-sm" id="add-lc">+</button></h3>
            <div id="lc-list">
                ${d.loadcases.map(lc => `
                    <div class="list-item ${lc.id === this.model.activeLoadcase ? 'active' : ''}" data-id="${lc.id}">
                        <span class="lc-select" data-id="${lc.id}">${lc.id}: ${lc.name} (${lc.loads.length} Lasten)</span>
                        <button class="btn-sm btn-del" data-action="del-lc" data-id="${lc.id}">×</button>
                    </div>
                `).join('')}
            </div>

            <h3>Analyse</h3>
            <div class="prop-group">
                <label>Typ</label>
                <select id="prop-analysis">
                    <option value="LINE" ${d.analysisSettings.type === 'LINE' ? 'selected' : ''}>Linear</option>
                    <option value="TH2" ${d.analysisSettings.type === 'TH2' ? 'selected' : ''}>Theorie II. Ordnung</option>
                    <option value="TH3" ${d.analysisSettings.type === 'TH3' ? 'selected' : ''}>Theorie III. Ordnung</option>
                </select>
            </div>

            <h3>Darstellung</h3>
            <div class="prop-group">
                <label>Querschnitte</label>
                <input type="checkbox" id="prop-show-sections">
            </div>

            <h3>Vernetzung</h3>
            <div class="prop-group">
                <label>Elem.größe [m]</label>
                <input type="range" id="prop-hmin" min="0.1" max="3.0" step="0.1" value="${d.meshSettings?.hmin || 0.5}" style="flex:1">
                <span id="prop-hmin-val" class="prop-val">${(d.meshSettings?.hmin || 0.5).toFixed(1)}</span>
            </div>

            <h3>.dat Vorschau</h3>
            <button class="btn-full" id="show-dat">Vorschau anzeigen</button>

            ${this.model.hasResults ? this._renderResultSummaryHTML() : ''}
        `;

        // Bind events
        this.el.querySelector('#prop-name').onchange = (e) => {
            this.model.data.meta.name = e.target.value;
        };
        this.el.querySelector('#prop-system').onchange = (e) => {
            this.model.data.meta.systemType = e.target.value;
        };
        this.el.querySelector('#prop-analysis').onchange = (e) => {
            this.model.data.analysisSettings.type = e.target.value;
        };
        const hminSlider = this.el.querySelector('#prop-hmin');
        if (hminSlider) {
            hminSlider.oninput = () => {
                const val = parseFloat(hminSlider.value);
                this.el.querySelector('#prop-hmin-val').textContent = val.toFixed(1);
                if (!this.model.data.meshSettings) this.model.data.meshSettings = {};
                this.model.data.meshSettings.hmin = val;
            };
        }
        const showSecCb = this.el.querySelector('#prop-show-sections');
        if (showSecCb) {
            showSecCb.onchange = () => {
                this.model.bus.emit('display:showSections', showSecCb.checked);
            };
        }

        // Material/Section/LC actions
        this.el.querySelector('#add-mat')?.addEventListener('click', () => this._showMaterialDialog());
        this.el.querySelector('#add-sec')?.addEventListener('click', () => this._showSectionDialog());
        this.el.querySelector('#add-lc')?.addEventListener('click', () => {
            const name = prompt('Lastfall-Name:');
            if (name) this.model.addLoadcase(name);
        });

        // Delete buttons
        for (const btn of this.el.querySelectorAll('[data-action="del-mat"]')) {
            btn.onclick = () => {
                if (!this.model.deleteMaterial(+btn.dataset.id)) alert('Material wird verwendet.');
            };
        }
        for (const btn of this.el.querySelectorAll('[data-action="del-sec"]')) {
            btn.onclick = () => {
                if (!this.model.deleteSection(+btn.dataset.id)) alert('Querschnitt wird verwendet.');
            };
        }
        for (const btn of this.el.querySelectorAll('[data-action="del-lc"]')) {
            btn.onclick = () => {
                if (!this.model.deleteLoadcase(+btn.dataset.id)) alert('Letzter Lastfall kann nicht gelöscht werden.');
            };
        }

        // Loadcase selection
        for (const span of this.el.querySelectorAll('.lc-select')) {
            span.onclick = () => { this.model.activeLoadcase = +span.dataset.id; };
        }

        // DAT preview
        this.el.querySelector('#show-dat')?.addEventListener('click', () => {
            const dat = generateDat(this.model.data);
            this._showDatPreview(dat);
        });
    }

    // ── Result Summary ──────────────────────────────────────
    _renderResultSummaryHTML() {
        const rd = this.model.resultData;
        if (!rd) return '';

        // Compute min/max for each force type
        const beams = rd.beams || [];
        let minN = Infinity, maxN = -Infinity;
        let minVz = Infinity, maxVz = -Infinity;
        let minMy = Infinity, maxMy = -Infinity;
        let minUx = Infinity, maxUx = -Infinity;
        let minUy = Infinity, maxUy = -Infinity;

        for (const f of beams) {
            if (f.N !== undefined) { minN = Math.min(minN, f.N); maxN = Math.max(maxN, f.N); }
            if (f.Vz !== undefined) { minVz = Math.min(minVz, f.Vz); maxVz = Math.max(maxVz, f.Vz); }
            if (f.My !== undefined) { minMy = Math.min(minMy, f.My); maxMy = Math.max(maxMy, f.My); }
        }
        for (const n of (rd.nodes || [])) {
            if (n.uX !== undefined) { minUx = Math.min(minUx, n.uX); maxUx = Math.max(maxUx, n.uX); }
            if (n.uY !== undefined) { minUy = Math.min(minUy, n.uY); maxUy = Math.max(maxUy, n.uY); }
        }

        const fmt = (v) => isFinite(v) ? v.toFixed(3) : '—';

        return `
            <h3>Ergebnisse (LF 1)</h3>
            <div class="result-summary">
                <div class="result-row"><span class="result-label">N [kN]</span><span class="result-val">${fmt(minN)} / ${fmt(maxN)}</span></div>
                <div class="result-row"><span class="result-label">Vz [kN]</span><span class="result-val">${fmt(minVz)} / ${fmt(maxVz)}</span></div>
                <div class="result-row"><span class="result-label">My [kNm]</span><span class="result-val">${fmt(minMy)} / ${fmt(maxMy)}</span></div>
                <div class="result-row"><span class="result-label">uX [m]</span><span class="result-val">${fmt(minUx)} / ${fmt(maxUx)}</span></div>
                <div class="result-row"><span class="result-label">uY [m]</span><span class="result-val">${fmt(minUy)} / ${fmt(maxUy)}</span></div>
            </div>
        `;
    }

    // ── Node Properties ────────────────────────────────────
    _renderNodeProps(nodeId) {
        const node = this.model.getNode(nodeId);
        if (!node) { this._renderModelProps(); return; }

        const supportOptions = Object.entries(SUPPORT_TYPES).map(([key, val]) =>
            `<option value="${key}" ${node.support === key ? 'selected' : ''}>${val.label}</option>`
        ).join('');

        const springStiffnessHtml = node.support === 'SPRING' ? `
            <div class="prop-group">
                <label>Steifigkeit [kN/m]</label>
                <input type="number" id="prop-spring-k" value="${node.springStiffness || 1e6}" step="1000">
            </div>` : '';

        // Gather existing node loads for active loadcase
        const activeLc = this.model.activeLoadcase;
        const lc = this.model.data.loadcases.find(l => l.id === activeLc);
        const nodeLoads = lc ? lc.loads.filter(l => l.type === 'NODE_FORCE' && l.nodeId === nodeId) : [];
        const existingLoadsHtml = nodeLoads.map(l =>
            `<div class="prop-group" style="gap:4px">
                <label style="min-width:40px">${l.direction}</label>
                <span class="prop-val" style="flex:1">${l.value} kN</span>
                <button class="btn-sm btn-del" data-action="del-load" data-loadid="${l.id}" title="Last löschen">&times;</button>
            </div>`
        ).join('');

        this.el.innerHTML = `
            <h3>Knoten ${node.id}</h3>
            <div class="prop-group">
                <label>X [m]</label>
                <input type="number" id="prop-x" value="${node.x}" step="0.1">
            </div>
            <div class="prop-group">
                <label>Z [m]</label>
                <input type="number" id="prop-z" value="${node.z}" step="0.1">
            </div>
            <div class="prop-group">
                <label>Auflager</label>
                <select id="prop-support">${supportOptions}</select>
            </div>
            ${springStiffnessHtml}

            <h3>Lasten (LF ${activeLc})</h3>
            ${existingLoadsHtml || '<div style="font-size:11px;color:#667;margin-bottom:6px">Keine Lasten</div>'}
            <div class="prop-group">
                <label>F [kN]</label>
                <input type="number" id="load-val" value="-50" step="1">
            </div>
            <div class="prop-group">
                <label>Richtung</label>
                <select id="load-dir">
                    <option value="PZ">PZ (vertikal)</option>
                    <option value="PX">PX (horizontal)</option>
                </select>
            </div>
            <button class="btn-full" id="add-node-load">Last hinzufügen</button>

            <button class="btn-full btn-danger" id="del-node" style="margin-top:12px">Knoten löschen</button>
        `;

        this.el.querySelector('#prop-x').onchange = (e) => {
            this.model.updateNode(nodeId, { x: parseFloat(e.target.value) });
        };
        this.el.querySelector('#prop-z').onchange = (e) => {
            this.model.updateNode(nodeId, { z: parseFloat(e.target.value) });
        };
        this.el.querySelector('#prop-support').onchange = (e) => {
            this.model.updateNode(nodeId, { support: e.target.value });
        };
        const springKInput = this.el.querySelector('#prop-spring-k');
        if (springKInput) {
            springKInput.onchange = (e) => {
                this.model.updateNode(nodeId, { springStiffness: parseFloat(e.target.value) });
            };
        }
        this.el.querySelector('#del-node').onclick = () => {
            this.model.deleteNode(nodeId);
            this.model.deselect();
        };

        // Add load button
        this.el.querySelector('#add-node-load').onclick = () => {
            const val = parseFloat(this.el.querySelector('#load-val').value);
            const dir = this.el.querySelector('#load-dir').value;
            if (isNaN(val)) return;
            this.model.addLoad(activeLc, {
                type: 'NODE_FORCE', nodeId,
                direction: dir, value: val,
            });
        };

        // Delete load buttons
        for (const btn of this.el.querySelectorAll('[data-action="del-load"]')) {
            btn.onclick = () => {
                this.model.deleteLoad(activeLc, +btn.dataset.loadid);
            };
        }
    }

    // ── Beam Properties ────────────────────────────────────
    _renderBeamProps(beamId) {
        const beam = this.model.getBeam(beamId);
        if (!beam) { this._renderModelProps(); return; }

        const sections = this.model.data.sections;
        const groups = this.model.data.groups;
        const length = this.model.beamLength(beamId);

        const secOpts = sections.map(s =>
            `<option value="${s.id}" ${beam.sectionId === s.id ? 'selected' : ''}>${s.id}: ${s.label || s.type}</option>`
        ).join('');

        const grpOpts = groups.map(g =>
            `<option value="${g.id}" ${beam.groupId === g.id ? 'selected' : ''}>${g.id}: ${g.name}</option>`
        ).join('');

        // Gather existing beam loads for active loadcase
        const activeLc = this.model.activeLoadcase;
        const lc = this.model.data.loadcases.find(l => l.id === activeLc);
        const beamLoads = lc ? lc.loads.filter(l => l.type === 'BEAM_LINE' && l.elementId === beamId) : [];
        const existingLoadsHtml = beamLoads.map(l =>
            `<div class="prop-group" style="gap:4px">
                <label style="min-width:40px">${l.direction}</label>
                <span class="prop-val" style="flex:1">${l.p1}/${l.p2} kN/m</span>
                <button class="btn-sm btn-del" data-action="del-beam-load" data-loadid="${l.id}" title="Last löschen">&times;</button>
            </div>`
        ).join('');

        const isStructLine = beam.isStructLine || false;

        this.el.innerHTML = `
            <h3>${isStructLine ? 'Strukturlinie' : 'Stab'} ${beam.id}</h3>
            <div class="prop-group">
                <label>Typ</label>
                <select id="prop-beam-type">
                    <option value="beam" ${!isStructLine ? 'selected' : ''}>Biegestab</option>
                    <option value="structline" ${isStructLine ? 'selected' : ''}>Strukturlinie</option>
                </select>
            </div>
            <div class="prop-group">
                <label>Von Knoten</label>
                <span class="prop-val">${beam.nodeStart}</span>
            </div>
            <div class="prop-group">
                <label>Bis Knoten</label>
                <span class="prop-val">${beam.nodeEnd}</span>
            </div>
            <div class="prop-group">
                <label>Länge [m]</label>
                <span class="prop-val">${length.toFixed(3)}</span>
            </div>
            ${!isStructLine ? `
            <div class="prop-group">
                <label>Querschnitt</label>
                <select id="prop-sec">${secOpts}</select>
            </div>
            <div class="prop-group">
                <label>Gruppe</label>
                <select id="prop-grp">${grpOpts}</select>
            </div>
            ` : ''}
            ${!isStructLine ? '<h3>Gelenke</h3>' : ''}
            <div class="prop-group">
                <label>Gelenk Anfang</label>
                <input type="checkbox" id="prop-hinge-start" ${beam.hingeStart ? 'checked' : ''}>
            </div>
            <div class="prop-group">
                <label>Gelenk Ende</label>
                <input type="checkbox" id="prop-hinge-end" ${beam.hingeEnd ? 'checked' : ''}>
            </div>

            <h3>Lasten (LF ${activeLc})</h3>
            ${existingLoadsHtml || '<div style="font-size:11px;color:#667;margin-bottom:6px">Keine Lasten</div>'}
            <div class="prop-group">
                <label>p1 [kN/m]</label>
                <input type="number" id="load-p1" value="-10" step="1">
            </div>
            <div class="prop-group">
                <label>p2 [kN/m]</label>
                <input type="number" id="load-p2" value="-10" step="1">
            </div>
            <div class="prop-group">
                <label>Richtung</label>
                <select id="load-dir">
                    <option value="PZZ">PZZ (vertikal)</option>
                    <option value="PXX">PXX (horizontal)</option>
                </select>
            </div>
            <button class="btn-full" id="add-beam-load">Last hinzufügen</button>

            <button class="btn-full btn-danger" id="del-beam" style="margin-top:12px">Stab löschen</button>
        `;

        this.el.querySelector('#prop-beam-type').onchange = (e) => {
            this.model.updateBeam(beamId, { isStructLine: e.target.value === 'structline' });
        };
        this.el.querySelector('#prop-sec')?.addEventListener('change', (e) => {
            this.model.updateBeam(beamId, { sectionId: +e.target.value });
        });
        this.el.querySelector('#prop-grp')?.addEventListener('change', (e) => {
            this.model.updateBeam(beamId, { groupId: +e.target.value });
        });
        this.el.querySelector('#prop-hinge-start')?.addEventListener('change', (e) => {
            this.model.updateBeam(beamId, { hingeStart: e.target.checked });
        });
        this.el.querySelector('#prop-hinge-end').onchange = (e) => {
            this.model.updateBeam(beamId, { hingeEnd: e.target.checked });
        };
        this.el.querySelector('#del-beam').onclick = () => {
            this.model.deleteBeam(beamId);
            this.model.deselect();
        };

        // Add beam load button
        this.el.querySelector('#add-beam-load').onclick = () => {
            const p1 = parseFloat(this.el.querySelector('#load-p1').value);
            const p2 = parseFloat(this.el.querySelector('#load-p2').value);
            const dir = this.el.querySelector('#load-dir').value;
            if (isNaN(p1) || isNaN(p2)) return;
            this.model.addLoad(activeLc, {
                type: 'BEAM_LINE', elementId: beamId,
                direction: dir, p1, p2,
            });
        };

        // Delete beam load buttons
        for (const btn of this.el.querySelectorAll('[data-action="del-beam-load"]')) {
            btn.onclick = () => {
                this.model.deleteLoad(activeLc, +btn.dataset.loadid);
            };
        }
    }

    // ── Area Properties ─────────────────────────────────────
    _renderAreaProps(areaId) {
        const area = this.model.getArea(areaId);
        if (!area) { this._renderModelProps(); return; }

        const materials = this.model.data.materials;
        const groups = this.model.data.groups;
        const size = this.model.areaSize(areaId);

        const matOpts = materials.map(m =>
            `<option value="${m.id}" ${area.materialId === m.id ? 'selected' : ''}>${m.id}: ${m.label || m.type + ' ' + m.grade}</option>`
        ).join('');

        const grpOpts = `<option value="0" ${area.groupId === 0 ? 'selected' : ''}>0: Standard</option>` +
            groups.map(g =>
                `<option value="${g.id}" ${area.groupId === g.id ? 'selected' : ''}>${g.id}: ${g.name}</option>`
            ).join('');

        const supTypes = { NONE: 'Frei', FIXED: 'Einspannung', PINNED: 'Gelenk', ROLLER_X: 'Verschieblich' };
        const edgeSups = area.edgeSupports || area.boundaryNodeIds.map(() => 'PINNED');
        const edgeHtml = area.boundaryNodeIds.map((nid, i) => {
            const n2id = area.boundaryNodeIds[(i + 1) % area.boundaryNodeIds.length];
            const opts = Object.entries(supTypes).map(([k, v]) =>
                `<option value="${k}" ${edgeSups[i] === k ? 'selected' : ''}>${v}</option>`
            ).join('');
            return `<div class="prop-group">
                <label>${nid}→${n2id}</label>
                <select class="edge-sup" data-idx="${i}">${opts}</select>
            </div>`;
        }).join('');

        // Gather existing area loads for active loadcase
        const activeLc = this.model.activeLoadcase;
        const lc = this.model.data.loadcases.find(l => l.id === activeLc);
        const areaLoads = lc ? lc.loads.filter(l => l.type === 'AREA_LOAD' && l.areaId === areaId) : [];
        const existingLoadsHtml = areaLoads.map(l =>
            `<div class="prop-group" style="gap:4px">
                <label style="min-width:40px">${l.direction}</label>
                <span class="prop-val" style="flex:1">${l.value} kN/m²</span>
                <button class="btn-sm btn-del" data-action="del-area-load" data-loadid="${l.id}" title="Last löschen">&times;</button>
            </div>`
        ).join('');

        this.el.innerHTML = `
            <h3>Fläche ${area.id}</h3>
            <div class="prop-group">
                <label>Dicke [m]</label>
                <input type="number" id="prop-thickness" value="${area.thickness}" step="0.01" min="0.01">
            </div>
            <div class="prop-group">
                <label>Material</label>
                <select id="prop-area-mat">${matOpts}</select>
            </div>
            <h3>Randlagerung</h3>
            ${edgeHtml}
            <div class="prop-group">
                <label>Fläche [m²]</label>
                <span class="prop-val">${size.toFixed(3)}</span>
            </div>

            <h3>Aussparungen</h3>
            ${(() => {
                const openings = this.model.getOpeningsForArea(areaId);
                if (openings.length === 0) return '<div style="font-size:11px;color:#667;margin-bottom:6px">Keine Aussparungen</div>';
                return openings.map(o => `
                    <div class="prop-group" style="gap:4px">
                        <label style="min-width:40px">Aussparung ${o.id}</label>
                        <span class="prop-val" style="flex:1">${o.boundaryNodeIds.length} Knoten</span>
                        <button class="btn-sm btn-del" data-action="del-opening" data-openingid="${o.id}" title="Aussparung löschen">&times;</button>
                    </div>
                `).join('');
            })()}

            <h3>Lasten (LF ${activeLc})</h3>
            ${existingLoadsHtml || '<div style="font-size:11px;color:#667;margin-bottom:6px">Keine Lasten</div>'}
            <div class="prop-group">
                <label>q [kN/m²]</label>
                <input type="number" id="load-q" value="-5" step="0.5">
            </div>
            <div class="prop-group">
                <label>Richtung</label>
                <select id="load-dir">
                    <option value="PZZ">PZZ (vertikal)</option>
                </select>
            </div>
            <button class="btn-full" id="add-area-load">Last hinzufügen</button>

            <button class="btn-full btn-danger" id="del-area" style="margin-top:12px">Fläche löschen</button>
        `;

        this.el.querySelector('#prop-thickness').onchange = (e) => {
            this.model.updateArea(areaId, { thickness: parseFloat(e.target.value) });
        };
        this.el.querySelector('#prop-area-mat').onchange = (e) => {
            this.model.updateArea(areaId, { materialId: +e.target.value });
        };
        for (const sel of this.el.querySelectorAll('.edge-sup')) {
            sel.onchange = () => {
                const idx = parseInt(sel.dataset.idx);
                const sups = [...(area.edgeSupports || area.boundaryNodeIds.map(() => 'PINNED'))];
                sups[idx] = sel.value;
                this.model.updateArea(areaId, { edgeSupports: sups });
            };
        }
        this.el.querySelector('#del-area').onclick = () => {
            this.model.deleteArea(areaId);
            this.model.deselect();
        };

        // Add area load button
        this.el.querySelector('#add-area-load').onclick = () => {
            const val = parseFloat(this.el.querySelector('#load-q').value);
            const dir = this.el.querySelector('#load-dir').value;
            if (isNaN(val)) return;
            this.model.addLoad(activeLc, {
                type: 'AREA_LOAD', areaId,
                direction: dir, value: val,
            });
        };

        // Delete area load buttons
        for (const btn of this.el.querySelectorAll('[data-action="del-area-load"]')) {
            btn.onclick = () => {
                this.model.deleteLoad(activeLc, +btn.dataset.loadid);
            };
        }

        // Delete opening buttons
        for (const btn of this.el.querySelectorAll('[data-action="del-opening"]')) {
            btn.onclick = () => {
                this.model.deleteOpening(+btn.dataset.openingid);
            };
        }
    }

    // ── Multi-Selection Properties ─────────────────────────
    _renderMultiProps(sel) {
        const nCount = sel.nodeIds ? sel.nodeIds.size : 0;
        const bCount = sel.beamIds ? sel.beamIds.size : 0;

        this.el.innerHTML = `
            <h3>Mehrfachauswahl</h3>
            <div class="prop-group">
                <label>Knoten</label>
                <span class="prop-val">${nCount}</span>
            </div>
            <div class="prop-group">
                <label>Stäbe</label>
                <span class="prop-val">${bCount}</span>
            </div>
            ${nCount > 0 ? `
            <div class="prop-group">
                <label>IDs</label>
                <span class="prop-val" style="font-size:10px">${[...sel.nodeIds].join(', ')}</span>
            </div>` : ''}
            ${bCount > 0 ? `
            <div class="prop-group">
                <label>IDs</label>
                <span class="prop-val" style="font-size:10px">${[...sel.beamIds].join(', ')}</span>
            </div>` : ''}
            ${nCount > 0 ? `
                <h3>Auflager (alle Knoten)</h3>
                <div class="prop-group">
                    <label>Setzen auf</label>
                    <select id="prop-multi-support">
                        <option value="">-- wählen --</option>
                        ${Object.entries(SUPPORT_TYPES).map(([key, val]) =>
                            `<option value="${key}">${val.label}</option>`
                        ).join('')}
                    </select>
                </div>
            ` : ''}
            ${bCount > 0 ? `
                <h3>Querschnitt (alle Stäbe)</h3>
                <div class="prop-group">
                    <label>Setzen auf</label>
                    <select id="prop-multi-sec">
                        <option value="">-- wählen --</option>
                        ${this.model.data.sections.map(s =>
                            `<option value="${s.id}">${s.id}: ${s.label || s.type}</option>`
                        ).join('')}
                    </select>
                </div>
            ` : ''}
            <button class="btn-full btn-danger" id="del-multi">Auswahl löschen</button>
        `;

        if (nCount > 0) {
            const supEl = this.el.querySelector('#prop-multi-support');
            if (supEl) {
                supEl.onchange = (e) => {
                    if (!e.target.value) return;
                    for (const nid of sel.nodeIds) {
                        this.model.updateNode(nid, { support: e.target.value });
                    }
                };
            }
        }
        if (bCount > 0) {
            const secEl = this.el.querySelector('#prop-multi-sec');
            if (secEl) {
                secEl.onchange = (e) => {
                    if (!e.target.value) return;
                    for (const bid of sel.beamIds) {
                        this.model.updateBeam(bid, { sectionId: +e.target.value });
                    }
                };
            }
        }

        this.el.querySelector('#del-multi').onclick = () => {
            // Delete beams first, then nodes
            if (sel.beamIds) {
                for (const bid of sel.beamIds) this.model.deleteBeam(bid);
            }
            if (sel.nodeIds) {
                for (const nid of sel.nodeIds) this.model.deleteNode(nid);
            }
            this.model.deselect();
        };
    }

    // ── Dialogs ────────────────────────────────────────────
    _showSupportDialog(nodeId) {
        const node = this.model.getNode(nodeId);
        if (!node) return;
        this.model.select('node', nodeId);
        // Properties panel will show support dropdown
    }

    _showLoadDialog(info) {
        const lc = this.model.activeLoadcase;
        if (info.type === 'area') {
            const val = prompt('Flächenlast [kN/m²] (negativ = nach unten):', '-5');
            if (val === null) return;
            const dir = prompt('Richtung (PZZ = vertikal):', 'PZZ');
            if (dir === null) return;
            this.model.addLoad(lc, {
                type: 'AREA_LOAD', areaId: info.id,
                direction: dir.toUpperCase(), value: parseFloat(val),
            });
        } else if (info.type === 'beam') {
            const p1 = prompt('Streckenlast p1 [kN/m] (negativ = nach unten):', '-10');
            if (p1 === null) return;
            const p2 = prompt('Streckenlast p2 [kN/m]:', p1);
            if (p2 === null) return;
            const dir = prompt('Richtung (PZZ = vertikal, PXX = horizontal):', 'PZZ');
            if (dir === null) return;
            this.model.addLoad(lc, {
                type: 'BEAM_LINE', elementId: info.id,
                direction: dir.toUpperCase(), p1: parseFloat(p1), p2: parseFloat(p2),
            });
        } else if (info.type === 'node') {
            const val = prompt('Einzellast [kN] (negativ = nach unten):', '-50');
            if (val === null) return;
            const dir = prompt('Richtung (PZ = vertikal, PX = horizontal):', 'PZ');
            if (dir === null) return;
            this.model.addLoad(lc, {
                type: 'NODE_FORCE', nodeId: info.id,
                direction: dir.toUpperCase(), value: parseFloat(val),
            });
        }
    }

    _showMaterialDialog() {
        const type = prompt('Typ (BETO oder STAH):', 'BETO');
        if (!type) return;
        const grade = prompt('Güte (z.B. C 30 oder S 500):', type === 'BETO' ? 'C 30' : 'S 500');
        if (!grade) return;
        const label = prompt('Bezeichnung:', `${type === 'BETO' ? 'Beton' : 'Stahl'} ${grade}`);
        this.model.addMaterial(type.toUpperCase(), grade, label || '');
    }

    _showSectionDialog() {
        const typeKey = prompt('Typ (SREC=Rechteck, SCIR=Kreis, TUBE=Rohr):', 'SREC');
        if (!typeKey) return;
        const secType = SECTION_TYPES[typeKey.toUpperCase()];
        if (!secType) { alert('Unbekannter Typ: ' + typeKey); return; }

        const params = {};
        for (let i = 0; i < secType.params.length; i++) {
            const val = prompt(`${secType.params[i]} [${secType.units[i]}]:`, '0.5');
            if (val === null) return;
            params[secType.params[i]] = parseFloat(val);
        }

        const matId = this.model.data.materials[0]?.id || 1;
        const label = prompt('Bezeichnung:', Object.values(params).join('/'));
        this.model.addSection(typeKey.toUpperCase(), matId, params, label || '');
    }

    _showDatPreview(dat) {
        const overlay = document.createElement('div');
        overlay.className = 'dat-overlay';
        overlay.innerHTML = `
            <div class="dat-dialog">
                <div class="dat-header">
                    <h3>.dat Vorschau</h3>
                    <button class="btn-sm" id="close-dat">✕</button>
                </div>
                <pre class="dat-content">${dat.replace(/</g, '&lt;')}</pre>
                <div class="dat-footer">
                    <button class="btn-full" id="copy-dat">Kopieren</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector('#close-dat').onclick = () => overlay.remove();
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
        overlay.querySelector('#copy-dat').onclick = () => {
            navigator.clipboard.writeText(dat);
            overlay.querySelector('#copy-dat').textContent = 'Kopiert!';
        };
    }
}

// ─── Status Bar ─────────────────────────────────────────────
export class StatusBar {
    constructor(container, model, canvas) {
        this.model = model;
        this.canvas = canvas || null;
        this.el = container;
        this.model.bus.on('mode:changed', () => this._render());
        this.model.bus.on('model:changed', () => this._render());
        this.model.bus.on('cursor:moved', (pos) => this._updateCursor(pos));
        this._cursorX = 0;
        this._cursorZ = 0;
        this._snapLabel = '';
        this._render();
    }

    _render() {
        const d = this.model.data;
        const modeLabels = {
            SELECT: 'Auswahl', NODE: 'Knoten setzen', BEAM: 'Stab zeichnen',
            RECT: 'Rechteck zeichnen', POLY: 'Polylinie zeichnen',
            AREA: 'Fläche definieren', SUPPORT: 'Auflager zuweisen',
            LOAD: 'Last definieren', DELETE: 'Löschen',
        };
        this.el.innerHTML = `
            <span class="status-mode">${modeLabels[this.model.mode] || this.model.mode}</span>
            <span class="status-sep">|</span>
            <input type="text" id="coord-input" placeholder="x,z oder @dx,dz" autocomplete="off">
            <span class="status-sep">|</span>
            <span class="status-coords" id="status-coords">X: ${this._cursorX.toFixed(2)}  Z: ${this._cursorZ.toFixed(2)}</span>
            <span class="status-snap" id="status-snap"></span>
            <span class="status-sep">|</span>
            <span>${d.nodes.length} Knoten, ${d.beams.length} Stäbe${(d.areas || []).length > 0 ? `, ${d.areas.length} Flächen` : ''}</span>
            <span class="status-sep">|</span>
            <span>LF ${this.model.activeLoadcase}</span>
            <span class="status-right" id="status-msg"></span>
        `;
        this._bindCoordInput();
    }

    _bindCoordInput() {
        const input = document.getElementById('coord-input');
        if (!input) return;

        // Tab key focuses the input
        this._tabHandler = (e) => {
            if (e.key === 'Tab' && document.activeElement !== input &&
                document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT') {
                e.preventDefault();
                input.focus();
                input.select();
            }
        };
        // Remove old handler if exists, then add new
        window.removeEventListener('keydown', this._tabHandlerRef);
        this._tabHandlerRef = this._tabHandler;
        window.addEventListener('keydown', this._tabHandler);

        input.addEventListener('keydown', (e) => {
            e.stopPropagation(); // prevent toolbar shortcuts while typing
            if (e.key === 'Enter') {
                const text = input.value.trim();
                if (text && this.canvas) {
                    const result = this.canvas.handleCoordInput(text);
                    if (result) {
                        input.value = '';
                        // Update status coords to show placed point
                        this._updateCursor({ x: result.x, z: result.z });
                    }
                }
            }
            if (e.key === 'Escape') {
                input.blur();
            }
        });
    }

    _updateCursor(pos) {
        this._cursorX = pos.x;
        this._cursorZ = pos.z;
        const el = document.getElementById('status-coords');
        if (el) el.textContent = `X: ${pos.x.toFixed(2)}  Z: ${pos.z.toFixed(2)}`;
        // Update snap label if provided
        if (pos.snapLabel !== undefined) {
            const snapEl = document.getElementById('status-snap');
            if (snapEl) snapEl.textContent = pos.snapLabel;
        }
    }

    /** Update the snap type indicator in the status bar. */
    setSnapLabel(label) {
        this._snapLabel = label;
        const el = document.getElementById('status-snap');
        if (el) el.textContent = label;
    }
}

// ─── Result Widget (Floating) ───────────────────────────────
export class ResultWidget {
    constructor(model, canvas) {
        this.model = model;
        this.canvas = canvas;
        this.el = document.getElementById('result-widget');
        this._toggles = { u: false, My: false, Vz: false, N: false, mxx: false, myy: false, uZ: false };
        this._deformScale = 500;
        this._diagramScale = 0.02;

        this.model.bus.on('results:loaded', () => this._show());
        this.model.bus.on('results:invalidated', () => this._onInvalidated());
        this.model.bus.on('results:cleared', () => this._hide());

        this._initDrag();
    }

    _show() {
        // Auto-enable deformation
        this._toggles = { u: true, My: false, Vz: false, N: false, mxx: false, myy: false, uZ: false };
        this._render();
        this.el.classList.add('visible');
        this._applyToggles();
    }

    _hide() {
        this.el.classList.remove('visible');
        this.canvas.resetDeformView();
        this.canvas.hideBeamDiagrams();
        this.canvas.hideQuadResults();
    }

    _onInvalidated() {
        this._hide();
        const statusEl = document.getElementById('status-msg');
        if (statusEl) {
            statusEl.textContent = 'Modell geaendert — neu berechnen';
            statusEl.style.color = '#ffaa44';
            setTimeout(() => { statusEl.style.color = ''; }, 5000);
        }
    }

    _render() {
        const hasBeams = this.model.data.beams.some(b => !b.isStructLine);
        const hasAreas = (this.model.data.areas || []).length > 0;
        const toggleDefs = [
            { key: 'u',  label: 'Verformung', color: '#ff3333' },
            ...(hasBeams ? [
                { key: 'My', label: 'Momente My', color: '#4488ff' },
                { key: 'Vz', label: 'Querkraft Vz', color: '#44bb44' },
                { key: 'N',  label: 'Normalkraft N', color: '#ffaa44' },
            ] : []),
            ...(hasAreas ? [
                { key: 'mxx', label: 'Momente mxx', color: '#4488ff' },
                { key: 'myy', label: 'Momente myy', color: '#44bbff' },
                { key: 'uZ', label: 'Durchbiegung uZ', color: '#ff3333' },
            ] : []),
        ];

        this.el.innerHTML = `
            <div class="result-widget-header" id="result-drag-handle">
                <span class="result-widget-title">Ergebnisse</span>
                <button class="result-widget-close" id="result-close">&times;</button>
            </div>
            <div class="result-toggles">
                ${toggleDefs.map(t => `
                    <label class="result-toggle">
                        <input type="checkbox" data-key="${t.key}" ${this._toggles[t.key] ? 'checked' : ''}>
                        <span class="color-dot" style="background:${t.color}"></span>
                        <span>${t.label}</span>
                    </label>
                `).join('')}
            </div>
            <div class="result-sliders">
                <div class="result-slider-row">
                    <span>u-Skala</span>
                    <input type="range" id="rs-deform" min="10" max="5000" step="10" value="${this._deformScale}">
                    <span class="slider-val" id="rs-deform-val">${this._deformScale}</span>
                </div>
                <div class="result-slider-row">
                    <span>S-Skala</span>
                    <input type="range" id="rs-diagram" min="1" max="200" value="${Math.round(this._diagramScale * 1000)}">
                    <span class="slider-val" id="rs-diagram-val">${this._diagramScale.toFixed(3)}</span>
                </div>
            </div>
            ${this._renderSummary()}
        `;

        // Bind events
        this.el.querySelector('#result-close').onclick = () => this._hide();

        for (const cb of this.el.querySelectorAll('input[type="checkbox"]')) {
            cb.onchange = () => {
                this._toggles[cb.dataset.key] = cb.checked;
                this._applyToggles();
            };
        }

        const dSlider = this.el.querySelector('#rs-deform');
        dSlider.oninput = () => {
            this._deformScale = parseInt(dSlider.value);
            this.el.querySelector('#rs-deform-val').textContent = this._deformScale;
            if (this._toggles.u) this.canvas.setDeformScale(this._deformScale);
            // Also update uZ quad results if active
            if (this._toggles.uZ) this._applyToggles();
        };

        const gSlider = this.el.querySelector('#rs-diagram');
        gSlider.oninput = () => {
            this._diagramScale = parseInt(gSlider.value) / 1000;
            this.el.querySelector('#rs-diagram-val').textContent = this._diagramScale.toFixed(3);
            this._applyToggles();
        };
    }

    _renderSummary() {
        const rd = this.model.resultData;
        if (!rd) return '';

        const beams = rd.beams || [];
        const quads = rd.quads || [];
        const fmt = (v) => isFinite(v) ? v.toFixed(2) : '--';
        let rows = '';

        if (beams.length > 0) {
            let minN = Infinity, maxN = -Infinity;
            let minVz = Infinity, maxVz = -Infinity;
            let minMy = Infinity, maxMy = -Infinity;
            for (const f of beams) {
                if (f.N != null) { minN = Math.min(minN, f.N); maxN = Math.max(maxN, f.N); }
                if (f.Vz != null) { minVz = Math.min(minVz, f.Vz); maxVz = Math.max(maxVz, f.Vz); }
                if (f.My != null) { minMy = Math.min(minMy, f.My); maxMy = Math.max(maxMy, f.My); }
            }
            rows += `<div class="result-row"><span class="result-label">N [kN]</span><span class="result-val">${fmt(minN)} / ${fmt(maxN)}</span></div>`;
            rows += `<div class="result-row"><span class="result-label">Vz [kN]</span><span class="result-val">${fmt(minVz)} / ${fmt(maxVz)}</span></div>`;
            rows += `<div class="result-row"><span class="result-label">My [kNm]</span><span class="result-val">${fmt(minMy)} / ${fmt(maxMy)}</span></div>`;
        }
        if (quads.length > 0) {
            let minMxx = Infinity, maxMxx = -Infinity;
            let minMyy = Infinity, maxMyy = -Infinity;
            for (const q of quads) {
                if (q.mxx != null) { minMxx = Math.min(minMxx, q.mxx); maxMxx = Math.max(maxMxx, q.mxx); }
                if (q.myy != null) { minMyy = Math.min(minMyy, q.myy); maxMyy = Math.max(maxMyy, q.myy); }
            }
            rows += `<div class="result-row"><span class="result-label">mxx [kNm/m]</span><span class="result-val">${fmt(minMxx)} / ${fmt(maxMxx)}</span></div>`;
            rows += `<div class="result-row"><span class="result-label">myy [kNm/m]</span><span class="result-val">${fmt(minMyy)} / ${fmt(maxMyy)}</span></div>`;
        }

        return `<div class="result-summary" style="border-top:1px solid #334; padding-top:8px; margin-top:8px;">${rows}</div>`;
    }

    _applyToggles() {
        if (!this.model.hasResults) return;
        const rd = this.model.resultData;

        if (this._toggles.u) {
            this.canvas.showDeformed(rd, this._deformScale);
        } else {
            this.canvas.resetDeformView();
        }

        // Beam force diagrams
        for (const type of ['My', 'Vz', 'N']) {
            if (this._toggles[type]) {
                this.canvas.showBeamDiagrams(rd, type, this._diagramScale);
            } else {
                this.canvas.hideBeamDiagrams(type);
            }
        }

        // Quad result surfaces — only one active at a time
        const quadTypes = ['mxx', 'myy', 'uZ'];
        let activeQuadType = null;
        for (const type of quadTypes) {
            if (this._toggles[type]) { activeQuadType = type; break; }
        }
        if (activeQuadType) {
            // uZ uses deform scale (large), force types use diagram scale (small)
            const qScale = activeQuadType === 'uZ' ? this._deformScale : this._diagramScale * 100;
            this.canvas.showQuadResults(rd, activeQuadType, qScale);
        } else {
            this.canvas.hideQuadResults();
        }
    }

    _initDrag() {
        let isDragging = false, startX, startY, origX, origY;
        const el = this.el;

        el.addEventListener('pointerdown', (e) => {
            if (!e.target.closest('#result-drag-handle')) return;
            isDragging = true;
            startX = e.clientX; startY = e.clientY;
            const rect = el.getBoundingClientRect();
            origX = rect.left; origY = rect.top;
            el.setPointerCapture(e.pointerId);
            e.preventDefault();
        });

        el.addEventListener('pointermove', (e) => {
            if (!isDragging) return;
            el.style.left = (origX + e.clientX - startX) + 'px';
            el.style.top = (origY + e.clientY - startY) + 'px';
            el.style.right = 'auto';
        });

        el.addEventListener('pointerup', () => { isDragging = false; });
    }
}
