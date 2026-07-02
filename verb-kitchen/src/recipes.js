// Item + dish data tables. The model column is the single source of truth
// for what each item looks like — swapping art = editing this table.
import { t } from './i18n.js';
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

  // --- level 6: vegetable soup ---
  // Pots live ON the stoves: the player chops veg and tips them STRAIGHT into a
  // stove-pot, which shows broth + the veg as it fills (the pot-in-progress is
  // identified by the SET of veg it holds, order-free). A complete recipe boils
  // (cookTo) into a finished soup-in-the-pot; you then scoop it into a BOWL
  // (`scoop`) and serve. TWO 2-veg recipes: carrot+potato = Carrot–Potato Soup
  // (orange `food_stew`); onion+mushroom = Onion–Mushroom Soup (same model tinted
  // creamy). Veg are a TWO-stage chop (raw → `_half` interim → `_chopped` final).
  carrot:          { model: 'food_ingredient_carrot',         emoji: '🥕', chopTo: 'carrot_half', chopTime: 1.8 },
  carrot_half:     { model: 'food_ingredient_carrot_chopped', emoji: '🥕', chopTo: 'carrot_chopped', chopTime: 1.8, interim: true },
  carrot_chopped:  { model: 'food_ingredient_carrot_pieces',  emoji: '🥕' },
  potato:          { model: 'food_ingredient_potato',         emoji: '🥔', chopTo: 'potato_half', chopTime: 1.8 },
  potato_half:     { model: 'food_ingredient_potato_chopped', emoji: '🥔', chopTo: 'potato_chopped', chopTime: 1.8, interim: true },
  potato_chopped:  { model: 'food_ingredient_potato_mashed',  emoji: '🥔' },
  onion:           { model: 'food_ingredient_onion',          emoji: '🧅', chopTo: 'onion_half', chopTime: 1.8 },
  onion_half:      { model: 'food_ingredient_onion_chopped',  emoji: '🧅', chopTo: 'onion_chopped', chopTime: 1.8, interim: true },
  onion_chopped:   { model: 'food_ingredient_onion_rings',    emoji: '🧅' },
  // (mushroom raw→half→chopped reuses the pizza mushroom chain defined below.)
  pot_empty:       { model: 'pot_B',                          emoji: '🍲' },   // empty pot on a stove; .accepts wired below
  // cooked soup sitting IN the pot — scoop it into a bowl. `scoop` = the bowl soup.
  pot_soup_cp:     { model: 'pot_B_stew',                     emoji: '🍲', scoop: 'cp_soup', steamy: true },
  pot_soup_om:     { model: 'pot_B_stew', tint: '#e9dcb6',    emoji: '🍲', scoop: 'om_soup', steamy: true },
  // the soup once it's in a bowl (the served dish content). Renders the stew bowl.
  cp_soup:         { model: 'food_stew',                      emoji: '🥕', plateable: true, steamy: true },
  om_soup:         { model: 'food_stew', tint: '#e9dcb6',     emoji: '🍄', plateable: true, steamy: true },

  // --- level 7: ice cream / sundaes (the first COLD-ASSEMBLY level: no stove,
  // no cutting board, no cooking) ---
  // Scoops are grabbed STRAIGHT from their tubs (crates) as plateable
  // ingredients — exactly the salad pattern, but cold. There is no chopping and
  // no cooking: the player grabs a plate (a bowl), spoons scoops + an optional
  // cherry onto it (order-free, side-by-side like a salad), it matches a sundae
  // DISH, then serves at the hatch → dirty plate → sink quiz (grammar reused
  // unchanged). One `icecream_scoop` model, tinted per flavour (flat cream /
  // chocolate / pink reads cleanly as a scoop ball — like the burnt-item tints).
  // The cherry is a separate plateable topping that adds an assembly step.
  scoop_vanilla:    { model: 'icecream_scoop', tint: '#fdf0cf', emoji: '🍨', scale: 1.15, plateable: true },
  scoop_chocolate:  { model: 'icecream_scoop', tint: '#6b4321', emoji: '🍫', scale: 1.15, plateable: true },
  scoop_strawberry: { model: 'icecream_scoop', tint: '#ff9ec2', emoji: '🍓', scale: 1.15, plateable: true },
  cherry:           { model: 'icecream_cherry', emoji: '🍒', scale: 1.4, plateable: true },
  // reusable chocolate-syrup bottle (like the pizza ketchup): drizzle it onto a
  // sundae-in-progress to add `syrup` — the Deluxe's extra step. `drizzle` names
  // the content it deposits; the bottle is the ketchup model tinted dark, the
  // drizzle that lands in the bowl is a tinted sauce blob.
  choc_syrup:       { model: 'ketchup', tint: '#3a2113', emoji: '🍫', scale: 1.9, reusable: true, drizzle: 'syrup' },
  syrup:            { model: 'food_ingredient_tomato_sauce', tint: '#3a2113', emoji: '🍯', scale: 1.0 },
};

// ---------- pot-in-progress states (order-free veg assembly) ----------
// Vegetables in canonical render order. A WIP pot's identity is the SUBSET it
// holds; build order never matters. Only a COMPLETE 2-veg recipe set boils →
// soup. Two recipes share the four veg: carrot+potato and onion+mushroom — so
// a half-filled pot (one veg) shows broth + that one veg (distinguished by the
// broth colour), and the player can still add the matching second veg.
export const POT_LAYERS = ['carrot', 'potato', 'onion', 'mushroom'];
// held CHOPPED-veg id → the veg token it deposits into the pot. Veg are chopped
// on the island's cutting boards first (two-stage chop, like the burger level),
// then the chopped form is tipped into a stove-pot.
const POT_ADDERS = {
  carrot_chopped: 'carrot', potato_chopped: 'potato',
  onion_chopped: 'onion', mushroom_chopped: 'mushroom',
};
// only a COMPLETE recipe set can be boiled (canonical comma-join → soup-in-pot)
const POT_BOILS = {
  'carrot,potato':   { cookTo: 'pot_soup_cp', cookTime: 9 },
  'onion,mushroom':  { cookTo: 'pot_soup_om', cookTime: 9 },
};
const POT_EMOJI = { carrot: '🥕', potato: '🥔', onion: '🧅', mushroom: '🍄' };
// the two valid recipes as canonical token sets (only these get accept-wiring
// beyond the first veg, so you can't mix carrot+onion etc.)
const POT_RECIPES = [['carrot', 'potato'], ['onion', 'mushroom']];

const potTokens = (set) => POT_LAYERS.filter((t) => set.has(t));
/** Canonical id for a veg set in the pot: the empty set is the bare pot. */
export function potWipId(set) {
  const t = potTokens(set);
  return t.length ? 'potwip_' + t.join('_') : 'pot_empty';
}

// which recipe (if any) a single veg belongs to, and the OTHER veg it pairs with
const POT_PARTNER = {};               // veg → the veg that completes its recipe
const POT_BROTH = {};                 // veg/recipe → broth tint (color of the interim)
for (const [a, b] of POT_RECIPES) { POT_PARTNER[a] = b; POT_PARTNER[b] = a; }
// broth colour by recipe (which soup is forming): carrot–potato = orange stew,
// onion–mushroom = creamy. A one-veg pot already shows its recipe's broth.
const CP_BROTH = '#d8761e', OM_BROTH = '#e9dcb6';
POT_BROTH.carrot = POT_BROTH.potato = CP_BROTH;
POT_BROTH.onion = POT_BROTH.mushroom = OM_BROTH;

// Generate the valid pot states: empty, each single veg (interim broth + that
// veg), and the two complete 2-veg recipes (boilable). Invalid mixes (e.g.
// carrot+onion) are never created — a one-veg pot only accepts its partner.
(function buildPotStates() {
  // empty pot accepts any first chopped veg
  const emptyAccepts = {};
  for (const [held, token] of Object.entries(POT_ADDERS)) emptyAccepts[held] = potWipId(new Set([token]));
  ITEMS.pot_empty.accepts = emptyAccepts;

  for (const token of POT_LAYERS) {
    // one-veg interim state: broth of its recipe + this veg, accepts its partner
    // (in EITHER raw or chopped form → the completed recipe pot)
    const id = potWipId(new Set([token]));
    const partner = POT_PARTNER[token];
    const accepts = {};
    for (const [held, tok] of Object.entries(POT_ADDERS)) {
      if (tok === partner) accepts[held] = potWipId(new Set([token, partner]));
    }
    ITEMS[id] = {
      compose: 'pot', veg: [token], broth: POT_BROTH[token],
      emoji: POT_EMOJI[token], accepts,
    };
  }

  for (const recipe of POT_RECIPES) {
    // complete recipe: both veg + broth, boilable, no further accepts
    const set = new Set(recipe);
    const tokens = potTokens(set);
    const id = potWipId(set);
    ITEMS[id] = {
      compose: 'pot', veg: tokens, broth: POT_BROTH[tokens[0]],
      emoji: tokens.map((t) => POT_EMOJI[t]).join(''),
      ...(POT_BOILS[tokens.join(',')] || {}),
    };
  }
})();

// Scatter models used to dress an in-progress pot per vegetable (the final
// chopped look: rings / pieces / mashed / mushroom bits — matching each veg's
// `_chopped` item).
export const POT_VEG_MODELS = {
  carrot: 'food_ingredient_carrot_pieces',
  potato: 'food_ingredient_potato_mashed',
  onion: 'food_ingredient_onion_rings',
  mushroom: 'food_ingredient_mushroom_pieces',
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
  carrot_potato_soup:  { name: 'Carrot–Potato Soup',  emoji: '🍲', parts: ['cp_soup'], coins: 40, model: 'food_stew',                model_tint: null,      icons: '🥕🥔' },
  onion_mushroom_soup: { name: 'Onion–Mushroom Soup', emoji: '🍲', parts: ['om_soup'], coins: 40, model: 'food_stew',                model_tint: '#e9dcb6', icons: '🧅🍄' },
  // --- level 7 sundaes (cold assembly; served in a bowl on the washable plate) ---
  // Each sundae is an exact, distinct SET of plateable scoops/cherry (order-free,
  // like the salad). The plated dish renders a finished ice-cream-bowl model so it
  // reads as a bowl of ice cream sitting on the plate (the plate stays the
  // washable vessel → the sink grammar is untouched). Variety: a single-scoop +
  // cherry, a three-scoop mix (no topping), and a two-scoop deluxe + cherry.
  // Ice-cream level dishes — scoop SETS served in a bowl (no cherry/syrup source
  // in the editor layout yet; those items stay defined for when the user adds a
  // topping source). Order-free exact-set match, like the salad.
  sundae_vanilla:    { name: 'Vanilla Scoop',     emoji: '🍨', parts: ['scoop_vanilla'],                                        coins: 20, model: 'icecream_bowl_icecream_vanilla', icons: '🍨' },
  sundae_deluxe:     { name: 'Berry Duo',         emoji: '🍨', parts: ['scoop_strawberry', 'scoop_chocolate'],                  coins: 32, model: 'icecream_bowl_cherries',        icons: '🍓🍫' },
  sundae_neapolitan: { name: 'Neapolitan Sundae', emoji: '🍨', parts: ['scoop_vanilla', 'scoop_chocolate', 'scoop_strawberry'], coins: 44, model: 'icecream_bowl_decorated_A',      icons: '🍨🍫🍓' },
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

/** True for any pot that lives on a stove: the empty pot, a veg WIP, or boiled soup. */
export function isPotItem(id) {
  const d = ITEMS[id];
  return id === 'pot_empty' || !!(d && (d.compose === 'pot' || d.scoop));
}

/** Hint for a stove-pot that still needs veg: which recipe(s) it can still become. */
export function potRecipeHint(have) {
  const opts = POT_RECIPES
    .filter((r) => have.every((v) => r.includes(v)))
    .map((r) => r.filter((v) => !have.includes(v)).map((v) => POT_EMOJI[v]).join(' + '))
    .filter((s) => s.length);
  return opts.length ? t('hintPotAdd', opts.join(` ${t('or')} `)) : t('hintPotFull');
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
  for (const m of Object.values(POT_VEG_MODELS)) names.add(m);
  ['food_ingredient_bun_top', 'food_ingredient_bun_bottom', 'food_ingredient_dough_base',
   'plate', 'plate_dirty', 'bowl', 'bowl_dirty'].forEach((m) => names.add(m));
  return [...names];
}
