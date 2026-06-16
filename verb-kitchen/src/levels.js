// Level definitions. Map legend (1 char = 1 tile = 2 world units):
//   .  floor          C  counter            b  cutting board (knife)
//   d  dough-rolling station (rolling pin; dough only)
//   s  stove          o  oven (pizza oven)  k  sink
//   r  plate rack     t  trash              H  serving hatch (2 wide)
//   1-9 ingredient crates (per-level `crates` mapping)
//   P  chef spawn (floor)
// High-score (race-the-clock) mode: each level is a FIXED list of orders,
// identical every play so completion TIMES are comparable. Deliver them all;
// the timer counts UP. Stars: `starTimes` = [1★, 2★, 3★(gold), author] in
// DESCENDING seconds (Trackmania-style; the author time stays hidden in the
// menu until the gold star is earned, and the 4th author star only shows once
// earned). All times are PLACEHOLDERS — tune from real playthroughs. Starting
// `plates` is below the order count so the player MUST wash (and study).
export const LEVELS = [
  {
    id: 'garden',
    num: 1,
    name: 'Garden Bistro',
    emoji: '🥗',
    // GUIDED tutorial level (see tutorial.js) — now an editor JSON layout
    // (levels/salad1.json). Step-by-step walkthrough of the first salad — grab →
    // chop → plate → repeat → serve → wash — then free play for the other 2.
    // Starts with one clean plate on a counter, an empty rack, and one dirty
    // plate at the sink (1 clean + 1 dirty), so washing is load-bearing.
    jsonUrl: 'levels/salad1.json',
    rotate: 2,                   // 180° — serving hatch at the back (camera convention)
    spawn: { col: 6, row: 4 },   // chef start in JSON cell coords
    guided: true,
    orders: ['salad', 'salad', 'salad'],
    spawnEvery: [4, 7],
    plates: 0,
    startItems: [{ c: 7, r: 4, item: 'plate' }],   // clean plate pre-placed on a counter (JSON cell coords)
    startDirty: 1,   // one dirty plate already at the sink (1 clean + 1 dirty to start)
    starTimes: [150, 115, 85, 62],   // 1★ / 2★ / 3★(gold) / author — placeholders
    tutorial: {
      image: 'assets/ChatGPT/Salad.png',
      title: 'Salad',
      text: 'Chop the lettuce and the tomato, pop them on a plate, and serve it up!',
    },
  },
  {
    id: 'burger',
    num: 2,
    name: 'Burger Bar',
    emoji: '🍔',
    style: 'A',
    map: [
      'CHHCCkrC',
      '1......s',
      '2.CCC..s',
      '3..P...C',
      '4......C',
      'CCbCbCtC',
    ],
    crates: { 1: 'bun', 2: 'patty_raw', 3: 'lettuce', 4: 'cheese' },
    // big burger appears exactly once, in slot 4 (or 5); the rest are
    // hamburgers / cheeseburgers in any order. 5 · 2 plates → 3 washes.
    orders: ['hamburger', 'cheeseburger', 'hamburger', 'bigburger', 'cheeseburger'],
    spawnEvery: [5, 8],
    plates: 2,
    starTimes: [215, 165, 130, 100],   // 1★ / 2★ / 3★(gold) / author — placeholders
    tutorial: {
      image: 'assets/ChatGPT/Burger.png',
      title: 'Burger',
      text: 'Cook a patty on a bun for a hamburger — add cheese for a cheeseburger, plus lettuce for a Big Burger!',
    },
  },
  {
    // Level 3 — the pizza level, made in the Krabsy Level Editor
    // (levels/pizza3.json). The layout/visuals come from the JSON; the gameplay
    // below is added here, and stations are inferred from the placed models
    // (see world.buildFromJSON). Replaced the old ASCII Pizzeria.
    id: 'pizzapalace',
    num: 3,
    name: 'Pizza Palace',
    emoji: '🍕',
    style: 'A',
    jsonUrl: 'levels/pizza3.json',
    rotate: 2,                   // 180° — put the serving hatch at the back (camera convention)
    spawn: { col: 6, row: 4 },   // chef start in JSON cell coords (editor stores none)
    // pizza3.json no longer includes the ketchup/sauce bottle (pizza4 had one at
    // 9,5) — without a sauce source no pizza can bake, so re-add it as a start
    // item on that counter. Remove if the editor exports it again.
    startItems: [{ c: 9, r: 5, item: 'ketchup' }],
    orders: ['pizza_cheese', 'pizza_mushroom', 'pizza_cheese', 'pizza_cheese', 'pizza_mushroom'],
    spawnEvery: [6, 9],
    plates: 2,
    starTimes: [265, 205, 160, 125],   // placeholders — tune from playthroughs
    tutorial: {
      image: 'assets/ChatGPT/Pizza.png',
      title: 'Pizza',
      text: 'Roll the dough, add sauce and cheese (and mushroom if you like), bake it, then serve!',
    },
  },
  {
    // Level 4 — CO-OP TEST: an exact copy of Burger Bar (level 2) plus a bot
    // kitchen helper. The helper owns the two cutting boards: it fetches raw
    // cheese / lettuce, chops each on its dedicated board, and parks the slice
    // on the counter to the RIGHT of that board (col+1). It is demand-driven
    // (only cuts what the orders need) and keeps at most one slice per board
    // (par=1). It never cooks, plates, serves or washes — see helper.js.
    // The `coop` block lives entirely in code (not the editor JSON schema).
    id: 'burger_coop',
    num: 4,
    name: 'Burger Bar Co-op',
    emoji: '🤝',
    style: 'A',
    map: [
      'CHHCCkrC',
      '1......s',
      '2.CCC..s',
      '3..P...C',
      '4......C',
      'CCbCbCtC',
    ],
    crates: { 1: 'bun', 2: 'patty_raw', 3: 'lettuce', 4: 'cheese' },
    orders: ['hamburger', 'cheeseburger', 'hamburger', 'bigburger', 'cheeseburger'],
    spawnEvery: [5, 8],
    plates: 2,
    starTimes: [215, 165, 130, 100],   // copied from Burger Bar — placeholders
    tutorial: {
      image: 'assets/ChatGPT/Burger.png',
      title: 'Burger Bar — with a helper!',
      text: 'A kitchen helper preps your cheese and lettuce on the cutting boards — focus on cooking the patties, building the burgers, serving and washing up!',
    },
    coop: {
      char: 'knight',                  // helper character (player defaults to rogue)
      spawn: { col: 2, row: 4 },       // helper starts near its boards
      idle: { col: 1, row: 4 },        // parks here (bottom-left) when both boards are stocked
      moveSpeed: 0.5,                  // walks at 50% of the player's speed (unhurried)
      workSpeed: 0.55,                 // chops slower than the player too
      reaction: 0.7,                   // pauses ~0.7s to "think" before each action
      // left board (col 2) = lettuce, right board (col 4) = cheese; each stages
      // onto the counter immediately to its right (col 3 / col 5).
      stations: [
        { ingredient: 'lettuce', board: { col: 2, row: 5 }, staging: { col: 3, row: 5 } },
        { ingredient: 'cheese',  board: { col: 4, row: 5 }, staging: { col: 5, row: 5 } },
      ],
    },
  },
];

// Locked "coming soon" slots shown after the 3 playable levels (levels grow to
// ~10–15; dish themes repeat). Numbers only; emoji is a decorative hint.
export const PLACEHOLDERS = [
  { id: 'lv5',  num: 5,  emoji: '🍲' },
  { id: 'lv6',  num: 6,  emoji: '🥗' },
  { id: 'lv7',  num: 7,  emoji: '🍔' },
  { id: 'lv8',  num: 8,  emoji: '🍕' },
  { id: 'lv9',  num: 9,  emoji: '🍨' },
  { id: 'lv10', num: 10, emoji: '🍲' },
];

// Static decor models every level needs preloaded, keyed by visual style.
export function levelModelNames(level) {
  const sB = level.style === 'B' ? '_styleB' : '';
  return [
    'floor_kitchen' + sB,
    'wall', 'wall_half', 'wall_orderwindow', 'wall_window_open',
    'wall_window_closed_curtains_red', 'wall_window_closed_curtains_green',
    'wall_tiles_A', 'wall_tiles_B', 'wall_decorated', 'wall_decorated_styleB',
    'kitchencounter_straight_A' + sB, 'kitchencounter_straight_B' + sB,
    'kitchencounter_straight_decorated' + sB,
    'kitchencounter_sink' + sB,
    'cuttingboard', 'knife', 'rollingpin',
    'stove_single_countertop', 'oven', 'pizza_oven', 'pan_A',
    'extractorhood', 'fridge_A', 'shelf_papertowel', 'towelrail',
    'dishrack', 'plate', 'plate_dirty',
    'crate', 'crate_lid',
    'crate_lettuce', 'crate_tomatoes', 'crate_buns', 'crate_potatoes',
    'crate_cheese', 'crate_dough', 'crate_mushrooms',
  ];
}

// crate item id → crate model
export const CRATE_MODELS = {
  lettuce: 'crate_lettuce',
  tomato: 'crate_tomatoes',
  bun: 'crate_buns',
  patty_raw: 'crate_potatoes',   // veggie patties come from the potato crate
  cheese: 'crate_cheese',
  dough: 'crate_dough',
  mushroom: 'crate_mushrooms',
};
