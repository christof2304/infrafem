// SectionPanel.js — Visual steel profile picker + parametric section editor
// Replaces _showSectionDialog() prompt() chain in PropertiesPanel

import { PROFILE_CATEGORIES, PROFILES, IPE } from '../profiles/steel-profiles.js';

// ── SVG cross-section previews ───────────────────────────────

function svgIProfile(h, b, tw, tf) {
    const pad = 8;
    const box = 100 - 2 * pad;
    const scale = Math.min(box / h, box / b);
    const sh = h * scale, sb = b * scale;
    const stw = Math.max(tw * scale, 2.5);
    const stf = Math.max(tf * scale, 3.5);
    const x0 = 50 - sb / 2, y0 = 50 - sh / 2;
    const xm = 50;
    return `<svg viewBox="0 0 100 100" width="84" height="84" xmlns="http://www.w3.org/2000/svg">
        <rect x="${x0}" y="${y0}" width="${sb}" height="${stf}" fill="#3d9eff" opacity="0.85"/>
        <rect x="${xm - stw/2}" y="${y0 + stf}" width="${stw}" height="${sh - 2*stf}" fill="#3d9eff" opacity="0.85"/>
        <rect x="${x0}" y="${y0 + sh - stf}" width="${sb}" height="${stf}" fill="#3d9eff" opacity="0.85"/>
    </svg>`;
}

function svgUProfile(h, b, tw, tf) {
    const pad = 8;
    const box = 100 - 2 * pad;
    const scale = Math.min(box / h, box / b);
    const sh = h * scale, sb = b * scale;
    const stw = Math.max(tw * scale, 3);
    const stf = Math.max(tf * scale, 3.5);
    const x0 = 50 - sb / 2, y0 = 50 - sh / 2;
    return `<svg viewBox="0 0 100 100" width="84" height="84" xmlns="http://www.w3.org/2000/svg">
        <rect x="${x0}" y="${y0}" width="${stw}" height="${sh}" fill="#3d9eff" opacity="0.85"/>
        <rect x="${x0}" y="${y0}" width="${sb}" height="${stf}" fill="#3d9eff" opacity="0.85"/>
        <rect x="${x0}" y="${y0 + sh - stf}" width="${sb}" height="${stf}" fill="#3d9eff" opacity="0.85"/>
    </svg>`;
}

function svgRect(H, B) {
    const pad = 10;
    const box = 100 - 2 * pad;
    const scale = Math.min(box / H, box / B);
    const sh = H * scale, sb = B * scale;
    return `<svg viewBox="0 0 100 100" width="84" height="84" xmlns="http://www.w3.org/2000/svg">
        <rect x="${50 - sb/2}" y="${50 - sh/2}" width="${sb}" height="${sh}" fill="#3d9eff" opacity="0.85" rx="1"/>
    </svg>`;
}

function svgCirc(D) {
    const r = 36;
    return `<svg viewBox="0 0 100 100" width="84" height="84" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="${r}" fill="#3d9eff" opacity="0.85"/>
    </svg>`;
}

function svgTube(D, T) {
    const ro = 36, ri = Math.max(ro - Math.max(T / D * ro * 2, 4), 8);
    return `<svg viewBox="0 0 100 100" width="84" height="84" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="${ro}" fill="#3d9eff" opacity="0.85"/>
        <circle cx="50" cy="50" r="${ri}" fill="#111318"/>
    </svg>`;
}

function renderSVG(category, profile, params) {
    if (category === 'IPE' || category === 'HEB' || category === 'HEA' || category === 'HEM') {
        if (!profile) return svgIProfile(200, 100, 5.6, 8.5);
        return svgIProfile(profile.h, profile.b, profile.tw, profile.tf);
    }
    if (category === 'UPN') {
        if (!profile) return svgUProfile(200, 75, 8.5, 11.5);
        return svgUProfile(profile.h, profile.b, profile.tw, profile.tf);
    }
    if (category === 'SREC') return svgRect(params.H || 300, params.B || 200);
    if (category === 'SCIR') return svgCirc(params.D || 300);
    if (category === 'TUBE') return svgTube(params.D || 300, params.T || 10);
    return '';
}

// ── SectionPanel class ───────────────────────────────────────

export class SectionPanel {
    constructor(container, model, onDone, editId = null) {
        this._el = container;
        this._model = model;
        this._onDone = onDone; // called with no args when done or cancelled
        this._editId = editId;

        this._category = 'IPE';
        this._selected = IPE[6]; // IPE 200 as default
        this._materialId = null;
        this._params = { H: 0.3, B: 0.2, D: 0.3, T: 0.01 }; // for parametric
    }

    show() {
        this._materialId = this._defaultMaterialId();
        if (this._editId != null) {
            const s = this._model.data.sections.find(s => s.id === this._editId);
            if (s) {
                // Pre-fill from existing section
                this._category = s.category || s.type || 'IPE';
                if (s.materialId) this._materialId = s.materialId;
                if (s.params) this._params = { ...this._params, ...s.params };
                if (this._isRolled()) {
                    const profiles = PROFILES[this._category] || [];
                    this._selected = profiles.find(p => p.name === s.profile || p.name === s.label) || profiles[0] || null;
                }
            }
        }
        this._render();
    }

    _defaultMaterialId() {
        // prefer first STAH material, fallback to first material
        const stahl = this._model.data.materials.find(m => m.type === 'STAH');
        if (stahl) return stahl.id;
        return this._model.data.materials[0]?.id || 1;
    }

    _isParametric() {
        return ['SREC', 'SCIR', 'TUBE'].includes(this._category);
    }

    _isRolled() {
        return ['IPE', 'HEB', 'HEA', 'HEM', 'UPN'].includes(this._category);
    }

    _render() {
        const profiles = PROFILES[this._category] || [];
        const sel = this._selected;
        const isParam = this._isParametric();
        const isRolled = this._isRolled();
        const mats = this._model.data.materials;

        const catTabs = PROFILE_CATEGORIES.map(c => `
            <button class="sec-cat-btn${this._category === c.id ? ' active' : ''}" data-cat="${c.id}">${c.label}</button>
        `).join('');

        const profileList = isRolled ? profiles.map(p => `
            <div class="sec-prof-item${sel && sel.name === p.name ? ' active' : ''}" data-name="${p.name}">
                ${p.name}
            </div>
        `).join('') : '';

        const svgPreview = renderSVG(this._category, sel, this._params);

        const propsHtml = isRolled && sel ? `
            <div class="sec-props-grid">
                <span>h</span><span>${sel.h} mm</span>
                <span>b</span><span>${sel.b} mm</span>
                <span>t<sub>w</sub></span><span>${sel.tw} mm</span>
                <span>t<sub>f</sub></span><span>${sel.tf} mm</span>
                <span>A</span><span>${sel.A} cm²</span>
                <span>I<sub>y</sub></span><span>${sel.Iy} cm⁴</span>
                <span>W<sub>pl,y</sub></span><span>${sel.Wply} cm³</span>
            </div>` : '';

        const paramInputs = isParam ? this._renderParamInputs() : '';

        const matOptions = mats.map(m =>
            `<option value="${m.id}" ${m.id === this._materialId ? 'selected' : ''}>${m.label || m.type + ' ' + m.grade}</option>`
        ).join('');

        const noSteelWarning = isRolled && !mats.find(m => m.type === 'STAH')
            ? `<div class="sec-warn">Kein Stahl-Material — bitte erst unter Materialien hinzufügen.</div>`
            : '';

        this._el.innerHTML = `
            <div class="sec-panel">
                <div class="sec-header">
                    <span>${this._editId != null ? 'Querschnitt bearbeiten' : 'Querschnitt hinzufügen'}</span>
                    <button class="btn-sm sec-cancel-btn" id="sec-cancel">✕</button>
                </div>

                <div class="sec-cats">${catTabs}</div>

                <div class="sec-body">
                    ${isRolled ? `
                    <div class="sec-list" id="sec-list-scroll">${profileList}</div>
                    ` : ''}
                    <div class="sec-right">
                        <div class="sec-preview">${svgPreview}</div>
                        ${propsHtml}
                        ${paramInputs}
                    </div>
                </div>

                ${noSteelWarning}

                <div class="sec-footer">
                    <div class="prop-group" style="margin:0">
                        <label>Material</label>
                        <select id="sec-mat">${matOptions}</select>
                    </div>
                    <button class="btn-full sec-add-btn" id="sec-add" ${isRolled && !sel ? 'disabled' : ''}>${this._editId != null ? 'Speichern' : 'Hinzufügen'}</button>
                </div>
            </div>

            <style>
            .sec-panel { display:flex; flex-direction:column; gap:8px; }
            .sec-header { display:flex; justify-content:space-between; align-items:center; font-size:12px; font-weight:600; color:var(--text); padding-bottom:4px; border-bottom:1px solid var(--border); }
            .sec-cats { display:flex; flex-wrap:wrap; gap:3px; }
            .sec-cat-btn { background:var(--bg-input); border:1px solid var(--border); color:var(--text-dim); padding:3px 7px; border-radius:3px; font-size:11px; cursor:pointer; font-family:var(--font-ui); }
            .sec-cat-btn:hover { color:var(--text); border-color:var(--border-hi); }
            .sec-cat-btn.active { background:var(--accent-dim); border-color:var(--accent); color:var(--accent); }
            .sec-body { display:flex; gap:8px; min-height:140px; }
            .sec-list { flex:1; overflow-y:auto; max-height:200px; border:1px solid var(--border); border-radius:3px; background:var(--bg-input); }
            .sec-prof-item { padding:4px 8px; font-size:11px; font-family:var(--font-mono); color:var(--text-dim); cursor:pointer; border-left:2px solid transparent; }
            .sec-prof-item:hover { background:var(--accent-dim); color:var(--text); }
            .sec-prof-item.active { color:var(--accent); border-left-color:var(--accent); background:var(--accent-dim); }
            .sec-right { display:flex; flex-direction:column; align-items:center; gap:6px; min-width:100px; }
            .sec-preview { background:var(--bg-input); border:1px solid var(--border); border-radius:4px; padding:4px; display:flex; align-items:center; justify-content:center; }
            .sec-props-grid { display:grid; grid-template-columns:auto auto; gap:2px 8px; font-size:10px; font-family:var(--font-mono); color:var(--text-dim); width:100%; }
            .sec-props-grid span:nth-child(even) { color:var(--text); text-align:right; }
            .sec-footer { display:flex; flex-direction:column; gap:6px; padding-top:6px; border-top:1px solid var(--border); }
            .sec-add-btn { padding:6px; font-size:12px; font-weight:600; background:var(--accent); color:#fff; border:none; border-radius:3px; cursor:pointer; }
            .sec-add-btn:hover { background:#5ab0ff; }
            .sec-add-btn:disabled { background:var(--border); color:var(--text-dim); cursor:default; }
            .sec-cancel-btn { background:transparent; border:none; color:var(--text-dim); cursor:pointer; font-size:13px; }
            .sec-cancel-btn:hover { color:var(--danger); }
            .sec-warn { font-size:10px; color:var(--danger); background:rgba(255,107,53,0.1); padding:4px 6px; border-radius:3px; }
            .sec-param-group { display:flex; align-items:center; gap:6px; width:100%; }
            .sec-param-group label { font-size:11px; color:var(--text-dim); min-width:30px; }
            .sec-param-group input { flex:1; background:var(--bg-input); border:1px solid var(--border); color:var(--text); padding:3px 6px; border-radius:3px; font-size:11px; font-family:var(--font-mono); }
            .sec-param-unit { font-size:10px; color:var(--text-dim); min-width:20px; }
            </style>
        `;

        this._bindEvents();
        // Scroll selected item into view
        const activeItem = this._el.querySelector('.sec-prof-item.active');
        if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });
    }

    _renderParamInputs() {
        if (this._category === 'SREC') return `
            <div class="sec-param-group"><label>H</label><input type="number" id="p-H" value="${this._params.H}" step="0.05" min="0.01"><span class="sec-param-unit">m</span></div>
            <div class="sec-param-group"><label>B</label><input type="number" id="p-B" value="${this._params.B}" step="0.05" min="0.01"><span class="sec-param-unit">m</span></div>
        `;
        if (this._category === 'SCIR') return `
            <div class="sec-param-group"><label>D</label><input type="number" id="p-D" value="${this._params.D}" step="0.05" min="0.01"><span class="sec-param-unit">m</span></div>
        `;
        if (this._category === 'TUBE') return `
            <div class="sec-param-group"><label>D</label><input type="number" id="p-D" value="${this._params.D}" step="0.05" min="0.01"><span class="sec-param-unit">m</span></div>
            <div class="sec-param-group"><label>T</label><input type="number" id="p-T" value="${this._params.T * 1000}" step="1" min="1"><span class="sec-param-unit">mm</span></div>
        `;
        return '';
    }

    _bindEvents() {
        // Category tabs
        for (const btn of this._el.querySelectorAll('.sec-cat-btn')) {
            btn.addEventListener('click', () => {
                this._category = btn.dataset.cat;
                this._selected = PROFILES[this._category]?.[0] || null;
                this._render();
            });
        }

        // Profile list items
        for (const item of this._el.querySelectorAll('.sec-prof-item')) {
            item.addEventListener('click', () => {
                const profiles = PROFILES[this._category] || [];
                this._selected = profiles.find(p => p.name === item.dataset.name) || null;
                // Re-render just the list + preview + props (full re-render is fine here)
                this._render();
            });
        }

        // Parametric inputs — live preview update
        for (const key of ['H', 'B', 'D']) {
            const inp = this._el.querySelector(`#p-${key}`);
            if (inp) inp.addEventListener('input', () => {
                this._params[key] = parseFloat(inp.value) || 0.1;
                const prev = this._el.querySelector('.sec-preview');
                if (prev) prev.innerHTML = renderSVG(this._category, null, this._params);
            });
        }
        const tInp = this._el.querySelector('#p-T');
        if (tInp) tInp.addEventListener('input', () => {
            this._params.T = (parseFloat(tInp.value) || 10) / 1000;
            const prev = this._el.querySelector('.sec-preview');
            if (prev) prev.innerHTML = renderSVG(this._category, null, this._params);
        });

        // Material select
        this._el.querySelector('#sec-mat')?.addEventListener('change', e => {
            this._materialId = parseInt(e.target.value);
        });

        // Cancel
        this._el.querySelector('#sec-cancel')?.addEventListener('click', () => {
            this._onDone(null);
        });

        // Add
        this._el.querySelector('#sec-add')?.addEventListener('click', () => {
            this._confirm();
        });
    }

    _confirm() {
        const matId = this._materialId || this._model.data.materials[0]?.id || 1;

        if (this._isRolled()) {
            if (!this._selected) return;
            const p = this._selected;
            const updates = {
                type: 'QPRO', materialId: matId, params: {}, label: p.name,
                profile: p.name, category: this._category,
                dims: { h: p.h, b: p.b, tw: p.tw, tf: p.tf },
                props: { A: p.A, Iy: p.Iy, Iz: p.Iz, Wply: p.Wply, Wplz: p.Wplz, It: p.It },
            };
            if (this._editId != null) this._model.updateSection(this._editId, updates);
            else this._model.addSection(updates.type, matId, updates.params, p.name, updates);
        } else {
            const params = { ...this._params };
            const label = this._category === 'SREC'
                ? `${(params.B * 100).toFixed(0)}/${(params.H * 100).toFixed(0)}`
                : this._category === 'SCIR'
                ? `D${(params.D * 100).toFixed(0)}`
                : `R${(params.D * 100).toFixed(0)}/t${(params.T * 1000).toFixed(0)}`;
            if (this._editId != null) this._model.updateSection(this._editId, { type: this._category, materialId: matId, params, label });
            else this._model.addSection(this._category, matId, params, label);
        }

        this._onDone(null);
    }
}
