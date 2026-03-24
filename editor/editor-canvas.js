// editor-canvas.js — Three.js scene, interaction, snapping, raycasting
// infraFEM Structural Editor

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SUPPORT_TYPES } from './editor-core.js';

// ─── Constants ──────────────────────────────────────────────
const NODE_RADIUS = 0.12;
const NODE_COLOR = 0x7eb8ff;
const NODE_SELECTED_COLOR = 0xffcc00;
const NODE_SUPPORT_COLOR = 0xff5555;
const BEAM_RADIUS = 0.06;
const BEAM_COLOR = 0x88aacc;
const BEAM_SELECTED_COLOR = 0xffcc00;
const GRID_COLOR = 0x334455;
const GRID_CENTER_COLOR = 0x556677;
const AREA_COLOR = 0x44aacc;
const AREA_OPACITY = 0.25;
const AREA_OUTLINE_COLOR = 0x66ccdd;
const AREA_SELECTED_COLOR = 0xffcc00;
const GHOST_COLOR = 0x7eb8ff;
const GHOST_OPACITY = 0.4;
const LOAD_COLOR = 0x44dd44;
const SNAP_RADIUS_PX = 25; // pixel radius for node snapping

export class EditorCanvas {
    constructor(container, model) {
        this.container = container;
        this.model = model;
        this.gridSize = 1.0;
        this.gridExtent = 50;

        // Three.js objects
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // Mesh groups
        this.nodeGroup = new THREE.Group();
        this.beamGroup = new THREE.Group();
        this.supportGroup = new THREE.Group();
        this.loadGroup = new THREE.Group();
        this.ghostGroup = new THREE.Group();
        this.deformGroup = new THREE.Group();
        this.diagramGroup = new THREE.Group();
        this.hingeGroup = new THREE.Group();
        this.areaGroup = new THREE.Group();
        this.quadResultGroup = new THREE.Group();

        // Diagram display state
        this._diagramData = null;
        this._diagramTypes = new Set(); // 'My', 'Vz', 'N'
        this._diagramScale = 0.5;

        // Deformation display state
        this._deformData = null; // { nodes: {id: {uX, uY}}, scale: 100 }
        this._deformScale = 100;
        this._showDeformed = false;

        // Interaction state
        this._beamStartNode = null; // for BEAM mode
        this._hoverNodeId = null;
        this._hoverBeamId = null;
        this._dragNode = null;
        this._dragOffset = new THREE.Vector3();
        this._isDragging = false;

        // Area mode state
        this._areaNodes = []; // accumulated node IDs for polygon boundary

        // RECT mode state
        this._rectStart = null; // {x, z} first corner in editor coords

        // POLY mode state
        this._polyNodes = []; // array of created node IDs

        // Selection rectangle state
        this._selRectActive = false;
        this._selRectStart = null;  // {clientX, clientY}
        this._selRectEl = null;     // HTML overlay div

        // Working plane: XY (Z=0) for RAHM 2D systems
        this._workPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

        this._init();
        this._bindEvents();
        this._buildGrid();
        this.rebuild();

        // Listen to model changes
        this.model.bus.on('model:changed', () => this.rebuild());
        this.model.bus.on('model:loaded', () => { this._fitCamera(); this.rebuild(); });
        this.model.bus.on('selection:changed', () => this._updateSelectionVisuals());
        this.model.bus.on('loadcase:changed', () => this._rebuildLoads());
        this.model.bus.on('mode:changed', (mode) => this._onModeChanged(mode));
    }

    // ── Init Three.js ──────────────────────────────────────
    _init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);

        // Camera: looking at XY plane from +Z (X=horizontal, Y=vertical)
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
        this.camera.position.set(0, 0, 30);
        this.camera.up.set(0, 1, 0); // Y is "up" in the view

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        // OrbitControls — XY plane view
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.12;
        this.controls.target.set(5, 3, 0);
        // Lock to 2D view for RAHM: disable rotation, allow pan + zoom
        this._set2DControls();

        // Lights
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(10, 20, 10);
        this.scene.add(dirLight);

        // Add groups to scene
        this.scene.add(this.nodeGroup);
        this.scene.add(this.beamGroup);
        this.scene.add(this.supportGroup);
        this.scene.add(this.loadGroup);
        this.scene.add(this.ghostGroup);
        this.scene.add(this.deformGroup);
        this.scene.add(this.diagramGroup);
        this.scene.add(this.hingeGroup);
        this.scene.add(this.areaGroup);
        this.scene.add(this.quadResultGroup);

        // Resize handler
        this._onResize = () => {
            const w = this.container.clientWidth;
            const h = this.container.clientHeight;
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h);
        };
        window.addEventListener('resize', this._onResize);

        // Animation loop
        const animate = () => {
            requestAnimationFrame(animate);
            this.controls.update();
            this.renderer.render(this.scene, this.camera);
        };
        animate();
    }

    _set2DControls() {
        // Left = pan, Middle = zoom, Right = 3D orbit
        this.controls.enableRotate = true;
        this.controls.mouseButtons = {
            LEFT: THREE.MOUSE.PAN,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.ROTATE,
        };
        this.controls.touches = {
            ONE: THREE.TOUCH.PAN,
            TWO: THREE.TOUCH.DOLLY_ROTATE,
        };
    }

    _fitCamera() {
        const nodes = this.model.data.nodes;
        if (nodes.length === 0) {
            this.camera.position.set(5, 3, 30);
            this.controls.target.set(5, 3, 0);
            return;
        }
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const n of nodes) {
            minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
            minZ = Math.min(minZ, n.z); maxZ = Math.max(maxZ, n.z);
        }
        const cx = (minX + maxX) / 2;
        const cy = (minZ + maxZ) / 2; // editor Z → screen Y
        const span = Math.max(maxX - minX, maxZ - minZ, 5);
        this.camera.position.set(cx, cy, span * 1.5);
        this.controls.target.set(cx, cy, 0);
    }

    // ── Grid ───────────────────────────────────────────────
    _buildGrid() {
        const ext = this.gridExtent;
        const step = this.gridSize;
        const gridHelper = new THREE.GridHelper(ext * 2, (ext * 2) / step, GRID_CENTER_COLOR, GRID_COLOR);
        // Rotate grid from XZ to XY plane
        gridHelper.rotation.x = Math.PI / 2;
        gridHelper.material.transparent = true;
        gridHelper.material.opacity = 0.3;
        this.scene.add(gridHelper);
    }

    // ── Rebuild all meshes from model ──────────────────────
    rebuild() {
        this._rebuildNodes();
        this._rebuildBeams();
        this._rebuildAreas();
        this._rebuildSupports();
        this._rebuildLoads();
        this._rebuildHinges();
        this._updateSelectionVisuals();
    }

    _clearGroup(group) {
        while (group.children.length > 0) {
            const child = group.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                else child.material.dispose();
            }
            group.remove(child);
        }
    }

    // ── Nodes ──────────────────────────────────────────────
    _rebuildNodes() {
        this._clearGroup(this.nodeGroup);
        const geo = new THREE.SphereGeometry(NODE_RADIUS, 16, 12);
        for (const node of this.model.data.nodes) {
            const hasSupport = node.support && node.support !== 'NONE';
            const color = hasSupport ? NODE_SUPPORT_COLOR : NODE_COLOR;
            const mat = new THREE.MeshPhongMaterial({ color });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(node.x, node.z, 0);
            mesh.userData = { type: 'node', id: node.id };
            this.nodeGroup.add(mesh);
        }
    }

    // ── Beams ──────────────────────────────────────────────
    _rebuildBeams() {
        this._clearGroup(this.beamGroup);
        for (const beam of this.model.data.beams) {
            const n1 = this.model.getNode(beam.nodeStart);
            const n2 = this.model.getNode(beam.nodeEnd);
            if (!n1 || !n2) continue;

            const p1 = new THREE.Vector3(n1.x, n1.z, 0);
            const p2 = new THREE.Vector3(n2.x, n2.z, 0);
            const dir = new THREE.Vector3().subVectors(p2, p1);
            const len = dir.length();
            if (len < 0.001) continue;

            const geo = new THREE.CylinderGeometry(BEAM_RADIUS, BEAM_RADIUS, len, 8);
            const mat = new THREE.MeshPhongMaterial({ color: BEAM_COLOR });
            const mesh = new THREE.Mesh(geo, mat);

            // Position at midpoint
            mesh.position.copy(p1).add(p2).multiplyScalar(0.5);

            // Rotate cylinder (default Y-axis) to beam direction
            const axis = new THREE.Vector3(0, 1, 0);
            const quat = new THREE.Quaternion().setFromUnitVectors(axis, dir.normalize());
            mesh.quaternion.copy(quat);

            mesh.userData = { type: 'beam', id: beam.id };
            this.beamGroup.add(mesh);
        }
    }

    // ── Areas ──────────────────────────────────────────────
    _rebuildAreas() {
        this._clearGroup(this.areaGroup);
        for (const area of (this.model.data.areas || [])) {
            const nodes = area.boundaryNodeIds.map(id => this.model.getNode(id)).filter(Boolean);
            if (nodes.length < 3) continue;

            // Create shape from boundary nodes (XY plane: node.x → X, node.z → Y)
            const shape = new THREE.Shape();
            shape.moveTo(nodes[0].x, nodes[0].z);
            for (let i = 1; i < nodes.length; i++) {
                shape.lineTo(nodes[i].x, nodes[i].z);
            }
            shape.closePath();

            // Add openings as holes in the shape
            const openings = this.model.getOpeningsForArea(area.id);
            for (const opening of openings) {
                const holeNodes = opening.boundaryNodeIds.map(id => this.model.getNode(id)).filter(Boolean);
                if (holeNodes.length < 3) continue;
                const hole = new THREE.Path();
                hole.moveTo(holeNodes[0].x, holeNodes[0].z);
                for (let i = 1; i < holeNodes.length; i++) {
                    hole.lineTo(holeNodes[i].x, holeNodes[i].z);
                }
                hole.closePath();
                shape.holes.push(hole);
            }

            // Semi-transparent fill
            const geo = new THREE.ShapeGeometry(shape);
            const grp = this.model.data.groups.find(g => g.id === area.groupId);
            const fillColor = grp ? parseInt(grp.color.replace('#', '0x')) : AREA_COLOR;
            const mat = new THREE.MeshBasicMaterial({
                color: fillColor,
                transparent: true,
                opacity: AREA_OPACITY,
                side: THREE.DoubleSide,
                depthWrite: false,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.z = -0.01; // slightly behind beams/nodes
            mesh.userData = { type: 'area', id: area.id };
            this.areaGroup.add(mesh);

            // Outline as LineLoop
            const outlinePoints = nodes.map(n => new THREE.Vector3(n.x, n.z, -0.005));
            outlinePoints.push(outlinePoints[0].clone()); // close the loop
            const lineGeo = new THREE.BufferGeometry().setFromPoints(outlinePoints);
            const lineMat = new THREE.LineBasicMaterial({ color: AREA_OUTLINE_COLOR });
            const line = new THREE.Line(lineGeo, lineMat);
            line.userData = { type: 'area', id: area.id };
            this.areaGroup.add(line);

            // Opening outlines (red dashed)
            for (const opening of openings) {
                const holeNodes = opening.boundaryNodeIds.map(id => this.model.getNode(id)).filter(Boolean);
                if (holeNodes.length < 3) continue;
                const holePts = holeNodes.map(n => new THREE.Vector3(n.x, n.z, -0.003));
                holePts.push(holePts[0].clone());
                const holeGeo = new THREE.BufferGeometry().setFromPoints(holePts);
                const holeMat = new THREE.LineDashedMaterial({
                    color: 0xff4444, dashSize: 0.3, gapSize: 0.15, linewidth: 2,
                });
                const holeLine = new THREE.Line(holeGeo, holeMat);
                holeLine.computeLineDistances();
                holeLine.userData = { type: 'opening', id: opening.id };
                this.areaGroup.add(holeLine);
            }
        }
    }

    // ── Support Symbols ────────────────────────────────────
    _rebuildSupports() {
        this._clearGroup(this.supportGroup);
        const scale = 0.4;

        for (const node of this.model.data.nodes) {
            if (!node.support || node.support === 'NONE') continue;
            const pos = new THREE.Vector3(node.x, node.z, 0);

            if (node.support === 'FIXED') {
                // Einspannung: filled box at base
                const geo = new THREE.BoxGeometry(scale * 2, scale * 0.6, 0.05);
                const mat = new THREE.MeshPhongMaterial({ color: 0xff4444 });
                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.copy(pos).add(new THREE.Vector3(0, -scale * 0.3, 0));
                this.supportGroup.add(mesh);
                // Hatching lines
                for (let i = -3; i <= 3; i++) {
                    const lineGeo = new THREE.BufferGeometry().setFromPoints([
                        new THREE.Vector3(pos.x + i * scale * 0.2, pos.y - scale * 0.1, 0),
                        new THREE.Vector3(pos.x + i * scale * 0.2 - scale * 0.2, pos.y - scale * 0.6, 0),
                    ]);
                    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xff4444 }));
                    this.supportGroup.add(line);
                }
            } else if (node.support === 'PINNED') {
                // Gelenk: triangle pointing down
                const shape = new THREE.Shape();
                shape.moveTo(0, 0);
                shape.lineTo(-scale * 0.5, -scale * 0.8);
                shape.lineTo(scale * 0.5, -scale * 0.8);
                shape.closePath();
                const geo = new THREE.ShapeGeometry(shape);
                const mat = new THREE.MeshBasicMaterial({ color: 0xff8844, side: THREE.DoubleSide });
                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.copy(pos);
                this.supportGroup.add(mesh);
            } else if (node.support === 'ROLLER_X') {
                // Verschieblich horizontal: triangle + rollers below
                const shape = new THREE.Shape();
                shape.moveTo(0, 0);
                shape.lineTo(-scale * 0.5, -scale * 0.8);
                shape.lineTo(scale * 0.5, -scale * 0.8);
                shape.closePath();
                const geo = new THREE.ShapeGeometry(shape);
                const mat = new THREE.MeshBasicMaterial({ color: 0x44bb44, side: THREE.DoubleSide });
                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.copy(pos);
                this.supportGroup.add(mesh);
                // Rollers
                for (const dx of [-0.2, 0, 0.2]) {
                    const cGeo = new THREE.CircleGeometry(scale * 0.12, 12);
                    const cMat = new THREE.MeshBasicMaterial({ color: 0x44bb44, side: THREE.DoubleSide });
                    const circle = new THREE.Mesh(cGeo, cMat);
                    circle.position.set(pos.x + dx * scale, pos.y - scale * 0.95, 0);
                    this.supportGroup.add(circle);
                }
            } else if (node.support === 'ROLLER_Z') {
                // Verschieblich vertikal: triangle rotated 90°
                const shape = new THREE.Shape();
                shape.moveTo(0, 0);
                shape.lineTo(-scale * 0.8, -scale * 0.5);
                shape.lineTo(-scale * 0.8, scale * 0.5);
                shape.closePath();
                const geo = new THREE.ShapeGeometry(shape);
                const mat = new THREE.MeshBasicMaterial({ color: 0x4488ff, side: THREE.DoubleSide });
                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.copy(pos);
                this.supportGroup.add(mesh);
            } else if (node.support === 'SPRING') {
                // Feder: zigzag line pointing downward
                const springColor = 0xcc44cc;
                const nCoils = 4;
                const coilH = scale * 0.15;
                const coilW = scale * 0.3;
                const springPts = [];
                springPts.push(new THREE.Vector3(pos.x, pos.y, 0));
                springPts.push(new THREE.Vector3(pos.x, pos.y - coilH * 0.5, 0));
                for (let c = 0; c < nCoils; c++) {
                    const yBase = pos.y - coilH * 0.5 - c * coilH;
                    springPts.push(new THREE.Vector3(pos.x + coilW, yBase - coilH * 0.25, 0));
                    springPts.push(new THREE.Vector3(pos.x - coilW, yBase - coilH * 0.75, 0));
                }
                const yEnd = pos.y - coilH * 0.5 - nCoils * coilH;
                springPts.push(new THREE.Vector3(pos.x, yEnd, 0));
                springPts.push(new THREE.Vector3(pos.x, yEnd - coilH * 0.3, 0));
                const spGeo = new THREE.BufferGeometry().setFromPoints(springPts);
                const spLine = new THREE.Line(spGeo, new THREE.LineBasicMaterial({ color: springColor, linewidth: 2 }));
                this.supportGroup.add(spLine);
                // Ground line at bottom
                const gndPts = [
                    new THREE.Vector3(pos.x - scale * 0.4, yEnd - coilH * 0.3, 0),
                    new THREE.Vector3(pos.x + scale * 0.4, yEnd - coilH * 0.3, 0),
                ];
                const gndGeo = new THREE.BufferGeometry().setFromPoints(gndPts);
                this.supportGroup.add(new THREE.Line(gndGeo, new THREE.LineBasicMaterial({ color: springColor })));
            }
        }
    }

    // ── Load Arrows ────────────────────────────────────────
    _rebuildLoads() {
        this._clearGroup(this.loadGroup);
        const loads = this.model.getActiveLoads();

        for (const load of loads) {
            if (load.type === 'NODE_FORCE') {
                const node = this.model.getNode(load.nodeId);
                if (!node) continue;
                const origin = new THREE.Vector3(node.x, node.z, 0);
                const dir = this._loadDirection(load.direction);
                const mag = Math.abs(load.value);
                const arrowLen = Math.min(Math.max(mag / 20, 0.5), 3);
                const sign = load.value >= 0 ? 1 : -1;
                const arrowDir = dir.clone().multiplyScalar(sign);
                const arrow = new THREE.ArrowHelper(arrowDir, origin.clone().sub(arrowDir.clone().multiplyScalar(arrowLen)), arrowLen, LOAD_COLOR, arrowLen * 0.25, arrowLen * 0.15);
                this.loadGroup.add(arrow);
                // Label
                this._addLoadLabel(origin.clone().sub(arrowDir.clone().multiplyScalar(arrowLen * 0.5)), `${load.value} kN`);
            } else if (load.type === 'BEAM_LINE') {
                const beam = this.model.getBeam(load.elementId);
                if (!beam) continue;
                const n1 = this.model.getNode(beam.nodeStart);
                const n2 = this.model.getNode(beam.nodeEnd);
                if (!n1 || !n2) continue;

                const dir = this._loadDirection(load.direction);
                const nArrows = 5;
                for (let i = 0; i <= nArrows; i++) {
                    const t = i / nArrows;
                    const px = n1.x + t * (n2.x - n1.x);
                    const py = n1.z + t * (n2.z - n1.z);
                    const origin = new THREE.Vector3(px, py, 0);
                    const val = load.p1 + t * (load.p2 - load.p1);
                    const mag = Math.abs(val);
                    const arrowLen = Math.min(Math.max(mag / 20, 0.3), 2);
                    const sign = val >= 0 ? 1 : -1;
                    const arrowDir = dir.clone().multiplyScalar(sign);
                    const arrow = new THREE.ArrowHelper(arrowDir, origin.clone().sub(arrowDir.clone().multiplyScalar(arrowLen)), arrowLen, LOAD_COLOR, arrowLen * 0.2, arrowLen * 0.1);
                    this.loadGroup.add(arrow);
                }
                // Fill polygon between arrows
                this._addDistributedLoadFill(n1, n2, load, dir);
            }
        }
    }

    _loadDirection(dirStr) {
        // Load directions in XY plane (X=horizontal, Y=vertical)
        if (dirStr === 'PX' || dirStr === 'PXX') return new THREE.Vector3(1, 0, 0);
        if (dirStr === 'PZ' || dirStr === 'PZZ') return new THREE.Vector3(0, 1, 0); // Z in model → Y on screen
        return new THREE.Vector3(0, -1, 0); // default downward
    }

    _addLoadLabel(position, text) {
        // Simple sprite-based label
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 32;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#44dd44';
        ctx.font = '18px monospace';
        ctx.fillText(text, 4, 22);
        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
        const sprite = new THREE.Sprite(mat);
        sprite.position.copy(position);
        sprite.scale.set(2, 0.5, 1);
        this.loadGroup.add(sprite);
    }

    _addDistributedLoadFill(n1, n2, load, dir) {
        // Semi-transparent fill between load arrows
        const nPts = 6;
        const points = [];
        for (let i = 0; i <= nPts; i++) {
            const t = i / nPts;
            const px = n1.x + t * (n2.x - n1.x);
            const py = n1.z + t * (n2.z - n1.z);
            const val = load.p1 + t * (load.p2 - load.p1);
            const len = val / 20; // scale
            points.push(new THREE.Vector3(px, py, 0));
            points.push(new THREE.Vector3(px + dir.x * len, py + dir.y * len, 0));
        }
        // Build triangles
        const positions = [];
        for (let i = 0; i < nPts; i++) {
            const a = points[i * 2], b = points[i * 2 + 1];
            const c = points[(i + 1) * 2], d = points[(i + 1) * 2 + 1];
            positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
            positions.push(b.x, b.y, b.z, d.x, d.y, d.z, c.x, c.y, c.z);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.computeVertexNormals();
        const mat = new THREE.MeshBasicMaterial({
            color: LOAD_COLOR, transparent: true, opacity: 0.2, side: THREE.DoubleSide
        });
        this.loadGroup.add(new THREE.Mesh(geo, mat));
    }

    // ── Hinge Symbols ─────────────────────────────────────
    _rebuildHinges() {
        this._clearGroup(this.hingeGroup);
        const HINGE_RADIUS = NODE_RADIUS * 1.2;
        const segments = 32;
        const ringGeo = new THREE.RingGeometry(HINGE_RADIUS * 0.6, HINGE_RADIUS, segments);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });

        for (const beam of this.model.data.beams) {
            if (!beam.hingeStart && !beam.hingeEnd) continue;
            const n1 = this.model.getNode(beam.nodeStart);
            const n2 = this.model.getNode(beam.nodeEnd);
            if (!n1 || !n2) continue;

            // Beam direction vector
            const dx = n2.x - n1.x;
            const dz = n2.z - n1.z;
            const L = Math.sqrt(dx * dx + dz * dz);
            if (L < 0.001) continue;
            const tx = dx / L, tz = dz / L;

            // Offset distance from node along beam
            const offset = NODE_RADIUS * 2.5;

            if (beam.hingeStart) {
                const mesh = new THREE.Mesh(ringGeo, ringMat.clone());
                mesh.position.set(n1.x + tx * offset, n1.z + tz * offset, 0.02);
                this.hingeGroup.add(mesh);
            }
            if (beam.hingeEnd) {
                const mesh = new THREE.Mesh(ringGeo, ringMat.clone());
                mesh.position.set(n2.x - tx * offset, n2.z - tz * offset, 0.02);
                this.hingeGroup.add(mesh);
            }
        }
    }

    // ── Selection Visuals ──────────────────────────────────
    _updateSelectionVisuals() {
        // Reset all colors, supporting single and multi-selection
        for (const mesh of this.nodeGroup.children) {
            const node = this.model.getNode(mesh.userData.id);
            if (!node) continue;
            const hasSupport = node.support && node.support !== 'NONE';
            const selected = this.model.isSelected('node', mesh.userData.id);
            mesh.material.color.setHex(
                selected ? NODE_SELECTED_COLOR
                    : (hasSupport ? NODE_SUPPORT_COLOR : NODE_COLOR)
            );
        }
        for (const mesh of this.beamGroup.children) {
            const selected = this.model.isSelected('beam', mesh.userData.id);
            mesh.material.color.setHex(selected ? BEAM_SELECTED_COLOR : BEAM_COLOR);
        }
        for (const child of this.areaGroup.children) {
            if (child.userData?.type === 'area' && child.isMesh) {
                const selected = this.model.isSelected('area', child.userData.id);
                if (selected) {
                    child.material.color.setHex(AREA_SELECTED_COLOR);
                    child.material.opacity = 0.4;
                } else {
                    const area = this.model.getArea(child.userData.id);
                    const grp = area ? this.model.data.groups.find(g => g.id === area.groupId) : null;
                    child.material.color.setHex(grp ? parseInt(grp.color.replace('#', '0x')) : AREA_COLOR);
                    child.material.opacity = AREA_OPACITY;
                }
            }
        }
    }

    // ── Ghost Preview ──────────────────────────────────────
    showGhostNode(x, z) {
        this._clearGroup(this.ghostGroup);
        const geo = new THREE.SphereGeometry(NODE_RADIUS, 16, 12);
        const mat = new THREE.MeshPhongMaterial({ color: GHOST_COLOR, transparent: true, opacity: GHOST_OPACITY });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, z, 0);
        this.ghostGroup.add(mesh);
    }

    showGhostBeam(x1, z1, x2, z2) {
        this._clearGroup(this.ghostGroup);
        const p1 = new THREE.Vector3(x1, z1, 0);
        const p2 = new THREE.Vector3(x2, z2, 0);
        const lineGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
        const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({
            color: GHOST_COLOR, transparent: true, opacity: GHOST_OPACITY
        }));
        this.ghostGroup.add(line);

        // Ghost node at endpoint
        const geo = new THREE.SphereGeometry(NODE_RADIUS, 16, 12);
        const mat = new THREE.MeshPhongMaterial({ color: GHOST_COLOR, transparent: true, opacity: GHOST_OPACITY });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(p2);
        this.ghostGroup.add(mesh);
    }

    showGhostArea(nodeIds, cursorX, cursorZ) {
        this._clearGroup(this.ghostGroup);
        if (nodeIds.length === 0) return;
        const points = nodeIds.map(id => {
            const n = this.model.getNode(id);
            return n ? new THREE.Vector3(n.x, n.z, 0) : null;
        }).filter(Boolean);
        // Add cursor position as current point
        points.push(new THREE.Vector3(cursorX, cursorZ, 0));
        // Close to first point
        if (points.length >= 2) {
            points.push(points[0].clone());
        }
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({
            color: GHOST_COLOR, transparent: true, opacity: GHOST_OPACITY,
        }));
        this.ghostGroup.add(line);

        // Ghost fill if >= 3 nodes selected
        if (nodeIds.length >= 2) {
            const fillPoints = nodeIds.map(id => {
                const n = this.model.getNode(id);
                return n ? new THREE.Vector3(n.x, n.z, 0) : null;
            }).filter(Boolean);
            fillPoints.push(new THREE.Vector3(cursorX, cursorZ, 0));
            if (fillPoints.length >= 3) {
                const shape = new THREE.Shape();
                shape.moveTo(fillPoints[0].x, fillPoints[0].y);
                for (let i = 1; i < fillPoints.length; i++) {
                    shape.lineTo(fillPoints[i].x, fillPoints[i].y);
                }
                shape.closePath();
                const geo = new THREE.ShapeGeometry(shape);
                const mat = new THREE.MeshBasicMaterial({
                    color: AREA_COLOR, transparent: true, opacity: 0.15, side: THREE.DoubleSide,
                });
                this.ghostGroup.add(new THREE.Mesh(geo, mat));
            }
        }
    }

    showGhostRect(x1, z1, x2, z2) {
        this._clearGroup(this.ghostGroup);
        const corners = [
            new THREE.Vector3(x1, z1, 0),
            new THREE.Vector3(x2, z1, 0),
            new THREE.Vector3(x2, z2, 0),
            new THREE.Vector3(x1, z2, 0),
            new THREE.Vector3(x1, z1, 0), // close
        ];
        const lineGeo = new THREE.BufferGeometry().setFromPoints(corners);
        const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({
            color: GHOST_COLOR, transparent: true, opacity: GHOST_OPACITY,
        }));
        this.ghostGroup.add(line);

        // Ghost nodes at corners
        const geo = new THREE.SphereGeometry(NODE_RADIUS, 16, 12);
        const mat = new THREE.MeshPhongMaterial({ color: GHOST_COLOR, transparent: true, opacity: GHOST_OPACITY });
        for (let i = 0; i < 4; i++) {
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(corners[i]);
            this.ghostGroup.add(mesh);
        }

        // Ghost fill
        const shape = new THREE.Shape();
        shape.moveTo(x1, z1);
        shape.lineTo(x2, z1);
        shape.lineTo(x2, z2);
        shape.lineTo(x1, z2);
        shape.closePath();
        const fillGeo = new THREE.ShapeGeometry(shape);
        const fillMat = new THREE.MeshBasicMaterial({
            color: AREA_COLOR, transparent: true, opacity: 0.15, side: THREE.DoubleSide,
        });
        this.ghostGroup.add(new THREE.Mesh(fillGeo, fillMat));
    }

    showGhostPoly(nodeIds, cursorX, cursorZ) {
        this._clearGroup(this.ghostGroup);
        if (nodeIds.length === 0) return;
        const points = nodeIds.map(id => {
            const n = this.model.getNode(id);
            return n ? new THREE.Vector3(n.x, n.z, 0) : null;
        }).filter(Boolean);
        // Add cursor position as the next point
        points.push(new THREE.Vector3(cursorX, cursorZ, 0));

        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({
            color: GHOST_COLOR, transparent: true, opacity: GHOST_OPACITY,
        }));
        this.ghostGroup.add(line);

        // Ghost node at cursor
        const geo = new THREE.SphereGeometry(NODE_RADIUS, 16, 12);
        const mat = new THREE.MeshPhongMaterial({ color: GHOST_COLOR, transparent: true, opacity: GHOST_OPACITY });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(cursorX, cursorZ, 0);
        this.ghostGroup.add(mesh);

        // If >= 3 nodes, show closing line (dashed hint from last point to first)
        if (nodeIds.length >= 2) {
            const firstNode = this.model.getNode(nodeIds[0]);
            if (firstNode) {
                const closePoints = [
                    new THREE.Vector3(cursorX, cursorZ, 0),
                    new THREE.Vector3(firstNode.x, firstNode.z, 0),
                ];
                const closeGeo = new THREE.BufferGeometry().setFromPoints(closePoints);
                const closeLine = new THREE.Line(closeGeo, new THREE.LineDashedMaterial({
                    color: GHOST_COLOR, transparent: true, opacity: GHOST_OPACITY * 0.5,
                    dashSize: 0.3, gapSize: 0.2,
                }));
                closeLine.computeLineDistances();
                this.ghostGroup.add(closeLine);
            }
        }
    }

    clearGhost() {
        this._clearGroup(this.ghostGroup);
    }

    // ── Raycasting / Picking ───────────────────────────────
    _updateMouse(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    _getWorldPos(event) {
        this._updateMouse(event);
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const target = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(this._workPlane, target);
        // Convert XY screen coords back to editor coords (x, z)
        // Screen: x=X, y=Y(=editor Z), z=0
        if (target) {
            target._editorX = target.x;
            target._editorZ = target.y; // screen Y = editor Z
        }
        return target;
    }

    _snapToGrid(x, z) {
        const g = this.gridSize;
        return {
            x: Math.round(x / g) * g,
            z: Math.round(z / g) * g,
        };
    }

    _snapToNode(x, z) {
        // Check if any existing node is close in screen space
        const testPos = new THREE.Vector3(x, z, 0).project(this.camera);
        for (const node of this.model.data.nodes) {
            const nPos = new THREE.Vector3(node.x, node.z, 0).project(this.camera);
            const dx = (testPos.x - nPos.x) * this.container.clientWidth / 2;
            const dy = (testPos.y - nPos.y) * this.container.clientHeight / 2;
            if (Math.sqrt(dx * dx + dy * dy) < SNAP_RADIUS_PX) {
                return { x: node.x, z: node.z, snappedNodeId: node.id };
            }
        }
        return null;
    }

    getSnappedPos(event) {
        const world = this._getWorldPos(event);
        if (!world) return null;

        // Editor coords: x = world.x, z = world.y (screen Y = editor Z)
        const ex = world.x;
        const ez = world.y;

        // Try node snap first
        const nodeSnap = this._snapToNode(ex, ez);
        if (nodeSnap) return nodeSnap;

        // Grid snap
        const gridSnap = this._snapToGrid(ex, ez);
        return { ...gridSnap, snappedNodeId: null };
    }

    pickObject(event) {
        this._updateMouse(event);
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Check nodes first (higher priority)
        const nodeHits = this.raycaster.intersectObjects(this.nodeGroup.children);
        if (nodeHits.length > 0) {
            return nodeHits[0].object.userData;
        }

        // Then beams
        const beamHits = this.raycaster.intersectObjects(this.beamGroup.children);
        if (beamHits.length > 0) {
            return beamHits[0].object.userData;
        }

        // Then areas (lowest priority)
        const areaHits = this.raycaster.intersectObjects(this.areaGroup.children);
        if (areaHits.length > 0) {
            const hit = areaHits[0].object.userData;
            if (hit && hit.type === 'area') return hit;
        }

        return null;
    }

    // ── Event Binding ──────────────────────────────────────
    _bindEvents() {
        const canvas = this.renderer.domElement;

        canvas.addEventListener('pointerdown', (e) => this._onPointerDown(e));
        canvas.addEventListener('pointermove', (e) => this._onPointerMove(e));
        canvas.addEventListener('pointerup', (e) => this._onPointerUp(e));
        window.addEventListener('keydown', (e) => this._onKeyDown(e));
    }

    _onPointerDown(event) {
        if (event.button !== 0) return; // left click only
        const mode = this.model.mode;

        if (mode === 'SELECT') {
            const hit = this.pickObject(event);
            if (hit) {
                if (event.shiftKey) {
                    this.model.toggleSelection(hit.type, hit.id);
                } else {
                    this.model.select(hit.type, hit.id);
                }
                // Start drag for nodes (single selection only)
                if (hit.type === 'node' && !event.shiftKey) {
                    this._dragNode = hit.id;
                    this._isDragging = false;
                    this.controls.enabled = false;
                }
            } else {
                // Empty space click: start selection rectangle drag
                if (!event.shiftKey) {
                    this.model.deselect();
                }
                this._selRectActive = true;
                this._selRectStart = { clientX: event.clientX, clientY: event.clientY };
                this.controls.enabled = false;
                this._createSelRectOverlay();
            }
        } else if (mode === 'NODE') {
            const pos = this.getSnappedPos(event);
            if (pos) {
                this.model.addNode(pos.x, pos.z);
            }
        } else if (mode === 'BEAM') {
            this._handleBeamClick(event);
        } else if (mode === 'SUPPORT') {
            const hit = this.pickObject(event);
            if (hit && hit.type === 'node') {
                this.model.select(hit.type, hit.id);
                this.model.bus.emit('support:requested', hit.id);
            }
        } else if (mode === 'LOAD') {
            const hit = this.pickObject(event);
            if (hit) {
                this.model.select(hit.type, hit.id);
                if (hit.type === 'area') {
                    this.model.bus.emit('load:requested', { type: 'area', id: hit.id });
                } else {
                    this.model.bus.emit('load:requested', { type: hit.type, id: hit.id });
                }
            }
        } else if (mode === 'RECT') {
            this._handleRectClick(event);
        } else if (mode === 'POLY') {
            this._handlePolyClick(event);
        } else if (mode === 'AREA') {
            this._handleAreaClick(event);
        } else if (mode === 'DELETE') {
            const hit = this.pickObject(event);
            if (hit) {
                if (hit.type === 'node') this.model.deleteNode(hit.id);
                else if (hit.type === 'beam') this.model.deleteBeam(hit.id);
                else if (hit.type === 'area') this.model.deleteArea(hit.id);
            }
        }
    }

    _handleBeamClick(event) {
        const pos = this.getSnappedPos(event);
        if (!pos) return;

        let nodeId = pos.snappedNodeId;

        // If not snapping to existing node, create one
        if (!nodeId) {
            const node = this.model.addNode(pos.x, pos.z);
            nodeId = node.id;
        }

        if (this._beamStartNode === null) {
            // First click: set start node
            this._beamStartNode = nodeId;
            this.model.select('node', nodeId);
        } else {
            // Second click: create beam
            if (nodeId !== this._beamStartNode) {
                this.model.addBeam(this._beamStartNode, nodeId);
            }
            // Continue chain: new beam starts from end node
            this._beamStartNode = nodeId;
            this.model.select('node', nodeId);
        }
    }

    _handleRectClick(event) {
        const pos = this.getSnappedPos(event);
        if (!pos) return;

        if (this._rectStart === null) {
            // First click: store corner 1
            this._rectStart = { x: pos.x, z: pos.z };
        } else {
            // Second click: create rectangle (4 nodes + 4 beams)
            const x1 = this._rectStart.x;
            const z1 = this._rectStart.z;
            const x2 = pos.x;
            const z2 = pos.z;

            // Don't create degenerate rectangles
            if (Math.abs(x2 - x1) < 0.001 || Math.abs(z2 - z1) < 0.001) {
                this._rectStart = null;
                this.clearGhost();
                return;
            }

            const n1 = this.model.addNode(x1, z1);
            const n2 = this.model.addNode(x2, z1);
            const n3 = this.model.addNode(x2, z2);
            const n4 = this.model.addNode(x1, z2);
            this.model.addBeam(n1.id, n2.id);
            this.model.addBeam(n2.id, n3.id);
            this.model.addBeam(n3.id, n4.id);
            this.model.addBeam(n4.id, n1.id);

            // Reset for next rectangle
            this._rectStart = null;
            this.clearGhost();
        }
    }

    _handlePolyClick(event) {
        const pos = this.getSnappedPos(event);
        if (!pos) return;

        let nodeId = pos.snappedNodeId;

        // If clicking on the first node of the polyline and we have >= 3 nodes, close the polygon
        if (nodeId && this._polyNodes.length >= 3 && nodeId === this._polyNodes[0]) {
            // Close: add beam from last node to first
            this.model.addBeam(this._polyNodes[this._polyNodes.length - 1], this._polyNodes[0]);
            this._polyNodes = [];
            this.clearGhost();
            return;
        }

        // If not snapping to existing node, create one
        if (!nodeId) {
            const node = this.model.addNode(pos.x, pos.z);
            nodeId = node.id;
        }

        // If we have a previous node, create a beam to this one
        if (this._polyNodes.length > 0) {
            const prevId = this._polyNodes[this._polyNodes.length - 1];
            if (nodeId !== prevId) {
                this.model.addBeam(prevId, nodeId);
            }
        }

        this._polyNodes.push(nodeId);
        this.model.select('node', nodeId);
    }

    _handleAreaClick(event) {
        // Try raycaster first (most reliable for clicking on visible nodes)
        let nodeId = null;
        const hit = this.pickObject(event);
        if (hit && hit.type === 'node') {
            nodeId = hit.id;
        }

        // Fallback: snap to nearest node by screen distance
        if (!nodeId) {
            const pos = this.getSnappedPos(event);
            nodeId = pos?.snappedNodeId || null;
        }

        // Last resort: find closest node in editor coords (world.x=X, world.y=editorZ)
        if (!nodeId) {
            const world = this._getWorldPos(event);
            if (world) {
                const nearest = this.model.findNodeNear(world.x, world.y, 1.5);
                if (nearest) nodeId = nearest.id;
            }
        }

        // If no node found, try auto-detect enclosing polygon ("Punkt in Fläche")
        if (!nodeId) {
            const world = this._getWorldPos(event);
            if (world && this.model.data.beams.length >= 3) {
                const cx = world.x;
                const cy = world.y; // editor Z = screen Y
                const polygon = this._detectEnclosingPolygon(cx, cy);
                if (polygon) {
                    // Check if this polygon is INSIDE an existing area → create opening
                    const enclosingArea = this._findEnclosingArea(polygon);
                    if (enclosingArea) {
                        console.log('AREA: creating opening in area', enclosingArea.id, 'with nodes', polygon);
                        this.model.addOpening(enclosingArea.id, polygon);
                    } else {
                        console.log('AREA: auto-detected polygon', polygon);
                        this.model.addArea(polygon);
                    }
                    this._areaNodes = [];
                    this.clearGhost();
                    return;
                }
            }
            // No polygon found either, log debug info
            const nodes = this.model.data.nodes;
            console.log('AREA click: no node or enclosing polygon found.',
                'world:', world?.x?.toFixed(2), world?.y?.toFixed(2), world?.z?.toFixed(2),
                'nodes:', nodes.map(n => `${n.id}(${n.x},${n.z})`).join(' '),
                'nodeGroup children:', this.nodeGroup.children.length);
            return;
        }

        // If clicking the first node again → close polygon
        if (this._areaNodes.length >= 3 && nodeId === this._areaNodes[0]) {
            // Check if this polygon is inside an existing area → create opening
            const enclosingArea = this._findEnclosingArea(this._areaNodes);
            if (enclosingArea) {
                console.log('AREA: creating opening in area', enclosingArea.id, 'with nodes', this._areaNodes);
                this.model.addOpening(enclosingArea.id, this._areaNodes);
            } else {
                console.log('AREA: closing polygon with nodes', this._areaNodes);
                this.model.addArea(this._areaNodes);
            }
            this._areaNodes = [];
            this.clearGhost();
            return;
        }

        // Don't add duplicate consecutive nodes
        if (this._areaNodes.length > 0 && nodeId === this._areaNodes[this._areaNodes.length - 1]) return;

        this._areaNodes.push(nodeId);
        console.log('AREA: added node', nodeId, 'chain:', this._areaNodes);
    }

    // ── "Punkt in Fläche" — detect smallest enclosing polygon ──
    /**
     * Given a click point (cx, cy) in editor coords (x, z mapped to screen x, y),
     * find the smallest closed polygon of beams that encloses this point.
     * Uses the planar face traversal algorithm: for each directed half-edge,
     * always turn as far clockwise as possible at each node.
     */
    _detectEnclosingPolygon(cx, cy) {
        const beams = this.model.data.beams;
        const nodes = this.model.data.nodes;
        if (beams.length < 3 || nodes.length < 3) return null;

        // Build adjacency: nodeId → [{neighbor, beamId}]
        const adj = {};
        for (const node of nodes) adj[node.id] = [];
        for (const beam of beams) {
            const n1 = this.model.getNode(beam.nodeStart);
            const n2 = this.model.getNode(beam.nodeEnd);
            if (!n1 || !n2) continue;
            adj[beam.nodeStart].push({ neighbor: beam.nodeEnd, beamId: beam.id });
            adj[beam.nodeEnd].push({ neighbor: beam.nodeStart, beamId: beam.id });
        }

        // Sort adjacency lists by angle (for consistent face traversal)
        const nodePos = {};
        for (const node of nodes) nodePos[node.id] = { x: node.x, y: node.z };

        for (const nodeId of Object.keys(adj)) {
            const pos = nodePos[nodeId];
            if (!pos) continue;
            adj[nodeId].sort((a, b) => {
                const pa = nodePos[a.neighbor], pb = nodePos[b.neighbor];
                if (!pa || !pb) return 0;
                const angA = Math.atan2(pa.y - pos.y, pa.x - pos.x);
                const angB = Math.atan2(pb.y - pos.y, pb.x - pos.x);
                return angA - angB;
            });
        }

        // For each directed half-edge, trace the face by always turning
        // as clockwise as possible (next edge after incoming in sorted order).
        // Collect all unique faces, then find the smallest one containing the point.
        const visitedHalfEdges = new Set();
        const faces = [];

        for (const beam of beams) {
            for (const [from, to] of [[beam.nodeStart, beam.nodeEnd], [beam.nodeEnd, beam.nodeStart]]) {
                const heKey = `${from}->${to}`;
                if (visitedHalfEdges.has(heKey)) continue;

                const face = this._traceFace(from, to, adj, nodePos, visitedHalfEdges);
                if (face && face.length >= 3) {
                    faces.push(face);
                }
            }
        }

        // Filter faces that contain the click point, pick the smallest
        let bestFace = null;
        let bestArea = Infinity;

        for (const face of faces) {
            const coords = face.map(nid => nodePos[nid]).filter(Boolean);
            if (coords.length < 3) continue;

            if (!this._pointInPolygon(cx, cy, coords)) continue;

            const area = this._polygonArea(coords);
            if (area < bestArea) {
                bestArea = area;
                bestFace = face;
            }
        }

        return bestFace;
    }

    /**
     * Trace one face of the planar subdivision starting from directed edge from→to.
     * At each node, pick the next edge by rotating clockwise from the incoming direction.
     */
    _traceFace(startFrom, startTo, adj, nodePos, visitedHalfEdges) {
        const face = [];
        let from = startFrom;
        let to = startTo;
        const maxSteps = 100; // safety limit

        for (let step = 0; step < maxSteps; step++) {
            const heKey = `${from}->${to}`;
            if (visitedHalfEdges.has(heKey)) {
                // If we've come back to the start edge, the face is complete
                if (from === startFrom && to === startTo && face.length >= 3) {
                    return face;
                }
                // Otherwise this half-edge was already used — abort
                return null;
            }
            visitedHalfEdges.add(heKey);
            face.push(from);

            // At node 'to', find the next edge: the one immediately clockwise
            // after the incoming direction (from 'from').
            const neighbors = adj[to];
            if (!neighbors || neighbors.length === 0) return null;

            const posTo = nodePos[to];
            const posFrom = nodePos[from];
            if (!posTo || !posFrom) return null;

            // Incoming angle (from → to), we want the reverse angle (to → from)
            const inAngle = Math.atan2(posFrom.y - posTo.y, posFrom.x - posTo.x);

            // Find the neighbor with the smallest positive angle difference
            // (clockwise from the incoming direction)
            let bestNext = null;
            let bestDiff = Infinity;

            for (const entry of neighbors) {
                if (entry.neighbor === from && neighbors.length > 1) {
                    // Skip going back on the same edge (unless it's the only option)
                    // But only if there are other neighbors
                    continue;
                }
                const posN = nodePos[entry.neighbor];
                if (!posN) continue;
                const outAngle = Math.atan2(posN.y - posTo.y, posN.x - posTo.x);
                // Clockwise difference from incoming direction
                let diff = inAngle - outAngle;
                // Normalize to (0, 2*PI] — we want the first edge clockwise
                while (diff <= 0) diff += 2 * Math.PI;
                while (diff > 2 * Math.PI) diff -= 2 * Math.PI;

                if (diff < bestDiff) {
                    bestDiff = diff;
                    bestNext = entry.neighbor;
                }
            }

            if (bestNext === null) return null;

            from = to;
            to = bestNext;

            // Check if we've returned to the start
            if (from === startFrom && to === startTo) {
                return face;
            }
        }

        return null; // exceeded max steps
    }

    /**
     * Point-in-polygon test using ray casting.
     * coords is [{x, y}, ...].
     */
    _pointInPolygon(px, py, coords) {
        let inside = false;
        const n = coords.length;
        for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = coords[i].x, yi = coords[i].y;
            const xj = coords[j].x, yj = coords[j].y;
            if (((yi > py) !== (yj > py)) &&
                (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    /**
     * Compute area of a polygon using the shoelace formula.
     */
    _polygonArea(coords) {
        let sum = 0;
        const n = coords.length;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            sum += coords[i].x * coords[j].y - coords[j].x * coords[i].y;
        }
        return Math.abs(sum) / 2;
    }

    /**
     * Check if a detected polygon lies entirely inside an existing area.
     * Returns the enclosing area or null.
     */
    _findEnclosingArea(polygonNodeIds) {
        const areas = this.model.data.areas || [];
        if (areas.length === 0) return null;

        // Get centroid of the detected polygon
        let cx = 0, cy = 0;
        const polyNodes = polygonNodeIds.map(id => this.model.getNode(id)).filter(Boolean);
        if (polyNodes.length < 3) return null;
        for (const n of polyNodes) {
            cx += n.x;
            cy += n.z;
        }
        cx /= polyNodes.length;
        cy /= polyNodes.length;

        // Check if centroid is inside any existing area
        for (const area of areas) {
            const areaNodes = area.boundaryNodeIds.map(id => this.model.getNode(id)).filter(Boolean);
            if (areaNodes.length < 3) continue;
            const areaCoords = areaNodes.map(n => ({ x: n.x, y: n.z }));
            if (this._pointInPolygon(cx, cy, areaCoords)) {
                // Also check that polygon nodes are not the same as area boundary nodes
                const areaNodeSet = new Set(area.boundaryNodeIds);
                const isSubset = polygonNodeIds.every(id => areaNodeSet.has(id));
                if (!isSubset) {
                    return area;
                }
            }
        }
        return null;
    }

    _onPointerMove(event) {
        const mode = this.model.mode;
        const pos = this.getSnappedPos(event);

        // Selection rectangle drag
        if (this._selRectActive && this._selRectStart) {
            this._updateSelRectOverlay(event.clientX, event.clientY);
            return;
        }

        if (this._dragNode && pos) {
            this._isDragging = true;
            this.model.updateNode(this._dragNode, { x: pos.x, z: pos.z });
            return;
        }

        if (!pos) { this.clearGhost(); return; }

        if (mode === 'NODE') {
            this.showGhostNode(pos.x, pos.z);
        } else if (mode === 'BEAM' && this._beamStartNode !== null) {
            const startNode = this.model.getNode(this._beamStartNode);
            if (startNode) {
                this.showGhostBeam(startNode.x, startNode.z, pos.x, pos.z);
            }
        } else if (mode === 'RECT') {
            if (this._rectStart) {
                this.showGhostRect(this._rectStart.x, this._rectStart.z, pos.x, pos.z);
            } else {
                this.showGhostNode(pos.x, pos.z);
            }
        } else if (mode === 'POLY') {
            if (this._polyNodes.length > 0) {
                this.showGhostPoly(this._polyNodes, pos.x, pos.z);
            } else {
                this.showGhostNode(pos.x, pos.z);
            }
        } else if (mode === 'AREA' && this._areaNodes.length > 0) {
            this.showGhostArea(this._areaNodes, pos.x, pos.z);
        } else {
            this.clearGhost();
        }

        // Emit cursor position for status bar
        this.model.bus.emit('cursor:moved', { x: pos.x, z: pos.z });
    }

    _onPointerUp(event) {
        if (this._selRectActive) {
            this._finishSelRect(event);
            this._selRectActive = false;
            this._selRectStart = null;
            this.controls.enabled = true;
            return;
        }
        if (this._dragNode) {
            this.controls.enabled = true;
            this._dragNode = null;
            this._isDragging = false;
        }
    }

    _onKeyDown(event) {
        if (event.key === 'Escape') {
            this._beamStartNode = null;
            this._areaNodes = [];
            this._rectStart = null;
            this._polyNodes = [];
            this.clearGhost();
            this._cancelSelRect();
            this.model.mode = 'SELECT';
            this.model.deselect();
        }
        // Enter: close polygon in POLY mode
        if (event.key === 'Enter' && this.model.mode === 'POLY' && this._polyNodes.length >= 3) {
            this.model.addBeam(this._polyNodes[this._polyNodes.length - 1], this._polyNodes[0]);
            this._polyNodes = [];
            this.clearGhost();
            return;
        }
        if (event.key === 'Enter' && this._areaNodes.length >= 3) {
            const enclosingArea = this._findEnclosingArea(this._areaNodes);
            if (enclosingArea) {
                console.log('AREA: creating opening in area', enclosingArea.id, 'with Enter, nodes:', this._areaNodes);
                this.model.addOpening(enclosingArea.id, this._areaNodes);
            } else {
                console.log('AREA: closing polygon with Enter, nodes:', this._areaNodes);
                this.model.addArea(this._areaNodes);
            }
            this._areaNodes = [];
            this.clearGhost();
            return;
        }
        if (event.ctrlKey && event.key === 'z') {
            event.preventDefault();
            this.model.undo();
        }
        if (event.ctrlKey && event.key === 'y') {
            event.preventDefault();
            this.model.redo();
        }
        if (event.key === 'Delete' || event.key === 'Backspace') {
            const sel = this.model.selection;
            if (sel.type === 'multi') {
                if (sel.beamIds) for (const bid of sel.beamIds) this.model.deleteBeam(bid);
                if (sel.nodeIds) for (const nid of sel.nodeIds) this.model.deleteNode(nid);
                this.model.deselect();
            } else if (sel.type === 'node') this.model.deleteNode(sel.id);
            else if (sel.type === 'beam') this.model.deleteBeam(sel.id);
            else if (sel.type === 'area') this.model.deleteArea(sel.id);
        }
    }

    _onModeChanged(mode) {
        this._beamStartNode = null;
        this._areaNodes = [];
        this._rectStart = null;
        this._polyNodes = [];
        this.clearGhost();
        // Change cursor
        const cursors = {
            SELECT: 'default', NODE: 'crosshair', BEAM: 'crosshair',
            RECT: 'crosshair', POLY: 'crosshair',
            AREA: 'crosshair', SUPPORT: 'pointer', LOAD: 'pointer', DELETE: 'not-allowed',
        };
        this.renderer.domElement.style.cursor = cursors[mode] || 'default';
    }

    // ── Selection Rectangle (Window/Crossing) ───────────────
    _createSelRectOverlay() {
        this._removeSelRectOverlay();
        const div = document.createElement('div');
        div.id = 'sel-rect-overlay';
        div.style.cssText = 'position:absolute;pointer-events:none;z-index:100;border:2px solid #4488ff;background:rgba(68,136,255,0.1);display:none;';
        this.container.appendChild(div);
        this._selRectEl = div;
    }

    _removeSelRectOverlay() {
        if (this._selRectEl) {
            this._selRectEl.remove();
            this._selRectEl = null;
        }
    }

    _updateSelRectOverlay(clientX, clientY) {
        if (!this._selRectEl || !this._selRectStart) return;
        const rect = this.container.getBoundingClientRect();
        const sx = this._selRectStart.clientX - rect.left;
        const sy = this._selRectStart.clientY - rect.top;
        const cx = clientX - rect.left;
        const cy = clientY - rect.top;

        const left = Math.min(sx, cx);
        const top = Math.min(sy, cy);
        const w = Math.abs(cx - sx);
        const h = Math.abs(cy - sy);

        // Determine direction: left-to-right = Window (blue solid), right-to-left = Crossing (green dashed)
        const isWindow = cx >= sx;
        if (isWindow) {
            this._selRectEl.style.border = '2px solid #4488ff';
            this._selRectEl.style.background = 'rgba(68,136,255,0.1)';
        } else {
            this._selRectEl.style.border = '2px dashed #44bb44';
            this._selRectEl.style.background = 'rgba(68,187,68,0.1)';
        }

        this._selRectEl.style.left = left + 'px';
        this._selRectEl.style.top = top + 'px';
        this._selRectEl.style.width = w + 'px';
        this._selRectEl.style.height = h + 'px';
        this._selRectEl.style.display = (w > 3 || h > 3) ? 'block' : 'none';
    }

    _cancelSelRect() {
        this._selRectActive = false;
        this._selRectStart = null;
        this._removeSelRectOverlay();
        this.controls.enabled = true;
    }

    _finishSelRect(event) {
        if (!this._selRectStart) { this._removeSelRectOverlay(); return; }

        const rect = this.container.getBoundingClientRect();
        const sx = this._selRectStart.clientX - rect.left;
        const sy = this._selRectStart.clientY - rect.top;
        const cx = event.clientX - rect.left;
        const cy = event.clientY - rect.top;

        this._removeSelRectOverlay();

        const w = Math.abs(cx - sx);
        const h = Math.abs(cy - sy);
        if (w < 5 && h < 5) return; // Too small, ignore

        const isWindow = cx >= sx; // left-to-right = Window

        // Rectangle bounds in screen pixels (relative to container)
        const rLeft = Math.min(sx, cx);
        const rRight = Math.max(sx, cx);
        const rTop = Math.min(sy, cy);
        const rBottom = Math.max(sy, cy);

        // Project each node to screen coordinates and test containment
        const nodeScreenPos = {}; // nodeId -> {sx, sy, inside}
        const selectedNodes = new Set();
        const selectedBeams = new Set();

        const containerW = this.container.clientWidth;
        const containerH = this.container.clientHeight;

        for (const node of this.model.data.nodes) {
            const v = new THREE.Vector3(node.x, node.z, 0).project(this.camera);
            const px = (v.x * 0.5 + 0.5) * containerW;
            const py = (-v.y * 0.5 + 0.5) * containerH;
            const inside = px >= rLeft && px <= rRight && py >= rTop && py <= rBottom;
            nodeScreenPos[node.id] = { px, py, inside };
            if (inside) selectedNodes.add(node.id);
        }

        for (const beam of this.model.data.beams) {
            const s = nodeScreenPos[beam.nodeStart];
            const e = nodeScreenPos[beam.nodeEnd];
            if (!s || !e) continue;

            if (isWindow) {
                // Window: both endpoints must be inside
                if (s.inside && e.inside) selectedBeams.add(beam.id);
            } else {
                // Crossing: at least one endpoint inside, OR segment intersects rectangle
                if (s.inside || e.inside) {
                    selectedBeams.add(beam.id);
                } else if (this._segmentIntersectsRect(s.px, s.py, e.px, e.py, rLeft, rTop, rRight, rBottom)) {
                    selectedBeams.add(beam.id);
                }
            }
        }

        if (selectedNodes.size > 0 || selectedBeams.size > 0) {
            this.model.selectMulti(selectedNodes, selectedBeams);
        }
    }

    // Test if line segment (x1,y1)-(x2,y2) intersects axis-aligned rectangle
    _segmentIntersectsRect(x1, y1, x2, y2, rLeft, rTop, rRight, rBottom) {
        // Cohen-Sutherland style clipping test
        const INSIDE = 0, LEFT = 1, RIGHT = 2, BOTTOM = 4, TOP = 8;
        const code = (x, y) => {
            let c = INSIDE;
            if (x < rLeft) c |= LEFT;
            else if (x > rRight) c |= RIGHT;
            if (y < rTop) c |= TOP;
            else if (y > rBottom) c |= BOTTOM;
            return c;
        };

        let c1 = code(x1, y1);
        let c2 = code(x2, y2);
        let ax = x1, ay = y1, bx = x2, by = y2;

        for (let i = 0; i < 20; i++) {
            if (!(c1 | c2)) return true; // Both inside
            if (c1 & c2) return false;   // Both in same outside region

            const cOut = c1 ? c1 : c2;
            let x, y;
            if (cOut & BOTTOM) {
                x = ax + (bx - ax) * (rBottom - ay) / (by - ay);
                y = rBottom;
            } else if (cOut & TOP) {
                x = ax + (bx - ax) * (rTop - ay) / (by - ay);
                y = rTop;
            } else if (cOut & RIGHT) {
                y = ay + (by - ay) * (rRight - ax) / (bx - ax);
                x = rRight;
            } else {
                y = ay + (by - ay) * (rLeft - ax) / (bx - ax);
                x = rLeft;
            }

            if (cOut === c1) { ax = x; ay = y; c1 = code(ax, ay); }
            else { bx = x; by = y; c2 = code(bx, by); }
        }
        return false;
    }

    // ── Deformation Display ──────────────────────────────────
    /**
     * Show deformed shape from calculation results.
     * @param {Object} resultData - { nodes: [{id, uX, uY}], beams: [{id, x, N, Vz, My}] }
     *   uX = horizontal displacement, uY = vertical displacement (RAHM convention)
     */
    showDeformed(resultData, scale = 100) {
        this._deformData = resultData;
        this._deformScale = scale;
        this._showDeformed = true;
        this._rebuildDeformed();
    }

    hideDeformed() {
        this._showDeformed = false;
        this._clearGroup(this.deformGroup);
    }

    setDeformScale(scale) {
        this._deformScale = scale;
        if (this._showDeformed && this._deformData) {
            this._rebuildDeformed();
        }
    }

    _rebuildDeformed() {
        this._clearGroup(this.deformGroup);
        if (!this._deformData) return;

        const s = this._deformScale;
        const nodeDisps = {};
        for (const nd of this._deformData.nodes || []) {
            // SOFiSTiK RAHM: uX = horizontal, uY = vertical
            nodeDisps[nd.id] = { dx: (nd.uX || 0) * s, dy: (nd.uY || 0) * s };
        }

        // Draw original structure faintly
        for (const beam of this.model.data.beams) {
            const n1 = this.model.getNode(beam.nodeStart);
            const n2 = this.model.getNode(beam.nodeEnd);
            if (!n1 || !n2) continue;
            const lineGeo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(n1.x, n1.z, 0),
                new THREE.Vector3(n2.x, n2.z, 0),
            ]);
            const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({
                color: 0x445566, transparent: true, opacity: 0.3,
            }));
            this.deformGroup.add(line);
        }

        // Draw deformed beams as thick colored lines through displaced positions
        // Use the subdivision nodes from the SQLite results
        // Group beam forces by element to trace the deformed shape
        const beamForces = this._deformData.beams || [];

        // Build node position map (original positions in editor coords)
        // SQLite stores RAHM as: position_x = X, position_y = Z(vertical)
        const allNodes = {};
        for (const node of this.model.data.nodes) {
            allNodes[node.id] = { x: node.x, y: node.z }; // editor z → screen y
        }
        // Add subdivision node positions from the SQLite result data
        for (const nd of this._deformData.allNodes || []) {
            allNodes[nd.id] = { x: nd.x, y: nd.y }; // SQLite position_x, position_y
        }

        // Build connectivity from beam forces: group by element_id, get node pairs
        const beamElements = this._deformData.elements || [];

        // Simple approach: draw deformed shape from node displacements
        // Connect nodes along each original beam using subdivision points
        for (const beam of this.model.data.beams) {
            const n1 = this.model.getNode(beam.nodeStart);
            const n2 = this.model.getNode(beam.nodeEnd);
            if (!n1 || !n2) continue;

            // Collect all nodes along this beam (original endpoints + subdivisions)
            const beamNodes = [];
            const bx = n2.x - n1.x;
            const bz = n2.z - n1.z;
            const L = Math.sqrt(bx * bx + bz * bz);

            // Find subdivision nodes by checking which result nodes lie on this beam
            // allNodes has {x, y} where y = editor Z = screen Y
            for (const [idStr, pos] of Object.entries(allNodes)) {
                const id = parseInt(idStr);
                const px = pos.x - n1.x;
                const py = pos.y - n1.z;  // editor z stored as y
                // Project onto beam direction (editor coords)
                const t = (px * bx + py * bz) / (L * L);
                const perpX = px - t * bx;
                const perpY = py - t * bz;
                const perpDist = Math.sqrt(perpX * perpX + perpY * perpY);
                if (t >= -0.001 && t <= 1.001 && perpDist < 0.01) {
                    const disp = nodeDisps[id] || { dx: 0, dy: 0 };
                    beamNodes.push({
                        t,
                        x: pos.x + disp.dx,
                        y: pos.y + disp.dy,
                    });
                }
            }

            // Sort by parameter t
            beamNodes.sort((a, b) => a.t - b.t);

            if (beamNodes.length < 2) continue;

            // Draw deformed beam as tube geometry for visibility (XY plane, Z=0)
            const path = new THREE.CatmullRomCurve3(
                beamNodes.map(n => new THREE.Vector3(n.x, n.y, 0))
            );
            const tubeGeo = new THREE.TubeGeometry(path, beamNodes.length * 4, BEAM_RADIUS * 1.5, 8, false);
            const tubeMat = new THREE.MeshPhongMaterial({ color: 0xff3333, emissive: 0x441111 });
            this.deformGroup.add(new THREE.Mesh(tubeGeo, tubeMat));

            // Draw deformed node positions as bright dots
            const dotGeo = new THREE.SphereGeometry(NODE_RADIUS * 0.8, 12, 8);
            const dotMat = new THREE.MeshPhongMaterial({ color: 0xff3333, emissive: 0x441111 });
            for (const n of beamNodes) {
                const dot = new THREE.Mesh(dotGeo, dotMat);
                dot.position.set(n.x, n.y, 0);
                this.deformGroup.add(dot);
            }
        }

        // Fade out the undeformed beams/nodes
        for (const mesh of this.beamGroup.children) {
            mesh.material.transparent = true;
            mesh.material.opacity = 0.2;
        }
        for (const mesh of this.nodeGroup.children) {
            mesh.material.transparent = true;
            mesh.material.opacity = 0.2;
        }
    }

    resetDeformView() {
        this.hideDeformed();
        // Restore opacity
        for (const mesh of this.beamGroup.children) {
            mesh.material.transparent = false;
            mesh.material.opacity = 1;
        }
        for (const mesh of this.nodeGroup.children) {
            mesh.material.transparent = false;
            mesh.material.opacity = 1;
        }
    }

    // ── Quad Result Surface (colored FE mesh) ───────────────
    /**
     * Show quad results as a colored FE mesh with jet colormap.
     * Uses actual quad element connectivity for per-element coloring.
     * @param {Object} resultData - { allNodes, nodes, quads, quadElements }
     * @param {string} type - 'mxx', 'myy', 'mxy', 'vx', 'vy', 'uZ'
     * @param {number} scale - height scale factor for Hoehenflaeche (0 = flat)
     */
    showQuadResults(resultData, type, scale) {
        this.hideQuadResults();
        if (!resultData?.allNodes?.length) return;

        const quadElems = resultData.quadElements || [];
        if (quadElems.length === 0) return;

        // Build node position map: id -> {x, y}
        const nodePos = {};
        for (const n of resultData.allNodes) {
            nodePos[n.id] = { x: n.x, y: n.y };
        }

        // Build element value map: elemNr -> value
        const elemValMap = {};
        if (type === 'uZ') {
            // For displacement: we use per-node values directly (handled below)
        } else {
            for (const q of (resultData.quads || [])) {
                elemValMap[q.id] = q[type] || 0;
            }
        }

        // Build per-node value map by averaging adjacent element values
        const nodeValSum = {};
        const nodeValCnt = {};

        if (type === 'uZ') {
            // Use displacement data directly per node
            const dispMap = {};
            for (const d of (resultData.nodes || [])) {
                dispMap[d.id] = d.uZ || 0;
            }
            for (const n of resultData.allNodes) {
                nodeValSum[n.id] = dispMap[n.id] || 0;
                nodeValCnt[n.id] = 1;
            }
        } else {
            // Average element-centered values at shared nodes
            for (const qe of quadElems) {
                const val = elemValMap[qe.nr];
                if (val === undefined) continue;
                for (const nid of qe.nodes) {
                    if (!nodeValSum[nid]) {
                        nodeValSum[nid] = 0;
                        nodeValCnt[nid] = 0;
                    }
                    nodeValSum[nid] += val;
                    nodeValCnt[nid] += 1;
                }
            }
        }

        // Compute averaged node values
        const nodeVal = {};
        for (const nid in nodeValSum) {
            nodeVal[nid] = nodeValSum[nid] / (nodeValCnt[nid] || 1);
        }

        // Determine value range
        const allVals = Object.values(nodeVal);
        if (allVals.length === 0) return;
        const vmin = Math.min(...allVals);
        const vmax = Math.max(...allVals);
        const vrange = Math.max(Math.abs(vmax - vmin), 1e-10);

        // Jet colormap
        const jet = (t) => {
            t = Math.max(0, Math.min(1, t));
            const r = Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 3)));
            const g = Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 2)));
            const b = Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 1)));
            return [r, g, b];
        };

        // Build mesh geometry: each quad = 2 triangles
        const positions = [];
        const colors = [];
        const wirePositions = [];

        for (const qe of quadElems) {
            const nids = qe.nodes;
            if (!nids || nids.length < 3) continue;

            // Gather node positions and values
            const pts = [];
            const vals = [];
            let valid = true;
            for (const nid of nids) {
                const p = nodePos[nid];
                if (!p) { valid = false; break; }
                const v = nodeVal[nid] !== undefined ? nodeVal[nid] : 0;
                pts.push(p);
                vals.push(v);
            }
            if (!valid) continue;

            // Normalized values for coloring
            const tVals = vals.map(v => (v - vmin) / vrange);
            const zVals = vals.map(v => v * scale);

            if (nids.length >= 4) {
                // Quad: 2 triangles (0,1,2) and (0,2,3)
                const triIndices = [[0, 1, 2], [0, 2, 3]];
                for (const [a, b, c] of triIndices) {
                    for (const idx of [a, b, c]) {
                        positions.push(pts[idx].x, pts[idx].y, zVals[idx]);
                        const col = jet(tVals[idx]);
                        colors.push(col[0], col[1], col[2]);
                    }
                }
                // Wireframe: quad outline
                for (let i = 0; i < 4; i++) {
                    const j = (i + 1) % 4;
                    wirePositions.push(pts[i].x, pts[i].y, zVals[i]);
                    wirePositions.push(pts[j].x, pts[j].y, zVals[j]);
                }
            } else {
                // Triangle: 1 triangle
                for (const idx of [0, 1, 2]) {
                    positions.push(pts[idx].x, pts[idx].y, zVals[idx]);
                    const col = jet(tVals[idx]);
                    colors.push(col[0], col[1], col[2]);
                }
                // Wireframe: triangle outline
                for (let i = 0; i < 3; i++) {
                    const j = (i + 1) % 3;
                    wirePositions.push(pts[i].x, pts[i].y, zVals[i]);
                    wirePositions.push(pts[j].x, pts[j].y, zVals[j]);
                }
            }
        }

        if (positions.length === 0) return;

        // Colored mesh
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        const meshMat = new THREE.MeshBasicMaterial({
            vertexColors: true, side: THREE.DoubleSide,
            transparent: true, opacity: 0.85,
        });
        this.quadResultGroup.add(new THREE.Mesh(geo, meshMat));

        // Wireframe overlay for element borders
        if (wirePositions.length > 0) {
            const wireGeo = new THREE.BufferGeometry();
            wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wirePositions, 3));
            const wireMat = new THREE.LineBasicMaterial({
                color: 0x223344, linewidth: 1, transparent: true, opacity: 0.5,
            });
            this.quadResultGroup.add(new THREE.LineSegments(wireGeo, wireMat));
        }

        // Show color legend
        const typeLabels = {
            mxx: 'mxx [kNm/m]', myy: 'myy [kNm/m]', mxy: 'mxy [kNm/m]',
            vx: 'vx [kN/m]', vy: 'vy [kN/m]', uZ: 'uZ [m]',
        };
        this._showColorLegend(typeLabels[type] || type, vmin, vmax);
    }

    hideQuadResults() {
        this._clearGroup(this.quadResultGroup);
        this._hideColorLegend();
    }

    // ── Color Legend ─────────────────────────────────────────
    _showColorLegend(title, vmin, vmax) {
        this._hideColorLegend();

        const legend = document.createElement('div');
        legend.id = 'quad-color-legend';
        legend.style.cssText = `
            position: absolute; bottom: 40px; left: 16px;
            background: rgba(10, 10, 30, 0.88); border: 1px solid #445;
            border-radius: 6px; padding: 8px 10px; z-index: 15;
            display: flex; flex-direction: row; align-items: stretch; gap: 8px;
            font-family: 'Segoe UI', system-ui, sans-serif; font-size: 11px;
            color: #c8d0e0; pointer-events: none;
        `;

        // Gradient bar (vertical)
        const bar = document.createElement('div');
        bar.style.cssText = `
            width: 16px; height: 180px; border-radius: 3px;
            background: linear-gradient(to top,
                rgb(0, 0, 143),
                rgb(0, 0, 255),
                rgb(0, 143, 255),
                rgb(0, 255, 255),
                rgb(143, 255, 112),
                rgb(255, 255, 0),
                rgb(255, 143, 0),
                rgb(255, 0, 0),
                rgb(128, 0, 0)
            );
        `;

        // Labels column
        const labels = document.createElement('div');
        labels.style.cssText = `
            display: flex; flex-direction: column; justify-content: space-between;
            height: 180px; font-family: monospace; font-size: 10px; color: #aabbcc;
        `;

        const fmt = (v) => {
            if (Math.abs(v) < 0.001 && v !== 0) return v.toExponential(2);
            return v.toFixed(3);
        };

        const topLabel = document.createElement('span');
        topLabel.textContent = fmt(vmax);
        const midLabel = document.createElement('span');
        midLabel.textContent = fmt((vmin + vmax) / 2);
        midLabel.style.textAlign = 'left';
        const botLabel = document.createElement('span');
        botLabel.textContent = fmt(vmin);

        labels.appendChild(topLabel);
        labels.appendChild(midLabel);
        labels.appendChild(botLabel);

        // Title
        const titleEl = document.createElement('div');
        titleEl.textContent = title;
        titleEl.style.cssText = `
            font-size: 11px; font-weight: 600; color: #7eb8ff;
            margin-bottom: 4px; text-align: center;
        `;

        const inner = document.createElement('div');
        inner.style.cssText = 'display: flex; flex-direction: row; gap: 6px;';
        inner.appendChild(bar);
        inner.appendChild(labels);

        legend.appendChild(titleEl);
        legend.appendChild(inner);

        this.container.appendChild(legend);
    }

    _hideColorLegend() {
        const existing = this.container.querySelector('#quad-color-legend');
        if (existing) existing.remove();
    }

    // ── Beam Force Diagrams ──────────────────────────────────
    /**
     * Show beam force diagrams on the canvas.
     * @param {Object} resultData - { allNodes, nodes, beams: [{id, x, N, Vz, My}] }
     * @param {string} type - 'My', 'Vz', or 'N'
     * @param {number} scale - scale factor for diagram size
     */
    showBeamDiagrams(resultData, type, scale) {
        this._diagramData = resultData;
        this._diagramTypes.add(type);
        this._diagramScale = scale;
        this._rebuildDiagrams();
    }

    hideBeamDiagrams(type) {
        if (type) {
            this._diagramTypes.delete(type);
        } else {
            this._diagramTypes.clear();
        }
        this._rebuildDiagrams();
    }

    setDiagramScale(scale) {
        this._diagramScale = scale;
        if (this._diagramTypes.size > 0 && this._diagramData) {
            this._rebuildDiagrams();
        }
    }

    _rebuildDiagrams() {
        this._clearGroup(this.diagramGroup);
        if (!this._diagramData || this._diagramTypes.size === 0) return;

        const colorMap = {
            My: { fill: 0x4488ff, line: 0x6699ff },
            Vz: { fill: 0x44bb44, line: 0x66dd66 },
            N:  { fill: 0xffaa44, line: 0xffcc66 },
        };

        const beamForces = this._diagramData.beams || [];
        if (beamForces.length === 0) return;

        // Group forces by element_id
        const forcesByElem = {};
        for (const f of beamForces) {
            (forcesByElem[f.id] ||= []).push(f);
        }

        // For each element group, sort by x position along beam
        for (const elemId in forcesByElem) {
            forcesByElem[elemId].sort((a, b) => a.x - b.x);
        }

        // Build allNodes lookup: {id -> {x, y}} where y = editor Z = screen Y
        const allNodesMap = {};
        for (const nd of this._diagramData.allNodes || []) {
            allNodesMap[nd.id] = { x: nd.x, y: nd.y };
        }
        for (const node of this.model.data.nodes) {
            allNodesMap[node.id] = { x: node.x, y: node.z };
        }

        // For each original beam, find all sub-element force records that lie on it
        for (const beam of this.model.data.beams) {
            const n1 = this.model.getNode(beam.nodeStart);
            const n2 = this.model.getNode(beam.nodeEnd);
            if (!n1 || !n2) continue;

            // Beam direction in screen coords (x→X, z→Y)
            const p1x = n1.x, p1y = n1.z;
            const p2x = n2.x, p2y = n2.z;
            const dx = p2x - p1x;
            const dy = p2y - p1y;
            const L = Math.sqrt(dx * dx + dy * dy);
            if (L < 0.001) continue;

            // Unit tangent and perpendicular (rotated 90° CCW)
            const tx = dx / L, ty = dy / L;
            const nx = -ty, ny = tx;

            // Collect all force records along this beam
            // Match sub-beam elements by checking if their force records
            // fall along this beam's axis
            const beamRecords = [];

            for (const elemId in forcesByElem) {
                const records = forcesByElem[elemId];
                // Check if this element's records lie on our beam
                // Use the first record's x position relative to beam start
                // Records have x = position along beam in [m] from beam start
                // Since sub-beams share the same global coordinates, we check by
                // looking at connectivity through allNodes
                // Simpler approach: use all sub-elements that have positions within this beam's span

                for (const rec of records) {
                    // rec.x is position along beam axis in meters from element start
                    // We need to map sub-element positions back to the original beam
                    // The API returns beam_forces with elem_nr (sub-element) and x (local position)
                    // For now, use position matching through the node positions
                }
            }

            // Alternative approach: collect all force values by position along this beam
            // by matching node positions of sub-elements
            const forcePoints = []; // {t, N, Vz, My}

            for (const elemId in forcesByElem) {
                const records = forcesByElem[elemId];
                for (const rec of records) {
                    // rec.x is the distance from element start in m
                    // We need the absolute position — but we don't have element connectivity
                    // So we reconstruct: each sub-element's forces at x=0 and x=subLength
                    // lie along the original beam axis

                    // The elem_nr from SOFiSTiK is the sub-element ID.
                    // We can find the sub-element's start/end nodes from the allNodes data.
                    // But we don't have explicit connectivity here.

                    // Practical approach: skip direct connectivity and instead
                    // project rec positions onto the beam using the assumption that
                    // x-values are cumulative along the original beam.
                }
            }

            // Since we cannot reliably map sub-elements back without connectivity,
            // use a more robust approach: collect ALL force records from ALL sub-elements
            // and check which ones have positions lying on this beam.
            // The beam forces have {id: elem_nr, x: local_position, N, Vz, My}
            // Each sub-element has a length, and x goes from 0 to that length.
            // Without knowing which sub-elements belong to which beam, we use
            // the global node positions approach.

            // Rebuild using elements array if available, or fall back to position matching
            this._collectBeamForcePoints(beam, n1, n2, L, tx, ty, forcePoints, forcesByElem, allNodesMap);

            if (forcePoints.length < 2) continue;
            forcePoints.sort((a, b) => a.t - b.t);

            // Draw diagrams for each active type
            for (const type of this._diagramTypes) {
                const colors = colorMap[type] || colorMap.My;
                const scale = this._diagramScale;

                // Build polygon: baseline (beam) + offset points
                const positions = [];
                const linePoints = [];

                for (let i = 0; i < forcePoints.length; i++) {
                    const fp = forcePoints[i];
                    const val = fp[type] || 0;
                    // Position along beam
                    const bx = p1x + fp.t * dx;
                    const by = p1y + fp.t * dy;
                    // Offset perpendicular to beam by force value * scale
                    const ox = bx + nx * val * scale;
                    const oy = by + ny * val * scale;

                    linePoints.push(new THREE.Vector3(ox, oy, 0.01));
                }

                // Build filled polygon triangles (beam baseline to offset curve)
                for (let i = 0; i < forcePoints.length - 1; i++) {
                    const fp0 = forcePoints[i];
                    const fp1 = forcePoints[i + 1];
                    const val0 = fp0[type] || 0;
                    const val1 = fp1[type] || 0;

                    // Baseline points
                    const ax = p1x + fp0.t * dx, ay = p1y + fp0.t * dy;
                    const cx = p1x + fp1.t * dx, cy = p1y + fp1.t * dy;
                    // Offset points
                    const bx2 = ax + nx * val0 * scale, by2 = ay + ny * val0 * scale;
                    const dx2 = cx + nx * val1 * scale, dy2 = cy + ny * val1 * scale;

                    // Two triangles: (a,b,c) and (b,d,c)
                    positions.push(
                        ax, ay, 0.01, bx2, by2, 0.01, cx, cy, 0.01,
                        bx2, by2, 0.01, dx2, dy2, 0.01, cx, cy, 0.01,
                    );
                }

                if (positions.length > 0) {
                    const geo = new THREE.BufferGeometry();
                    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
                    geo.computeVertexNormals();
                    const mat = new THREE.MeshBasicMaterial({
                        color: colors.fill,
                        transparent: true,
                        opacity: 0.3,
                        side: THREE.DoubleSide,
                        depthWrite: false,
                    });
                    this.diagramGroup.add(new THREE.Mesh(geo, mat));
                }

                // Draw outline line along force values
                if (linePoints.length > 1) {
                    const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
                    const lineMat = new THREE.LineBasicMaterial({ color: colors.line, linewidth: 2 });
                    this.diagramGroup.add(new THREE.Line(lineGeo, lineMat));
                }

                // Draw closing lines from baseline to first and last offset points
                if (forcePoints.length > 0) {
                    const fp0 = forcePoints[0];
                    const fpN = forcePoints[forcePoints.length - 1];
                    const val0 = fp0[type] || 0;
                    const valN = fpN[type] || 0;
                    if (Math.abs(val0) > 1e-10 || Math.abs(valN) > 1e-10) {
                        const closePts = [];
                        // Start closing line
                        const sx = p1x + fp0.t * dx, sy = p1y + fp0.t * dy;
                        const sox = sx + nx * val0 * scale, soy = sy + ny * val0 * scale;
                        closePts.push(new THREE.Vector3(sx, sy, 0.01), new THREE.Vector3(sox, soy, 0.01));
                        // End closing line
                        const ex = p1x + fpN.t * dx, ey = p1y + fpN.t * dy;
                        const eox = ex + nx * valN * scale, eoy = ey + ny * valN * scale;
                        closePts.push(new THREE.Vector3(ex, ey, 0.01), new THREE.Vector3(eox, eoy, 0.01));

                        const closeGeo = new THREE.BufferGeometry().setFromPoints(closePts);
                        const closeMat = new THREE.LineBasicMaterial({ color: colors.line });
                        this.diagramGroup.add(new THREE.LineSegments(closeGeo, closeMat));
                    }
                }

                // Add value labels at max and min
                this._addDiagramLabels(forcePoints, type, p1x, p1y, dx, dy, nx, ny, scale, colors.line);
            }
        }
    }

    _collectBeamForcePoints(beam, n1, n2, L, tx, ty, forcePoints, forcesByElem, allNodesMap) {
        // Approach: iterate all force records across all sub-elements.
        // Each sub-element has force records at positions x along it.
        // We find sub-elements whose nodes lie on this beam by checking
        // node positions against the beam axis.

        // First, find all nodes that lie on this beam
        const p1x = n1.x, p1y = n1.z;
        const dx = n2.x - n1.x, dy = n2.z - n1.z;
        const nodesOnBeam = new Map(); // nodeId -> t (parameter along beam)

        for (const [idStr, pos] of Object.entries(allNodesMap)) {
            const id = parseInt(idStr);
            const px = pos.x - p1x;
            const py = pos.y - p1y;
            const t = (px * dx + py * dy) / (L * L);
            const perpX = px - t * dx;
            const perpY = py - t * dy;
            const perpDist = Math.sqrt(perpX * perpX + perpY * perpY);
            if (t >= -0.001 && t <= 1.001 && perpDist < 0.01) {
                nodesOnBeam.set(id, Math.max(0, Math.min(1, t)));
            }
        }

        // Now collect force records from sub-elements that lie on this beam.
        // A sub-element lies on this beam if its force positions (mapped from
        // the local x coordinate) correspond to positions along this beam.
        //
        // Since we don't have sub-element connectivity, we use a different approach:
        // Each force record has (elem_nr, x, N, Vz, My).
        // For sub-elements of length subL, x goes from 0 to subL.
        // The sub-elements are numbered sequentially.
        //
        // Practical approach: the beam forces already have absolute x positions
        // along the original beam (the RESULTS export uses cumulative x).
        // So x=0 is beam start, x=L is beam end.

        // Collect all unique (x, N, Vz, My) across all sub-elements
        // that have x in range [0, L] for this beam.
        // Since multiple beams may have similar lengths, we also verify
        // by checking that the element's forces form a continuous set.

        // Group all force records by their x position mapped to t = x / L
        const seen = new Set();
        const allRecords = [];
        for (const elemId in forcesByElem) {
            for (const rec of forcesByElem[elemId]) {
                allRecords.push(rec);
            }
        }

        // Try to match force records to this beam.
        // The elem_nr in the forces corresponds to sub-beams.
        // With 8 subdivisions, elements for beam with original_id get IDs:
        // original_id*100+1, original_id*100+2, ..., etc.
        // Or they may just be sequential. Let's try by original beam ID pattern.

        // Check for sub-element IDs that match beam.id pattern
        const candidateElems = [];
        for (const elemIdStr in forcesByElem) {
            const elemId = parseInt(elemIdStr);
            // SOFiSTiK subdivision: sub-elements often have IDs like beamId*100+sub
            // or they may be sequential. Check if elemId/100 rounds to beam.id
            if (Math.floor((elemId - 1) / 100) + 1 === beam.id ||
                Math.floor(elemId / 100) === beam.id) {
                candidateElems.push(elemIdStr);
            }
        }

        if (candidateElems.length > 0) {
            // Collect all force records from candidate sub-elements
            // and compute cumulative x position
            const subElems = candidateElems
                .map(id => ({ id: parseInt(id), records: forcesByElem[id] }))
                .sort((a, b) => a.id - b.id);

            let cumX = 0;
            for (const sub of subElems) {
                const recs = sub.records;
                if (recs.length === 0) continue;
                const subLen = Math.max(...recs.map(r => r.x));
                for (const rec of recs) {
                    const absX = cumX + rec.x;
                    const t = L > 0 ? absX / L : 0;
                    const key = t.toFixed(6);
                    if (!seen.has(key)) {
                        seen.add(key);
                        forcePoints.push({ t, N: rec.N || 0, Vz: rec.Vz || 0, My: rec.My || 0 });
                    }
                }
                cumX += subLen;
            }
        }

        // Fallback: if no candidate elements found, try matching by beam length
        if (forcePoints.length < 2) {
            // Try grouping all elements and finding a sequence that sums to L
            // Simple fallback: just use all forces from all elements,
            // distributed along [0,1] proportionally
            const sortedElems = Object.keys(forcesByElem)
                .map(id => parseInt(id))
                .sort((a, b) => a - b);

            // Find consecutive element groups whose total length ~ L
            for (let start = 0; start < sortedElems.length; start++) {
                let totalLen = 0;
                const group = [];
                for (let i = start; i < sortedElems.length; i++) {
                    const recs = forcesByElem[sortedElems[i]];
                    const subLen = Math.max(...recs.map(r => r.x), 0);
                    totalLen += subLen;
                    group.push(sortedElems[i]);
                    if (Math.abs(totalLen - L) < 0.01) {
                        // Found a matching group
                        let cumX2 = 0;
                        for (const elemId of group) {
                            const recs2 = forcesByElem[elemId];
                            const subLen2 = Math.max(...recs2.map(r => r.x), 0);
                            for (const rec of recs2) {
                                const absX2 = cumX2 + rec.x;
                                const t = L > 0 ? absX2 / L : 0;
                                const key = t.toFixed(6);
                                if (!seen.has(key)) {
                                    seen.add(key);
                                    forcePoints.push({ t, N: rec.N || 0, Vz: rec.Vz || 0, My: rec.My || 0 });
                                }
                            }
                            cumX2 += subLen2;
                        }
                        // Mark these elements as used
                        for (const eid of group) {
                            delete forcesByElem[eid];
                        }
                        return;
                    }
                    if (totalLen > L + 0.1) break;
                }
            }
        }
    }

    _addDiagramLabels(forcePoints, type, p1x, p1y, dxBeam, dyBeam, nx, ny, scale, color) {
        if (forcePoints.length === 0) return;

        // Find min and max values
        let minVal = Infinity, maxVal = -Infinity;
        let minPt = null, maxPt = null;
        for (const fp of forcePoints) {
            const val = fp[type] || 0;
            if (val < minVal) { minVal = val; minPt = fp; }
            if (val > maxVal) { maxVal = val; maxPt = fp; }
        }

        const labelPts = [];
        if (Math.abs(maxVal) > 1e-6) labelPts.push({ val: maxVal, pt: maxPt });
        if (Math.abs(minVal) > 1e-6 && minPt !== maxPt) labelPts.push({ val: minVal, pt: minPt });

        for (const { val, pt } of labelPts) {
            const bx = p1x + pt.t * dxBeam;
            const by = p1y + pt.t * dyBeam;
            const ox = bx + nx * val * scale;
            const oy = by + ny * val * scale;

            const canvas = document.createElement('canvas');
            canvas.width = 160; canvas.height = 32;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
            ctx.font = 'bold 16px monospace';
            const text = val.toFixed(1);
            ctx.fillText(text, 4, 22);
            const tex = new THREE.CanvasTexture(canvas);
            const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
            const sprite = new THREE.Sprite(mat);
            sprite.position.set(ox + nx * 0.3, oy + ny * 0.3, 0.02);
            sprite.scale.set(2.5, 0.5, 1);
            this.diagramGroup.add(sprite);
        }
    }

    // ── Cleanup ────────────────────────────────────────────
    dispose() {
        window.removeEventListener('resize', this._onResize);
        this.renderer.dispose();
    }
}
