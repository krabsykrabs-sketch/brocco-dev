// Order tickets (high-score mode): a FIXED queue of orders streams in (max 3
// on screen). You must deliver them ALL; the round clock counts UP, so speed
// is the score. Serving the oldest matching ticket earns a small in-order
// bonus. Patience is COSMETIC pressure only (never a fail): the bar drains,
// the customer's mood sours, the card shakes when nearly out — and a fast
// serve earns a small patience tip on top.
import { DISHES, ITEMS } from './recipes.js';
import { audio } from './audio.js';
import { rng } from './verbs.js';
import { dishName } from './i18n.js';

let nextId = 1;
const PATIENCE_DEFAULT = 90;   // seconds until the (cosmetic) bar runs dry

export class Orders {
  constructor(level, callbacks = {}) {
    this.level = level;
    this.cb = callbacks;            // { onAllServed() }
    this.tickets = [];
    this.queue = [...(level.orders || [])];
    this.total = this.queue.length;
    this.served = 0;
    this.tNext = 1.5;               // first ticket lands quickly
    this.spawningEnabled = true;
    this.patience = level.patience || PATIENCE_DEFAULT;
    this.bar = document.getElementById('tickets');
    this.bar.innerHTML = '';
  }

  /** Spawn the next queued ticket (or a forced dish for QA). */
  spawn(dishId = null) {
    if (this.tickets.length >= 3) return null;
    let dish = dishId;
    if (!dish) {
      if (!this.queue.length) return null;
      dish = this.queue.shift();
    }
    const d = DISHES[dish];
    const t = { id: nextId++, dish, el: null, left: this.patience };
    const el = document.createElement('div');
    el.className = 'ticket';
    const ings = d.icons || d.parts.map((p) => ITEMS[p].emoji).join(' ');
    el.innerHTML = `<div class="dish">${d.emoji}</div><div class="dn">${dishName(dish, d.name)}</div>` +
      `<div class="ings">${ings}</div>` +
      `<div class="pbar"><div class="pfill" style="width:100%"></div></div><div class="mood">😊</div>`;
    this.bar.appendChild(el);
    t.el = el;
    t.fill = el.querySelector('.pfill');
    t.mood = el.querySelector('.mood');
    this.tickets.push(t);
    audio.tick();
    return t;
  }

  update(dt) {
    if (this.spawningEnabled && this.tickets.length < 3 && this.queue.length) {
      this.tNext -= dt;
      if (this.tNext <= 0) {
        this.spawn();
        const [a, b] = this.level.spawnEvery;
        this.tNext = a + rng.next() * (b - a);
      }
    }
    // cosmetic patience: bar drains, mood sours, card shakes — nothing expires
    for (const t of this.tickets) {
      t.left = Math.max(0, t.left - dt);
      const frac = t.left / this.patience;
      t.fill.style.width = (frac * 100) + '%';
      t.el.classList.toggle('warn', frac < 0.5 && frac >= 0.25);
      t.el.classList.toggle('hurry', frac < 0.25);
      const mood = frac >= 0.5 ? '😊' : frac >= 0.25 ? '😐' : frac > 0 ? '😟' : '😠';
      if (t.mood.textContent !== mood) t.mood.textContent = mood;
    }
  }

  /** True while any on-screen customer is nearly out of patience (drives the
   *  frantic music layer + the pulsing timer). */
  anyHurry() { return this.tickets.some((t) => t.left / this.patience < 0.25); }

  /** Serve a dish: match the oldest matching ticket (any order allowed).
   *  inOrder = true when it was the very first ticket → small streak bonus. */
  serve(dishId) {
    const idx = this.tickets.findIndex((t) => t.dish === dishId);
    if (idx < 0) return null;
    const t = this.tickets[idx];
    const inOrder = idx === 0;
    this.remove(t, 'servedAnim');
    this.served++;
    return { ticket: t, inOrder, served: this.served, total: this.total,
             tipFrac: t.left / this.patience };   // remaining patience → tip
  }

  remaining() { return this.total - this.served; }
  allServed() { return this.served >= this.total; }

  remove(t, animClass) {
    this.tickets = this.tickets.filter((x) => x !== t);
    t.el.classList.remove('hurry');   // the shake animation would fight the exit
    t.el.classList.add(animClass);
    setTimeout(() => t.el.remove(), 600);
  }

  clear() {
    for (const t of this.tickets) t.el.remove();
    this.tickets = [];
    this.queue = [];
  }
}
