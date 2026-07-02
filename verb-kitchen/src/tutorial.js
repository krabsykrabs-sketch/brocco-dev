// Guided step-by-step tutorial for the salad level. It walks the player through
// making the FIRST salad — grab → chop → plate → repeat → serve → wash — then
// hands off to free play for the remaining orders. Each step latches once its
// milestone is reached (so it survives doing things slightly out of order); a
// banner shows the current step and a bobbing arrow points at the station.
import * as THREE from 'three';
import { ui } from './ui.js';
import { t } from './i18n.js';

export class Tutorial {
  constructor(game) {
    this.game = game;
    this.i = 0;
    this.done = false;
    this.t = 0;
    const G = game;
    this.steps = [
      { icon: '🥬', text: t('tut1'),
        target: () => crate(G, 'lettuce'), test: () => carries(G, 'lettuce') },
      { icon: '🔪', text: t('tut2'),
        target: () => board(G), test: () => exists(G, 'lettuce_chopped') },
      { icon: '🥗', text: t('tut3'),
        target: () => plateStation(G), test: () => plateHas(G, 'lettuce_chopped') },
      { icon: '🍅', text: t('tut4'),
        target: () => crate(G, 'tomato'), test: () => carries(G, 'tomato') },
      { icon: '🔪', text: t('tut5'),
        target: () => board(G), test: () => exists(G, 'tomato_slices') },
      { icon: '🥗', text: t('tut6'),
        target: () => plateStation(G), test: () => saladDone(G) },
      { icon: '🛎️', text: t('tut7'),
        target: () => first(G, 'hatch'), test: () => G.orders.served >= 1 },
      { icon: '🧽', text: t('tut8'),
        target: () => first(G, 'sink'), test: () => (G.washesCompleted || 0) >= 1 },
    ];

    // a bobbing arrow that points down at the current step's station
    this.arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.3, 0.62, 16),
      new THREE.MeshBasicMaterial({ color: 0x2ee6c0 })
    );
    this.arrow.rotation.x = Math.PI;   // tip points down
    this.arrow.visible = false;
    game.scene.add(this.arrow);
    this.show();
  }

  update(dt) {
    this.t += dt;
    if (!this.done) {
      // advance past a step when its milestone — OR any LATER one — is reached,
      // so a transient milestone (e.g. only briefly carrying the lettuce) or
      // doing things out of order can't stall the walkthrough.
      const laterDone = (k) => { for (let j = k + 1; j < this.steps.length; j++) if (this.steps[j].test()) return true; return false; };
      while (this.i < this.steps.length && (this.steps[this.i].test() || laterDone(this.i))) {
        this.i++;
        if (this.i < this.steps.length) this.show();
      }
      if (this.i >= this.steps.length) {
        this.done = true;
        ui.tutorialDone(t('tutDone'));
      }
    }
    const st = this.done ? null : this.steps[this.i].target();
    this.arrow.visible = !!st;
    if (st) {
      const bob = Math.sin(this.t * 4) * 0.12;
      this.arrow.position.set(st.pos.x, (st.topY || 1.0) + 1.5 + bob, st.pos.z);
    }
  }

  show() {
    const s = this.steps[this.i];
    ui.tutorialStep(s.icon, s.text, this.i + 1, this.steps.length);
  }
}

// --- milestone helpers (poll the live game state) ---
function carries(g, id) { const c = g.chef.carried; return !!c && c.type === 'ing' && c.id === id; }
function first(g, type) { return g.world.stations.find((s) => s.type === type) || null; }
function crate(g, item) { return g.world.stations.find((s) => s.type === 'crate' && s.crateItem === item) || null; }
function board(g) {
  const bs = g.world.stations.filter((s) => s.type === 'board');
  if (!bs.length) return null;
  const p = g.chef.pos;
  return bs.reduce((a, b) => (a.pos.distanceToSquared(p) <= b.pos.distanceToSquared(p) ? a : b));
}
function plateStation(g) { return g.world.stations.find((s) => s.item && s.item.type === 'plate') || null; }
function exists(g, id) {
  const c = g.chef.carried;
  if (c && (c.id === id || (c.type === 'plate' && c.contents.includes(id)))) return true;
  for (const s of g.world.stations) {
    const it = s.item;
    if (it && (it.id === id || (it.type === 'plate' && it.contents.includes(id)))) return true;
  }
  return false;
}
function plateHas(g, id) {
  const c = g.chef.carried;
  if (c && c.type === 'plate' && c.contents.includes(id)) return true;
  for (const s of g.world.stations) if (s.item && s.item.type === 'plate' && s.item.contents.includes(id)) return true;
  return false;
}
function saladDone(g) {
  const c = g.chef.carried;
  if (c && c.type === 'plate' && c.dish === 'salad') return true;
  for (const s of g.world.stations) if (s.item && s.item.type === 'plate' && s.item.dish === 'salad') return true;
  return false;
}
