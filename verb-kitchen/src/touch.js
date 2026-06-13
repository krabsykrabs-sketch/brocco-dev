// Touch input for phones/tablets: point-and-click pathfinding (tap-to-move).
// Purely additive — feeds the SAME state the keyboard uses (sets game.keys to
// steer the chef along a BFS path, then calls the existing game.interactE() /
// holds game.keys[' '] for chopping). No game logic changed; the keyboard path
// is untouched, and desktop (no touch events) keeps using the keyboard.
//
//   Tap a cell        → chef walks there.
//   Tap a station     → walk to it + the same E action (pick/drop/serve/wash…).
//   Hold a cutting board → walk there + chop while held (release to stop).
import * as THREE from 'three';
import { TILE } from './models.js';

export function initTouch(game) {
  const canvas = game.renderer && game.renderer.domElement;
  if (!canvas) return;

  const clearMove = () => { const k = game.keys; k.w = k.a = k.s = k.d = false; };

  // tap = a quick touch → the E action (pick up / put down / serve / wash);
  // hold = a sustained touch on a cutting board → chop while held. They're told
  // apart by how long the touch lasts, NOT just whether it's still down — so
  // tapping a board you're already standing at picks up the just-chopped item
  // instead of starting another chop (the bug this fixes).
  const HOLD_MS = 200;
  let nav = null, touchDown = false, downAt = 0, chopArmed = false, chopping = false;
  const _ray = new THREE.Raycaster();
  const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  const chefTile = () => ({
    col: Math.round(game.chef.pos.x / TILE + game.world.offX),
    row: Math.round(game.chef.pos.z / TILE + game.world.offZ),
  });
  const adj = (c, r, sc, sr) => Math.abs(c - sc) + Math.abs(r - sr) === 1;

  // Screen point → tile. Prefer a real mesh hit (counter tops etc.), else the
  // ground plane (y=0).
  function pickTile(clientX, clientY) {
    if (!game.camera || !game.world) return null;
    const rect = canvas.getBoundingClientRect();
    const ndc = { x: ((clientX - rect.left) / rect.width) * 2 - 1,
                  y: -((clientY - rect.top) / rect.height) * 2 + 1 };
    _ray.setFromCamera(ndc, game.camera);
    let p = null;
    for (const h of _ray.intersectObject(game.world.group, true)) {
      if (h.object && h.object.isMesh && h.object !== game.world.highlight) { p = h.point; break; }
    }
    if (!p) { p = new THREE.Vector3(); if (!_ray.ray.intersectPlane(_plane, p)) return null; }
    const W = game.world;
    const col = Math.round(p.x / TILE + W.offX), row = Math.round(p.z / TILE + W.offZ);
    if (col < 0 || row < 0 || col >= W.cols || row >= W.rows) return null;
    return { col, row, station: W.stationAtTile(col, row) };
  }

  // 4-connected BFS over walkable tiles; returns the tile path or null.
  function bfs(start, goal) {
    const W = game.world;
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

  function startNav(target) {
    const start = chefTile();
    let path = null, station = null, board = false;
    if (target.station) {
      station = target.station; board = station.type === 'board';
      path = bfs(start, (c, r) => adj(c, r, station.col, station.row));
    } else if (game.world.isWalkable(target.col, target.row)) {
      path = bfs(start, (c, r) => c === target.col && r === target.row);
    }
    nav = path ? { path, i: 0, station, board } : null;
  }

  function doArrive() {
    const S = nav.station;
    if (!S) return;                                // floor target → just stop
    const ct = chefTile();
    game.chef.facing.set(Math.sign(S.col - ct.col), Math.sign(S.row - ct.row));
    if (!nav.board) { game.interactE(); return; }  // any other station → the E action
    // a board: chop only on a real hold; otherwise the E action (pick up / place)
    if (touchDown && performance.now() - downAt >= HOLD_MS) { game.keys[' '] = true; chopping = true; }
    else if (touchDown) chopArmed = true;          // arrived instantly & still down — decide on release / threshold
    else game.interactE();                         // already released = a tap → pick up the chopped item
  }

  // Resolve a board we reached while still holding but too briefly to be a chop
  // yet: released first → it was a tap (pick up); held past HOLD_MS → chop.
  // Run from both the rAF tick and the QA step() so tests don't need real time.
  function resolveArm() {
    if (!chopArmed) return;
    // round ended / sink quiz opened during the brief arm window → drop it (the
    // closure outlives the round, so a stuck arm would leak into the next one)
    if (!game.running || game.roundOver || game.questionOpen) { chopArmed = false; return; }
    if (!touchDown) { chopArmed = false; game.interactE(); }   // released first = a tap → pick up
    else if (performance.now() - downAt >= HOLD_MS) { chopArmed = false; game.keys[' '] = true; chopping = true; }
  }

  function steer() {
    const chef = game.chef, W = game.world;
    const wp = nav.path[nav.i];
    const c = W.tileWorld(wp.col, wp.row);
    const dx = c.x - chef.pos.x, dz = c.z - chef.pos.z;
    const d = Math.hypot(dx, dz);
    const last = nav.i >= nav.path.length - 1;
    if (d < (last ? 0.18 : 0.34)) {
      if (last) { clearMove(); doArrive(); nav = null; return; }
      nav.i++; return;
    }
    const k = game.keys; k.w = k.a = k.s = k.d = false;
    const t = Math.max(0.25, d * 0.4);
    if (dx > t) k.d = true; else if (dx < -t) k.a = true;
    if (dz > t) k.s = true; else if (dz < -t) k.w = true;
    if (!k.w && !k.a && !k.s && !k.d) {            // never stall short of arrival
      if (Math.abs(dx) > Math.abs(dz)) k[dx > 0 ? 'd' : 'a'] = true;
      else k[dz > 0 ? 's' : 'w'] = true;
    }
  }

  canvas.addEventListener('touchstart', (e) => {
    if (!game.running || game.roundOver || game.questionOpen) return;
    const t = e.changedTouches[0];
    const target = pickTile(t.clientX, t.clientY);
    if (!target) return;
    e.preventDefault();
    if (chopping) { game.keys[' '] = false; chopping = false; }   // cancel a chop a prior touch left running
    chopArmed = false;
    touchDown = true;
    downAt = performance.now();
    startNav(target);
  }, { passive: false });

  const navEnd = () => { touchDown = false; if (chopping) { game.keys[' '] = false; chopping = false; } };
  window.addEventListener('touchend', navEnd);
  window.addEventListener('touchcancel', navEnd);

  // steering loop (cheap no-op unless navigating)
  function tick() {
    requestAnimationFrame(tick);
    resolveArm();
    if (!nav) return;
    if (!game.running || game.roundOver || game.questionOpen) { clearMove(); return; }
    steer();
  }
  tick();

  // QA hook (mirrors window.__VK): drive nav deterministically in tests
  window.__touch = {
    // tap = touch down "now" (resolves to a pick-up if released before HOLD_MS)
    tapTile: (col, row) => { if (chopping) { game.keys[' '] = false; chopping = false; } chopArmed = false; touchDown = true; downAt = performance.now(); startNav({ col, row, station: game.world.stationAtTile(col, row) }); },
    // hold = backdate the press so arrival already counts as a sustained hold → chop
    holdTile: (col, row) => { if (chopping) { game.keys[' '] = false; chopping = false; } chopArmed = false; touchDown = true; downAt = performance.now() - 10000; startNav({ col, row, station: game.world.stationAtTile(col, row) }); },
    release: navEnd,
    step: () => { resolveArm(); if (nav) steer(); },
    getNav: () => (nav ? { i: nav.i, len: nav.path.length, station: nav.station ? [nav.station.col, nav.station.row, nav.station.type] : null, board: nav.board } : null),
    armed: () => chopArmed,
    chopping: () => chopping,
  };
}
