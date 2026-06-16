// Co-op kitchen helper (the first multiplayer experiment — a BOT teammate).
// Drives a SECOND Chef through a tiny state machine:
//   toIdle/idle → toCrate → toBoard → chopping → toStaging → toIdle …
// It fetches raw ingredients from the crates, chops each on its OWN dedicated
// board, and stages the finished slice for the player to grab. Two behaviours
// are picked per level via the coop config:
//   • production — DEMAND-DRIVEN (make whatever the on-screen orders are short
//     of) when `config.demand`, else always keep every supply topped up;
//   • staging — a shared POOL of pass-counter tiles (drop a slice on any free
//     one) when `config.pass` is set, else one fixed spot per ingredient.
// When nothing needs making it walks to an idle corner and waits there
// (config.idle), out of the player's way.
// It NEVER cooks, plates, serves or washes — the human owns assembly and the
// sink (so the grammar stays 100% with the player). This is deliberately a
// dumb, predictable, station-bound bot: the "second seat" abstraction that a
// remote human could later drive instead.
import { TILE } from './models.js';
import { ITEMS, DISHES } from './recipes.js';
import { makeIngredient, buildItemMesh } from './stations.js';
import { audio } from './audio.js';

const CHOP_TIME = 1.4;
// chopped-output id for each raw the bot preps, and the reverse — used to read
// the orders' needs and to recognise free slices lying around.
const CHOPPED = { cheese: 'cheese_chopped', lettuce: 'lettuce_chopped', tomato: 'tomato_slices' };
const INGREDIENT_OF = { cheese_chopped: 'cheese', lettuce_chopped: 'lettuce', tomato_slices: 'tomato' };

export class Helper {
  constructor(game, chef, config) {
    this.game = game;
    this.chef = chef;
    this.world = game.world;
    // resolve each ingredient's board + staging counter + source crate from the
    // map cell coords in the level's `coop` config (ASCII map coords == grid coords)
    this.lines = config.stations.map((s) => ({
      ingredient: s.ingredient,
      board: this.world.stationAtTile(s.board.col, s.board.row),
      staging: s.staging ? this.world.stationAtTile(s.staging.col, s.staging.row) : null,
      crate: this.world.stations.find((st) => st.type === 'crate' && st.crateItem === s.ingredient),
    }));
    // production mode: demand-driven (only cut what the orders need) vs simply
    // keeping every supply topped up. Staging: a shared POOL of pass-counter
    // tiles (drop a slice on any free one) vs one fixed spot per ingredient.
    this.demandMode = !!config.demand;
    this.passTiles = (config.pass || [])
      .map((p) => this.world.stationAtTile(p.col, p.row)).filter(Boolean);
    this.stageTarget = null;   // the staging tile chosen for the slice in hand
    // where to park when stocked (out of the player's way)
    this.idleTile = config.idle || { col: 0, row: 0 };
    // pacing (all tunable from the level's coop config — the helper is meant to
    // feel unhurried, not robotic): chop speed vs the player + a "think" delay
    // before each action so it doesn't react instantly.
    this.workMul = config.workSpeed != null ? config.workSpeed : 0.55;
    this.reaction = config.reaction != null ? config.reaction : 0.7;
    this.delay = 0;          // reaction countdown; stands still while > 0
    this.state = 'toIdle';
    this.line = null;        // the line (ingredient) currently being worked
    this.nav = null;         // { path:[{col,row}], i }
    this.chopBoard = null;   // board chopped THIS frame (game.js hides its resting knife)
  }

  chefTile() {
    return {
      col: Math.round(this.chef.pos.x / TILE + this.world.offX),
      row: Math.round(this.chef.pos.z / TILE + this.world.offZ),
    };
  }

  // 4-connected BFS over walkable tiles → tile path, or null if unreachable.
  bfs(goal) {
    const W = this.world, start = this.chefTile();
    const seen = new Set([start.col + ',' + start.row]);
    const q = [{ c: start.col, r: start.row, p: [] }];
    while (q.length) {
      const cur = q.shift();
      const path = cur.p.concat([{ col: cur.c, row: cur.r }]);
      if (goal(cur.c, cur.r)) return path;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = cur.c + dx, nr = cur.r + dz, key = nc + ',' + nr;
        if (seen.has(key) || !W.isWalkable(nc, nr)) continue;
        seen.add(key); q.push({ c: nc, r: nr, p: path });
      }
    }
    return null;
  }

  // how many slices of `line`'s ingredient are sitting ready for the player —
  // counted across the pass pool (pool levels) or its single fixed spot.
  stagedCount(line) {
    const part = CHOPPED[line.ingredient];
    if (this.passTiles.length) return this.passTiles.filter((t) => t.item && t.item.id === part).length;
    return line.staging && line.staging.item && line.staging.item.id === part ? 1 : 0;
  }

  // choose the next job; sets this.line + state and returns true if one starts.
  pickWork() {
    if (this.demandMode) return this.pickByPlan();
    // always-stocked: first line whose (fixed or pooled) supply is empty
    for (const line of this.lines) {
      if (this.stagedCount(line) > 0) continue;
      this.line = line; this.state = 'toCrate'; this.nav = null;
      return true;
    }
    return false;
  }

  // Smart demand planner. Walk the orders on screen in turn: an order that
  // already has a ready-made dish waiting is skipped; otherwise each chopped
  // ingredient it needs is satisfied first from a FREE slice already lying
  // around (pass pool / a counter / the player's hand — anything NOT bound into
  // another dish), and only the first genuinely-missing one is made. Re-run each
  // time the bot is free, so "2 cheeses needed" naturally becomes 2 trips.
  // Backup when every order is covered: top up an empty pass slot with any
  // ingredient we currently have none of anywhere.
  pickByPlan() {
    const { free, dishes } = this.gatherResources();
    const have = { ...free };                 // absolute availability, for the backup rule
    for (const ticket of (this.game.orders ? this.game.orders.tickets : [])) {
      const d = ticket.dish;
      if ((dishes[d] || 0) > 0) { dishes[d]--; continue; }   // a finished one waits → covered
      for (const part of ((DISHES[d] && DISHES[d].parts) || [])) {
        const ing = INGREDIENT_OF[part];
        if (!ing) continue;                                  // bun / patty etc. — not the bot's job
        if (free[ing] > 0) { free[ing]--; continue; }        // a free slice exists → use it
        return this.startJob(ing);                           // genuinely missing → make it next
      }
    }
    // nothing required → fill an empty pass slot with an ingredient we have none of
    if (this.passTiles.some((t) => !t.item)) {
      for (const line of this.lines) if ((have[line.ingredient] || 0) === 0) return this.startJob(line.ingredient);
    }
    return false;
  }

  startJob(ingredient) {
    const line = this.lines.find((l) => l.ingredient === ingredient);
    if (!line) return false;
    this.line = line; this.state = 'toCrate'; this.nav = null;
    return true;
  }

  // Tally what's already available so the bot never makes a duplicate: ready-made
  // dishes (a complete plate, or a finished plate-less burger) and FREE chopped
  // slices (standalone on a station or in the player's hand — NOT the slices
  // bound inside a plate or a half-built burger).
  gatherResources() {
    const free = { cheese: 0, lettuce: 0, tomato: 0 };
    const dishes = {};
    const add = (it) => {
      if (!it) return;
      if (it.type === 'plate') {
        if (it.dish) dishes[it.dish] = (dishes[it.dish] || 0) + 1;
      } else if (it.type === 'ing') {
        const ing = INGREDIENT_OF[it.id];
        if (ing) free[ing]++;
        else { const d = ITEMS[it.id] && ITEMS[it.id].dish; if (d) dishes[d] = (dishes[d] || 0) + 1; }
      }
    };
    for (const st of this.world.stations) add(st.item);
    add(this.game.chef.carried);
    return { free, dishes };
  }

  // steer the chef along this.nav; returns { vec:{x,z}, arrived }.
  steer() {
    const W = this.world, chef = this.chef;
    const wp = this.nav.path[this.nav.i];
    const c = W.tileWorld(wp.col, wp.row);
    const dx = c.x - chef.pos.x, dz = c.z - chef.pos.z;
    const d = Math.hypot(dx, dz);
    const last = this.nav.i >= this.nav.path.length - 1;
    if (d < (last ? 0.18 : 0.34)) {
      if (last) return { vec: { x: 0, z: 0 }, arrived: true };
      this.nav.i++; return this.steer();
    }
    const t = Math.max(0.25, d * 0.4);
    let x = 0, z = 0;
    if (dx > t) x = 1; else if (dx < -t) x = -1;
    if (dz > t) z = 1; else if (dz < -t) z = -1;
    if (!x && !z) { if (Math.abs(dx) > Math.abs(dz)) x = dx > 0 ? 1 : -1; else z = dz > 0 ? 1 : -1; }
    return { vec: { x, z }, arrived: false };
  }

  // build a BFS nav to a goal (once), then steer along it. → {vec, arrived, nopath}
  navigate(goalFn) {
    if (!this.nav) {
      const path = this.bfs(goalFn);
      if (!path) return { vec: { x: 0, z: 0 }, arrived: false, nopath: true };
      this.nav = { path, i: 0 };
    }
    const r = this.steer();
    return { vec: r.vec, arrived: r.arrived, nopath: false };
  }

  // walk to a tile adjacent to `station`, then run onArrive() when standing there.
  // onArrive returns true when the step is done (advance), false to keep waiting.
  goTo(station, onArrive) {
    if (!station) { this.reset(); return { x: 0, z: 0 }; }
    const r = this.navigate((c, rr) => Math.abs(c - station.col) + Math.abs(rr - station.row) === 1);
    if (r.nopath) { this.reset(); return { x: 0, z: 0 }; }   // unreachable → drop the task
    if (r.arrived) {
      const ct = this.chefTile();   // face the station so the pose points the right way
      this.chef.facing.set(Math.sign(station.col - ct.col), Math.sign(station.row - ct.row));
      if (onArrive()) this.nav = null;
      return { x: 0, z: 0 };
    }
    return r.vec;
  }

  // walk to an exact floor tile (the idle corner) and wait there.
  goToTile(col, row) {
    const r = this.navigate((c, rr) => c === col && rr === row);
    if (r.nopath || r.arrived) { this.nav = null; this.state = 'idle'; return { x: 0, z: 0 }; }
    return r.vec;
  }

  // where to drop the slice in hand: the nearest FREE pass-counter tile (pool
  // levels — so a taken preferred spot just means "use the next one"), or the
  // line's single fixed spot. null = pool full → wait, holding it.
  chooseStaging() {
    if (this.passTiles.length) {
      const ct = this.chefTile();
      let best = null, bd = Infinity;
      for (const t of this.passTiles) {
        if (t.item) continue;
        const d = Math.abs(t.col - ct.col) + Math.abs(t.row - ct.row);
        if (d < bd) { bd = d; best = t; }
      }
      return best;
    }
    return this.line.staging;
  }

  reset() { this.state = 'toIdle'; this.line = null; this.nav = null; this.stageTarget = null; }

  // advance the two-stage chop on the line's board (mirrors game.workStations).
  chopTick(dt) {
    const st = this.line.board;
    if (!st.item || st.item.type !== 'ing') { this.reset(); return; }
    const def = ITEMS[st.item.id];
    if (!def.chopTo) {                       // fully chopped → carry the slice to staging
      const it = st.takeItem();
      this.chef.setCarried(it, buildItemMesh(it));
      this.state = 'toStaging';
      this.nav = null;
      this.delay = this.reaction * 0.5;      // beat before walking it over
      return;
    }
    this.chopBoard = st;
    const before = st.progress;
    st.progress += (dt * this.workMul) / (def.chopTime || CHOP_TIME);
    if (Math.floor(before * 5) !== Math.floor(st.progress * 5)) audio.chop();
    if (ITEMS[def.chopTo] && ITEMS[def.chopTo].interim) {
      if (st.progress >= 0.5) st.setItem(makeIngredient(def.chopTo), true, true);
    } else if (st.progress >= 1) {
      st.setItem(makeIngredient(def.chopTo));
      this.game.fx.sparkle(st.pos.clone().setY(st.topY + 0.4));
    }
  }

  update(dt) {
    const g = this.game, chef = this.chef;
    this.chopBoard = null;
    // pause with the rest of the kitchen during a sink question / between rounds
    if (!g.running || g.roundOver || g.questionOpen) { chef.update(dt, { x: 0, z: 0 }, g.fx); return; }

    // reaction beat: stand still while a "think" delay is pending
    if (this.delay > 0) { this.delay -= dt; chef.update(dt, { x: 0, z: 0 }, g.fx); return; }

    // whenever it's free, look for a refill — then take a beat before darting off
    if ((this.state === 'idle' || this.state === 'toIdle') && this.pickWork()) {
      this.delay = this.reaction;
      chef.update(dt, { x: 0, z: 0 }, g.fx);
      return;
    }
    const L = this.line;
    let input = { x: 0, z: 0 };

    switch (this.state) {
      case 'idle':
        break;                                       // parked in the corner, waiting
      case 'toIdle':
        input = this.goToTile(this.idleTile.col, this.idleTile.row);
        break;
      case 'toCrate':
        input = this.goTo(L.crate, () => {
          if (this.chef.carried) return true;                 // safety: already holding
          const raw = makeIngredient(L.crate.crateItem);
          this.chef.setCarried(raw, buildItemMesh(raw));
          this.state = 'toBoard';
          this.delay = this.reaction * 0.5;   // beat after grabbing
          return true;
        });
        break;
      case 'toBoard':
        input = this.goTo(L.board, () => {
          if (L.board.item) return false;                     // board busy → wait
          if (!this.chef.carried) { this.reset(); return true; }
          L.board.setItem(this.chef.carried);
          this.chef.setCarried(null);
          this.state = 'chopping';
          this.delay = this.reaction * 0.5;   // beat before the knife comes down
          return true;
        });
        break;
      case 'chopping':
        this.chopTick(dt);
        break;
      case 'toStaging':
        // (re)pick a drop spot if we don't have a free one yet
        if (!this.stageTarget || this.stageTarget.item) { this.stageTarget = this.chooseStaging(); this.nav = null; }
        if (!this.stageTarget) break;                         // pool full → wait, holding the slice
        input = this.goTo(this.stageTarget, () => {
          if (this.stageTarget.item) { this.stageTarget = null; this.nav = null; return false; }  // taken → re-pick
          this.stageTarget.setItem(this.chef.carried);
          this.chef.setCarried(null);
          this.stageTarget = null;
          this.reset();
          return true;
        });
        break;
    }

    chef.working = this.state === 'chopping' && !!this.chopBoard;
    if (chef.working) chef.workTool = 'knife';
    chef.update(dt, input, g.fx);
  }
}
