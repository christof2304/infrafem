// column-wizard.js — Column Design Wizard (SOFiSTiK COLUMN module)
// Floating draggable panel, modelled after CFDPanel.

const CONCRETE_GRADES = ["C20", "C25", "C30", "C35", "C40", "C45", "C50"];
const STEEL_GRADES    = ["B500A", "B500B", "B500C"];

export class ColumnWizardPanel {
    constructor(model, canvas, api) {
        this.model  = model;
        this.canvas = canvas;
        this.api    = api;
        this.el     = null;
        this._result   = null;
        this._loading  = false;
        this._rawVisible = false;

        // Current inputs (persist while panel is open)
        this._inputs = {
            elemNr:   null,
            lc:       1,
            concrete: "C30",
            steel:    "B500B",
            coverY:   50,
            coverZ:   50,
            betaY:    1.0,
            betaZ:    1.0,
        };
    }

    _url(path) { return (this.api?.baseUrl || '') + path; }

    show() {
        if (this.el) this.el.remove();
        this.el = document.createElement("div");
        this.el.id = "column-wizard-panel";
        this.el.style.cssText = [
            "position:fixed", "top:70px", "left:60px",
            "background:rgba(10,10,30,0.95)",
            "border:1px solid #556",
            "border-radius:8px", "padding:0",
            "z-index:26", "min-width:280px", "max-width:320px",
            "color:#c8d0e0", "font-size:12px",
            "box-shadow:0 4px 20px rgba(0,0,0,0.5)",
        ].join(";");
        this._minimized = false;
        this._render();
        document.body.appendChild(this.el);
        this._makeDraggable();

        // Sync element list from current model results
        this._syncFromModel();
    }

    hide() {
        if (this._dragMove) document.removeEventListener("mousemove", this._dragMove);
        if (this._dragUp)   document.removeEventListener("mouseup",   this._dragUp);
        if (this.el) { this.el.remove(); this.el = null; }
    }

    // Called when user clicks a beam element on canvas (editor beam ID, not SQLite nr)
    selectElement(editorBeamId) {
        this._inputs._editorBeamId = editorBeamId;
        // Auto-suggest β from boundary conditions — only if user hasn't overridden manually
        if (!this._inputs._betaManual) {
            const sug = this._suggestBeta(editorBeamId);
            if (sug) {
                this._inputs.betaY      = sug.beta;
                this._inputs.betaZ      = sug.beta;
                this._inputs._betaLabel = sug.label;
            }
        }
        if (this.el) this._render();
    }

    // ── β auto-detection from editor model ───────────────────────────────────

    _suggestBeta(editorBeamId) {
        const beams = this.model.data?.beams || [];
        const nodes = this.model.data?.nodes || [];
        const beam  = beams.find(b => b.id == editorBeamId);
        if (!beam) return null;

        // Count how many OTHER beams connect to each end node
        const otherConn = (nodeId) =>
            beams.filter(b => b.id !== beam.id &&
                (b.nodeStart === nodeId || b.nodeEnd === nodeId) &&
                !b.isStructLine
            ).length;

        const connA = otherConn(beam.nodeStart);
        const connB = otherConn(beam.nodeEnd);

        const nA = nodes.find(n => n.id === beam.nodeStart);
        const nB = nodes.find(n => n.id === beam.nodeEnd);

        const classifyEnd = (node, otherConns) => {
            const sup = node?.support || 'NONE';
            if (sup === 'FIXED')                          return 'fixed';
            if (sup === 'PINNED' || sup === 'ROLLER_X' ||
                sup === 'ROLLER_Z' || sup === 'SPRING')   return 'pinned';
            // No explicit support — classify by frame connectivity
            if (otherConns >= 2) return 'fixed';   // well-connected frame node
            if (otherConns === 1) return 'pinned';  // single connecting beam → partial restraint
            return 'free';                           // isolated end → cantilever tip
        };

        const endA = classifyEnd(nA, connA);
        const endB = classifyEnd(nB, connB);

        // EN 1992-1-1 Figure 5.7
        if (endA === 'fixed'  && endB === 'fixed')  return { beta: 0.5, label: 'fix–fix  → β=0.5' };
        if ((endA === 'fixed' && endB === 'pinned') ||
            (endA === 'pinned'&& endB === 'fixed'))  return { beta: 0.7, label: 'fix–Gelenk → β=0.7' };
        if (endA === 'pinned' && endB === 'pinned')  return { beta: 1.0, label: 'Gelenk–Gelenk → β=1.0' };
        if ((endA === 'fixed' && endB === 'free') ||
            (endA === 'free'  && endB === 'fixed'))  return { beta: 2.0, label: 'Kragstütze → β=2.0' };
        if ((endA === 'pinned'&& endB === 'free') ||
            (endA === 'free'  && endB === 'pinned')) return { beta: 2.0, label: 'Krag (gelenkig) → β=2.0' };
        return { beta: 1.0, label: 'Rahmen, angenommen → β=1.0' };
    }

    // ── Render ───────────────────────────────────────────────────────────────

    _render() {
        if (!this.el) return;
        const min = this._minimized;

        this.el.innerHTML = `
        <div id="cw-header" style="
            display:flex; justify-content:space-between; align-items:center;
            padding:8px 12px; border-bottom:1px solid #334;
            cursor:move; user-select:none; background:rgba(255,255,255,0.03);
            border-radius:8px 8px 0 0;
        ">
            <span style="font-weight:600; color:#aabbee">⬡ Column Design</span>
            <div style="display:flex;gap:4px">
                <button onclick="this.closest('#column-wizard-panel').__cwToggle()"
                    style="background:none;border:none;color:#667;cursor:pointer;padding:2px 6px"
                    title="${min ? "Expand" : "Minimize"}">${min ? "▶" : "▼"}</button>
                <button onclick="this.closest('#column-wizard-panel').__cwClose()"
                    style="background:none;border:none;color:#667;cursor:pointer;padding:2px 6px"
                    title="Close">✕</button>
            </div>
        </div>
        ${min ? "" : this._renderBody()}
        `;

        // Attach instance methods to DOM element for button callbacks
        this.el.__cwToggle = () => { this._minimized = !this._minimized; this._render(); };
        this.el.__cwClose  = () => this.hide();

        if (!min) this._bindEvents();
        if (!min && this._result) this._drawDiagram();
    }

    _renderBody() {
        const inp  = this._inputs;
        const res  = this._result;
        const beams = this._getBeamList();

        // Load cases from model results
        const lcs = this._getLcList();

        const etaColor = !res ? "#667"
            : res.eta === null ? "#f90"
            : res.eta <= 0.75 ? "#4c8" : res.eta <= 1.0 ? "#fa0" : "#f44";
        const statusIcon = !res ? "" : res.status === "OK" ? "✓" : res.status === "FAIL" ? "✗" : "⚠";

        return `
        <div style="padding:10px 12px;display:flex;flex-direction:column;gap:8px">

          <!-- Element + LC row -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
            <label style="display:flex;flex-direction:column;gap:2px">
              <span style="color:#889;font-size:10px">ELEMENT</span>
              <select id="cw-elem" style="${sel_css()}">
                <option value="">— click beam —</option>
                ${beams.map(b => `<option value="${b.nr}" ${b.nr == inp.elemNr ? "selected" : ""}>
                    #${b.nr}${b.section ? " · " + b.section : ""}</option>`).join("")}
              </select>
            </label>
            <label style="display:flex;flex-direction:column;gap:2px">
              <span style="color:#889;font-size:10px">LOAD CASE</span>
              <select id="cw-lc" style="${sel_css()}">
                ${lcs.length ? lcs.map(lc =>
                    `<option value="${lc.nr}" ${lc.nr == inp.lc ? "selected" : ""}>${lc.nr}: ${lc.name || "LC " + lc.nr}</option>`
                ).join("") : `<option value="1">1</option>`}
              </select>
            </label>
          </div>

          <!-- Section info (read from model) -->
          <div id="cw-section-info" style="background:rgba(255,255,255,0.04);border-radius:4px;padding:6px 8px;font-size:11px;color:#8899bb">
            ${inp.elemNr ? this._renderSectionInfo() : "Select an element above"}
          </div>

          <!-- Material params -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
            <label style="display:flex;flex-direction:column;gap:2px">
              <span style="color:#889;font-size:10px">CONCRETE</span>
              <select id="cw-concrete" style="${sel_css()}">
                ${CONCRETE_GRADES.map(g => `<option ${g === inp.concrete ? "selected" : ""}>${g}</option>`).join("")}
              </select>
            </label>
            <label style="display:flex;flex-direction:column;gap:2px">
              <span style="color:#889;font-size:10px">STEEL</span>
              <select id="cw-steel" style="${sel_css()}">
                ${STEEL_GRADES.map(g => `<option ${g === inp.steel ? "selected" : ""}>${g}</option>`).join("")}
              </select>
            </label>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px">
            <label style="display:flex;flex-direction:column;gap:2px">
              <span style="color:#889;font-size:10px">c<sub>y</sub> [mm]</span>
              <input id="cw-covery" type="number" min="10" max="100" value="${inp.coverY}" style="${inp_css()}">
            </label>
            <label style="display:flex;flex-direction:column;gap:2px">
              <span style="color:#889;font-size:10px">c<sub>z</sub> [mm]</span>
              <input id="cw-coverz" type="number" min="10" max="100" value="${inp.coverZ}" style="${inp_css()}">
            </label>
            <label style="display:flex;flex-direction:column;gap:2px">
              <span style="color:#889;font-size:10px">β<sub>y</sub> ${inp._betaManual ? '✎' : '⚡'}</span>
              <input id="cw-betay" type="number" min="0.5" max="2" step="0.1" value="${inp.betaY}" style="${inp_css()}">
            </label>
            <label style="display:flex;flex-direction:column;gap:2px">
              <span style="color:#889;font-size:10px">β<sub>z</sub> ${inp._betaManual ? '✎' : '⚡'}</span>
              <input id="cw-betaz" type="number" min="0.5" max="2" step="0.1" value="${inp.betaZ}" style="${inp_css()}">
            </label>
          </div>
          ${inp._betaLabel ? `
          <div style="font-size:10px;color:${inp._betaManual ? '#fa0' : '#4c8'};padding:2px 4px;
              background:rgba(255,255,255,0.03);border-radius:3px;display:flex;justify-content:space-between">
            <span>${inp._betaManual ? '✎ manuell' : '⚡ auto'}: ${inp._betaLabel}</span>
            ${inp._betaManual ? `<button id="cw-beta-reset" style="background:none;border:none;color:#667;
                cursor:pointer;font-size:9px;padding:0">zurücksetzen</button>` : ''}
          </div>` : ''}

          <!-- Run button -->
          <button id="cw-run" style="
              background:${this._loading ? "rgba(80,80,120,0.5)" : "rgba(30,80,180,0.7)"};
              border:1px solid #445; border-radius:5px; color:#c8d0e0;
              padding:7px; cursor:pointer; font-size:12px; font-weight:600;
              transition:background 0.2s;
          " ${this._loading ? "disabled" : ""}>
            ${this._loading ? "⏳ Running SOFiSTiK COLUMN…" : "▶ Design Check (COLUMN)"}
          </button>

          <!-- Result summary -->
          ${res ? `
          <div style="background:rgba(255,255,255,0.04);border-radius:5px;padding:8px 10px">
            ${res.success ? `
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <span style="font-size:14px;color:${etaColor};font-weight:700">
                  η = ${res.eta !== null ? res.eta.toFixed(3) : "—"} ${statusIcon}
                </span>
                <span style="font-size:10px;color:#667">${res.status}</span>
              </div>
              <table style="width:100%;border-collapse:collapse;font-size:11px">
                ${tr("A<sub>s,req</sub>", res.as_req_cm2 != null ? res.as_req_cm2.toFixed(2) + " cm²" : "—")}
                ${tr("A<sub>s,min</sub>", res.as_min_cm2 != null ? res.as_min_cm2.toFixed(2) + " cm²" : "—")}
                ${tr("ρ", res.rho_pct != null ? res.rho_pct.toFixed(2) + " %" : "—")}
                ${tr("N<sub>Ed</sub>", res.design_point ? res.design_point.N_kN.toFixed(1) + " kN" : "—")}
                ${tr("M<sub>Ed</sub>", res.design_point ? res.design_point.M_kNm.toFixed(1) + " kNm" : "—")}
              </table>
            ` : `<div style="color:#f66">Error: ${res.error}</div>`}
          </div>` : ""}

          <!-- Interaction diagram canvas -->
          ${res && res.success && res.diagram ? `
          <div>
            <div style="color:#889;font-size:10px;margin-bottom:3px;text-align:center">
              N-M INTERACTION DIAGRAM
            </div>
            <canvas id="cw-diagram" width="294" height="200"
                style="width:294px;height:200px;border:1px solid #334;border-radius:4px"></canvas>
          </div>` : ""}

          <!-- Raw .erg toggle -->
          ${res && res.success && res.raw_erg ? `
          <button id="cw-erg-toggle" style="
              background:none;border:1px solid #334;border-radius:4px;
              color:#667;padding:4px;cursor:pointer;font-size:10px
          ">${this._rawVisible ? "▲ Hide .erg output" : "▼ Show .erg output"}</button>
          ${this._rawVisible ? `
          <textarea readonly style="
              width:100%;height:120px;background:#0a0a1a;border:1px solid #334;
              color:#7a8;font-size:9px;font-family:monospace;padding:4px;resize:vertical
          ">${(res.raw_erg || "").substring(0, 4000)}</textarea>` : ""}` : ""}

        </div>`;
    }

    _renderSectionInfo() {
        const beams = this._getBeamList();
        const b = beams.find(x => x.nr == this._inputs.elemNr);
        if (!b) return `Element #${this._inputs.elemNr}`;
        const w = b.b != null ? (b.b * 100).toFixed(0) + "×" + (b.h * 100).toFixed(0) + " cm" : "";
        const l = b.length != null ? "L = " + b.length.toFixed(2) + " m" : "";
        return `#${b.nr} · ${b.section || ""}  ${w}  ${l}`;
    }

    // ── Event binding ─────────────────────────────────────────────────────────

    _bindEvents() {
        const q = id => this.el.querySelector("#" + id);

        const update = () => {
            this._inputs.elemNr   = q("cw-elem")?.value || null;
            this._inputs.lc       = parseInt(q("cw-lc")?.value) || 1;
            this._inputs.concrete = q("cw-concrete")?.value || "C30";
            this._inputs.steel    = q("cw-steel")?.value || "B500B";
            this._inputs.coverY   = parseInt(q("cw-covery")?.value) || 50;
            this._inputs.coverZ   = parseInt(q("cw-coverz")?.value) || 50;
            this._inputs.betaY    = parseFloat(q("cw-betay")?.value) || 1.0;
            this._inputs.betaZ    = parseFloat(q("cw-betaz")?.value) || 1.0;
        };

        ["cw-elem","cw-lc","cw-concrete","cw-steel"].forEach(id => {
            q(id)?.addEventListener("change", () => { update(); this._render(); });
        });
        ["cw-covery","cw-coverz"].forEach(id => {
            q(id)?.addEventListener("change", update);
        });
        // β changes: mark as manually overridden so canvas re-selection won't reset them
        ["cw-betay","cw-betaz"].forEach(id => {
            q(id)?.addEventListener("change", () => {
                update();
                this._inputs._betaManual = true;
                this._render();
            });
        });
        q("cw-beta-reset")?.addEventListener("click", () => {
            this._inputs._betaManual = false;
            // Re-run auto-detection if we still have an editor beam selected
            if (this._inputs._editorBeamId) {
                const sug = this._suggestBeta(this._inputs._editorBeamId);
                if (sug) {
                    this._inputs.betaY      = sug.beta;
                    this._inputs.betaZ      = sug.beta;
                    this._inputs._betaLabel = sug.label;
                }
            }
            this._render();
        });

        q("cw-run")?.addEventListener("click", () => {
            update();
            this._runDesign();
        });

        q("cw-erg-toggle")?.addEventListener("click", () => {
            this._rawVisible = !this._rawVisible;
            this._render();
            if (this._result) this._drawDiagram();
        });
    }

    // ── Design API call ───────────────────────────────────────────────────────

    async _runDesign() {
        const inp = this._inputs;
        this._loading = true;
        this._result  = null;
        this._render();

        const payload = {
            lc:       inp.lc,
            concrete: inp.concrete,
            steel:    inp.steel,
            cover_y:  inp.coverY,
            cover_z:  inp.coverZ,
            beta_y:   inp.betaY,
            beta_z:   inp.betaZ,
        };

        if (inp.elemNr) {
            payload.elem_nr = parseInt(inp.elemNr);
        }

        try {
            const resp = await fetch(this._url("/api/columns/design"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await resp.json();
            if (!resp.ok) {
                this._result = { success: false, error: data.detail || resp.statusText };
            } else {
                this._result = data;
            }
        } catch (err) {
            this._result = { success: false, error: err.message };
        }

        this._loading = false;
        this._render();
        if (this._result?.diagram) this._drawDiagram();
    }

    // ── Interaction diagram canvas drawing ────────────────────────────────────

    _drawDiagram() {
        const canvas = this.el?.querySelector("#cw-diagram");
        if (!canvas || !this._result?.diagram) return;

        const ctx    = canvas.getContext("2d");
        const W      = canvas.width;
        const H      = canvas.height;
        const pad    = { top: 20, right: 15, bottom: 25, left: 45 };
        const pts    = this._result.diagram;
        const dp     = this._result.design_point;

        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = "#0a0a1a";
        ctx.fillRect(0, 0, W, H);

        if (!pts || pts.length < 2) return;

        const Ns = pts.map(p => p.N_kN);
        const Ms = pts.map(p => p.M_kNm);
        const minN = Math.min(...Ns) * 1.1;
        const maxN = Math.max(...Ns) * 1.1;
        const maxM = Math.max(...Ms) * 1.2 || 10;

        const scaleX = (m) => pad.left + (m / maxM) * (W - pad.left - pad.right);
        const scaleY = (n) => pad.top + (1 - (n - minN) / (maxN - minN)) * (H - pad.top - pad.bottom);

        // Grid lines
        ctx.strokeStyle = "#1e2240";
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const x = scaleX(maxM * i / 4);
            ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, H - pad.bottom); ctx.stroke();
        }
        for (let i = 0; i <= 4; i++) {
            const y = pad.top + i * (H - pad.top - pad.bottom) / 4;
            ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
        }

        // Axes
        ctx.strokeStyle = "#445";
        ctx.lineWidth = 1;
        const x0 = scaleX(0);
        const y0 = scaleY(0);
        ctx.beginPath(); ctx.moveTo(pad.left, y0); ctx.lineTo(W - pad.right, y0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x0, pad.top); ctx.lineTo(x0, H - pad.bottom); ctx.stroke();

        // Axis labels
        ctx.fillStyle = "#667";
        ctx.font = "9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("M [kNm]", W / 2, H - 3);
        ctx.save(); ctx.translate(10, H / 2); ctx.rotate(-Math.PI / 2);
        ctx.fillText("N [kN]", 0, 0); ctx.restore();

        // Scale values
        ctx.fillStyle = "#556";
        ctx.font = "8px sans-serif";
        ctx.textAlign = "right";
        [0, 0.25, 0.5, 0.75, 1].forEach(f => {
            const n = minN + f * (maxN - minN);
            ctx.fillText(n.toFixed(0), pad.left - 3, scaleY(n) + 3);
        });
        ctx.textAlign = "center";
        [0.25, 0.5, 0.75, 1].forEach(f => {
            const m = maxM * f;
            ctx.fillText(m.toFixed(0), scaleX(m), H - pad.bottom + 11);
        });

        // Capacity curve (filled area)
        ctx.beginPath();
        ctx.moveTo(scaleX(pts[0].M_kNm), scaleY(pts[0].N_kN));
        for (const p of pts) ctx.lineTo(scaleX(p.M_kNm), scaleY(p.N_kN));
        ctx.closePath();
        ctx.fillStyle = "rgba(30, 80, 180, 0.15)";
        ctx.fill();
        ctx.strokeStyle = "#4488cc";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Design point
        if (dp) {
            const dx = scaleX(dp.M_kNm);
            const dy = scaleY(dp.N_kN);
            const eta = this._result.eta;
            const color = eta == null ? "#fa0" : eta <= 1.0 ? "#4c8" : "#f44";
            ctx.beginPath();
            ctx.arc(dx, dy, 5, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 1;
            ctx.stroke();

            // Label
            ctx.fillStyle = color;
            ctx.font = "bold 9px sans-serif";
            ctx.textAlign = "left";
            ctx.fillText(`(${dp.M_kNm.toFixed(0)}, ${dp.N_kN.toFixed(0)})`, dx + 7, dy - 4);
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    _getBeamList() {
        // beamElements from fetchResults() → actual SQLite fe_line numbers
        const rd = this.model?.resultData;
        return (rd?.beamElements || []).map(b => ({
            nr:     b.nr,
            length: b.length || null,
        }));
    }

    _getLcList() {
        // Load cases fetched from /api/model/loadcases and stored in resultData
        const rd = this.model?.resultData;
        return (rd?.loadcases || []);
    }

    _syncFromModel() {
        const lcs = this._getLcList();
        if (lcs.length && this._inputs.lc === 1) {
            this._inputs.lc = lcs[0].nr;
        }
    }

    _makeDraggable() {
        const header = this.el.querySelector("#cw-header");
        if (!header) return;
        let ox = 0, oy = 0;
        header.addEventListener("mousedown", e => {
            if (e.target.tagName === "BUTTON") return;
            ox = e.clientX - this.el.offsetLeft;
            oy = e.clientY - this.el.offsetTop;
            this._dragMove = ev => {
                this.el.style.left = (ev.clientX - ox) + "px";
                this.el.style.top  = (ev.clientY - oy) + "px";
            };
            this._dragUp = () => {
                document.removeEventListener("mousemove", this._dragMove);
                document.removeEventListener("mouseup",   this._dragUp);
            };
            document.addEventListener("mousemove", this._dragMove);
            document.addEventListener("mouseup",   this._dragUp);
        });
    }
}

// ── Style helpers ─────────────────────────────────────────────────────────────

function sel_css() {
    return [
        "background:rgba(255,255,255,0.07)", "border:1px solid #334",
        "border-radius:4px", "color:#c8d0e0", "padding:4px 6px",
        "font-size:11px", "width:100%", "cursor:pointer",
    ].join(";");
}
function inp_css() {
    return [
        "background:rgba(255,255,255,0.07)", "border:1px solid #334",
        "border-radius:4px", "color:#c8d0e0", "padding:4px 6px",
        "font-size:11px", "width:100%", "text-align:center",
    ].join(";");
}
function tr(label, value) {
    return `<tr>
        <td style="color:#889;padding:2px 0;width:55%">${label}</td>
        <td style="color:#c8d0e0;text-align:right;font-weight:600">${value}</td>
    </tr>`;
}
