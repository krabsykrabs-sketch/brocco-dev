// Additive touch input for phones/tablets. Two switchable modes, both feeding
// the SAME state the keyboard uses (game.keys[] + game.interactE()/spacePress())
// — no game logic is duplicated or changed, keyboard path untouched.
//
//   D-pad mode : floating joystick (left) → keys w/a/s/d; Pick/Drop + Chop buttons.
//   Tap mode   : tap a cell/station → chef BFS-walks there and does the E action;
//                hold on a cutting board → walk there + chop while held.
//
// A HUD toggle (🕹️ ↔ 👆) switches modes mid-level (remembered per device).
// Shown only on touch devices and only while the HUD is up. Perf-safe: rgba +
// transform/opacity only — no blur/filter/animated shadows.
import * as THREE from 'three';
import { TILE } from './models.js';

export function initTouch(game) {
  const padZone = document.getElementById('padZone');
  const padBase = document.getElementById('padBase');
  const padKnob = document.getElementById('padKnob');
  const btnE = document.getElementById('tBtnE');
  const btnChop = document.getElementById('tBtnChop');
  const ctrlToggle = document.getElementById('ctrlToggle');
  if (!padZone || !btnE || !btnChop) return;

  // reveal controls on touch devices only (or ?touch=1 for testing)
  const enable = () => document.body.classList.add('touch');
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if (coarse || new URLSearchParams(location.search).has('touch')) enable();
  window.addEventListener('touchstart', enable, { once: true, passive: true });

  const clearMove = () => { const k = game.keys; k.w = k.a = k.s = k.d = false; };

  // current control mode (declared up here — read by handlers + the steer loop)
  let mode = 'dpad';
  try { const m = localStorage.getItem('krabsy_vkitchen_ctrl'); if (m === 'tap' || m === 'dpad') mode = m; } catch (e) {}
  const urlCtrl = new URLSearchParams(location.search).get('ctrl');   // test aid
  if (urlCtrl === 'tap' || urlCtrl === 'dpad') mode = urlCtrl;

  // ============================ D-PAD MODE ============================
  const DEAD = 15, BASE_R = 56;
  let padId = null, ox = 0, oy = 0;

  const setMove = (dx, dy) => {
    const k = game.keys;
    k.w = k.a = k.s = k.d = false;
    const mag = Math.hypot(dx, dy);
    if (mag < DEAD) return;
    const t = mag * 0.38;                       // per-axis cut → 8 directions
    if (dx > t) k.d = true; else if (dx < -t) k.a = true;
    if (dy > t) k.s = true; else if (dy < -t) k.w = true;
  };

  padZone.addEventListener('touchstart', (e) => {
    if (mode !== 'dpad' || padId !== null) return;
    const t = e.changedTouches[0];
    padId = t.identifier; ox = t.clientX; oy = t.clientY;
    padBase.style.left = ox + 'px'; padBase.style.top = oy + 'px';
    padKnob.style.transform = 'translate(0px,0px)';
    padBase.classList.add('on');
    e.preventDefault();
  }, { passive: false });

  padZone.addEventListener('touchmove', (e) => {
    if (padId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== padId) continue;
      const dx = t.clientX - ox, dy = t.clientY - oy;
      setMove(dx, dy);
      const mag = Math.hypot(dx, dy) || 1;
      const cl = Math.min(mag, BASE_R);
      padKnob.style.transform = `translate(${dx / mag * cl}px, ${dy / mag * cl}px)`;
      e.preventDefault();
    }
  }, { passive: false });

  const endPad = (e) => {
    if (padId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier === padId) { padId = null; clearMove(); padBase.classList.remove('on'); }
    }
  };
  padZone.addEventListener('touchend', endPad, { passive: false });
  padZone.addEventListener('touchcancel', endPad, { passive: false });

  btnE.addEventListener('touchstart', (e) => {
    e.preventDefault(); btnE.classList.add('pressed');
    if (game.running && !game.roundOver) game.interactE();
  }, { passive: false });
  const upE = () => btnE.classList.remove('pressed');
  btnE.addEventListener('touchend', upE); btnE.addEventListener('touchcancel', upE);

  btnChop.addEventListener('touchstart', (e) => {
    e.preventDefault(); btnChop.classList.add('pressed');
    game.keys[' '] = true;
    if (game.running && !game.roundOver) game.spacePress();
  }, { passive: false });
  const upChop = () => { btnChop.classList.remove('pressed'); game.keys[' '] = false; };
  btnChop.addEventListener('touchend', upChop); btnChop.addEventListener('touchcancel', upChop);

  // ============================ TAP-TO-MOVE MODE ============================
  let nav = null, pendingHold = false, chopping = false;
  const _ray = new THREE.Raycaster();
  const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  const chefTile = () => ({
    col: Math.round(game.chef.pos.x / TILE + game.world.offX),
    row: Math.round(game.chef.pos.z / TILE + game.world.offZ),
  });
  const adj = (c, r, sc, sr) => Math.abs(c - sc) + Math.abs(r - sr) === 1;

  function pickTile(clientX, clientY) {
    if (!game.camera || !game.world) return null;
    const rect = game.renderer.domElement.getBoundingClientRect();
    const ndc = { x: ((clientX - rect.left) / rect.width) * 2 - 1,
                  y: -((clientY - rect.top) / rect.height) * 2 + 1 };
    _ray.setFromCamera(ndc, game.camera);
    let p = null;                                  // prefer a real mesh hit (counter tops etc.)
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
    if (nav.board && pendingHold) { game.keys[' '] = true; chopping = true; }   // hold = chop
    else game.interactE();                         // tap = pick / drop / serve …
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

  const canvas = game.renderer.domElement;
  canvas.addEventListener('touchstart', (e) => {
    if (mode !== 'tap' || !game.running || game.roundOver || game.questionOpen) return;
    const t = e.changedTouches[0];
    const target = pickTile(t.clientX, t.clientY);
    if (!target) return;
    e.preventDefault();
    pendingHold = true;
    startNav(target);
  }, { passive: false });

  const navEnd = () => {
    if (mode !== 'tap') return;
    pendingHold = false;
    if (chopping) { game.keys[' '] = false; chopping = false; }
  };
  window.addEventListener('touchend', navEnd);
  window.addEventListener('touchcancel', navEnd);

  // steering loop (cheap no-op unless navigating in tap mode)
  function tick() {
    requestAnimationFrame(tick);
    if (mode !== 'tap' || !nav) return;
    if (!game.running || game.roundOver || game.questionOpen) { clearMove(); return; }
    steer();
  }
  tick();

  // ============================ MODE TOGGLE ============================
  function setMode(m) {
    mode = m;
    document.body.classList.toggle('ctrl-tap', m === 'tap');
    try { localStorage.setItem('krabsy_vkitchen_ctrl', m); } catch (e) {}
    // clear all transient input state on switch
    clearMove(); padBase.classList.remove('on'); padId = null;
    if (chopping) { game.keys[' '] = false; chopping = false; }
    nav = null; pendingHold = false;
    if (ctrlToggle) ctrlToggle.textContent = m === 'tap' ? '👆' : '🕹️';
  }
  if (ctrlToggle) ctrlToggle.addEventListener('click', () => setMode(mode === 'tap' ? 'dpad' : 'tap'));
  setMode(mode);   // apply persisted/default mode

  // QA hook (mirrors window.__VK): drive nav deterministically in tests
  window.__touch = {
    setMode, getMode: () => mode,
    tapTile: (col, row) => { pendingHold = false; startNav({ col, row, station: game.world.stationAtTile(col, row) }); },
    holdTile: (col, row) => { pendingHold = true; startNav({ col, row, station: game.world.stationAtTile(col, row) }); },
    release: navEnd,
    step: () => { if (nav) steer(); },
    getNav: () => (nav ? { i: nav.i, len: nav.path.length, station: nav.station ? [nav.station.col, nav.station.row, nav.station.type] : null, board: nav.board } : null),
    chopping: () => chopping,
  };
}
