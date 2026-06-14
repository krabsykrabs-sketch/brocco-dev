// Builds the 3D kitchen for a level: floors, walls, counters, stations.
// Static geometry merges into one draw call; stations keep live holders.
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { TILE, getModel, mergeStatic, measureModel } from './models.js';
import { Station, makeRingSprite } from './stations.js';
import { CRATE_MODELS } from './levels.js';

export class World {
  constructor(level) {
    this.level = level;
    this.group = new THREE.Group();
    this.stations = [];
    this.stationAt = new Map();        // "col,row" → station
    this.spawn = new THREE.Vector3();
    this.walk = [];                    // [row][col] true = walkable
    this.startItems = level.startItems || [];   // applied by game.startLevel
    if (level.scene) {                 // editor JSON level (see jsonlevel.js)
      this.buildFromJSON(level.scene);
    } else {
      this.rows = level.map.length;
      this.cols = level.map[0].length;
      this.offX = (this.cols - 1) / 2; // grid→world offset (tiles)
      this.offZ = (this.rows - 1) / 2;
      this.build();
    }
  }

  tileWorld(col, row) {
    return new THREE.Vector3((col - this.offX) * TILE, 0, (row - this.offZ) * TILE);
  }

  build() {
    const lv = this.level;
    const sB = lv.style === 'B' ? '_styleB' : '';
    const staticG = new THREE.Group();

    // --- floor: 4×4 KayKit tiles laid every 2 grid tiles. On odd-sized levels
    // the last tile would overhang the kitchen rectangle (e.g. Garden Bistro is
    // 7×5), so clip edge tiles to the grid bounds — scale to the in-bounds span
    // and recentre, so no floor pokes out past the counters. ---
    for (let r = 0; r < this.rows; r += 2) {
      for (let c = 0; c < this.cols; c += 2) {
        const hiC = Math.min(c + 1, this.cols - 1), hiR = Math.min(r + 1, this.rows - 1);
        const spanC = hiC - c + 1, spanR = hiR - r + 1;   // 1 (clipped) or 2 (full)
        const f = getModel('floor_kitchen' + sB);
        const p = this.tileWorld((c + hiC) / 2, (r + hiR) / 2);
        f.position.set(p.x, 0, p.z);
        f.scale.set(spanC / 2, 1, spanR / 2);
        staticG.add(f);
      }
    }

    // --- parse map ---
    // plain counters only — decorated variants carry prop knives/boards that
    // read as fake stations and camouflage the real cutting boards
    const counterModelFor = (c, r) => 'kitchencounter_straight_' + ((c + r) % 2 ? 'A' : 'B') + sB;

    for (let r = 0; r < this.rows; r++) {
      this.walk[r] = [];
      for (let c = 0; c < this.cols; c++) {
        const ch = lv.map[r][c];
        const p = this.tileWorld(c, r);
        this.walk[r][c] = (ch === '.' || ch === 'P');
        if (ch === 'P') this.spawn.copy(p);
        if (ch === '.' || ch === 'P') continue;

        let st = null;
        const facing = this.facingFor(c, r);   // rotate station toward floor

        if (ch === 'C' || ch === 'H') {
          const m = getModel(ch === 'H' ? 'kitchencounter_straight_A' + sB : counterModelFor(c, r));
          m.position.copy(p); m.rotation.y = facing;
          staticG.add(m);
          st = new Station(ch === 'H' ? 'hatch' : 'counter', c, r, p, 1.02);
        } else if (ch >= '1' && ch <= '9') {
          const ing = lv.crates[ch];
          const m = getModel(CRATE_MODELS[ing] || 'crate');
          m.position.copy(p); m.rotation.y = facing;
          staticG.add(m);
          st = new Station('crate', c, r, p, 1.05);
          st.crateItem = ing;
        } else if (ch === 'b' || ch === 'd') {
          // b = cutting board (knife), d = dough-rolling station (rolling pin)
          const counter = getModel(counterModelFor(c, r));
          counter.position.copy(p); counter.rotation.y = facing;
          const board = getModel('cuttingboard');
          board.position.set(p.x, 1.02, p.z); board.rotation.y = facing;
          // tools rest ON the board (top = 1.17): knife lies flat,
          // rolling pin sits on its rollers (radius 0.215)
          const tool = getModel(ch === 'd' ? 'rollingpin' : 'knife');
          if (ch === 'd') {
            tool.position.set(p.x, 1.39, p.z - 0.3);
            tool.rotation.y = facing + 0.35;
          } else {
            tool.rotation.set(Math.PI / 2, facing + 0.6, 0);
            tool.position.set(p.x + 0.5, 1.23, p.z - 0.25);
          }
          staticG.add(counter, board);   // counter+board merge; the tool stays LIVE
          st = new Station('board', c, r, p, 1.13);
          st.tool = ch === 'd' ? 'rollingpin' : 'knife';
          // keep the resting knife / rolling pin as a separate (un-merged) mesh
          // so it can be hidden while the chef is holding it → reads as the same
          // tool moving from the board into the hand and back (toggled in game.js)
          st.toolMesh = tool;
        } else if (ch === 's') {
          const counter = getModel('kitchencounter_straight_B' + sB);
          counter.position.copy(p); counter.rotation.y = facing;
          const stove = getModel('stove_single_countertop');
          stove.position.set(p.x, 0.07, p.z); stove.rotation.y = facing;
          const pan = getModel('pan_A');
          pan.position.set(p.x, 1.22, p.z); pan.rotation.y = facing + Math.PI * 0.35;
          staticG.add(counter, stove, pan);
          st = new Station('stove', c, r, p, 1.28);
        } else if (ch === 'o') {
          const oven = getModel(lv.id === 'pizzeria' ? 'pizza_oven' : 'oven');
          oven.position.copy(p); oven.rotation.y = facing;
          staticG.add(oven);
          st = new Station('oven', c, r, p, 1.0);
        } else if (ch === 'k') {
          const sink = getModel('kitchencounter_sink' + sB);
          sink.position.copy(p); sink.rotation.y = facing;
          staticG.add(sink);
          st = new Station('sink', c, r, p, 1.02);
        } else if (ch === 'r') {
          const counter = getModel(counterModelFor(c, r));
          counter.position.copy(p); counter.rotation.y = facing;
          const rack = getModel('dishrack');
          rack.position.set(p.x, 1.02, p.z); rack.rotation.y = facing + Math.PI / 2;
          staticG.add(counter, rack);
          st = new Station('rack', c, r, p, 1.12);
        } else if (ch === 't') {
          const bin = getModel('crate', '#4a5366');
          bin.position.copy(p); bin.scale.setScalar(0.92);
          staticG.add(bin);
          st = new Station('trash', c, r, p, 1.0);
        }

        if (st) {
          st.rot = facing;
          this.stations.push(st);
          this.stationAt.set(c + ',' + r, st);
        }
      }
    }

    // --- back wall row (behind row 0): the order window sits EXACTLY over the
    // two hatch tiles, so both serving counters are clearly under it. Wall
    // pieces are 2 tiles wide, so we anchor the whole row's grid to the hatch
    // centre (hatchMid) and tile outward — no gaps, window perfectly aligned. ---
    const wallZ = this.tileWorld(0, -0.5).z - 0.35;
    const hatchCols = [];
    for (let c = 0; c < this.cols; c++) if (lv.map[0][c] === 'H') hatchCols.push(c);
    const windowDecor = ['wall_tiles_A', 'wall', 'wall_tiles_B', 'wall_window_closed_curtains_' + (sB ? 'green' : 'red')];
    const hatchMid = hatchCols.length ? (hatchCols[0] + hatchCols[hatchCols.length - 1]) / 2 : 0.5;
    const centers = [];
    for (let cc = hatchMid; cc > -1; cc -= 2) centers.unshift(cc);   // left of (and incl.) the hatch
    for (let cc = hatchMid + 2; cc < this.cols; cc += 2) centers.push(cc);
    let di = 0;
    for (const center of centers) {
      // drop a 2-wide back-wall piece that would overhang the kitchen's right
      // edge (the odd-offset window decor on Burger Bar / Pizzeria) — keeps the
      // level rectangular and a touch narrower
      if (center > this.cols - 1.5) continue;
      const isHatch = Math.abs(center - hatchMid) < 0.01;
      const name = isHatch ? 'wall_orderwindow' : windowDecor[di++ % windowDecor.length];
      const w = getModel(name);
      const p = this.tileWorld(center, 0);
      w.position.set(p.x, 0, wallZ);
      staticG.add(w);
    }
    // side stub walls (half height) for depth
    for (const side of [-1, 1]) {
      const c = side < 0 ? -0.5 : this.cols - 0.5;
      for (let r = 0; r < Math.min(2, this.rows); r += 2) {
        const w = getModel('wall_half');
        const p = this.tileWorld(c, r + 0.5);
        w.position.set(p.x + side * 0.35 * 0, 0, p.z);
        w.rotation.y = Math.PI / 2;
        w.position.x = this.tileWorld(c, 0).x + side * 0.35;
        staticG.add(w);
      }
    }

    // --- decor: extractor hood over stoves/ovens, fridge near crates ---
    for (const st of this.stations) {
      if (st.type === 'stove' && st.row === 0) {
        const hood = getModel('extractorhood');
        hood.position.set(st.pos.x, 2.6, st.pos.z);
        staticG.add(hood);
      }
    }

    this._finishStatic(staticG);
  }

  /** Merge static geometry → one draw call, then add live holders, station
   *  rings, resting board tools, and the tile-highlight marker. Shared by the
   *  ASCII (build) and editor-JSON (buildFromJSON) paths. */
  _finishStatic(staticG) {
    const merged = mergeStatic(staticG, BufferGeometryUtils);
    this.group.add(merged);

    for (const st of this.stations) {
      this.group.add(st.holder);
      if (st.toolMesh) this.group.add(st.toolMesh);   // resting board tool (hidden while chopping)
      if (st.type === 'stove' || st.type === 'oven' || st.type === 'board') {
        st.ring = makeRingSprite();
        st.ring.position.set(st.pos.x, st.topY + 1.5, st.pos.z);
        this.group.add(st.ring);
      }
    }

    const hl = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.78, 4),
      new THREE.MeshBasicMaterial({ color: 0x2ee6c0, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    hl.rotation.x = -Math.PI / 2;
    hl.rotation.z = Math.PI / 4;
    hl.scale.setScalar(TILE * 0.62);
    hl.position.y = 0.06;
    hl.visible = false;
    this.highlight = hl;
    this.group.add(hl);
  }

  /** Build the kitchen from an editor JSON scene (assets/JSON Levels +
   *  LEVEL-FORMAT.md). Reconstructs the exact visual layout, then infers the
   *  gameplay stations from the placed model names. */
  buildFromJSON(scene) {
    const T = scene.grid.tile, jcols = scene.grid.cols, jrows = scene.grid.rows;
    const FOOTPRINT = { floor_kitchen: [2, 2], floor_kitchen_styleB: [2, 2] };
    const GROUND = new Set(['floor_kitchen', 'floor_kitchen_styleB', 'floor_kitchen_small',
      'floor_kitchen_small_styleB', 'tile_white', 'tile_black', 'tile_brown_light', 'tile_brown_dark']);
    const WALL_PLACE = { x: -1, y: 0, z: -0.5 };
    const WALL = new Set(['door_A', 'door_B', 'wall', 'wall_doorway', 'wall_half', 'wall_decorated',
      'wall_decorated_styleB', 'wall_window_open', 'wall_window_closed', 'wall_window_closed_curtains_red',
      'wall_window_closed_curtains_green', 'wall_orderwindow', 'wall_orderwindow_decorated']);
    const fp = (m) => FOOTPRINT[m] || [1, 1];
    const jcell = (c, r) => ({ x: (c - (jcols - 1) / 2) * T, z: (r - (jrows - 1) / 2) * T });
    const rotY = (v, q) => { const t = q * Math.PI / 2, c = Math.cos(t), s = Math.sin(t);
      return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c }; };
    const isCounter = (m) => m.startsWith('kitchencounter_');
    // counters' WORK-SURFACE height (where boards / racks / items sit). Backsplash
    // variants measure taller (the splash rises ~0.2 above the surface), so stack
    // things on the surface — not the bbox top — matching the ASCII levels.
    const COUNTER_SURFACE = 1.02;

    // optional whole-level rotation: the editor's "front" need not match the
    // game's fixed camera. Rotate the cell coords (180° supported) so the visual
    // reconstruction AND the inferred gameplay all land in the same frame.
    let objs = scene.objects, spawnCell = this.level.spawn;
    if (this.level.rotate === 2) {
      const C = jcols, R = jrows;
      objs = scene.objects.map((o) => {
        const [w, d] = fp(o.model);
        return { ...o, col: C - o.col - w, row: R - o.row - d, rot: (o.rot + 2) % 4,
          off: o.off ? { x: -o.off.x, y: o.off.y, z: -o.off.z } : undefined };
      });
      if (spawnCell) spawnCell = { col: C - 1 - spawnCell.col, row: R - 1 - spawnCell.row };
    }

    // pass 1 — stack heights (array order matters)
    const tops = new Map();
    for (const o of objs) {
      const [w, d] = fp(o.model); let base = 0;
      for (let c = o.col; c < o.col + w; c++) for (let r = o.row; r < o.row + d; r++)
        base = Math.max(base, tops.get(c + ',' + r) || 0);
      o._y = base;
      const top = base + (GROUND.has(o.model) ? 0 : isCounter(o.model) ? COUNTER_SURFACE : measureModel(o.model).height);
      for (let c = o.col; c < o.col + w; c++) for (let r = o.row; r < o.row + d; r++) tops.set(c + ',' + r, top);
    }
    // pass 2 — world positions (JSON frame, centred on the 12×12 grid)
    for (const o of objs) {
      const [w, d] = fp(o.model);
      const ctr = jcell(o.col + (w - 1) / 2, o.row + (d - 1) / 2);
      const yB = GROUND.has(o.model) ? o._y : o._y - measureModel(o.model).minY;
      const pl = WALL.has(o.model) ? rotY(WALL_PLACE, o.rot) : { x: 0, y: 0, z: 0 };
      const off = o.off || { x: 0, y: 0, z: 0 };
      o._pos = { x: ctr.x + pl.x + off.x, y: yB + pl.y + off.y, z: ctr.z + pl.z + off.z };
    }

    // --- recentre on the floor footprint so the kitchen sits at the origin
    //     (the editor places it off-centre in the larger grid) ---
    let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
    for (const o of objs) {
      if (!GROUND.has(o.model)) continue;
      const [w, d] = fp(o.model);
      minC = Math.min(minC, o.col); maxC = Math.max(maxC, o.col + w - 1);
      minR = Math.min(minR, o.row); maxR = Math.max(maxR, o.row + d - 1);
    }
    if (!isFinite(minC)) { minC = 0; maxC = jcols - 1; minR = 0; maxR = jrows - 1; }
    const kc = jcell((minC + maxC) / 2, (minR + maxR) / 2);
    for (const o of objs) { o._pos.x -= kc.x; o._pos.z -= kc.z; }

    this.cols = maxC - minC + 1;
    this.rows = maxR - minR + 1;
    this.offX = (this.cols - 1) / 2;     // local 0-based grid, centred at origin
    this.offZ = (this.rows - 1) / 2;
    const toLocal = (c, r) => ({ c: c - minC, r: r - minR });

    // --- classify station tiles, collect floor tiles / start items / hatch anchor ---
    const PRI = { counter: 0, sink: 1, oven: 1, board: 1, rack: 1, crate: 1 };
    const typeOf = (m) => {
      if (m.startsWith('kitchencounter_sink')) return 'sink';
      if (m === 'pizza_oven' || m === 'oven') return 'oven';
      if (m === 'cuttingboard') return 'board';
      if (m === 'dishrack') return 'rack';
      if (m.startsWith('crate_')) return 'crate';
      if (m.startsWith('kitchencounter_')) return 'counter';
      return null;
    };
    const CRATE_ITEM = {}; for (const k in CRATE_MODELS) CRATE_ITEM[CRATE_MODELS[k]] = k;
    const floorTiles = new Set();
    const tileStation = new Map();        // local "c,r" → { type, item }
    const startItems = [];
    let orderWindow = null;
    for (const o of objs) {
      if (GROUND.has(o.model)) {
        const [w, d] = fp(o.model);
        for (let c = 0; c < w; c++) for (let r = 0; r < d; r++) {
          const l = toLocal(o.col + c, o.row + r); floorTiles.add(l.c + ',' + l.r);
        }
        continue;
      }
      if (o.model === 'wall_orderwindow' || o.model === 'wall_orderwindow_decorated') orderWindow = o;
      if (o.model === 'ketchup') { const l = toLocal(o.col, o.row); startItems.push({ c: l.c, r: l.r, item: 'ketchup' }); continue; }
      const t = typeOf(o.model);
      if (!t) continue;
      const l = toLocal(o.col, o.row), key = l.c + ',' + l.r, cur = tileStation.get(key);
      if (!cur || PRI[t] > PRI[cur.type]) tileStation.set(key, { type: t, item: t === 'crate' ? CRATE_ITEM[o.model] : null });
    }

    // --- walkable = floor tile with no station on it ---
    for (let r = 0; r < this.rows; r++) { this.walk[r] = []; for (let c = 0; c < this.cols; c++)
      this.walk[r][c] = floorTiles.has(c + ',' + r) && !tileStation.has(c + ',' + r); }

    // --- place every model (faithful visual). ketchup is a pickable start item;
    //     the board knife is added live below so it can hide while chopping. ---
    const staticG = new THREE.Group();
    for (const o of objs) {
      if (o.model === 'ketchup') continue;
      const mdl = getModel(o.model);
      mdl.position.set(o._pos.x, o._pos.y, o._pos.z);
      mdl.rotation.y = o.rot * Math.PI / 2;
      staticG.add(mdl);
    }

    // --- stations from the classified tiles ---
    const TOP_Y = { counter: 1.02, hatch: 1.02, crate: 1.05, board: 1.13, oven: 1.0, sink: 1.02, rack: 1.12 };
    for (const [key, info] of tileStation) {
      const [lc, lr] = key.split(',').map(Number);
      const pos = this.tileWorld(lc, lr);
      const facing = this.faceToFloor(lc, lr);
      const st = new Station(info.type, lc, lr, pos, TOP_Y[info.type] ?? 1.02);
      st.rot = facing;
      if (info.type === 'crate') st.crateItem = info.item;
      if (info.type === 'board') {
        st.tool = 'knife';
        const knife = getModel('knife');
        // place the knife exactly like the ASCII levels do, relative to the
        // board: there it's world offset (+0.5, -0.25) for boards facing PI,
        // i.e. board-local (-0.5, 0.25) — rotate that local offset by this
        // board's facing so it lands the same way at any orientation.
        const ox = -0.5, oz = 0.25, c = Math.cos(facing), s = Math.sin(facing);
        knife.rotation.set(Math.PI / 2, facing + 0.6, 0);
        knife.position.set(pos.x + ox * c + oz * s, 1.23, pos.z - ox * s + oz * c);
        st.toolMesh = knife;
      }
      this.stations.push(st);
      this.stationAt.set(key, st);
    }

    // --- hatch: retype the counter(s) directly in front of the order window ---
    if (orderWindow) {
      const wx = orderWindow._pos.x, wz = orderWindow._pos.z;
      for (const s of this.stations) {
        if (s.type === 'counter' && Math.hypot(s.pos.x - wx, s.pos.z - wz) <= 2.2) s.type = 'hatch';
      }
    }

    // --- spawn (not in the JSON; from level.spawn, given in JSON cell coords) ---
    const sp = spawnCell ? toLocal(spawnCell.col, spawnCell.row)
      : { c: Math.floor(this.cols / 2), r: Math.floor(this.rows / 2) };
    this.spawn.copy(this.tileWorld(sp.c, sp.r));
    this.startItems = startItems;

    this._finishStatic(staticG);
  }

  /** Face toward an adjacent walkable tile (used by editor-JSON stations). */
  faceToFloor(c, r) {
    const dirs = [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]];
    for (const [dx, dz, rot] of dirs) if (this.isWalkable(c + dx, r + dz)) return rot;
    return 0;
  }

  /** Which way should a perimeter station face? Toward adjacent floor. */
  facingFor(c, r) {
    const dirs = [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]];
    for (const [dx, dz, rot] of dirs) {
      const rr = r + dz, cc = c + dx;
      if (rr >= 0 && rr < this.rows && cc >= 0 && cc < this.cols) {
        const ch = this.level.map[rr][cc];
        if (ch === '.' || ch === 'P') return rot;
      }
    }
    return 0;
  }

  isWalkable(col, row) {
    return row >= 0 && row < this.rows && col >= 0 && col < this.cols && this.walk[row][col];
  }

  /** AABB (square radius) vs tile grid. */
  areaWalkable(x, z, radius) {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const col = Math.round((x + sx * radius) / TILE + this.offX);
        const row = Math.round((z + sz * radius) / TILE + this.offZ);
        if (!this.isWalkable(col, row)) return false;
      }
    }
    return true;
  }

  stationAtTile(col, row) {
    return this.stationAt.get(col + ',' + row) || null;
  }
}
