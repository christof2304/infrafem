// MaterialPanel.js — Visual material picker for PropertiesPanel
// Analogous to SectionPanel: two-column layout, SVG preview, properties grid

// ── Material data (EN 1992 / EN 1993) ───────────────────────

const STAH_DATA = {
    'S 235': { fy: 235, fu: 360, E: 210000, G: 81000, gam: 78.5 },
    'S 275': { fy: 275, fu: 430, E: 210000, G: 81000, gam: 78.5 },
    'S 355': { fy: 355, fu: 510, E: 210000, G: 81000, gam: 78.5 },
    'S 420': { fy: 420, fu: 520, E: 210000, G: 81000, gam: 78.5 },
    'S 460': { fy: 460, fu: 540, E: 210000, G: 81000, gam: 78.5 },
};

const BETO_DATA = {
    'C 12/15': { fck: 12,  fctm: 1.6, Ecm: 27000, eps_cu: 3.5, gam: 25 },
    'C 16/20': { fck: 16,  fctm: 1.9, Ecm: 29000, eps_cu: 3.5, gam: 25 },
    'C 20/25': { fck: 20,  fctm: 2.2, Ecm: 30000, eps_cu: 3.5, gam: 25 },
    'C 25/30': { fck: 25,  fctm: 2.6, Ecm: 31000, eps_cu: 3.5, gam: 25 },
    'C 30/37': { fck: 30,  fctm: 2.9, Ecm: 33000, eps_cu: 3.5, gam: 25 },
    'C 35/45': { fck: 35,  fctm: 3.2, Ecm: 34000, eps_cu: 3.5, gam: 25 },
    'C 40/50': { fck: 40,  fctm: 3.5, Ecm: 35000, eps_cu: 3.5, gam: 25 },
    'C 45/55': { fck: 45,  fctm: 3.8, Ecm: 36000, eps_cu: 3.5, gam: 25 },
    'C 50/60': { fck: 50,  fctm: 4.1, Ecm: 37000, eps_cu: 3.5, gam: 25 },
};

const STAH_GRADES = Object.keys(STAH_DATA);
const BETO_GRADES = Object.keys(BETO_DATA);

// ── SVG stress-strain diagrams ───────────────────────────────

function svgSteel(props) {
    const { fy, E } = props;
    // Elastic slope then flat plateau
    const w = 84, h = 84, pad = 12;
    const epsY = fy / E;         // yield strain (normalized)
    const epsMax = epsY * 8;     // plot to 8× yield
    const sigMax = fy * 1.05;    // headroom above fy

    const px = (eps) => pad + (eps / epsMax) * (w - 2 * pad);
    const py = (sig) => (h - pad) - (sig / sigMax) * (h - 2 * pad);

    const x0 = px(0), y0 = py(0);
    const xY = px(epsY), yY = py(fy);
    const xE = px(epsMax), yE = py(fy);

    return `<svg viewBox="0 0 ${w} ${h}" width="84" height="84" xmlns="http://www.w3.org/2000/svg">
        <line x1="${x0}" y1="${h - pad}" x2="${w - pad + 4}" y2="${h - pad}" stroke="#334" stroke-width="1"/>
        <line x1="${x0}" y1="${h - pad + 2}" x2="${x0}" y2="${pad - 4}" stroke="#334" stroke-width="1"/>
        <polyline points="${x0},${y0} ${xY},${yY} ${xE},${yE}"
            fill="none" stroke="#3d9eff" stroke-width="2" stroke-linejoin="round"/>
        <line x1="${x0}" y1="${yY}" x2="${pad - 3}" y2="${yY}" stroke="#2a3444" stroke-width="0.8" stroke-dasharray="2,2"/>
        <text x="${pad - 4}" y="${yY + 3}" font-size="7" fill="#6a7a8e" text-anchor="end" font-family="monospace">fy</text>
        <text x="${w - pad + 6}" y="${h - pad + 3}" font-size="7" fill="#6a7a8e" font-family="monospace">ε</text>
        <text x="${pad - 3}" y="${pad - 2}" font-size="7" fill="#6a7a8e" font-family="monospace">σ</text>
    </svg>`;
}

function svgConcrete(props) {
    const { fck, eps_cu } = props;
    // Parabola-rectangle (EN 1992 Fig. 3.3)
    const w = 84, h = 84, pad = 12;
    const eps2 = 2.0;   // end of parabola (‰)
    const sigMax = fck * 1.05;

    const px = (eps) => pad + (eps / eps_cu) * (w - 2 * pad);
    const py = (sig) => (h - pad) - (sig / sigMax) * (h - 2 * pad);

    // Parabolic part: 0 → eps2
    const nPts = 12;
    let pts = '';
    for (let i = 0; i <= nPts; i++) {
        const eps = (eps2 / nPts) * i;
        const sig = fck * (1 - Math.pow(1 - eps / eps2, 2));
        pts += `${px(eps)},${py(sig)} `;
    }
    // Rectangle part: eps2 → eps_cu at fck
    pts += `${px(eps_cu)},${py(fck)} `;
    pts += `${px(eps_cu)},${py(0)} `;
    pts += `${px(0)},${py(0)}`;

    return `<svg viewBox="0 0 ${w} ${h}" width="84" height="84" xmlns="http://www.w3.org/2000/svg">
        <line x1="${px(0)}" y1="${h - pad}" x2="${w - pad + 4}" y2="${h - pad}" stroke="#334" stroke-width="1"/>
        <line x1="${px(0)}" y1="${h - pad + 2}" x2="${px(0)}" y2="${pad - 4}" stroke="#334" stroke-width="1"/>
        <polygon points="${pts}"
            fill="rgba(61,158,255,0.15)" stroke="#3d9eff" stroke-width="1.5" stroke-linejoin="round"/>
        <line x1="${px(0)}" y1="${py(fck)}" x2="${pad - 3}" y2="${py(fck)}" stroke="#2a3444" stroke-width="0.8" stroke-dasharray="2,2"/>
        <text x="${pad - 4}" y="${py(fck) + 3}" font-size="7" fill="#6a7a8e" text-anchor="end" font-family="monospace">fck</text>
        <text x="${w - pad + 6}" y="${h - pad + 3}" font-size="7" fill="#6a7a8e" font-family="monospace">ε</text>
        <text x="${px(0) - 3}" y="${pad - 2}" font-size="7" fill="#6a7a8e" font-family="monospace">σ</text>
    </svg>`;
}

// ── MaterialPanel class ──────────────────────────────────────

export class MaterialPanel {
    constructor(container, model, onDone, editId = null) {
        this._el = container;
        this._model = model;
        this._onDone = onDone;
        this._editId = editId;
        this._type = 'STAH';
        this._grade = 'S 355';
        this._label = '';
    }

    show() {
        if (this._editId != null) {
            const m = this._model.data.materials.find(m => m.id === this._editId);
            if (m) {
                this._type = m.type || 'STAH';
                this._grade = m.grade || 'S 355';
                this._label = m.label || '';
            }
        }
        this._render();
    }

    _grades() {
        return this._type === 'BETO' ? BETO_GRADES : STAH_GRADES;
    }

    _props() {
        return this._type === 'BETO' ? BETO_DATA[this._grade] : STAH_DATA[this._grade];
    }

    _defaultLabel() {
        return this._type === 'BETO'
            ? `Beton ${this._grade}`
            : `Stahl ${this._grade}`;
    }

    _propsGrid() {
        const p = this._props();
        if (!p) return '';
        if (this._type === 'STAH') {
            return `
                <div class="mat-props-grid">
                    <span>f<sub>y</sub></span><span>${p.fy} MPa</span>
                    <span>f<sub>u</sub></span><span>${p.fu} MPa</span>
                    <span>E</span><span>${(p.E / 1000).toFixed(0)} GPa</span>
                    <span>G</span><span>${(p.G / 1000).toFixed(0)} GPa</span>
                    <span>γ</span><span>${p.gam} kN/m³</span>
                </div>`;
        } else {
            return `
                <div class="mat-props-grid">
                    <span>f<sub>ck</sub></span><span>${p.fck} MPa</span>
                    <span>f<sub>ctm</sub></span><span>${p.fctm} MPa</span>
                    <span>E<sub>cm</sub></span><span>${(p.Ecm / 1000).toFixed(0)} GPa</span>
                    <span>ε<sub>cu</sub></span><span>${p.eps_cu} ‰</span>
                    <span>γ</span><span>${p.gam} kN/m³</span>
                </div>`;
        }
    }

    _render() {
        const grades = this._grades();
        if (!grades.includes(this._grade)) this._grade = grades[0];
        const label = this._label || this._defaultLabel();
        const props = this._props();
        const svgHtml = this._type === 'STAH' ? svgSteel(props) : svgConcrete(props);

        this._el.innerHTML = `
            <div class="sec-panel">
                <div class="sec-header">
                    <span>${this._editId != null ? 'Material bearbeiten' : 'Material hinzufügen'}</span>
                    <button class="btn-sm sec-cancel-btn" id="mat-cancel">✕</button>
                </div>

                <div class="sec-cats">
                    <button class="sec-cat-btn${this._type === 'STAH' ? ' active' : ''}" data-type="STAH">Stahl</button>
                    <button class="sec-cat-btn${this._type === 'BETO' ? ' active' : ''}" data-type="BETO">Beton</button>
                </div>

                <div class="sec-body">
                    <div class="sec-list" id="mat-list-scroll">
                        ${grades.map(g => `
                            <div class="sec-prof-item${g === this._grade ? ' active' : ''}" data-grade="${g}">
                                ${g}
                            </div>
                        `).join('')}
                    </div>
                    <div class="sec-right">
                        <div class="sec-preview">${svgHtml}</div>
                        ${this._propsGrid()}
                    </div>
                </div>

                <div class="sec-footer">
                    <div class="prop-group" style="margin:0">
                        <label>Bezeichnung</label>
                        <input type="text" id="mat-label" value="${label}"
                            style="flex:1;background:var(--bg-input);border:1px solid var(--border);
                                   color:var(--text);padding:3px 6px;border-radius:3px;font-size:11px">
                    </div>
                    <button class="btn-full sec-add-btn" id="mat-add">${this._editId != null ? 'Speichern' : 'Hinzufügen'}</button>
                </div>
            </div>

            <style>
            .mat-props-grid {
                display: grid; grid-template-columns: auto auto;
                gap: 2px 8px; font-size: 10px; font-family: var(--font-mono);
                color: var(--text-dim); width: 100%;
            }
            .mat-props-grid span:nth-child(even) { color: var(--text); text-align: right; }
            </style>
        `;

        // Category tabs
        for (const btn of this._el.querySelectorAll('.sec-cat-btn')) {
            btn.addEventListener('click', () => {
                this._type = btn.dataset.type;
                this._grade = this._grades()[0];
                this._label = '';
                this._render();
            });
        }

        // Grade list
        for (const item of this._el.querySelectorAll('.sec-prof-item')) {
            item.addEventListener('click', () => {
                this._grade = item.dataset.grade;
                this._label = '';
                this._render();
                // Scroll active into view
                const active = this._el.querySelector('.sec-prof-item.active');
                if (active) active.scrollIntoView({ block: 'nearest' });
            });
        }

        // Label input
        this._el.querySelector('#mat-label').addEventListener('input', e => {
            this._label = e.target.value;
        });

        // Scroll selected grade into view on open
        const active = this._el.querySelector('.sec-prof-item.active');
        if (active) active.scrollIntoView({ block: 'nearest' });

        this._el.querySelector('#mat-cancel').addEventListener('click', () => this._onDone());
        this._el.querySelector('#mat-add').addEventListener('click', () => this._confirm());
        this._el.querySelector('#mat-label').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this._confirm();
            if (e.key === 'Escape') this._onDone();
        });
    }

    _confirm() {
        const label = (this._el.querySelector('#mat-label')?.value || this._defaultLabel()).trim();
        if (this._editId != null) {
            this._model.updateMaterial(this._editId, { type: this._type, grade: this._grade, label });
        } else {
            this._model.addMaterial(this._type, this._grade, label);
        }
        this._onDone();
    }
}
