// Stations hold state + item visuals; the interaction *rules* live in game.js.
import * as THREE from 'three';
import { TILE, getModel, measureModel } from './models.js';
import { ITEMS, DISHES, matchDish, isBurgerDish, PIZZA_TOPPING_MODELS, BURGER_LAYER_ORDER, BURGER_LAYER_MODELS, POT_LAYERS, POT_VEG_MODELS } from './recipes.js';
import { audio } from './audio.js';

// ---------- items ----------
export function makeIngredient(id) { return { type: 'ing', id }; }
export function makePlate(contents = [], dirty = false) {
  return { type: 'plate', contents, dirty, dish: matchDish(contents) };
}

const ITEM_SCALE = 0.95;
const sauceMat = new THREE.MeshStandardMaterial({ color: 0xd2402e, roughness: 0.85 });

// ---------- serving vessel (per level) ----------
// Most levels plate on a `plate`; the soup level serves in a `bowl` instead.
// One module-level switch (set by game.startLevel) so every render path — the
// carried/served vessel, the rack stack, the dirty-sink pile — uses the right
// model without threading it through makePlate everywhere.
let VESSEL = 'plate';
export function setVessel(v) { VESSEL = (v === 'bowl') ? 'bowl' : 'plate'; }
const vesselModel = (dirty) => VESSEL === 'bowl'
  ? (dirty ? 'bowl_dirty' : 'bowl')
  : (dirty ? 'plate_dirty' : 'plate');

// Pizzas read better small: the dough model alone is nearly plate-sized.
const PIZZA_SCALE = 0.72;

/** Unscaled rolled dough + optional red sauce disc (crust stays visible). */
function saucedParts(withSauce = true) {
  const g = new THREE.Group();
  const base = getModel('food_ingredient_dough_base');
  g.add(base);
  const m = measureModel('food_ingredient_dough_base');
  if (withSauce) {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(m.radius * 0.68, m.radius * 0.68, 0.03, 20), sauceMat);
    disc.position.y = m.height + 0.012;
    g.add(disc);
  }
  return { g, m };
}

/** Pizza-in-progress: rolled dough + any subset of {sauce, cheese, mushroom},
 *  always layered bottom→top in the SAME order — so the look depends only on
 *  WHICH toppings are present, never the order they were added.
 *  Bits stay INSIDE the sauce disc (radius 0.68): centers ≤ 0.42·r. */
function composePizza(toppings) {
  const has = (t) => toppings.includes(t);
  const { g, m } = saucedParts(has('sauce'));
  const scatter = (model, spots, scale, y) => {
    for (const [sx, sz] of spots) {
      const bit = getModel(model);
      bit.scale.setScalar(scale);
      bit.position.set(sx * m.radius, y, sz * m.radius);
      bit.rotation.y = (sx * 7 + sz * 13) % (Math.PI * 2);
      g.add(bit);
    }
  };
  // cheese layer: few BIG readable pieces
  if (has('cheese')) scatter(PIZZA_TOPPING_MODELS.cheese,
    [[-0.06, 0.18], [0.24, -0.14], [-0.26, -0.18]],
    0.7, m.height + 0.045);
  if (has('mushroom')) scatter(PIZZA_TOPPING_MODELS.mushroom,
    [[0.04, -0.32], [-0.3, 0.1], [0.3, 0.18], [0, 0]],
    0.45, m.height + 0.075);
  g.scale.setScalar(PIZZA_SCALE);
  return g;
}

/** Visible burger build: bun bottom, real layers, bun top when complete. */
// Burger stack from a contents list (must include 'bun'). `closed` adds the top
// bun (a complete, servable burger). Works on a plate (baseY = plate top) OR as
// a standalone plate-less burgerwip (baseY = 0). Fillings are ~10% bigger than
// before so each ingredient (patty / cheese slice / lettuce) reads inside the bun.
function composeBurger(contents, closed, baseY = 0) {
  const g = new THREE.Group();
  let y = baseY;
  const bb = getModel('food_ingredient_bun_bottom');
  bb.position.y = y;
  g.add(bb);
  y += Math.max(0.1, measureModel('food_ingredient_bun_bottom').height * 0.85);
  const S = 0.86;
  for (const layer of BURGER_LAYER_ORDER) {
    if (!contents.includes(layer)) continue;
    const model = BURGER_LAYER_MODELS[layer];
    const mm = measureModel(model);
    const lm = getModel(model);
    lm.scale.setScalar(S);
    // some models (cheese slice) have their origin ABOVE the geometry (minY<0),
    // which sinks them into the layer below — lift each so it rests on `y`
    lm.position.y = y - (mm.minY || 0) * S;
    g.add(lm);
    y += Math.max(0.08, mm.height * S * 0.8);
  }
  if (closed) {
    const bt = getModel('food_ingredient_bun_top');
    bt.position.y = y;
    g.add(bt);
  }
  return g;
}

/** Pot-in-progress: the empty pot (`pot_B`) + a tinted BROTH surface + the
 *  chopped veg resting in it, always in canonical order. The broth COLOUR (per
 *  recipe) is what distinguishes a half-filled pot — carrot–potato reads orange,
 *  onion–mushroom reads creamy — so "soup forming without the second veg" is
 *  legible at a glance. Order-free, like composePizza. */
function composePot(veg, broth) {
  const g = new THREE.Group();
  const pot = getModel('pot_B');
  pot.scale.multiplyScalar(0.9);
  g.add(pot);
  const m = measureModel('pot_B');
  const r = m.radius || 0.5;
  // broth disc sitting just below the rim, tinted to the recipe
  if (broth) {
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.74, r * 0.7, 0.05, 22),
      new THREE.MeshStandardMaterial({ color: broth, roughness: 0.5 }),
    );
    disc.position.y = m.height * 0.6;
    g.add(disc);
  }
  // chopped bits floating in the broth, spread around the centre
  const spots = { carrot: [0.2, 0.06], potato: [0, -0.2], onion: [-0.18, 0.1], mushroom: [0.16, -0.14] };
  for (const t of POT_LAYERS) {
    if (!veg.includes(t)) continue;
    const bit = getModel(POT_VEG_MODELS[t]);
    bit.scale.setScalar(0.55);
    const [sx, sz] = spots[t] || [0, 0];
    bit.position.set(sx * r, m.height * 0.63, sz * r);
    bit.rotation.y = (sx * 9 + sz * 11) % (Math.PI * 2);
    g.add(bit);
  }
  return g;
}

/** Build the visual for one ingredient (handles composed items). */
function ingredientMesh(id) {
  const def = ITEMS[id];
  if (def.compose === 'pizza') return composePizza(def.toppings);
  if (def.compose === 'burger') return composeBurger(def.expandsTo, !!def.dish, 0);
  if (def.compose === 'pot') return composePot(def.veg, def.broth);
  const m = getModel(def.model, def.tint || null);
  if (def.scale) m.scale.multiplyScalar(def.scale);
  return m;
}

/** Build the visual for any logical item (ingredient or plate w/ stack). */
export function buildItemMesh(item) {
  const g = new THREE.Group();
  if (!item) return g;
  if (item.type === 'ing') {
    const m = ingredientMesh(item.id);
    m.scale.multiplyScalar(ITEM_SCALE);
    // lift models whose origin sits above their geometry (cheese slice) so they
    // rest on the surface instead of sinking into the board / counter
    const def = ITEMS[item.id];
    if (def.model) {
      const mm = measureModel(def.model);
      if (mm.minY < 0) m.position.y -= mm.minY * ITEM_SCALE * (def.scale || 1);
    }
    g.add(m);
    return g;
  }
  // plate / bowl (the serving vessel is per-level)
  const isBowl = VESSEL === 'bowl';
  if (item.dirty) { g.add(getModel(vesselModel(true))); return g; }
  // A filled SOUP bowl: the `food_stew` dish model IS already a bowl of soup, so
  // it REPLACES the empty bowl (no nesting) and carries the recipe tint.
  if (isBowl && item.dish && DISHES[item.dish].model) {
    const d = DISHES[item.dish];
    const dm = getModel(d.model, d.model_tint || null);
    dm.scale.setScalar(0.9);
    g.add(dm);
    return g;
  }
  const plate = getModel(vesselModel(false));
  g.add(plate);
  const PLATE_TOP = 0.08;
  if (item.dish && DISHES[item.dish].model) {
    // baked pizzas keep the finished plated model (small — see PIZZA_SCALE)
    const dm = getModel(DISHES[item.dish].model, DISHES[item.dish].model_tint || null);
    dm.scale.setScalar(0.66);
    dm.position.y = PLATE_TOP;
    g.add(dm);
  } else if (item.contents.includes('bun')) {
    g.add(composeBurger(item.contents, isBurgerDish(item.dish), PLATE_TOP));
  } else {
    // salad & loose items: arranged side by side, not stacked
    const n = item.contents.length;
    item.contents.forEach((id, i) => {
      const m = ingredientMesh(id);
      m.scale.multiplyScalar(0.72);
      const ang = (i / Math.max(1, n)) * Math.PI * 2 + 0.7;
      const r = n > 1 ? 0.16 : 0;
      m.position.set(Math.cos(ang) * r, PLATE_TOP + 0.02, Math.sin(ang) * r);
      m.rotation.y = i * 1.7;
      g.add(m);
    });
  }
  return g;
}

// ---------- progress bar (canvas sprite above stoves/boards) ----------
export function makeRingSprite() {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 32;
  const tex = new THREE.CanvasTexture(cv);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  spr.scale.set(1.6, 0.4, 1);
  spr.renderOrder = 5;
  spr.userData = { cv, tex };
  spr.visible = false;
  return spr;
}
export function drawRing(spr, frac, color = '#2ee6c0', warn = false) {
  const { cv, tex } = spr.userData;
  const c = cv.getContext('2d');
  const W = 128, H = 32, R = H / 2;
  c.clearRect(0, 0, W, H);
  // track
  c.beginPath(); c.roundRect(0, 0, W, H, R);
  c.fillStyle = 'rgba(10,16,38,.78)'; c.fill();
  // fill
  const pad = 5;
  const fw = (W - pad * 2) * Math.min(1, frac);
  if (fw > 1) {
    c.beginPath(); c.roundRect(pad, pad, Math.max(fw, H - pad * 2), H - pad * 2, R - pad);
    c.fillStyle = color; c.fill();
  }
  if (warn) {
    c.font = 'bold 24px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#fff';
    c.fillText('!', W / 2, H / 2 + 1);
  }
  tex.needsUpdate = true;
}

// ---------- station ----------
export class Station {
  /** type: counter|crate|board|stove|oven|sink|rack|trash|hatch */
  constructor(type, col, row, worldPos, topY) {
    this.type = type;
    this.col = col; this.row = row;
    this.pos = worldPos;            // tile center, y = 0
    this.topY = topY;               // where items sit
    this.item = null;
    this.itemMesh = null;
    this.holder = new THREE.Group();
    this.holder.position.set(worldPos.x, topY, worldPos.z);

    // crate
    this.crateItem = null;
    // board
    this.progress = 0;
    // stove / oven
    this.cookT = 0; this.burnT = 0; this.state = 'idle';  // idle|cooking|ready|burnt
    this.ring = null;
    // rack / sink
    this.plates = 0;
    this.dirtyPlates = 0;
    this.stackGroup = null;
  }

  setItem(item, bounce = true, keepProgress = false) {
    if (this.itemMesh) this.holder.remove(this.itemMesh);
    this.item = item;
    this.itemMesh = item ? buildItemMesh(item) : null;
    if (this.itemMesh) {
      // long items (pepperoni!) lie along the board, not across it
      if (this.type === 'board') this.itemMesh.rotation.y = this.rot || 0;
      this.holder.add(this.itemMesh);
      if (bounce) {
        this.itemMesh.position.y = 0.35;
        this.itemMesh.userData.drop = 0.35;
      }
    }
    if (this.type === 'board' && !keepProgress) this.progress = 0;
  }

  takeItem() {
    const it = this.item;
    this.setItem(null);
    return it;
  }

  /** Refresh plate visuals on rack/sink. */
  refreshStack() {
    if (this.stackGroup) this.holder.remove(this.stackGroup);
    this.stackGroup = new THREE.Group();
    const isBowl = VESSEL === 'bowl';
    if (this.type === 'rack') {
      const n = Math.min(this.plates, 4);
      if (isBowl) {
        // clean bowls just nest in a stack where the dish rack used to be
        for (let i = 0; i < n; i++) {
          const b = getModel('bowl');
          b.position.set(0, 0.04 + i * 0.12, 0);
          this.stackGroup.add(b);
        }
      } else {
        // plates stand upright, side by side in the rack slots (0–4 visible)
        for (let i = 0; i < n; i++) {
          const p = getModel('plate');
          // on edge, face along the row (disc normal = x), all leaning the same way
          p.rotation.z = Math.PI / 2 - 0.12;
          p.position.set(-0.36 + i * 0.24, 0.42, 0);
          this.stackGroup.add(p);
        }
        this.stackGroup.rotation.y = (this.rot || 0) + Math.PI / 2;  // match the turned rack
      }
    } else {
      // dirty pile at the sink: bowls nest on the RIGHT, plates pile at the back
      for (let i = 0; i < Math.min(this.dirtyPlates, 4); i++) {
        const p = getModel(isBowl ? 'bowl_dirty' : 'plate_dirty');
        if (isBowl) p.position.set(0.5, 0.04 + i * 0.12, 0.2);
        else p.position.set(0.45, 0.02 + i * 0.14, -0.3);
        p.rotation.y = i * 0.5;
        this.stackGroup.add(p);
      }
    }
    this.holder.add(this.stackGroup);
  }

  /** Per-frame: cooking logic + item drop animation. Returns events. */
  update(dt, paused) {
    const ev = [];
    if (this.itemMesh && this.itemMesh.userData.drop > 0) {
      this.itemMesh.userData.drop -= dt * 2.2;
      const k = Math.max(0, this.itemMesh.userData.drop);
      this.itemMesh.position.y = k * k * 8 * 0.35;
    }
    if ((this.type === 'stove' || this.type === 'oven') && !paused) {
      const def = this.item && this.item.type === 'ing' ? ITEMS[this.item.id] : null;
      if (this.state === 'cooking' && def && (def.cookTo || def.bakeTo)) {
        const total = def.cookTime || def.bakeTime;
        this.cookT += dt;
        if (this.cookT >= total) {
          this.setItem(makeIngredient(def.cookTo || def.bakeTo), false);
          this.state = 'ready'; this.burnT = 0;
          ev.push('ready');
        }
      } else if (this.state === 'ready' && def && def.burnTo) {
        this.burnT += dt;
        if (this.burnT >= def.burnTime) {
          this.setItem(makeIngredient(def.burnTo), false);
          this.state = 'burnt';
          ev.push('burnt');
        }
      }
      if (this.ring) {
        if (this.state === 'cooking') {
          const total = (ITEMS[this.item.id].cookTime || ITEMS[this.item.id].bakeTime);
          this.ring.visible = true;
          drawRing(this.ring, this.cookT / total, '#ffcf5e');
        } else if (this.state === 'ready' && ITEMS[this.item.id]?.burnTo) {
          const frac = this.burnT / ITEMS[this.item.id].burnTime;
          this.ring.visible = true;
          drawRing(this.ring, frac, frac > 0.55 ? '#ff8585' : '#2ee6c0', frac > 0.55);
        } else {
          this.ring.visible = false;
        }
      }
    }
    return ev;
  }

  /** Put a cookable on the stove/oven. */
  startCooking(item) {
    this.setItem(item, false);
    const def = ITEMS[item.id];
    if (def.cookTo || def.bakeTo) { this.state = 'cooking'; this.cookT = 0; }
    else if (def.burnTo) { this.state = 'ready'; this.burnT = 0; }
    else this.state = 'idle';
    if (this.type === 'stove') audio.sizzle(true);
  }

  clearCooking() {
    const it = this.takeItem();
    this.state = 'idle'; this.cookT = 0; this.burnT = 0;
    if (this.ring) this.ring.visible = false;
    return it;
  }
}
