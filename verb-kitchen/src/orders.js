// Order tickets (high-score mode): a FIXED queue of orders streams in (max 3
// on screen). No patience / no expiry — you must deliver them ALL; the round
// clock counts UP, so speed is the score. Serving the oldest matching ticket
// earns a small in-order bonus.
import { DISHES, ITEMS } from './recipes.js';
import { audio } from './audio.js';
import { rng } from './verbs.js';

let nextId = 1;

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
    const t = { id: nextId++, dish, el: null };
    const el = document.createElement('div');
    el.className = 'ticket';
    const ings = d.icons || d.parts.map((p) => ITEMS[p].emoji).join(' ');
    el.innerHTML = `<div class="dish">${d.emoji}</div><div class="dn">${d.name}</div>` +
      `<div class="ings">${ings}</div>`;
    this.bar.appendChild(el);
    t.el = el;
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
  }

  /** Serve a dish: match the oldest matching ticket (any order allowed).
   *  inOrder = true when it was the very first ticket → small streak bonus. */
  serve(dishId) {
    const idx = this.tickets.findIndex((t) => t.dish === dishId);
    if (idx < 0) return null;
    const t = this.tickets[idx];
    const inOrder = idx === 0;
    this.remove(t, 'servedAnim');
    this.served++;
    return { ticket: t, inOrder, served: this.served, total: this.total };
  }

  remaining() { return this.total - this.served; }
  allServed() { return this.served >= this.total; }

  remove(t, animClass) {
    this.tickets = this.tickets.filter((x) => x !== t);
    t.el.classList.add(animClass);
    setTimeout(() => t.el.remove(), 600);
  }

  clear() {
    for (const t of this.tickets) t.el.remove();
    this.tickets = [];
    this.queue = [];
  }
}
