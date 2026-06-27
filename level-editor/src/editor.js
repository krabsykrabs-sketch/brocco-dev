// The 3D editor: scene, grid, free placement with vertical stacking,
// selection, and pointer interaction. Owns the renderer + render loop.
//
// Coordinates: the floor is the X–Z plane (the square grid); Y is up (the
// vertical stacking axis). Cells are TILE units wide and the grid is centred
// on the origin. Each grid cell is its own stack: placing drops an object on
// top of whatever already occupies its cell(s) — its base rests on the
// running stack height (from each model's measured bounding-box height).
//
// Per-model placement metadata (everything else defaults to 1×1, non-ground):
//   w,d    footprint in cells. Most pieces are 1×1 and centre on a tile. A few
//          are bigger — the large floor tiles are 4×4 world units = 2×2 cells —
//          so they snap to a *block* of cells (anchored to the shared grid
//          intersection) instead of overhanging a single tile. Add entries here
//          if other oversized pieces should tile too (walls are 2 wide, the big
//          and round tables, the pizza oven …).
//   ground floor tiles: laid flush at the stack surface (recessed below, like
//          the game) and contribute 0 height, so things placed on a floored
//          cell still sit at ground level rather than on a raised slab.
//   place  a built-in placement offset (world units, in the piece's LOCAL
//          frame so it rotates with the piece). The wall/door/window kit
//          shares one origin that sits off-grid, so they get a default nudge
//          to align — this is intrinsic and separate from the user's manual
//          per-object Offset (which still starts at 0,0,0).
import * as THREE from 'three';
import { OrbitController } from './controls.js';
import { AssetPack } from './models.js';
import { CATALOGS, loadManifest } from './catalog.js';

export const TILE = 2;   // KayKit pieces are 2×2 world units

const ZERO = { x: 0, y: 0, z: 0 };
// the whole wall/door/window kit shares one off-grid origin → same default nudge
const WALL_PLACE = { x: -1, y: 0, z: -0.5 };
// packs whose footprints come ONLY from the hand-authored MODEL_META below
// (their game loader is frozen and must agree with the editor). All other packs
// derive footprints from the measured model size — see Editor.footprint().
const LEGACY_FOOTPRINT_PACKS = new Set(['restaurant-bits']);

const MODEL_META = {
  floor_kitchen:              { w: 2, d: 2, ground: true },
  floor_kitchen_styleB:       { w: 2, d: 2, ground: true },
  floor_kitchen_small:        { w: 1, d: 1, ground: true },
  floor_kitchen_small_styleB: { w: 1, d: 1, ground: true },
  // generated single-colour 1×1 floor tiles (build-tiles.py)
  tile_white:                 { w: 1, d: 1, ground: true },
  tile_black:                 { w: 1, d: 1, ground: true },
  tile_brown_light:           { w: 1, d: 1, ground: true },
  tile_brown_dark:            { w: 1, d: 1, ground: true },
  // wall/door/window kit — built-in alignment offset (NOT pillars, NOT tiles)
  door_A:                            { place: WALL_PLACE },
  door_B:                            { place: WALL_PLACE },
  wall:                              { place: WALL_PLACE },
  wall_doorway:                      { place: WALL_PLACE },
  wall_half:                         { place: WALL_PLACE },
  wall_decorated:                    { place: WALL_PLACE },
  wall_decorated_styleB:             { place: WALL_PLACE },
  wall_window_open:                  { place: WALL_PLACE },
  wall_window_closed:                { place: WALL_PLACE },
  wall_window_closed_curtains_red:   { place: WALL_PLACE },
  wall_window_closed_curtains_green: { place: WALL_PLACE },
  wall_orderwindow:                  { place: WALL_PLACE },
  wall_orderwindow_decorated:        { place: WALL_PLACE },
  // (door entries live below alongside the prototype block; see DOOR_MODELS)
  // --- prototype-bits walls: geometrically identical to the restaurant walls
  // (x[-2,2], thin in z), so the SAME WALL_PLACE offset aligns them, and the
  // place-offset makes them 1×1 (see footprint()) instead of auto-deriving 2×2.
  Wall:               { place: WALL_PLACE },
  Wall_Half:          { place: WALL_PLACE },
  Wall_Doorway:       { place: WALL_PLACE },
  Wall_Window_Open:   { place: WALL_PLACE },
  Wall_Window_Closed: { place: WALL_PLACE },
  Wall_Decorated:     { place: WALL_PLACE },
  Wall_Target:        { place: WALL_PLACE },
  // prototype doors — same wall-plane offset as the doorway so a door seats into
  // a Wall_Doorway (restaurant door_A/door_B already carry WALL_PLACE above).
  Door_A:             { place: WALL_PLACE },
  Door_B:             { place: WALL_PLACE },
  Door_A_Decorated:   { place: WALL_PLACE },
  // --- prototype-bits floors: laid flush (top at the surface, slab recessed),
  // harmonised with the restaurant floors. Footprint still auto-derives (Floor
  // is 4×4 units = 2×2 cells).
  Floor:            { ground: true },
  Floor_Dirt:       { ground: true },
  Floor_Prototype:  { ground: true },
  Primitive_Floor:  { ground: true },
};

// Door leaves snap into a placed doorway (same cell + matching rotation) when
// you hover near one. Both packs.
const DOOR_MODELS = new Set(['door_A', 'door_B', 'Door_A', 'Door_B', 'Door_A_Decorated']);
const DOORWAY_MODELS = new Set(['wall_doorway', 'Wall_Doorway']);

export class Editor {
  constructor(container) {
    this.container = container;

    // callbacks the UI assigns
    this.onChange = null;     // (state)        -> persist / mark dirty
    this.onStatus = null;     // (msg)          -> toast
    this.onSelect = null;     // (record|null)  -> selection panel
    this.onPlaceMode = null;  // (modelName|null)
    this.onTool = null;       // ('select'|'erase')
    this.onRotation = null;   // (quarterTurns 0..3)
    this.onGrid = null;       // (cols, rows)

    // `catalogId` is the DEFAULT pack for untagged objects (the first pack
    // loaded this session). A level can mix packs: each object carries its own
    // `pack` and only objects matching the default omit it on export.
    this.state = { catalogId: null, cols: 12, rows: 12, tile: TILE, objects: [] };
    this.packs = new Map();        // catalogId -> AssetPack (several can be loaded)
    this.pack = null;              // the ACTIVE pack (what new placements use)
    this.activeCatalogId = null;

    this.tool = 'select';     // 'select' | 'erase'
    this.placeModel = null;   // model name in place mode, or null
    this.rotation = 0;        // quarter turns for next placement
    this.selected = null;     // selected record
    this._idc = 0;

    this._raycaster = new THREE.Raycaster();
    this._ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._ndc = new THREE.Vector2();
    this._downXY = null;
    this._hoverPoint = null;     // world hit point under cursor
    this._hoverTarget = null;    // {col,row,w,d} block under cursor (place mode)
    this._cellTops = new Map();  // "c,r" -> current stack height

    this._initThree();
  }

  meta(name) { return Object.assign({ w: 1, d: 1, ground: false, place: null }, MODEL_META[name]); }
  isGround(name) { return !!this.meta(name).ground; }

  /** A model's cell footprint. `restaurant-bits` uses the hand-authored
   *  MODEL_META (so the editor stays in lockstep with the kitchen game's loader,
   *  which only treats the big floors as 2×2). Other packs have no frozen loader,
   *  so we DERIVE the footprint from the measured size — a piece ~4 world units
   *  wide (2 cells) snaps to a 2-cell block instead of overhanging one tile. */
  footprint(name, packId) {
    const explicit = MODEL_META[name];
    if (explicit && (explicit.w || explicit.d)) return { w: explicit.w || 1, d: explicit.d || 1 };
    // wall/door-kit pieces (those with a built-in `place` offset) are always 1×1
    // — the offset seats the wide mesh on one cell's edge — so don't auto-derive.
    if (explicit && explicit.place) return { w: 1, d: 1 };
    const pid = packId || this.activeCatalogId;
    const pk = this.packs.get(pid);
    if (pk && !LEGACY_FOOTPRINT_PACKS.has(pid) && pk.templates.has(name)) {
      const m = pk.measure(name);
      return { w: Math.max(1, Math.round(m.sizeX / TILE)), d: Math.max(1, Math.round(m.sizeZ / TILE)) };
    }
    return { w: 1, d: 1 };
  }

  /** Built-in placement offset for a model, rotated into world space by rot. */
  placeOffset(name, rot) {
    const pl = this.meta(name).place;
    if (!pl) return ZERO;
    const th = (rot || 0) * Math.PI / 2;
    const c = Math.cos(th), s = Math.sin(th);
    return { x: pl.x * c + pl.z * s, y: pl.y, z: -pl.x * s + pl.z * c };
  }

  // ---- setup ----
  _initThree() {
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 600;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x0d1426, 1);
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4a64, 1.15));
    const dir = new THREE.DirectionalLight(0xffffff, 1.05);
    dir.position.set(12, 22, 10);
    this.scene.add(dir);

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
    this.controls = new OrbitController(this.camera, this.renderer.domElement);
    this.controls.onClick = () => this._detach();   // right-click: detach from everything

    this.gridGroup = new THREE.Group();
    this.levelGroup = new THREE.Group();
    this.scene.add(this.gridGroup, this.levelGroup);

    // hover highlight (one cell; scaled to the footprint in place mode)
    const hl = new THREE.Mesh(
      new THREE.PlaneGeometry(TILE * 0.96, TILE * 0.96),
      new THREE.MeshBasicMaterial({ color: 0x2ee6c0, transparent: true, opacity: 0.22, side: THREE.DoubleSide }),
    );
    hl.rotation.x = -Math.PI / 2;
    hl.position.y = 0.02;
    hl.visible = false;
    this.highlight = hl;
    this.scene.add(hl);

    // selection outline
    this.selBox = new THREE.BoxHelper(new THREE.Object3D(), 0xffcf5e);
    this.selBox.visible = false;
    this.scene.add(this.selBox);

    this._buildGrid();
    this.controls.frame(this.state.cols, this.state.rows, TILE);

    // pointer (left button only; camera owns the others)
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', (e) => this._onDown(e));
    dom.addEventListener('pointermove', (e) => this._onMove(e));
    dom.addEventListener('pointerup', (e) => this._onUp(e));
    window.addEventListener('keydown', (e) => this._onKey(e));
    window.addEventListener('resize', () => this._resizeRenderer());
    this._ro = new ResizeObserver(() => this._resizeRenderer());
    this._ro.observe(this.container);

    this._render = this._render.bind(this);
    requestAnimationFrame(this._render);
  }

  _resizeRenderer() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _render() {
    if (this.selected && this.selected.node) this.selBox.update();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._render);
  }

  // ---- grid ----
  _buildGrid() {
    this.gridGroup.clear();
    const { cols, rows } = this.state;
    const w = cols * TILE, d = rows * TILE;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color: 0x141d33, roughness: 1, metalness: 0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    this.gridGroup.add(floor);

    const pts = [];
    const x0 = -w / 2, z0 = -d / 2;
    for (let c = 0; c <= cols; c++) { const x = x0 + c * TILE; pts.push(x, 0, z0, x, 0, z0 + d); }
    for (let r = 0; r <= rows; r++) { const z = z0 + r * TILE; pts.push(x0, 0, z, x0 + w, 0, z); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x2c3b5a }));
    lines.position.y = 0.001;
    this.gridGroup.add(lines);
  }

  /** World position of a (possibly fractional) cell centre. */
  worldFromCell(col, row) {
    return new THREE.Vector3(
      (col - (this.state.cols - 1) / 2) * TILE,
      0,
      (row - (this.state.rows - 1) / 2) * TILE,
    );
  }

  /** Nearest single cell to a world point, or null if outside the grid. */
  cellFromWorld(x, z) {
    const col = Math.round(x / TILE + (this.state.cols - 1) / 2);
    const row = Math.round(z / TILE + (this.state.rows - 1) / 2);
    if (col < 0 || col >= this.state.cols || row < 0 || row >= this.state.rows) return null;
    return { col, row };
  }

  /** Anchor (top-left cell) of a w×d block nearest a world point; null if it can't fit. */
  blockAnchor(x, z, w, d) {
    if (w > this.state.cols || d > this.state.rows) return null;
    const cx = x / TILE + (this.state.cols - 1) / 2;   // cursor in cell space
    const cz = z / TILE + (this.state.rows - 1) / 2;
    const col = Math.max(0, Math.min(this.state.cols - w, Math.round(cx - (w - 1) / 2)));
    const row = Math.max(0, Math.min(this.state.rows - d, Math.round(cz - (d - 1) / 2)));
    return { col, row };
  }

  /** Centre world position of a w×d block anchored at (col,row). */
  blockCenter(col, row, w, d) {
    return this.worldFromCell(col + (w - 1) / 2, row + (d - 1) / 2);
  }

  // ---- catalog ----
  /** Make `manifest`'s pack the ACTIVE one (what new placements use). Loads it
   *  once and keeps it alongside any other loaded packs — switching the active
   *  pack does NOT clear the level, so you can combine objects from several. */
  async setCatalog(manifest) {
    let pack = this.packs.get(manifest.id);
    if (!pack) { pack = new AssetPack(manifest); this.packs.set(manifest.id, pack); }
    this.pack = pack;
    this.activeCatalogId = manifest.id;
    if (!this.state.catalogId) this.state.catalogId = manifest.id;   // default for untagged objects
    this.clearPlaceMode();
    this.select(null);
  }

  /** The AssetPack a placed object renders from (its own pack, or the active). */
  _packFor(rec) { return this.packs.get(rec.pack) || this.pack; }

  /** Load (once) the AssetPack for a catalog id — used when importing a level
   *  that references packs not yet loaded. */
  async _ensurePack(catalogId) {
    if (this.packs.has(catalogId)) return this.packs.get(catalogId);
    const entry = CATALOGS.find((c) => c.id === catalogId);
    if (!entry) throw new Error('Unknown catalog: ' + catalogId);
    const manifest = await loadManifest(entry);
    const pack = new AssetPack(manifest);
    this.packs.set(catalogId, pack);
    return pack;
  }

  // ---- placement ----
  async selectModel(name) {
    if (!name) { this.clearPlaceMode(); return; }
    this.placeModel = name;
    this.tool = 'select';
    this.onTool && this.onTool('select');
    this.onPlaceMode && this.onPlaceMode(name);
    this.select(null);
    await this.pack.ensure(name);
    if (this.placeModel !== name) return;     // changed while loading
    if (this._ghost) { this.scene.remove(this._ghost); this._ghost = null; }
    this._ghost = this.pack.makeGhost(name);
    if (this._ghost) { this._ghost.visible = false; this.scene.add(this._ghost); }
    this._updateHover();
  }

  clearPlaceMode() {
    this.placeModel = null;
    if (this._ghost) { this.scene.remove(this._ghost); this._ghost = null; }
    this.onPlaceMode && this.onPlaceMode(null);
    this._updateHover();
  }

  setTool(tool) {
    this.tool = tool;
    if (tool === 'erase') this.clearPlaceMode();
    this.onTool && this.onTool(tool);
  }

  /** Right-click: drop place mode + selection and return to the Select tool. */
  _detach() {
    this.clearPlaceMode();
    this.select(null);
    this.setTool('select');
  }

  rotateStep() {
    if (this.placeModel) {
      this.rotation = (this.rotation + 1) % 4;
      this.onRotation && this.onRotation(this.rotation);
      this._updateGhost();
    } else if (this.selected) {
      this.selected.rot = (this.selected.rot + 1) % 4;
      this._applyRotation(this.selected);
      this._positionNode(this.selected);   // place offset rotates with the piece
      this.onRotation && this.onRotation(this.selected.rot);
      this.onSelect && this.onSelect(this.selected);   // refresh the panel's Y value
      this._changed();
    }
  }

  _covers(o, c, r) {
    const w = o.w || 1, d = o.d || 1;
    return c >= o.col && c < o.col + w && r >= o.row && r < o.row + d;
  }

  /** Re-derive every object's stack height (insertion order) + cell tops. */
  _restackAll() {
    const tops = new Map();
    const key = (c, r) => c + ',' + r;
    for (const o of this.state.objects) {
      const m = this._packFor(o).measure(o.model);
      const ground = this.isGround(o.model);
      const w = o.w || 1, d = o.d || 1;
      let base = 0;
      for (let cc = o.col; cc < o.col + w; cc++)
        for (let rr = o.row; rr < o.row + d; rr++)
          base = Math.max(base, tops.get(key(cc, rr)) || 0);
      o.y = base;
      // ground tiles lie flush (origin = surface, slab recessed); others rest
      // their measured bottom on the surface. Manual offsets are cosmetic and
      // do NOT change the stack a cell contributes.
      this._positionNode(o);
      const top = base + (ground ? 0 : m.height);
      for (let cc = o.col; cc < o.col + w; cc++)
        for (let rr = o.row; rr < o.row + d; rr++)
          tops.set(key(cc, rr), top);
    }
    this._cellTops = tops;
  }

  /** Stack base a new w×d block would rest on at (col,row). */
  _blockBase(col, row, w, d) {
    let base = 0;
    for (let cc = col; cc < col + w; cc++)
      for (let rr = row; rr < row + d; rr++)
        base = Math.max(base, this._cellTops.get(cc + ',' + rr) || 0);
    return base;
  }

  /** Place a record's node at its grid/stack position plus its manual offset. */
  _positionNode(rec) {
    const node = rec.node;
    if (!node) return;
    const m = this._packFor(rec).measure(rec.model);
    const p = this.blockCenter(rec.col, rec.row, rec.w || 1, rec.d || 1);
    // ground pieces sit with their TOP at the surface (slab recessed below) —
    // `- maxY` harmonises floors whose origin is at the bottom (prototype) with
    // those whose origin is at the top (restaurant, maxY = 0 ⇒ unchanged).
    const y = this.isGround(rec.model) ? rec.y - (m.minY + m.height) : rec.y - m.minY;
    const pl = this.placeOffset(rec.model, rec.rot);   // intrinsic, rotates with piece
    const o = rec.off || ZERO;                          // user's manual nudge (world)
    node.position.set(p.x + pl.x + o.x, y + pl.y + o.y, p.z + pl.z + o.z);
  }

  _addNode(rec) {
    const node = this._packFor(rec).instance(rec.model);
    if (!node) return;     // template not loaded for this object's pack
    node.userData.objId = rec.id;
    node.traverse((o) => { o.userData.objId = rec.id; });
    rec.node = node;
    this.levelGroup.add(node);
    this._applyRotation(rec);
    this._positionNode(rec);
  }

  /** All three rotations: Y from `rot` quarter-turns (R key), X/Z free degrees.
   *  Order 'YXZ' keeps the Y/R rotation a world-up turntable even when tilted. */
  _applyRotation(rec) {
    if (!rec.node) return;
    rec.node.rotation.set(
      (rec.rotX || 0) * Math.PI / 180,
      (rec.rot || 0) * Math.PI / 2,
      (rec.rotZ || 0) * Math.PI / 180,
      'YXZ',
    );
  }

  _place() {
    const name = this.placeModel;
    if (!name || !this._hoverTarget) return;
    const t = this._hoverTarget;                                  // snapped to a doorway if applicable
    const rot = (this._snapRot != null) ? this._snapRot : this.rotation;
    const rec = { id: ++this._idc, model: name, pack: this.activeCatalogId, col: t.col, row: t.row, rot, rotX: 0, rotZ: 0, w: t.w, d: t.d, y: 0, off: { x: 0, y: 0, z: 0 } };
    this.state.objects.push(rec);
    this._addNode(rec);
    this._restackAll();
    this._updateHover();
    this._changed();
  }

  _removeRecord(rec) {
    if (rec.node) this.levelGroup.remove(rec.node);
    const i = this.state.objects.indexOf(rec);
    if (i >= 0) this.state.objects.splice(i, 1);
    if (this.selected === rec) this.select(null);
    this._restackAll();
    this._changed();
  }

  /** Remove the topmost object covering a cell. */
  _removeTop(col, row) {
    const covering = this.state.objects.filter((o) => this._covers(o, col, row));
    if (!covering.length) return;
    covering.sort((a, b) => (a.y - b.y) || (this.state.objects.indexOf(a) - this.state.objects.indexOf(b)));
    this._removeRecord(covering[covering.length - 1]);
  }

  deleteSelected() {
    if (this.selected) this._removeRecord(this.selected);
  }

  // ---- per-object offset (manual nudge, world units) ----
  setOffset(rec, axis, value) {
    if (!rec || !(axis in { x: 0, y: 0, z: 0 })) return;
    if (!rec.off) rec.off = { x: 0, y: 0, z: 0 };
    rec.off[axis] = Math.round((value || 0) * 1000) / 1000;
    this._positionNode(rec);
    this._changed();
  }

  nudgeOffset(rec, axis, delta) {
    this.setOffset(rec, axis, ((rec.off && rec.off[axis]) || 0) + delta);
  }

  resetOffset(rec) {
    if (!rec) return;
    rec.off = { x: 0, y: 0, z: 0 };
    this._positionNode(rec);
    this._changed();
  }

  // ---- per-object rotation (Y = quarter-turns / R key; X,Z = free degrees) ----
  setRotation(rec, axis, deg) {
    if (!rec) return;
    deg = +deg || 0;
    if (axis === 'y') rec.rot = ((Math.round(deg / 90) % 4) + 4) % 4;
    else if (axis === 'x') rec.rotX = ((Math.round(deg) % 360) + 360) % 360;
    else if (axis === 'z') rec.rotZ = ((Math.round(deg) % 360) + 360) % 360;
    else return;
    this._applyRotation(rec);
    this._positionNode(rec);   // wall place-offset depends on the Y rotation
    this._changed();
  }

  nudgeRotation(rec, axis, deltaDeg) {
    const cur = axis === 'y' ? rec.rot * 90 : (axis === 'x' ? (rec.rotX || 0) : (rec.rotZ || 0));
    this.setRotation(rec, axis, cur + deltaDeg);
  }

  resetRotation(rec) {
    if (!rec) return;
    rec.rot = 0; rec.rotX = 0; rec.rotZ = 0;
    this._applyRotation(rec);
    this._positionNode(rec);
    this._changed();
  }

  // ---- selection ----
  select(rec) {
    this.selected = rec || null;
    if (this.selected && this.selected.node) {
      this.selBox.setFromObject(this.selected.node);
      this.selBox.visible = true;
    } else {
      this.selBox.visible = false;
    }
    this.onSelect && this.onSelect(this.selected);
  }

  // ---- pointer ----
  _setNdc(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this._ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    this._ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }

  _raycastPoint() {
    this._raycaster.setFromCamera(this._ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this._raycaster.ray.intersectPlane(this._ground, hit)) return null;
    return hit;
  }

  _pickObject() {
    this._raycaster.setFromCamera(this._ndc, this.camera);
    const hits = this._raycaster.intersectObjects(this.levelGroup.children, true);
    if (!hits.length) return null;
    let o = hits[0].object;
    while (o && o.userData.objId === undefined) o = o.parent;
    if (!o) return null;
    return this.state.objects.find((r) => r.id === o.userData.objId) || null;
  }

  _onDown(e) {
    if (e.button !== 0) return;
    this._downXY = { x: e.clientX, y: e.clientY };
  }

  _onMove(e) {
    this._setNdc(e);
    this._hoverPoint = this._raycastPoint();
    this._updateHover();
  }

  _onUp(e) {
    if (e.button !== 0 || !this._downXY) return;
    const moved = Math.hypot(e.clientX - this._downXY.x, e.clientY - this._downXY.y);
    this._downXY = null;
    if (moved > 5) return;       // a drag, not a click
    this._setNdc(e);
    this._hoverPoint = this._raycastPoint();
    this._updateHover();         // refresh target + door snap for the exact click point
    this._handleClick();
  }

  _handleClick() {
    if (this.tool === 'erase') {
      const rec = this._pickObject();
      if (rec) { this._removeRecord(rec); return; }
      const cell = this._hoverPoint && this.cellFromWorld(this._hoverPoint.x, this._hoverPoint.z);
      if (cell) this._removeTop(cell.col, cell.row);
      return;
    }
    if (this.placeModel) { this._place(); return; }
    this.select(this._pickObject());
  }

  /** Nearest placed doorway within ~1 cell of a world point (for door snapping). */
  _nearestDoorway(point) {
    let best = null, bestD = 2.0;
    for (const o of this.state.objects) {
      if (!DOORWAY_MODELS.has(o.model)) continue;
      const c = this.blockCenter(o.col, o.row, o.w || 1, o.d || 1);
      const d = Math.hypot(point.x - c.x, point.z - c.z);
      if (d < bestD) { bestD = d; best = o; }
    }
    return best;
  }

  _updateHover() {
    const fp = this.placeModel ? this.footprint(this.placeModel, this.activeCatalogId) : { w: 1, d: 1 };
    let target = null;
    this._snapRot = null;
    if (this._hoverPoint) {
      // a door being placed snaps into a nearby doorway: its cell + rotation
      if (this.placeModel && DOOR_MODELS.has(this.placeModel)) {
        const dw = this._nearestDoorway(this._hoverPoint);
        if (dw) { target = { col: dw.col, row: dw.row, w: 1, d: 1 }; this._snapRot = dw.rot; }
      }
      if (!target) {
        const a = this.blockAnchor(this._hoverPoint.x, this._hoverPoint.z, fp.w, fp.d);
        if (a) target = { col: a.col, row: a.row, w: fp.w, d: fp.d };
      }
    }
    this._hoverTarget = target;

    if (target) {
      const p = this.blockCenter(target.col, target.row, target.w, target.d);
      this.highlight.position.set(p.x, 0.02, p.z);
      this.highlight.scale.set(target.w, target.d, 1);
      this.highlight.visible = true;
    } else {
      this.highlight.visible = false;
    }
    this._updateGhost();
  }

  _updateGhost() {
    if (!this._ghost || !this.placeModel || !this._hoverTarget) {
      if (this._ghost) this._ghost.visible = false;
      return;
    }
    const t = this._hoverTarget;
    const m = this.pack.measure(this.placeModel);
    const base = this._blockBase(t.col, t.row, t.w, t.d);
    const p = this.blockCenter(t.col, t.row, t.w, t.d);
    const yb = this.isGround(this.placeModel) ? base - (m.minY + m.height) : base - m.minY;
    const rot = (this._snapRot != null) ? this._snapRot : this.rotation;   // door snaps to doorway rotation
    const pl = this.placeOffset(this.placeModel, rot);
    this._ghost.position.set(p.x + pl.x, yb + pl.y, p.z + pl.z);
    this._ghost.rotation.y = rot * Math.PI / 2;
    this._ghost.visible = true;
  }

  _onKey(e) {
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === 'r' || e.key === 'R') { this.rotateStep(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.deleteSelected(); }
    else if (e.key === 'Escape') { this.clearPlaceMode(); this.select(null); }
    else if (e.key === 'v' || e.key === 'V') { this.setTool('select'); }
    else if (e.key === 'x' || e.key === 'X') { this.setTool('erase'); }
  }

  // ---- grid ops ----
  resize(cols, rows) {
    cols = Math.max(1, Math.min(60, cols | 0));
    rows = Math.max(1, Math.min(60, rows | 0));
    const fits = (o) => (o.col + (o.w || 1) <= cols) && (o.row + (o.d || 1) <= rows);
    const dropped = this.state.objects.filter((o) => !fits(o));
    for (const o of dropped) if (o.node) this.levelGroup.remove(o.node);
    this.state.objects = this.state.objects.filter(fits);
    if (this.selected && dropped.includes(this.selected)) this.select(null);

    this.state.cols = cols; this.state.rows = rows;
    this._buildGrid();
    this._restackAll();   // repositions every node (centre shifted)
    this.controls.frame(cols, rows, TILE);
    this.onGrid && this.onGrid(cols, rows);
    this._changed();
  }

  /** Add or remove ONE row/column on a given side — north | south | east | west.
   *  `add` true grows that edge, false trims it (dropping objects on the removed
   *  edge). Existing content keeps its place: for the north/west edges every
   *  object's col/row is shifted, and the camera is panned by the same world
   *  amount so the level stays visually anchored (the view doesn't reset). This
   *  is what lets the grid grow/shrink in all four directions, not just S/E. */
  growGrid(side, add) {
    const d = add ? 1 : -1;
    const isRow = (side === 'north' || side === 'south');
    const shift = (side === 'north' || side === 'west') ? d : 0;   // index shift for the NW edges
    const newCols = this.state.cols + (isRow ? 0 : d);
    const newRows = this.state.rows + (isRow ? d : 0);
    if (newCols < 1 || newRows < 1 || newCols > 60 || newRows > 60) {
      this.onStatus && this.onStatus(add ? 'Grid at max (60)' : 'Grid at min (1)');
      return;
    }
    if (shift) for (const o of this.state.objects) { if (isRow) o.row += shift; else o.col += shift; }
    this.state.cols = newCols; this.state.rows = newRows;

    const fits = (o) => o.col >= 0 && o.row >= 0 && (o.col + (o.w || 1) <= newCols) && (o.row + (o.d || 1) <= newRows);
    const dropped = this.state.objects.filter((o) => !fits(o));
    for (const o of dropped) if (o.node) this.levelGroup.remove(o.node);
    this.state.objects = this.state.objects.filter(fits);
    if (this.selected && dropped.includes(this.selected)) this.select(null);

    this._buildGrid();
    this._restackAll();
    // pan the camera by the same world shift the content underwent, so the level
    // stays put on screen and the camera angle/zoom are preserved.
    const worldShift = (shift - d / 2) * TILE;
    if (isRow) this.controls.target.z += worldShift; else this.controls.target.x += worldShift;
    this.controls.update();

    this.onGrid && this.onGrid(newCols, newRows);
    if (dropped.length) this.onStatus && this.onStatus(`Trimmed ${dropped.length} object${dropped.length === 1 ? '' : 's'} on the ${side} edge`);
    this._changed();
  }

  resetView() { this.controls.frame(this.state.cols, this.state.rows, TILE); }

  _clearObjects() {
    for (const o of this.state.objects) if (o.node) this.levelGroup.remove(o.node);
    this.state.objects = [];
    this._cellTops = new Map();
    this.select(null);
  }

  newLevel() {
    this._clearObjects();
    this.clearPlaceMode();
    this.state.catalogId = this.activeCatalogId;   // fresh level defaults to the active pack
    this._changed();
  }

  // ---- IO ----
  getState() {
    return {
      format: 'krabsy-level',
      version: 1,
      catalog: this.state.catalogId,
      grid: { cols: this.state.cols, rows: this.state.rows, tile: TILE },
      objects: this.state.objects.map((o) => {
        const r = { model: o.model, col: o.col, row: o.row, rot: o.rot };
        // tag the source pack only when it differs from the level default,
        // so single-pack levels (e.g. the kitchen's) stay byte-identical
        if (o.pack && o.pack !== this.state.catalogId) r.pack = o.pack;
        if (o.rotX) r.rotX = o.rotX;
        if (o.rotZ) r.rotZ = o.rotZ;
        if (o.off && (o.off.x || o.off.y || o.off.z)) r.off = { x: o.off.x, y: o.off.y, z: o.off.z };
        return r;
      }),
    };
  }

  async loadState(data) {
    if (!data || !data.grid || !Array.isArray(data.objects)) throw new Error('Not a valid level file');
    this._clearObjects();
    this.clearPlaceMode();
    this.state.cols = data.grid.cols || 12;
    this.state.rows = data.grid.rows || 12;
    this._buildGrid();

    // the level's default pack + every per-object pack it references
    const defaultCat = data.catalog || this.activeCatalogId || (CATALOGS[0] && CATALOGS[0].id);
    const packIds = [...new Set([defaultCat, ...data.objects.map((o) => o.pack).filter(Boolean)])];
    const loaded = new Map();
    for (const id of packIds) {
      try { loaded.set(id, await this._ensurePack(id)); } catch (e) { console.warn('[world-designer]', e.message); }
    }
    if (loaded.has(defaultCat)) { this.state.catalogId = defaultCat; this.pack = loaded.get(defaultCat); this.activeCatalogId = defaultCat; }

    // load each referenced model from its OWN pack
    const wanted = {};   // packId -> Set(model)
    for (const o of data.objects) {
      const pid = o.pack || defaultCat;
      (wanted[pid] = wanted[pid] || new Set()).add(o.model);
    }
    await Promise.all(Object.entries(wanted).flatMap(([pid, set]) => {
      const pk = loaded.get(pid); if (!pk) return [];
      return [...set].map((n) => pk.ensure(n).catch(() => null));
    }));

    for (const o of data.objects) {
      if (typeof o.col !== 'number' || typeof o.row !== 'number') continue;
      const pid = o.pack || defaultCat;
      const pk = loaded.get(pid);
      if (!pk || !pk.templates.has(o.model)) continue;   // skip unknown / unloadable models
      const fp = this.footprint(o.model, pid);
      const off = (o.off && typeof o.off === 'object')
        ? { x: +o.off.x || 0, y: +o.off.y || 0, z: +o.off.z || 0 }
        : { x: 0, y: 0, z: 0 };
      const rec = { id: ++this._idc, model: o.model, pack: pid, col: o.col, row: o.row, rot: o.rot || 0,
        rotX: +o.rotX || 0, rotZ: +o.rotZ || 0, w: fp.w, d: fp.d, y: 0, off };
      this.state.objects.push(rec);
      this._addNode(rec);
    }
    this._restackAll();
    this.controls.frame(this.state.cols, this.state.rows, TILE);
    this.onGrid && this.onGrid(this.state.cols, this.state.rows);
    this._changed();
  }

  _changed() { this.onChange && this.onChange(this.getState()); }
}
