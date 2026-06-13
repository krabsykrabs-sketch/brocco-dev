// Item + dish data tables. The model column is the single source of truth
// for what each item looks like — swapping art = editing this table.
//
// Chop chains: chopTo may point at another choppable (two-stage chopping:
// raw → half → done). `interim` marks the halfway stage for hints.
// `compose` items are built from several models in stations.buildItemMesh.
// `steamy` items emit steam wisps for a while after cooking/baking.
export const ITEMS = {
  // --- level 1: salad ---
  lettuce:         { model: 'food_ingredient_lettuce',         emoji: '🥬', chopTo: 'lettuce_half', chopTime: 1.8 },
  lettuce_half:    { model: 'food_ingredient_lettuce_chopped', emoji: '🥬', chopTo: 'lettuce_chopped', chopTime: 1.8, interim: true },
  lettuce_chopped: { model: 'food_ingredient_lettuce_slice',   emoji: '🥬', plateable: true },
  tomato:          { model: 'food_ingredient_tomato',          emoji: '🍅', chopTo: 'tomato_slices' },
  tomato_slices:   { model: 'food_ingredient_tomato_slices',   emoji: '🍅', plateable: true },

  // --- level 2: burgers ---
  bun:             { model: 'food_ingredient_bun',             emoji: '🍞', plateable: true },
  // veggie patties (asset swap only — mechanics unchanged): raw → cooked → burnt
  patty_raw:       { model: 'food_ingredient_vegetableburger_uncooked', emoji: '🥩', cookTo: 'patty_cooked', cookTime: 10.5 },
  patty_cooked:    { model: 'food_ingredient_vegetableburger_cooked',   emoji: '🍖', plateable: true, burnTo: 'patty_burnt', burnTime: 12, steamy: true },
  patty_burnt:     { model: 'food_ingredient_burger_trash',    emoji: '💀', trashOnly: true },
  // cheese: whole → half-cut (interim) → SLICED (final), like the lettuce chain.
  // The final slice is what you carry / plate; the pizza topping renders it as
  // grated (melted) bits via PIZZA_TOPPING_MODELS — burgers get a real slice.
  cheese:          { model: 'food_ingredient_cheese',          emoji: '🧀', chopTo: 'cheese_half', chopTime: 1.8 },
  cheese_half:     { model: 'food_ingredient_cheese_chopped',  emoji: '🧀', chopTo: 'cheese_chopped', chopTime: 1.8, interim: true },
  cheese_chopped:  { model: 'food_ingredient_cheese_slice',    emoji: '🧀', plateable: true },
  // `bun` (above) is the burger BASE: patty/cheese/lettuce build on it in any
  // order — see buildBurgerStates below. `.accepts` is wired there.

  // --- level 3: pizza ---
  // Build a pizza on rolled dough by adding toppings in ANY order (dough is
  // always first). A pizza-in-progress is identified by the SET of toppings it
  // carries, not the build sequence — so "cheese then sauce" and "sauce then
  // cheese" converge on the SAME item id and render identically. The per-set
  // states + their accept/bake wiring are generated below (see buildPizzaStates).
  dough:           { model: 'food_ingredient_dough',           emoji: '🟤', chopTo: 'dough_base', chopVerb: 'Roll' },
  dough_base:      { model: 'food_ingredient_dough_base',      emoji: '⚪', scale: 0.72 },   // .accepts wired below
  ketchup:         { model: 'ketchup',                         emoji: '🥫', scale: 1.9, reusable: true },
  mushroom:        { model: 'food_ingredient_mushroom',          emoji: '🍄', chopTo: 'mushroom_half', chopTime: 1.8 },
  mushroom_half:   { model: 'food_ingredient_mushroom_chopped',  emoji: '🍄', chopTo: 'mushroom_chopped', chopTime: 1.8, interim: true },
  mushroom_chopped:{ model: 'food_ingredient_mushroom_pieces',   emoji: '🍄' },
  pizza_cheese:    { model: 'food_pizza_cheese_plated',    emoji: '🍕', scale: 0.66, plateable: true, burnTo: 'pizza_burnt', burnTime: 8, steamy: true },
  pizza_mushroom:  { model: 'food_pizza_mushroom_plated',  emoji: '🍕', scale: 0.66, plateable: true, burnTo: 'pizza_burnt', burnTime: 8, steamy: true },
  pizza_burnt:     { model: 'food_pizza_cheese_plated',    emoji: '💀', scale: 0.66, tint: '#2a2118', trashOnly: true },
};

// ---------- pizza-in-progress states (order-free assembly) ----------
// Toppings in canonical bottom→top render order. A WIP pizza's identity is the
// SUBSET of these it carries, so build order never matters — visually or logically.
export const PIZZA_LAYERS = ['sauce', 'cheese', 'mushroom'];
// held item id → topping it deposits when combined onto a dough base / WIP pizza
const PIZZA_ADDERS = { ketchup: 'sauce', cheese_chopped: 'cheese', mushroom_chopped: 'mushroom' };
// only COMPLETE topping sets can be baked (canonical comma-join → baked dish item)
const PIZZA_BAKES = {
  'sauce,cheese':          { bakeTo: 'pizza_cheese',   bakeTime: 13.5 },
  'sauce,cheese,mushroom': { bakeTo: 'pizza_mushroom', bakeTime: 13.5 },
};
const PIZZA_EMOJI = { sauce: '🥫', cheese: '🧀', mushroom: '🍄' };

const pizzaTokens = (set) => PIZZA_LAYERS.filter((t) => set.has(t));
/** Canonical id for a topping set: the empty set is the bare rolled base. */
export function pizzaWipId(set) {
  const t = pizzaTokens(set);
  return t.length ? 'pizzawip_' + t.join('_') : 'dough_base';
}

// Generate an ITEMS entry for every non-empty topping subset, wiring each
// (incl. the empty `dough_base`) to accept any topping it doesn't yet have.
(function buildPizzaStates() {
  const n = PIZZA_LAYERS.length;
  for (let mask = 0; mask < (1 << n); mask++) {
    const set = new Set();
    for (let i = 0; i < n; i++) if (mask & (1 << i)) set.add(PIZZA_LAYERS[i]);
    const id = pizzaWipId(set);
    const accepts = {};
    for (const [held, token] of Object.entries(PIZZA_ADDERS)) {
      if (set.has(token)) continue;
      const next = new Set(set); next.add(token);
      accepts[held] = pizzaWipId(next);
    }
    if (id === 'dough_base') { ITEMS.dough_base.accepts = accepts; continue; }
    const tokens = pizzaTokens(set);
    ITEMS[id] = {
      compose: 'pizza', toppings: tokens,
      emoji: tokens.map((t) => PIZZA_EMOJI[t]).join(''),
      accepts,
      ...(PIZZA_BAKES[tokens.join(',')] || {}),
    };
  }
})();

// Scatter models used to dress a raw pizza per topping.
export const PIZZA_TOPPING_MODELS = {
  cheese: 'food_ingredient_cheese_grated',
  mushroom: 'food_ingredient_mushroom_pieces',
};

// Burger stack: which model represents each ingredient inside the stack,
// bottom-to-top serving order. (bun renders as bun_bottom + bun_top.)
export const BURGER_LAYER_ORDER = ['patty_cooked', 'cheese_chopped', 'lettuce_chopped', 'tomato_slices'];
export const BURGER_LAYER_MODELS = {
  patty_cooked: 'food_ingredient_vegetableburger_cooked',
  cheese_chopped: 'food_ingredient_cheese_slice',   // a real slice on the burger
  lettuce_chopped: 'food_ingredient_lettuce_slice',
  tomato_slices: 'food_ingredient_tomato_slices',
};

// ---------- burger-in-progress states (order-free, PLATE-LESS assembly) ----------
// Burgers build on a BUN by adding patty / cheese / lettuce in ANY order — no
// plate required (a plate is only the serving tray). Identity = the topping SET,
// exactly like the pizza system. A set that matches a DISH closes with a top bun;
// any other set stays open-faced (buildable, but not servable).
export const BURGER_LAYERS = ['patty', 'cheese', 'lettuce'];   // canonical bottom→top
const BURGER_ADDERS = { patty_cooked: 'patty', cheese_chopped: 'cheese', lettuce_chopped: 'lettuce' };
const BURGER_TOKEN_ITEM = { patty: 'patty_cooked', cheese: 'cheese_chopped', lettuce: 'lettuce_chopped' };
const BURGER_DISHES = {           // complete servable sets (canonical join) → dish id
  'patty': 'hamburger',
  'patty,cheese': 'cheeseburger',
  'patty,cheese,lettuce': 'bigburger',
};

const burgerTokens = (set) => BURGER_LAYERS.filter((t) => set.has(t));
/** Canonical id for a burger topping set on a bun: empty set = bare `bun`. */
export function burgerWipId(set) {
  const t = burgerTokens(set);
  return t.length ? 'burgerwip_' + t.join('_') : 'bun';
}

// Generate an ITEMS entry for every non-empty topping subset on the bun, wiring
// each (incl. the empty `bun`) to accept any topping it doesn't yet have.
(function buildBurgerStates() {
  const n = BURGER_LAYERS.length;
  for (let mask = 0; mask < (1 << n); mask++) {
    const set = new Set();
    for (let i = 0; i < n; i++) if (mask & (1 << i)) set.add(BURGER_LAYERS[i]);
    const id = burgerWipId(set);
    const accepts = {};
    for (const [held, token] of Object.entries(BURGER_ADDERS)) {
      if (set.has(token)) continue;
      const next = new Set(set); next.add(token);
      accepts[held] = burgerWipId(next);
    }
    if (id === 'bun') { ITEMS.bun.accepts = accepts; continue; }
    const tokens = burgerTokens(set);
    ITEMS[id] = {
      compose: 'burger', layers: tokens,
      expandsTo: ['bun', ...tokens.map((t) => BURGER_TOKEN_ITEM[t])],   // for plating + dish match
      dish: BURGER_DISHES[tokens.join(',')] || null,                    // set → top bun + servable
      emoji: '🍔', plateable: true, accepts,
    };
  }
})();

// Dishes: parts must exactly match a plate's contents (order-free).
export const DISHES = {
  salad:           { name: 'Salad',        emoji: '🥗', parts: ['lettuce_chopped', 'tomato_slices'], coins: 20, model: null },
  hamburger:       { name: 'Hamburger',    emoji: '🍔',   parts: ['bun', 'patty_cooked'],                                    coins: 25, model: null, icons: '🍞🍖' },
  cheeseburger:    { name: 'Cheeseburger', emoji: '🧀🍔', parts: ['bun', 'patty_cooked', 'cheese_chopped'],                  coins: 30, model: null, icons: '🍞🍖🧀' },
  bigburger:       { name: 'Big Burger',   emoji: '🍔⭐', parts: ['bun', 'patty_cooked', 'cheese_chopped', 'lettuce_chopped'], coins: 40, model: null, icons: '🍞🍖🧀🥬' },
  pizza_cheese:    { name: 'Cheese Pizza',    emoji: '🍕', parts: ['pizza_cheese'],    coins: 40, model: 'food_pizza_cheese_plated',    icons: '🥫🧀' },
  pizza_mushroom:  { name: 'Mushroom Pizza',  emoji: '🍕', parts: ['pizza_mushroom'],  coins: 40, model: 'food_pizza_mushroom_plated',  icons: '🥫🧀🍄' },
};

export function isBurgerDish(dishId) {
  return dishId === 'hamburger' || dishId === 'cheeseburger' || dishId === 'bigburger';
}

/** Exact-set dish match for a plate's contents. Returns dish id or null. */
export function matchDish(contents) {
  const sorted = contents.slice().sort().join(',');
  for (const [id, d] of Object.entries(DISHES)) {
    if (d.parts.slice().sort().join(',') === sorted) return id;
  }
  return null;
}

/**
 * Free-build rule: any plateable ingredient may go on a plate (build the
 * burger YOU want), except exact duplicates (can never match a dish —
 * pure frustration) and silly towers (cap 5).
 */
export function canPlate(contents, extra) {
  const parts = (ITEMS[extra] && ITEMS[extra].expandsTo) || [extra];   // burgerwip → bun + fillings
  if (contents.length + parts.length > 5) return false;
  return parts.every((p) => !contents.includes(p));
}

/** Counter-top combine (pizza assembly): base item + held item → result id or null. */
export function combine(baseId, heldId) {
  const def = ITEMS[baseId];
  return (def && def.accepts && def.accepts[heldId]) || null;
}

// Every restaurant model the game ever instantiates (preload manifest).
export function itemModelNames() {
  const names = new Set();
  for (const def of Object.values(ITEMS)) if (def.model) names.add(def.model);
  for (const d of Object.values(DISHES)) if (d.model) names.add(d.model);
  for (const m of Object.values(PIZZA_TOPPING_MODELS)) names.add(m);
  for (const m of Object.values(BURGER_LAYER_MODELS)) names.add(m);
  ['food_ingredient_bun_top', 'food_ingredient_bun_bottom', 'food_ingredient_dough_base',
   'plate', 'plate_dirty'].forEach((m) => names.add(m));
  return [...names];
}
