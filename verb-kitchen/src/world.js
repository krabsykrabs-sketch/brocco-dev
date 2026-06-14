// Builds the 3D kitchen for a level: floors, walls, counters, stations.
// Static geometry merges into one draw call; stations keep live holders.
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { TILE, getModel, mergeStatic } from './models.js';
import { Station, makeRingSprite } from './stations.js';
import { CRATE_MODELS } from './levels.js';

export class World {
  constructor(level) {
    this.level = level;
    this.group = new THREE.Group();
    this.stations = [];
    this.stationAt = new Map();        // "col,row" → station
    this.rows = level.map.length;
    this.cols = level.map[0].length;
    this.offX = (this.cols - 1) / 2;   // grid→world offset (tiles)
    this.offZ = (this.rows - 1) / 2;
    this.spawn = new THREE.Vector3();
    this.walk = [];                    // [row][col] true = walkable
    this.build();
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

    // merge all static geometry → one draw call
    const merged = mergeStatic(staticG, BufferGeometryUtils);
    this.group.add(merged);

    // live holders + rings
    for (const st of this.stations) {
      this.group.add(st.holder);
      if (st.toolMesh) this.group.add(st.toolMesh);   // resting board tool (hidden while chopping)
      if (st.type === 'stove' || st.type === 'oven' || st.type === 'board') {
        st.ring = makeRingSprite();
        st.ring.position.set(st.pos.x, st.topY + 1.5, st.pos.z);
        this.group.add(st.ring);
      }
    }

    // tile highlight marker
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
