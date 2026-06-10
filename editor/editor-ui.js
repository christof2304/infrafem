// editor-ui.js — Toolbar, Properties Panel, Dialogs, Status Bar
// infraFEM Structural Editor

import { SUPPORT_TYPES, SECTION_TYPES } from './editor-core.js';
import { generateDat, downloadDat } from './editor-dat.js';
import { SectionPanel } from './panels/SectionPanel.js';
import { MaterialPanel } from './panels/MaterialPanel.js';

// ─── Toolbar ────────────────────────────────────────────────
export class Toolbar {
    constructor(container, model, api, canvas) {
        this.model = model;
        this.canvas = canvas;
        this.api = api;
        this.el = container;
        this._build();
        this.model.bus.on('mode:changed', () => this._updateActive());
        this.model.bus.on('calc:requested', () => this._calculate());
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
            btn.dataset.tooltip = m.label;
            btn.innerHTML = `<span class="tool-icon">${m.icon}</span><span class="tool-label">${m.key}</span>`;
            btn.onclick = () => this.model.mode = m.mode;
            this.el.appendChild(btn);
        }

        // Separator
        const sep = document.createElement('div');
        sep.className = 'tool-sep';
        this.el.appendChild(sep);

        // Undo / Redo
        const undoBtn = document.createElement('button');
        undoBtn.className = 'tool-btn action-btn';
        undoBtn.dataset.tooltip = 'Rückgängig (Ctrl+Z)';
        undoBtn.id = 'btn-undo';
        undoBtn.innerHTML = '<span class="tool-icon">↩</span>';
        undoBtn.onclick = () => this.model.undo();
        this.el.appendChild(undoBtn);

        const redoBtn = document.createElement('button');
        redoBtn.className = 'tool-btn action-btn';
        redoBtn.dataset.tooltip = 'Wiederholen (Ctrl+Y)';
        redoBtn.id = 'btn-redo';
        redoBtn.innerHTML = '<span class="tool-icon">↪</span>';
        redoBtn.onclick = () => this.model.redo();
        this.el.appendChild(redoBtn);

        // Update undo/redo button state on model changes
        this.model.bus.on('model:changed', () => this._updateUndoButtons());
        this._updateUndoButtons();

        const sep2 = document.createElement('div');
        sep2.className = 'tool-sep';
        this.el.appendChild(sep2);

        // Action buttons
        const actions = [
            { icon: '▶', label: 'Berechnen', action: () => this._calculate() },
            { icon: '⊞', label: 'Vernetzen', action: () => this._meshOnly(), id: 'btn-mesh' },
            { icon: '🔍', label: 'Im Viewer öffnen', action: () => this._openViewer() },
            { icon: '⬇', label: '.dat Export', action: () => downloadDat(this.model.data) },
            { icon: '💾', label: 'Speichern', action: () => this._save() },
            { icon: '📂', label: 'Laden', action: () => this._load() },
            { icon: '⚡', label: 'Beispiele', action: () => this._openExamples(), id: 'btn-examples' },
            { icon: '📐', label: 'DXF Import', action: () => this._importDxf() },
            { icon: '💨', label: 'CFD Wind', action: () => this._openCFD(), id: 'btn-cfd' },
            { icon: '⬡', label: 'Stütze (K)', action: () => this._openColumnWizard(), id: 'btn-column' },
            { icon: '🗑', label: 'Neu', action: () => this._confirmReset() },
        ];

        for (const a of actions) {
            const btn = document.createElement('button');
            btn.className = 'tool-btn action-btn';
            btn.dataset.tooltip = a.label;
            btn.innerHTML = `<span class="tool-icon">${a.icon}</span>`;
            btn.onclick = a.action;
            if (a.id) btn.id = a.id;
            this.el.appendChild(btn);
        }

        // Keyboard shortcuts
        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
            if (e.ctrlKey && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                this.model.undo();
                return;
            }
            if (e.ctrlKey && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
                e.preventDefault();
                this.model.redo();
                return;
            }
            if (e.key === 'Escape') {
                this.model.mode = 'SELECT';
                return;
            }
            const keyMap = { s: 'SELECT', n: 'NODE', b: 'BEAM', r: 'RECT', p: 'POLY', f: 'AREA', a: 'SUPPORT', l: 'LOAD', d: 'DELETE' };
            if (keyMap[e.key.toLowerCase()] && !e.ctrlKey) {
                this.model.mode = keyMap[e.key.toLowerCase()];
            }
            if (e.key.toLowerCase() === 'k' && !e.ctrlKey) {
                this._openColumnWizard();
            }
        });

        this._updateActive();
    }

    _updateActive() {
        for (const btn of this.el.querySelectorAll('.tool-btn[data-mode]')) {
            btn.classList.toggle('active', btn.dataset.mode === this.model.mode);
        }
    }

    _updateUndoButtons() {
        const undo = document.getElementById('btn-undo');
        const redo = document.getElementById('btn-redo');
        if (undo) undo.style.opacity = this.model.canUndo ? '1' : '0.3';
        if (redo) redo.style.opacity = this.model.canRedo ? '1' : '0.3';
    }

    _showError(msg) {
        const el = document.getElementById('status-msg');
        if (!el) return;
        el.textContent = msg;
        el.style.color = 'var(--danger)';
        setTimeout(() => { el.style.color = ''; }, 6000);
    }

    _showStatus(msg) {
        const el = document.getElementById('status-msg');
        if (el) el.textContent = msg;
    }

    _setCalcActive(on) {
        document.getElementById('status-calc-dot')?.classList.toggle('active', on);
    }

    async _calculate() {
        const solver = this.model.data.meta.solver || 'sofistik';
        if (solver === 'stabileo') {
            return this._calculateStabileo();
        }
        return this._calculateSofistik();
    }

    async _calculateStabileo() {
        const statusEl = document.getElementById('status-msg');
        this._setCalcActive(true);
        try {
            // Dynamically import the bridge
            const { initStabileo, isStabileoAvailable, solveWithStabileo, solveWithStabileo3D } = await import('./stabileo-bridge.js');

            statusEl.textContent = 'Stabileo: Initialisiere WASM...';
            const ok = await initStabileo();
            if (!ok || !isStabileoAvailable()) {
                statusEl.textContent = 'Stabileo WASM nicht verfügbar';
                this._showError('Stabileo WASM konnte nicht geladen werden — bitte SOFiSTiK als Solver verwenden.');
                return;
            }

            const hasAreas = (this.model.data.areas || []).length > 0;
            statusEl.textContent = hasAreas
                ? 'Stabileo 3D: Platte vernetzt + berechnet...'
                : 'Stabileo 2D: Berechnung im Browser...';
            const t0 = performance.now();
            const resultData = hasAreas
                ? solveWithStabileo3D(this.model.data)
                : solveWithStabileo(this.model.data);
            const dt = (performance.now() - t0).toFixed(0);

            this.model.setResults(resultData, null);
            const nForces = resultData.beams.length;
            statusEl.textContent = `Stabileo OK (${dt}ms) — ${resultData.nodes.length} Knoten, ${nForces} Schnittgrößen`;
        } catch (err) {
            statusEl.textContent = `Stabileo-Fehler: ${err.message}`;
            console.error('Stabileo error:', err);
        } finally {
            this._setCalcActive(false);
        }
    }

    async _calculateSofistik() {
        if (this._calcLock) return; // prevent concurrent SPS runs
        this._calcLock = true;
        const statusEl = document.getElementById('status-msg');
        this._setCalcActive(true);
        try {
            statusEl.textContent = 'SOFiSTiK: Berechnung läuft...';
            const result = await this.api.calculate(this.model.data);
            if (result.success) {
                statusEl.textContent = `SOFiSTiK OK — lade Ergebnisse...`;
                try {
                    const resultData = await this.api.fetchResults(result.sqlite);
                    this.model.setResults(resultData, result.sqlite);
                    const nForces = resultData.beams.length + resultData.quads.length;
                    statusEl.textContent = `SOFiSTiK OK — ${resultData.nodes.length} Knoten, ${nForces} Schnittgrößen`;
                } catch (e) {
                    statusEl.textContent = `SOFiSTiK OK — Ergebnisse nicht ladbar: ${e.message}`;
                }
            } else {
                const errMsg = result.errors?.join(', ') || 'Berechnung fehlgeschlagen';
                statusEl.textContent = `Fehler: ${errMsg}`;
                const logTail = result.log ? '\n\n' + result.log.split('\n').slice(-15).join('\n') : '';
                this._showError(`SOFiSTiK: ${errMsg}${logTail}`);
            }
        } catch (err) {
            statusEl.textContent = `API-Fehler: ${err.message}`;
        } finally {
            this._setCalcActive(false);
            this._calcLock = false;
        }
    }

    async _meshOnly() {
        const hasAreas = (this.model.data.areas || []).length > 0;
        if (!hasAreas) {
            this._showError('Vernetzung nur für Plattenmodelle — zuerst Flächen zeichnen.');
            return;
        }
        const statusEl = document.getElementById('status-msg');
        const btn = document.getElementById('btn-mesh');
        if (btn) btn.classList.add('active');
        this._setCalcActive(true);
        try {
            // Toggle: if mesh is already visible, hide it
            if (this.canvas.isMeshVisible()) {
                this.canvas.clearMeshOverlay();
                statusEl.textContent = 'Netz ausgeblendet';
                return;
            }
            statusEl.textContent = 'SOFiSTiK: Vernetzung läuft...';
            const result = await this.api.meshOnly(this.model.data);
            if (result.success) {
                this.canvas.showMeshOverlay(result.nodes, result.quads);
                statusEl.textContent = `Netz: ${result.n_nodes} Knoten, ${result.n_quads} Elemente`;
            } else {
                statusEl.textContent = `Vernetzung fehlgeschlagen: ${result.errors?.join(', ') || ''}`;
                this._showError(`Vernetzung: ${result.errors?.join(', ') || 'Fehlgeschlagen'}`);
            }
        } catch (err) {
            statusEl.textContent = `Fehler: ${err.message}`;
        } finally {
            if (btn) btn.classList.remove('active');
            this._setCalcActive(false);
        }
    }

    _openViewer() {
        if (this.model._resultSqlite) {
            this.api.openViewer(this.model._resultSqlite);
        } else {
            this._showError('Erst berechnen — keine Ergebnisse vorhanden.');
        }
    }

    async _openCFD() {
        const { CFDPanel } = await import('./cfd-panel.js?v=' + Date.now());
        if (!this._cfdPanel) {
            this._cfdPanel = new CFDPanel(this.model, this.canvas, this.api);
        }
        this._cfdPanel.show();
    }

    async _openExamples() {
        const { FEM_EXAMPLES } = await import('./fem-examples.js?v=' + Date.now());

        if (document.getElementById('fem-examples-panel')) {
            document.getElementById('fem-examples-panel').remove();
            return;
        }

        const panel = document.createElement('div');
        panel.id = 'fem-examples-panel';
        panel.style.cssText = `
            position: fixed; top: 60px; left: 60px; background: var(--bg-panel);
            border: 1px solid var(--border-hi); border-radius: 8px; padding: 12px 14px;
            z-index: 30; min-width: 260px; color: var(--text); font-size: 12px;
            font-family: var(--font-ui); box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        `;

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;';
        header.innerHTML = `<span style="font-weight:600;font-size:13px;color:var(--text-hi)">FEM Beispiele</span>`;
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = 'background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:13px;padding:2px 4px;';
        closeBtn.onclick = () => panel.remove();
        header.appendChild(closeBtn);
        panel.appendChild(header);

        for (const ex of FEM_EXAMPLES) {
            const card = document.createElement('div');
            card.style.cssText = `
                border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px;
                margin-bottom: 8px; cursor: pointer; transition: border-color 0.15s;
            `;
            card.onmouseenter = () => { card.style.borderColor = 'var(--accent)'; };
            card.onmouseleave = () => { card.style.borderColor = 'var(--border)'; };

            const badge = `<span style="background:var(--bg-input);border:1px solid var(--border);border-radius:3px;padding:1px 5px;font-size:10px;color:var(--text-dim);margin-left:6px;">${ex.systemType}</span>`;
            card.innerHTML = `
                <div style="font-weight:600;font-size:12px;color:var(--text-hi);margin-bottom:4px;">
                    ${ex.name}${badge}
                </div>
                <div style="color:var(--text-dim);font-size:11px;line-height:1.5;white-space:pre-line;">${ex.desc}</div>
                <button style="margin-top:8px;padding:3px 12px;background:var(--accent);color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-family:var(--font-ui);">Laden</button>
            `;
            card.querySelector('button').onclick = () => {
                this.model.loadJSON(JSON.parse(JSON.stringify(ex.model)));
                document.getElementById('status-msg').textContent = `Beispiel geladen: ${ex.name}`;
                panel.remove();
            };
            panel.appendChild(card);
        }

        document.body.appendChild(panel);

        // Make draggable
        let ox = 0, oy = 0;
        header.style.cursor = 'move';
        header.onmousedown = (e) => {
            ox = e.clientX - panel.offsetLeft;
            oy = e.clientY - panel.offsetTop;
            const mm = (e) => { panel.style.left = (e.clientX - ox) + 'px'; panel.style.top = (e.clientY - oy) + 'px'; };
            const mu = () => { document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); };
            document.addEventListener('mousemove', mm);
            document.addEventListener('mouseup', mu);
        };
    }

    async _openColumnWizard() {
        const { ColumnWizardPanel } = await import('./column-wizard.js?v=' + Date.now());
        if (!this._columnWizard) {
            this._columnWizard = new ColumnWizardPanel(this.model, this.canvas, this.api);
        }
        this._columnWizard.show();

        // Wire up canvas beam selection → wizard β auto-detection (bound once globally)
        if (!this._columnWizardSelBound) {
            this._columnWizardSelBound = true;
            this.model.bus.on('selection:changed', (sel) => {
                if (!this._columnWizard?.el) return;
                if (sel.type === 'beam') {
                    // sel.id = editor beam ID → wizard detects β from model.data
                    this._columnWizard.selectElement(sel.id);
                }
            });
        }
    }

    async _save() {
        const name = (this.model.data.meta.name || '').trim() || 'Neues Modell';
        this.model.data.meta.name = name;
        try {
            await this.api.saveModel(name, this.model.data);
            document.getElementById('status-msg').textContent = `Gespeichert: ${name}`;
        } catch (err) {
            this._showError('Speichern fehlgeschlagen: ' + err.message);
        }
    }

    async _load() {
        try {
            const models = await this.api.listModels();
            if (models.length === 0) { this._showStatus('Keine gespeicherten Modelle.'); return; }
            this._showLoadPanel(models);
        } catch (err) {
            this._showError('Laden fehlgeschlagen: ' + err.message);
        }
    }

    _showLoadPanel(models) {
        const overlay = document.createElement('div');
        overlay.className = 'dat-overlay';
        overlay.innerHTML = `
            <div class="dat-dialog" style="max-width:320px">
                <div class="dat-header">
                    <h3>Modell laden</h3>
                    <button class="btn-sm" id="load-panel-close">✕</button>
                </div>
                <div style="padding:8px 0;max-height:280px;overflow-y:auto" id="load-model-list">
                    ${models.map(m => `
                        <div class="list-item load-model-item" data-name="${m.replace(/"/g, '&quot;')}" style="cursor:pointer;padding:6px 8px">
                            ${m}
                        </div>
                    `).join('')}
                </div>
                <div style="padding:8px;display:flex;gap:6px;border-top:1px solid var(--border)">
                    <button class="btn-full" id="load-panel-load-btn" disabled style="flex:1;margin-top:0">Laden</button>
                    <button class="btn-sm" id="load-panel-del-btn" disabled style="flex-shrink:0">Löschen</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        let selected = null;
        const loadBtn = overlay.querySelector('#load-panel-load-btn');
        const delBtn  = overlay.querySelector('#load-panel-del-btn');

        for (const item of overlay.querySelectorAll('.load-model-item')) {
            item.addEventListener('click', () => {
                for (const i of overlay.querySelectorAll('.load-model-item')) i.classList.remove('active');
                item.classList.add('active');
                selected = item.dataset.name;
                loadBtn.disabled = false;
                delBtn.disabled = false;
                delBtn.textContent = 'Löschen';
                delete delBtn.dataset.confirm;
            });
            item.addEventListener('dblclick', async () => {
                await this._doLoadModel(item.dataset.name);
                overlay.remove();
            });
        }

        loadBtn.addEventListener('click', async () => {
            if (!selected) return;
            await this._doLoadModel(selected);
            overlay.remove();
        });

        delBtn.addEventListener('click', async () => {
            if (!selected) return;
            if (!delBtn.dataset.confirm) {
                delBtn.textContent = 'Sicher?';
                delBtn.dataset.confirm = '1';
                return;
            }
            try {
                await this.api.deleteModel(selected);
                this._showStatus(`Gelöscht: ${selected}`);
                overlay.remove();
            } catch (err) {
                this._showError('Löschen fehlgeschlagen: ' + err.message);
                overlay.remove();
            }
        });

        overlay.querySelector('#load-panel-close').onclick = () => overlay.remove();
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    }

    async _doLoadModel(name) {
        try {
            const data = await this.api.loadModel(name);
            this.model.loadJSON(data);
            document.getElementById('status-msg').textContent = `Geladen: ${name}`;
        } catch (err) {
            this._showError('Laden fehlgeschlagen: ' + err.message);
        }
    }

    _confirmReset() {
        const el = document.getElementById('status-msg');
        if (!el) { this.model.reset(); return; }
        el.innerHTML = `Zurücksetzen? <button id="reset-yes" style="margin-left:6px;padding:1px 8px;background:var(--danger);color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:10px">Ja</button> <button id="reset-no" style="margin-left:4px;padding:1px 8px;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:3px;cursor:pointer;font-size:10px">Nein</button>`;
        document.getElementById('reset-yes').onclick = () => {
            this.model.reset();
            el.textContent = 'Modell zurückgesetzt';
        };
        document.getElementById('reset-no').onclick = () => { el.textContent = ''; };
    }

    _importDxf() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.dxf';
        input.style.display = 'none';
        input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;
            const statusEl = document.getElementById('status-msg');
            statusEl.textContent = `DXF wird importiert: ${file.name}...`;
            try {
                const result = await this.api.importDxf(file);
                this.canvas.loadDxfBackground(result);
                statusEl.textContent = `DXF geladen: ${result.entityCount} Elemente (${file.name})`;
            } catch (err) {
                statusEl.textContent = `DXF-Fehler: ${err.message}`;
                this._showError('DXF Import fehlgeschlagen: ' + err.message);
            }
            input.remove();
        };
        document.body.appendChild(input);
        input.click();
    }
}

// ─── Properties Panel ───────────────────────────────────────
export class PropertiesPanel {
    constructor(container, model) {
        this.model = model;
        this.el = container;
        this._collapsed = new Set(); // persists across re-renders
        this.model.bus.on('selection:changed', () => this._render());
        this.model.bus.on('model:changed', () => this._render());
        this.model.bus.on('loadcase:changed', () => this._render());
        this.model.bus.on('results:loaded', () => this._render());
        this.model.bus.on('results:cleared', () => this._render());
        this.model.bus.on('support:requested', (nodeId) => this._showSupportDialog(nodeId));
        this.model.bus.on('load:requested', (info) => this._showLoadDialog(info));
        this.model.bus.on('area:edge-clicked', (info) => this._highlightEdge(info));
        this._render();
    }

    _statusMsg(msg, isError = false) {
        const el = document.getElementById('status-msg');
        if (!el) return;
        el.textContent = msg;
        el.style.color = isError ? 'var(--danger)' : '';
        if (isError) setTimeout(() => { el.style.color = ''; }, 5000);
    }

    _render() {
        const sel = this.model.selection;
        // Preserve scroll only when re-rendering the same selection context
        const sameCtx = this._lastSelKey === `${sel.type}:${sel.id}`;
        const scrollTop = sameCtx ? this.el.scrollTop : 0;
        this._lastSelKey = `${sel.type}:${sel.id}`;

        if (sel.type === 'multi') this._renderMultiProps(sel);
        else if (sel.type === 'node') this._renderNodeProps(sel.id);
        else if (sel.type === 'beam') this._renderBeamProps(sel.id);
        else if (sel.type === 'area') this._renderAreaProps(sel.id);
        else this._renderModelProps();
        this._applyCollapsible();
        this.el.scrollTop = scrollTop;
    }

    // Wraps content after each h3 in a .section-body and makes headers toggleable.
    // State in this._collapsed survives re-renders.
    _applyCollapsible() {
        for (const h3 of this.el.querySelectorAll('h3')) {
            const body = document.createElement('div');
            body.className = 'section-body';
            let next = h3.nextSibling;
            while (next && !(next.nodeType === 1 && next.tagName === 'H3')) {
                const tmp = next.nextSibling;
                body.appendChild(next);
                next = tmp;
            }
            h3.after(body);

            // Use only the title span text for the key (ignore badge counts that change)
            const titleEl = h3.querySelector('.wf-h3-left');
            const rawText = titleEl
                ? (titleEl.childNodes[1]?.textContent || titleEl.textContent).replace(/[+×▾▴\d·]/g, '')
                : h3.textContent.replace(/[+×▾▴]/g, '');
            const key = rawText.trim().slice(0, 30);
            if (this._collapsed.has(key)) {
                h3.classList.add('sec-collapsed');
                body.classList.add('sec-collapsed');
            }

            h3.addEventListener('click', (e) => {
                if (e.target.tagName === 'BUTTON') return;
                const nowCollapsed = body.classList.toggle('sec-collapsed');
                h3.classList.toggle('sec-collapsed', nowCollapsed);
                if (nowCollapsed) this._collapsed.add(key);
                else this._collapsed.delete(key);
            });
        }
    }

    // ── Workflow helpers ───────────────────────────────────
    _computeWorkflowStatus() {
        const d = this.model.data;
        const nodes = d.nodes || [];
        const beams = d.beams || [];
        const areas = d.areas || [];
        const totalLoads = d.loadcases.reduce((s, lc) => s + lc.loads.length, 0);
        const hasSupport = nodes.some(n => n.support && n.support !== 'NONE');
        const hasElements = beams.length > 0 || areas.length > 0;
        return {
            projekt:      'full',
            materialien:  d.materials.length > 0 ? 'full' : 'empty',
            querschnitte: d.sections.length > 0 ? 'full' : 'empty',
            geometrie:    nodes.length === 0 ? 'empty'
                          : (!hasElements || !hasSupport) ? 'partial' : 'full',
            lasten:       totalLoads === 0 ? 'empty' : 'full',
            ergebnisse:   this.model.hasResults ? 'full' : 'empty',
        };
    }

    _wfH3(status, title, badge = '', addId = null) {
        const dot = `<span class="wf-dot wf-dot-${status}"></span>`;
        const badgeHtml = badge ? ` <span class="wf-badge">${badge}</span>` : '';
        const left = `<span class="wf-h3-left">${dot}${title}${badgeHtml}</span>`;
        const addBtn = addId ? `<button class="btn-sm" id="${addId}">+</button>` : '';
        return `<h3>${left}${addBtn}</h3>`;
    }

    // ── Model Properties (default view) ────────────────────
    _renderModelProps() {
        const d = this.model.data;
        const ws = this._computeWorkflowStatus();
        const systemLabel = { RAHM:'2D Rahmen', PLATTE:'2D Platte', SCHEIBE:'2D Scheibe', ROST:'2D Rost', '3D':'3D', CFD_2D:'CFD 2D', CFD_3D:'CFD 3D' }[d.meta.systemType] || d.meta.systemType;
        const solverLabel = (d.meta.solver || 'sofistik') === 'sofistik' ? 'SOFiSTiK' : 'Stabileo';

        const matBadge  = d.materials.length > 0  ? `${d.materials.length}` : '';
        const secBadge  = d.sections.length > 0   ? `${d.sections.length}` : '';
        const totalLoads = d.loadcases.reduce((s, lc) => s + lc.loads.length, 0);
        const lcBadge   = `${d.loadcases.length} LF · ${totalLoads} Lasten`;

        const nodes = d.nodes || [];
        const beams = d.beams || [];
        const areas = d.areas || [];
        const hasSupport = nodes.some(n => n.support && n.support !== 'NONE');
        const geoWarn = nodes.length > 0 && (!hasSupport) ? `<div class="wf-warn">⚠ Kein Auflager definiert</div>` : '';
        const geoBadge = `${nodes.length}K · ${beams.length}S${areas.length > 0 ? ` · ${areas.length}F` : ''}`;

        const lcNr = this.model.activeLoadcase || 1;
        const resultBadge = this.model.hasResults ? `LF ${lcNr}` : '';

        this.el.innerHTML = `
            ${this._wfH3('full', 'Projekt', `${systemLabel} · ${solverLabel}`)}
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
            <div class="prop-group">
                <label>Solver</label>
                <select id="prop-solver">
                    <option value="sofistik" ${(d.meta.solver || 'sofistik') === 'sofistik' ? 'selected' : ''}>SOFiSTiK (Server)</option>
                    <option value="stabileo" ${d.meta.solver === 'stabileo' ? 'selected' : ''}>Stabileo (Browser)</option>
                </select>
            </div>

            ${this._wfH3(ws.materialien, 'Materialien', matBadge, 'add-mat')}
            <div id="mat-list">
                ${d.materials.length === 0 ? '<div class="wf-empty-hint">Noch kein Material — + drücken</div>' : ''}
                ${d.materials.map(m => `
                    <div class="list-item" data-id="${m.id}">
                        <span style="flex:1">${m.id}: ${m.label || m.type + ' ' + m.grade}</span>
                        <button class="btn-sm" data-action="edit-mat" data-id="${m.id}" title="Bearbeiten">✏</button>
                        <button class="btn-sm btn-del" data-action="del-mat" data-id="${m.id}">×</button>
                    </div>
                `).join('')}
            </div>

            ${this._wfH3(ws.querschnitte, 'Querschnitte', secBadge, 'add-sec')}
            <div id="sec-list">
                ${d.sections.length === 0 ? '<div class="wf-empty-hint">Noch kein Querschnitt — + drücken</div>' : ''}
                ${d.sections.map(s => `
                    <div class="list-item" data-id="${s.id}">
                        <span style="flex:1">${s.id}: ${s.label || s.type}</span>
                        <button class="btn-sm" data-action="edit-sec" data-id="${s.id}" title="Bearbeiten">✏</button>
                        <button class="btn-sm btn-del" data-action="del-sec" data-id="${s.id}">×</button>
                    </div>
                `).join('')}
            </div>

            ${this._wfH3(ws.geometrie, 'Geometrie', geoBadge)}
            ${nodes.length === 0 ? '<div class="wf-empty-hint">Noch keine Knoten — Werkzeug N oder Stab B wählen</div>' : `
                <div class="wf-geo-row"><span class="wf-geo-lbl">Knoten</span><span class="wf-geo-val">${nodes.length}</span></div>
                <div class="wf-geo-row"><span class="wf-geo-lbl">Stäbe</span><span class="wf-geo-val">${beams.length}</span></div>
                ${areas.length > 0 ? `<div class="wf-geo-row"><span class="wf-geo-lbl">Flächen</span><span class="wf-geo-val">${areas.length}</span></div>` : ''}
                ${geoWarn}
            `}

            ${this._wfH3(ws.lasten, 'Lastfälle', lcBadge, 'add-lc')}
            <div id="lc-list">
                ${d.loadcases.map(lc => `
                    <div class="list-item ${lc.id === this.model.activeLoadcase ? 'active' : ''}" data-id="${lc.id}">
                        <span class="lc-select" style="flex:1" data-id="${lc.id}">${lc.id}: ${lc.name} (${lc.loads.length} Lasten)</span>
                        <button class="btn-sm" data-action="rename-lc" data-id="${lc.id}" title="Umbenennen">✏</button>
                        <button class="btn-sm btn-del" data-action="del-lc" data-id="${lc.id}">×</button>
                    </div>
                `).join('')}
            </div>

            <h3 style="border-left-color:var(--border-hi);color:var(--text-dim)">Analyse</h3>
            <div class="prop-group">
                <label>Typ</label>
                <select id="prop-analysis">
                    <option value="LINE" ${d.analysisSettings.type === 'LINE' ? 'selected' : ''}>Linear</option>
                    <option value="TH2" ${d.analysisSettings.type === 'TH2' ? 'selected' : ''}>Theorie II. Ordnung</option>
                    <option value="TH3" ${d.analysisSettings.type === 'TH3' ? 'selected' : ''}>Theorie III. Ordnung</option>
                </select>
            </div>
            <button class="btn-calc${ws.ergebnisse === 'full' ? ' calc-ok' : ''}" id="btn-calc-panel">▶ Berechnen</button>

            ${this._wfH3(ws.ergebnisse, 'Ergebnisse', resultBadge)}
            ${this.model.hasResults
                ? this._renderResultSummaryHTML()
                : '<div class="wf-results-locked"><div class="wf-empty-hint">Noch keine Ergebnisse — zuerst berechnen</div></div>'
            }

            <h3 style="border-left-color:var(--border-hi);color:var(--text-dim)">Einstellungen</h3>
            <div class="prop-group">
                <label>Querschnitte</label>
                <input type="checkbox" id="prop-show-sections">
            </div>
            <div class="prop-group">
                <label>Elem.größe [m]</label>
                <input type="range" id="prop-hmin" min="0.1" max="3.0" step="0.1" value="${d.meshSettings?.hmin || 0.5}" style="flex:1">
                <span id="prop-hmin-val" class="prop-val">${(d.meshSettings?.hmin || 0.5).toFixed(1)}</span>
            </div>
            <button class="btn-full" id="show-dat">.dat Vorschau</button>
        `;

        // Bind events
        this.el.querySelector('#prop-name').onchange = (e) => {
            this.model.data.meta.name = e.target.value;
        };
        this.el.querySelector('#prop-system').onchange = (e) => {
            this.model.data.meta.systemType = e.target.value;
            this.canvas.applyViewControls();
        };
        this.el.querySelector('#prop-solver')?.addEventListener('change', (e) => {
            this.model.data.meta.solver = e.target.value;
        });
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

        // Calculate from panel
        this.el.querySelector('#btn-calc-panel')?.addEventListener('click', () => {
            this.model.bus.emit('calc:requested');
        });

        // Material/Section/LC actions
        this.el.querySelector('#add-mat')?.addEventListener('click', () => this._showMaterialDialog());
        this.el.querySelector('#add-sec')?.addEventListener('click', () => this._showSectionDialog());
        this.el.querySelector('#add-lc')?.addEventListener('click', () => {
            const lcList = this.el.querySelector('#lc-list');
            if (!lcList || lcList.querySelector('.lc-add-row')) return;
            // Expand section if collapsed
            const body = lcList.closest('.section-body');
            if (body?.classList.contains('sec-collapsed')) {
                body.classList.remove('sec-collapsed');
                const h3 = body.previousElementSibling;
                if (h3?.tagName === 'H3') {
                    h3.classList.remove('sec-collapsed');
                    const titleEl = h3.querySelector('.wf-h3-left');
                    const rawText = titleEl
                        ? (titleEl.childNodes[1]?.textContent || titleEl.textContent).replace(/[+×▾▴\d·]/g, '')
                        : h3.textContent.replace(/[+×▾▴]/g, '');
                    this._collapsed.delete(rawText.trim().slice(0, 30));
                }
            }
            const row = document.createElement('div');
            row.className = 'lc-add-row';
            row.style.cssText = 'display:flex;gap:4px;margin-bottom:4px';
            row.innerHTML = `
                <input type="text" id="new-lc-name" placeholder="Lastfall-Name" style="flex:1;background:var(--bg-input);border:1px solid var(--border);color:var(--text);padding:3px 6px;border-radius:3px;font-size:11px">
                <button class="btn-sm" id="lc-ok">✓</button>
                <button class="btn-sm" id="lc-cancel">✕</button>
            `;
            lcList.appendChild(row);
            const input = row.querySelector('#new-lc-name');
            input.focus();
            const doAdd = () => {
                const name = input.value.trim();
                if (name) this.model.addLoadcase(name);
                else this._render();
            };
            row.querySelector('#lc-ok').onclick = doAdd;
            row.querySelector('#lc-cancel').onclick = () => this._render();
            input.onkeydown = (e) => {
                if (e.key === 'Enter') doAdd();
                if (e.key === 'Escape') this._render();
            };
        });

        // Delete buttons
        for (const btn of this.el.querySelectorAll('[data-action="del-mat"]')) {
            btn.onclick = () => {
                if (!this.model.deleteMaterial(+btn.dataset.id))
                    this._statusMsg('Material wird verwendet — zuerst Querschnitte ändern.', true);
            };
        }
        for (const btn of this.el.querySelectorAll('[data-action="del-sec"]')) {
            btn.onclick = () => {
                if (!this.model.deleteSection(+btn.dataset.id))
                    this._statusMsg('Querschnitt wird verwendet — zuerst Stäbe ändern.', true);
            };
        }
        for (const btn of this.el.querySelectorAll('[data-action="del-lc"]')) {
            btn.onclick = () => {
                if (!this.model.deleteLoadcase(+btn.dataset.id))
                    this._statusMsg('Mindestens ein Lastfall muss erhalten bleiben.', true);
            };
        }

        // Edit buttons
        for (const btn of this.el.querySelectorAll('[data-action="edit-mat"]')) {
            btn.onclick = (e) => { e.stopPropagation(); this._showMaterialDialog(+btn.dataset.id); };
        }
        for (const btn of this.el.querySelectorAll('[data-action="edit-sec"]')) {
            btn.onclick = (e) => { e.stopPropagation(); this._showSectionDialog(+btn.dataset.id); };
        }
        for (const btn of this.el.querySelectorAll('[data-action="rename-lc"]')) {
            btn.onclick = (e) => {
                e.stopPropagation();
                const id = +btn.dataset.id;
                const lc = this.model.data.loadcases.find(l => l.id === id);
                if (!lc) return;
                const span = btn.closest('.list-item')?.querySelector('.lc-select');
                if (!span) return;
                const input = document.createElement('input');
                input.type = 'text';
                input.value = lc.name;
                input.style.cssText = 'flex:1;background:var(--bg-input);border:1px solid var(--border);color:var(--text);padding:2px 6px;border-radius:3px;font-size:11px';
                span.replaceWith(input);
                input.focus();
                input.select();
                const commit = () => {
                    const name = input.value.trim();
                    if (name) this.model.updateLoadcase(id, { name });
                    else this._render();
                };
                input.onkeydown = (ev) => {
                    if (ev.key === 'Enter') commit();
                    if (ev.key === 'Escape') this._render();
                };
                input.onblur = commit;
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
            <div class="result-summary">
                <div class="result-row"><span class="result-label">N [kN]</span><span class="result-val">${fmt(minN)} / ${fmt(maxN)}</span></div>
                <div class="result-row"><span class="result-label">Vz [kN]</span><span class="result-val">${fmt(minVz)} / ${fmt(maxVz)}</span></div>
                <div class="result-row"><span class="result-label">My [kNm]</span><span class="result-val">${fmt(minMy)} / ${fmt(maxMy)}</span></div>
                <div class="result-row"><span class="result-label">uX [m]</span><span class="result-val">${fmt(minUx)} / ${fmt(maxUx)}</span></div>
                <div class="result-row"><span class="result-label">uY [m]</span><span class="result-val">${fmt(minUy)} / ${fmt(maxUy)}</span></div>
            </div>
        `;
    }

    // ── Result helpers ─────────────────────────────────────
    _beamResultHtml(beamId) {
        if (!this.model.hasResults) return '';
        const rd = this.model.resultData;
        const forces = (rd.beams || []).filter(f => f.id === beamId);
        if (forces.length === 0) return '';

        let minN = Infinity, maxN = -Infinity;
        let minVz = Infinity, maxVz = -Infinity;
        let minMy = Infinity, maxMy = -Infinity;
        for (const f of forces) {
            if (f.N  != null) { minN  = Math.min(minN,  f.N);  maxN  = Math.max(maxN,  f.N);  }
            if (f.Vz != null) { minVz = Math.min(minVz, f.Vz); maxVz = Math.max(maxVz, f.Vz); }
            if (f.My != null) { minMy = Math.min(minMy, f.My); maxMy = Math.max(maxMy, f.My); }
        }
        const fmt = v => isFinite(v) ? v.toFixed(2) : '—';
        const sign = (min, max) => {
            if (!isFinite(min)) return '';
            const absMax = Math.max(Math.abs(min), Math.abs(max));
            const bar = Math.round(Math.min(absMax / (absMax || 1) * 52, 52));
            const col = min < 0 && max > 0 ? '#ffaa44' : min >= 0 ? '#44bb44' : '#4488ff';
            return `<div style="height:3px;background:${col};width:${bar}px;border-radius:2px;margin-top:2px"></div>`;
        };

        return `
            <h3>Schnittgrößen (LF)</h3>
            <div class="result-row">
                <span class="result-label">N [kN]</span>
                <span class="result-val">${fmt(minN)} / ${fmt(maxN)}</span>
            </div>${sign(minN, maxN)}
            <div class="result-row">
                <span class="result-label">Vz [kN]</span>
                <span class="result-val">${fmt(minVz)} / ${fmt(maxVz)}</span>
            </div>${sign(minVz, maxVz)}
            <div class="result-row">
                <span class="result-label">My [kNm]</span>
                <span class="result-val">${fmt(minMy)} / ${fmt(maxMy)}</span>
            </div>${sign(minMy, maxMy)}
        `;
    }

    // ── Beam cross-section stress visualization ────────────────
    _beamStressHTML(beamId) {
        if (!this.model.hasResults) return '';
        const beam = this.model.getBeam(beamId);
        if (!beam?.sectionId || beam.isStructLine) return '';
        const sec = this.model.data.sections.find(s => s.id === beam.sectionId);
        if (!sec) return '';
        const forces = (this.model.resultData?.beams || []).filter(f => f.id === beamId);
        if (!forces.length) return '';

        // Worst-case position: max |My|
        const worst = forces.reduce((m, f) => Math.abs(f.My) > Math.abs(m.My) ? f : m, forces[0]);
        const { N = 0, Vz = 0, My = 0, x = 0 } = worst;

        const props = this._sectionProps(sec);
        if (!props) return `<div class="wf-empty-hint">Spannungen: Querschnitt nicht unterstützt</div>`;

        // Bending stresses [MPa]  σ = N/A ± My·(H/2)/Iy
        const K = 1 / 1000; // kN/m² → MPa
        const sigTop = (N / props.A - My * (props.H / 2) / props.Iy) * K;
        const sigBot = (N / props.A + My * (props.H / 2) / props.Iy) * K;
        const tauMax = this._tauMax(props, Vz);
        const fmt = v => (isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(1) : '—');

        return `
            <h3>Spannungen (x = ${x.toFixed(2)} m)</h3>
            <div style="display:flex;justify-content:center;margin:4px 0 6px">
                ${this._stressSVG(props, sigTop, sigBot)}
            </div>
            <div class="result-row"><span class="result-label">σ oben [MPa]</span><span class="result-val">${fmt(sigTop)}</span></div>
            <div class="result-row"><span class="result-label">σ unten [MPa]</span><span class="result-val">${fmt(sigBot)}</span></div>
            <div class="result-row"><span class="result-label">τ max [MPa]</span><span class="result-val">${fmt(tauMax)}</span></div>
        `;
    }

    _sectionProps(sec) {
        if (sec.type === 'SREC') {
            const H = sec.params.H, B = sec.params.B;
            const A = B * H, Iy = B * H ** 3 / 12;
            return { type: 'SREC', H, B, A, Iy, tw: B, tf: 0 };
        }
        if (sec.type === 'SCIR') {
            const D = sec.params.D, R = D / 2;
            return { type: 'SCIR', H: D, B: D, D, A: Math.PI * R ** 2, Iy: Math.PI * R ** 4 / 4, tw: D, tf: 0 };
        }
        if (sec.type === 'TUBE') {
            const D = sec.params.D, T = sec.params.T, Ro = D / 2, Ri = D / 2 - T;
            return { type: 'TUBE', H: D, B: D, D, T, A: Math.PI * (Ro ** 2 - Ri ** 2), Iy: Math.PI * (Ro ** 4 - Ri ** 4) / 4, tw: 2 * T, tf: 0 };
        }
        if (sec.type === 'QPRO' && sec.props?.Iy && sec.dims?.h) {
            const A  = (sec.props.A  || 1)  * 1e-4;   // cm² → m²
            const Iy = (sec.props.Iy || 1)  * 1e-8;   // cm⁴ → m⁴
            const H  = (sec.dims.h  || 200) * 1e-3;   // mm → m
            const B  = (sec.dims.b  || 100) * 1e-3;
            const tw = (sec.dims.tw || 6)   * 1e-3;
            const tf = (sec.dims.tf || 10)  * 1e-3;
            return { type: 'QPRO', H, B, A, Iy, tw, tf };
        }
        return null;
    }

    _tauMax(props, Vz) {
        if (Math.abs(Vz) < 1e-9) return 0;
        const { type, H, B, A, Iy, tw, tf } = props;
        const V = Math.abs(Vz);
        if (type === 'SREC') return 1.5 * V / A / 1000;
        if (type === 'SCIR') return (4 / 3) * V / A / 1000;
        if (type === 'TUBE') return 2 * V / A / 1000;
        if (type === 'QPRO') {
            // First moment of area at neutral axis of I-section
            const S_NA = B * tf * (H / 2 - tf / 2) + tw * Math.pow(H / 2 - tf, 2) / 2;
            return V * S_NA / (Iy * tw) / 1000;
        }
        return 0;
    }

    _stressSVG(props, sigTop, sigBot) {
        const W = 210, H = 96;
        const qW = 72, dX = 88, dW = W - dX - 6;
        const yT = 6, yB = H - 6, hH = H - 12; // top/bottom y, draw height

        // ── Cross-section outline ──
        let qs = '';
        const cx = qW / 2 + 4, cy = H / 2;
        const { type } = props;
        if (type === 'SREC') {
            const sc = Math.min((qW - 10) / props.B, (hH - 6) / props.H);
            const sw = props.B * sc, sh = props.H * sc;
            qs = `<rect x="${cx - sw/2}" y="${cy - sh/2}" width="${sw}" height="${sh}" fill="#1a2535" stroke="#3d9eff" stroke-width="1.5"/>`;
        } else if (type === 'SCIR') {
            const r = Math.min(qW, hH) / 2 - 6;
            qs = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#1a2535" stroke="#3d9eff" stroke-width="1.5"/>`;
        } else if (type === 'TUBE') {
            const ro = Math.min(qW, hH) / 2 - 6;
            const ri = Math.max(ro * (1 - 2 * props.T / props.D), 4);
            qs = `<circle cx="${cx}" cy="${cy}" r="${ro}" fill="#1a2535" stroke="#3d9eff" stroke-width="1.5"/>
                  <circle cx="${cx}" cy="${cy}" r="${ri}" fill="#0d0f14" stroke="#3d9eff" stroke-width="1"/>`;
        } else if (type === 'QPRO') {
            const sc = Math.min((qW - 10) / props.B, (hH - 4) / props.H);
            const sh = props.H * sc, sb = props.B * sc;
            const stw = Math.max(props.tw * sc, 2.5), stf = Math.max(props.tf * sc, 3.5);
            qs = `<rect x="${cx-sb/2}" y="${cy-sh/2}" width="${sb}" height="${stf}" fill="#1a2535" stroke="#3d9eff" stroke-width="1"/>
                  <rect x="${cx-stw/2}" y="${cy-sh/2+stf}" width="${stw}" height="${sh-2*stf}" fill="#1a2535" stroke="#3d9eff" stroke-width="1"/>
                  <rect x="${cx-sb/2}" y="${cy+sh/2-stf}" width="${sb}" height="${stf}" fill="#1a2535" stroke="#3d9eff" stroke-width="1"/>`;
        }
        // Neutral axis on QS
        qs += `<line x1="4" y1="${cy}" x2="${qW}" y2="${cy}" stroke="#3a4a5a" stroke-width="0.8" stroke-dasharray="3,2"/>`;

        // ── Stress diagram ──
        const zeroX = dX + dW * 0.42;
        const maxExt = dW * 0.52;
        const sigAbsMax = Math.max(Math.abs(sigTop), Math.abs(sigBot), 0.001);
        const scale = maxExt / sigAbsMax;
        const xT = zeroX + sigTop * scale;
        const xB = zeroX + sigBot * scale;

        // Zero-crossing y between yT and yB
        let zeroCrossY = null;
        if (Math.sign(sigTop) !== Math.sign(sigBot) && sigTop !== 0 && sigBot !== 0) {
            zeroCrossY = yT + hH * Math.abs(sigTop) / (Math.abs(sigTop) + Math.abs(sigBot));
        }

        const colorOf = s => s < 0 ? '#3d9eff' : '#ff5555';
        const fillOf  = s => s < 0 ? 'rgba(61,158,255,0.25)' : 'rgba(255,85,85,0.25)';

        let poly = '';
        if (zeroCrossY !== null) {
            poly = `
                <polygon points="${zeroX},${yT} ${xT},${yT} ${zeroX},${zeroCrossY}"
                    fill="${fillOf(sigTop)}" stroke="${colorOf(sigTop)}" stroke-width="1.5" stroke-linejoin="round"/>
                <polygon points="${zeroX},${zeroCrossY} ${xB},${yB} ${zeroX},${yB}"
                    fill="${fillOf(sigBot)}" stroke="${colorOf(sigBot)}" stroke-width="1.5" stroke-linejoin="round"/>`;
        } else {
            const c = (sigTop + sigBot < 0) ? colorOf(-1) : colorOf(1);
            const f = (sigTop + sigBot < 0) ? fillOf(-1) : fillOf(1);
            poly = `<polygon points="${zeroX},${yT} ${xT},${yT} ${xB},${yB} ${zeroX},${yB}"
                        fill="${f}" stroke="${c}" stroke-width="1.5" stroke-linejoin="round"/>`;
        }

        const fmtLbl = v => (v >= 0 ? '+' : '') + v.toFixed(1);
        const lblAnch = v => v >= 0 ? 'start' : 'end';
        const lblOffX = v => v >= 0 ? 3 : -3;

        const labels = `
            <text x="${xT + lblOffX(sigTop)}" y="${yT + 9}" font-size="8" fill="${colorOf(sigTop)}"
                  text-anchor="${lblAnch(sigTop)}" font-family="monospace">${fmtLbl(sigTop)}</text>
            <text x="${xB + lblOffX(sigBot)}" y="${yB - 2}" font-size="8" fill="${colorOf(sigBot)}"
                  text-anchor="${lblAnch(sigBot)}" font-family="monospace">${fmtLbl(sigBot)}</text>
            <text x="${W - 3}" y="${H - 1}" font-size="7" fill="#445" text-anchor="end"
                  font-family="monospace">MPa</text>`;

        const zeroLine = `<line x1="${zeroX}" y1="${yT - 2}" x2="${zeroX}" y2="${yB + 2}"
                               stroke="#3a4a5a" stroke-width="1" stroke-dasharray="3,2"/>`;
        const border   = `<line x1="${qW + 4}" y1="${yT}" x2="${qW + 4}" y2="${yB}"
                               stroke="#1e2430" stroke-width="1"/>`;

        return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"
                     xmlns="http://www.w3.org/2000/svg" style="display:block">
            ${qs}${border}${zeroLine}${poly}${labels}
        </svg>`;
    }

    _nodeResultHtml(nodeId) {
        if (!this.model.hasResults) return '';
        const rd = this.model.resultData;
        const d = (rd.nodes || []).find(n => n.id === nodeId);
        if (!d) return '';
        const fmt = v => (v != null && isFinite(v)) ? (v * 1000).toFixed(2) : '—'; // m → mm
        return `
            <h3>Verschiebungen</h3>
            <div class="result-row">
                <span class="result-label">uX [mm]</span>
                <span class="result-val">${fmt(d.uX)}</span>
            </div>
            <div class="result-row">
                <span class="result-label">uY [mm]</span>
                <span class="result-val">${fmt(d.uY)}</span>
            </div>
            ${d.uZ != null ? `<div class="result-row"><span class="result-label">uZ [mm]</span><span class="result-val">${fmt(d.uZ)}</span></div>` : ''}
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
                <input type="number" class="load-edit-val" data-loadid="${l.id}" value="${l.value}" step="1" style="flex:1;background:var(--bg-input);border:1px solid var(--border);color:var(--text);padding:2px 4px;border-radius:3px;font-size:11px">
                <span style="font-size:10px;color:var(--text-dim)">kN</span>
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

            ${this._nodeResultHtml(nodeId)}

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

        // Inline node load editing
        for (const inp of this.el.querySelectorAll('.load-edit-val')) {
            inp.onchange = () => {
                const loadId = +inp.dataset.loadid;
                const value = parseFloat(inp.value);
                if (!isNaN(value)) this.model.updateLoad(activeLc, loadId, { value });
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
                <input type="number" class="load-edit-p1" data-loadid="${l.id}" value="${l.p1}" step="1" style="width:46px;background:var(--bg-input);border:1px solid var(--border);color:var(--text);padding:2px 4px;border-radius:3px;font-size:11px">
                <span style="font-size:10px;color:var(--text-dim)">/</span>
                <input type="number" class="load-edit-p2" data-loadid="${l.id}" value="${l.p2}" step="1" style="width:46px;background:var(--bg-input);border:1px solid var(--border);color:var(--text);padding:2px 4px;border-radius:3px;font-size:11px">
                <span style="font-size:10px;color:var(--text-dim)">kN/m</span>
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

            ${this._beamResultHtml(beamId)}
            ${this._beamStressHTML(beamId)}

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

        // Inline beam load editing
        for (const inp of this.el.querySelectorAll('.load-edit-p1, .load-edit-p2')) {
            inp.onchange = () => {
                const loadId = +inp.dataset.loadid;
                const row = inp.closest('.prop-group');
                const p1 = parseFloat(row.querySelector('.load-edit-p1').value);
                const p2 = parseFloat(row.querySelector('.load-edit-p2').value);
                if (!isNaN(p1) && !isNaN(p2)) this.model.updateLoad(activeLc, loadId, { p1, p2 });
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

        const supTypes = { NONE: 'Frei', PINNED: 'Gelenk', FIXED: 'Einspannung', ROLLER_X: 'Verschieblich X', ROLLER_Z: 'Verschieblich Z' };
        const edgeSups = area.edgeSupports || area.boundaryNodeIds.map(() => 'NONE');
        const edgeHtml = area.boundaryNodeIds.map((nid, i) => {
            const n2id = area.boundaryNodeIds[(i + 1) % area.boundaryNodeIds.length];
            const opts = Object.entries(supTypes).map(([k, v]) =>
                `<option value="${k}" ${edgeSups[i] === k ? 'selected' : ''}>${v}</option>`
            ).join('');
            const isActive = edgeSups[i] !== 'NONE';
            return `<div class="prop-group edge-sup-row ${isActive ? 'edge-sup-active' : ''}" data-edge-idx="${i}">
                <label class="edge-sup-lbl">Rand ${i + 1}</label>
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
                const sups = [...(area.edgeSupports || area.boundaryNodeIds.map(() => 'NONE'))];
                sups[idx] = sel.value;
                this.model.updateArea(areaId, { edgeSupports: sups });
                // Update active class on row
                const row = sel.closest('.edge-sup-row');
                if (row) row.classList.toggle('edge-sup-active', sel.value !== 'NONE');
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

    // ── Edge support highlight from canvas click ────────────
    _highlightEdge({ areaId, edgeIndex }) {
        // Select the area if not already
        if (this.model.selection.type !== 'area' || this.model.selection.id !== areaId) {
            this.model.select('area', areaId);
            // Wait for re-render
            requestAnimationFrame(() => this._focusEdgeRow(edgeIndex));
        } else {
            this._focusEdgeRow(edgeIndex);
        }
    }

    _focusEdgeRow(edgeIndex) {
        const rows = this.el.querySelectorAll('.edge-sup-row');
        rows.forEach((r, i) => r.classList.toggle('edge-sup-focus', i === edgeIndex));
        const row = rows[edgeIndex];
        if (row) {
            row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            const sel = row.querySelector('select');
            if (sel) sel.focus();
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
        // Select the element — the properties panel already has inline load forms
        if (info.type === 'area') this.model.select('area', info.id);
        else if (info.type === 'beam') this.model.select('beam', info.id);
        else if (info.type === 'node') this.model.select('node', info.id);
        // Hint + scroll to the add-load button after re-render
        requestAnimationFrame(() => {
            const btn = this.el.querySelector('#add-beam-load, #add-node-load, #add-area-load');
            if (btn) {
                btn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                // Flash the button to draw attention
                btn.style.outline = '2px solid var(--accent)';
                setTimeout(() => { btn.style.outline = ''; }, 1200);
            }
        });
        this._statusMsg('Last-Werte im rechten Panel eingeben →');
    }

    _showMaterialDialog(editId = null) {
        const panel = new MaterialPanel(this.el, this.model, () => this._render(), editId);
        panel.show();
    }

    _showSectionDialog(editId = null) {
        const panel = new SectionPanel(this.el, this.model, () => this._render(), editId);
        panel.show();
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
        this.model.bus.on('loadcase:changed', () => this._render());
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
        const nAreas = (d.areas || []).length;
        const countStr = [
            `${d.nodes.length}N`,
            `${d.beams.length}S`,
            ...(nAreas > 0 ? [`${nAreas}F`] : []),
        ].join(' ');
        this.el.innerHTML = `
            <span class="status-mode">${modeLabels[this.model.mode] || this.model.mode}</span>
            <span class="status-sep">|</span>
            <input type="text" id="coord-input" placeholder="x,z  oder  @dx,dz" autocomplete="off">
            <span class="status-sep">|</span>
            <span class="status-coords" id="status-coords">${this._coordHTML(this._cursorX, this._cursorZ)}</span>
            <span class="status-snap" id="status-snap"></span>
            <span class="status-sep">|</span>
            <span style="font-size:10px;color:var(--text-dim)">${countStr}</span>
            <span class="status-sep">|</span>
            <span class="status-lf">LF&nbsp;${this.model.activeLoadcase}</span>
            <span class="calc-dot" id="status-calc-dot"></span>
            <span class="status-right" id="status-msg"></span>
        `;
        this._bindCoordInput();
    }

    _coordHTML(x, z) {
        return `<span class="status-coord-lbl">x</span><span class="status-coord-val">${x.toFixed(3)}</span>`
             + `&nbsp;&nbsp;<span class="status-coord-lbl">z</span><span class="status-coord-val">${z.toFixed(3)}</span>`;
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
        if (el) el.innerHTML = this._coordHTML(pos.x, pos.z);
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
    constructor(model, canvas, api) {
        this.model = model;
        this.canvas = canvas;
        this._api = api;
        this.el = document.getElementById('result-widget');
        this._toggles = { u: false, My: false, Vz: false, N: false, mxx: false, myy: false, uZ: false, reactions: false };
        this._deformScale = 500;
        this._diagramScale = 0.02;
        this._currentLc = 1;
        this._switching = false; // prevents toggle reset during LC switch

        this.model.bus.on('results:loaded', () => this._show());
        this.model.bus.on('results:invalidated', () => this._onInvalidated());
        this.model.bus.on('results:cleared', () => this._hide());

        this._initDrag();
    }

    _anyToggleActive() {
        return Object.values(this._toggles).some(v => v);
    }

    _show() {
        if (!this._switching) {
            // First load: auto-enable deformation + moments
            const hasBeams = this.model.data.beams.some(b => !b.isStructLine);
            const hasAreas = (this.model.data.areas || []).length > 0;
            this._toggles = {
                u:         true,
                My:        hasBeams,
                Vz:        false,
                N:         false,
                mxx:       false,
                myy:       hasAreas,
                uZ:        false,
                reactions: false,
            };
            // Sync displayed LC to first available
            const lcs = this.model.resultData?.loadcases || [];
            this._currentLc = lcs[0]?.nr || 1;
        }
        this._switching = false;
        this._render();
        this.el.classList.add('visible');
        this._applyToggles();
    }

    _hide() {
        this.el.classList.remove('visible');
        this.canvas.resetDeformView();
        this.canvas.hideBeamDiagrams();
        this.canvas.hideQuadResults();
        this.canvas.hideReactions();
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
        const lcs = this.model.resultData?.loadcases || [];
        const isSofistik = !!this.model._resultSqlite;

        const toggleDefs = [
            { key: 'u',  label: 'Verformung', color: '#ff3333' },
            ...(hasBeams ? [
                { key: 'My', label: 'My [kNm]',   color: '#4488ff' },
                { key: 'Vz', label: 'Vz [kN]',    color: '#44bb44' },
                { key: 'N',  label: 'N  [kN]',    color: '#ffaa44' },
            ] : []),
            ...(hasAreas ? [
                { key: 'mxx', label: 'mxx [kNm/m]', color: '#4488ff' },
                { key: 'myy', label: 'myy [kNm/m]', color: '#44bbff' },
                { key: 'uZ',  label: 'uZ [mm]',     color: '#ff3333' },
            ] : []),
            { key: 'reactions', label: 'Auflagerkräfte', color: '#ff8800' },
        ];

        const lcSwitcherHtml = isSofistik && lcs.length > 1 ? `
            <div class="result-lc-row">
                <span>Lastfall</span>
                <select id="rs-lc">
                    ${lcs.map(lc => `<option value="${lc.nr}" ${lc.nr === this._currentLc ? 'selected' : ''}>LF ${lc.nr}${lc.name ? ': ' + lc.name : ''}</option>`).join('')}
                </select>
            </div>` : '';

        this.el.innerHTML = `
            <div class="result-widget-header" id="result-drag-handle">
                <span class="result-widget-title">Ergebnisse${isSofistik ? ' · SOFiSTiK' : ' · Stabileo'}</span>
                <button class="result-widget-close" id="result-close">&times;</button>
            </div>
            ${lcSwitcherHtml}
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

        // LC switcher
        this.el.querySelector('#rs-lc')?.addEventListener('change', async (e) => {
            const lcNr = parseInt(e.target.value);
            if (!this._api || !this.model._resultSqlite) return;
            this._currentLc = lcNr;
            const statusEl = document.getElementById('status-msg');
            if (statusEl) statusEl.textContent = `Lade LF ${lcNr}...`;
            try {
                this._switching = true;
                const rd = await this._api.fetchResults(this.model._resultSqlite, lcNr);
                this.model.setResults(rd, this.model._resultSqlite);
                if (statusEl) statusEl.textContent = `LF ${lcNr} geladen`;
            } catch (err) {
                this._switching = false;
                if (statusEl) statusEl.textContent = `Fehler beim Laden von LF ${lcNr}: ${err.message}`;
            }
        });

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

        // Support reactions
        if (this._toggles.reactions) {
            this.canvas.showReactions(rd);
        } else {
            this.canvas.hideReactions();
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

// ─── Load Scale Widget ───────────────────────────────────────
export class LoadWidget {
    constructor(model, canvas) {
        this.model = model;
        this.canvas = canvas;
        this.el = document.getElementById('load-widget');
        this._scale = 1.0;

        model.bus.on('model:changed',    () => this._update());
        model.bus.on('loadcase:changed', () => this._update());
        model.bus.on('model:loaded',     () => this._update());
        this._update();
    }

    _activeLoads() {
        const lc = this.model.data.loadcases.find(l => l.id === this.model.activeLoadcase);
        return lc ? lc.loads : [];
    }

    _update() {
        const loads = this._activeLoads();
        if (loads.length === 0) {
            this.el.classList.remove('visible');
            return;
        }
        this.el.classList.add('visible');
        this._render();
    }

    _render() {
        const loads = this._activeLoads();
        const lc = this.model.data.loadcases.find(l => l.id === this.model.activeLoadcase);
        const lcName = lc ? `LF ${lc.id}: ${lc.name}` : '';
        const scaleDisplay = this._scale.toFixed(1);

        this.el.innerHTML = `
            <div class="result-widget-header" id="load-drag-handle">
                <span class="result-widget-title">Lasten · ${lcName}</span>
            </div>
            <div style="font-size:10px;color:var(--text-dim);margin-bottom:6px">${loads.length} Last${loads.length !== 1 ? 'en' : ''}</div>
            <div class="result-slider-row">
                <span>Skala</span>
                <input type="range" id="lw-scale" min="1" max="50" step="1" value="${Math.round(this._scale * 10)}">
                <span class="slider-val" id="lw-scale-val">${scaleDisplay}×</span>
            </div>
        `;

        this.el.querySelector('#lw-scale').oninput = (e) => {
            this._scale = parseInt(e.target.value) / 10;
            this.el.querySelector('#lw-scale-val').textContent = this._scale.toFixed(1) + '×';
            this.canvas.setLoadScale(this._scale);
        };

        // Drag
        let isDragging = false, startX, startY, origX, origY;
        const handle = this.el.querySelector('#load-drag-handle');
        handle.style.cursor = 'move';
        handle.addEventListener('pointerdown', (e) => {
            isDragging = true;
            startX = e.clientX; startY = e.clientY;
            const r = this.el.getBoundingClientRect();
            origX = r.left; origY = r.top;
            this.el.setPointerCapture(e.pointerId);
            e.preventDefault();
        });
        this.el.addEventListener('pointermove', (e) => {
            if (!isDragging) return;
            this.el.style.left   = (origX + e.clientX - startX) + 'px';
            this.el.style.top    = (origY + e.clientY - startY) + 'px';
            this.el.style.right  = 'auto';
            this.el.style.bottom = 'auto';
        });
        this.el.addEventListener('pointerup', () => { isDragging = false; });
    }
}
