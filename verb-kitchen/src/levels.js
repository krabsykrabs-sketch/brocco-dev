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
    open: true,                  // co-op test level — always selectable
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
  {
    // Level 5 "Split Kitchen" — the FLAGSHIP co-op level. A solid counter wall
    // (col 4) splits the kitchen into a PREP wing (the bot's room: cheese /
    // lettuce / tomato crates + ONE board, cols 0–3) and a SERVICE wing (yours:
    // buns, patties, two stoves, rack, sink, hatch, trash, cols 5–8). The two
    // are joined ONLY by the central pass counter (col 4), where the bot drops
    // prepped toppings and you grab them from the service side. Neither can
    // cross — co-op is structural (the prep wing is unreachable solo). Each chef
    // owns its room, so the kitchen is compact (9×7). You cook, build burgers,
    // plate salads, serve and WASH; the bot preps all three toppings.
    // Code-side ASCII + coop config (editor schema untouched).
    id: 'split_coop',
    num: 5,
    open: true,                  // co-op test level — always selectable
    name: 'Split Kitchen',
    emoji: '👥',
    style: 'A',
    map: [
      'CCCCCHHCC',
      '4...C..sC',
      '3.b.C.PsC',
      '5...C...1',
      'C...C.C.2',
      'C...C...C',
      'CCCCCkrtC',
    ],
    crates: { 1: 'bun', 2: 'patty_raw', 3: 'lettuce', 4: 'cheese', 5: 'tomato' },
    // burgers (cheese) + big burgers (cheese+lettuce) + salads (lettuce+tomato)
    // → all three of the bot's prep streams stay busy.
    orders: ['cheeseburger', 'salad', 'bigburger', 'hamburger', 'salad', 'cheeseburger', 'bigburger', 'salad'],
    spawnEvery: [5, 8],
    plates: 3,
    starTimes: [340, 270, 215, 170],   // bigger level — placeholders, tune from play
    tutorial: {
      image: 'assets/ChatGPT/Burger.png',
      title: 'Split Kitchen (co-op)',
      text: 'You share a divided kitchen with a helper! It preps cheese, lettuce and tomato and passes them across the middle counter — you cook the patties, build burgers and salads, serve, and wash up.',
    },
    coop: {
      char: 'knight',
      spawn: { col: 1, row: 4 },
      idle: { col: 1, row: 5 },        // parks bottom-left of the prep wing
      moveSpeed: 0.5, workSpeed: 0.55, reaction: 0.7,
      demand: true,                    // cut only what the orders actually need
      // the central pass counter (col 4) is a shared drop pool — the bot parks a
      // slice on ANY free tile (preferred one taken? just use the next).
      pass: [
        { col: 4, row: 1 }, { col: 4, row: 2 }, { col: 4, row: 3 },
        { col: 4, row: 4 }, { col: 4, row: 5 },
      ],
      // ONE shared cutting board (col 2) — the bot only chops one thing at a
      // time; staging is the shared pass pool above.
      stations: [
        { ingredient: 'cheese',  board: { col: 2, row: 2 } },
        { ingredient: 'lettuce', board: { col: 2, row: 2 } },
        { ingredient: 'tomato',  board: { col: 2, row: 2 } },
      ],
    },
  },
  {
    // Level 6 "Soup Kitchen" — a vegetable-soup level (editor JSON layout,
    // levels/soup6.json). Single player, served in BOWLS not plates. TWO empty
    // pots sit on the two stoves at the start (Overcooked-style fixtures): chop a
    // veg and tip it STRAIGHT into a stove-pot (E) — the broth shows the soup
    // forming, coloured by recipe even with just one veg in. Two recipes share
    // four veg: carrot + potato (orange soup) and onion + mushroom (creamy). A
    // complete pot auto-boils, then you scoop the soup into a clean BOWL (the pot
    // stays, empty, reusable), serve at the hatch → dirty bowl → sink → verb quiz
    // (grammar loop reused unchanged). Clean bowls stack where the dish rack was;
    // dirty bowls land on the right of the sink.
    id: 'soup',
    num: 6,
    open: true,                  // selectable for playtest
    name: 'Soup Kitchen',
    emoji: '🍲',
    style: 'B',
    jsonUrl: 'levels/soup6.json',
    vessel: 'bowl',              // serve in bowls, not plates (see stations.setVessel)
    spawn: { col: 4, row: 4 },   // chef start in JSON cell coords
    // two empty pots pre-placed on the two stoves (JSON cell coords)
    startItems: [
      { c: 5, r: 1, item: 'pot_empty' },
      { c: 6, r: 1, item: 'pot_empty' },
    ],
    // a mix of the two recipes; lets the player batch chops. 6 orders · 2 bowls
    // → washing stays load-bearing.
    orders: ['carrot_potato_soup', 'onion_mushroom_soup', 'carrot_potato_soup', 'onion_mushroom_soup', 'carrot_potato_soup', 'onion_mushroom_soup'],
    spawnEvery: [7, 11],
    plates: 2,                   // 2 clean bowls to start
    starTimes: [320, 250, 195, 150],   // 1★ / 2★ / 3★(gold) / author — placeholders
    tutorial: {
      image: 'assets/ChatGPT/Salad.png',
      title: 'Soup Kitchen',
      text: 'Two pots wait on the stoves! Grab a veg and drop it into a pot (E) — carrot + potato makes one soup, onion + mushroom another. When it boils, scoop it into a bowl and serve!',
    },
  },
  {
    // Level 7 "Sundae Sunday" — the FIRST cold-assembly level. Single player.
    // NO stove, NO cutting board, NO cooking — this proves the assemble→serve→
    // wash loop works with none of those stations present. Scoops are grabbed
    // straight from their tubs (crates) as plateable ingredients, spooned onto a
    // bowl (the standard washable PLATE) in any order — exactly the SALAD pattern,
    // but cold. A cherry is an extra plateable topping. The plated sundae renders
    // a finished ice-cream-bowl model (so it reads as a bowl of ice cream), but
    // the plate underneath stays the washable vessel → the sink quiz is unchanged.
    // Three distinct sundaes (single-scoop+cherry / three-scoop mix / two-scoop
    // deluxe+cherry) give variety + a topping assembly step. style 'B' kitchen.
    id: 'sundae',
    num: 7,
    open: true,                  // selectable for playtest
    name: 'Sundae Sunday',
    emoji: '🍨',
    style: 'B',
    map: [
      'CHHCCkrC',
      '1.....CC',
      '2.....CC',
      '3..P...C',
      '4.....tC',
      'CCCCCCCC',
    ],
    // 1/2/3 = the three flavour tubs; 4 = the cherry crate (generic crate art).
    crates: { 1: 'scoop_vanilla', 2: 'scoop_chocolate', 3: 'scoop_strawberry', 4: 'cherry' },
    // one reusable chocolate-syrup bottle on a counter — drizzle it on for the
    // Cherry Deluxe (the deluxe's extra assembly step).
    startItems: [{ c: 6, r: 2, item: 'choc_syrup' }],
    // a mix of the three sundaes; lets the player batch scoops. 6 orders · 2
    // plates → 4 washes (washing stays load-bearing — below the order count).
    orders: ['sundae_vanilla', 'sundae_neapolitan', 'sundae_deluxe', 'sundae_vanilla', 'sundae_deluxe', 'sundae_neapolitan'],
    spawnEvery: [5, 8],
    plates: 2,
    starTimes: [260, 200, 155, 120],   // 1★ / 2★ / 3★(gold) / author — placeholders
    tutorial: {
      image: 'assets/ChatGPT/Salad.png',
      title: 'Sundae Sunday',
      text: 'No cooking today! Grab a bowl, scoop ice cream from the tubs, add a cherry (and drizzle chocolate syrup for a Deluxe), serve — then wash up!',
    },
  },
];

// Locked "coming soon" slots shown after the playable levels (levels grow to
// ~10–15; dish themes repeat). Numbers only; emoji is a decorative hint.
export const PLACEHOLDERS = [
  { id: 'lv8',  num: 8,  emoji: '🍕' },
  { id: 'lv9',  num: 9,  emoji: '🥪' },
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
    'crate_onions', 'crate_carrots', 'pot_A', 'food_stew',
    // ice-cream tubs (crate art) — the scoop/cherry/bowl item+dish models come
    // through itemModelNames(); the tub container models are only named here.
    'icecream_container_icecream_vanilla', 'icecream_container_icecream_chocolate',
    'icecream_container_icecream_strawberry',
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
  onion: 'crate_onions',
  carrot: 'crate_carrots',
  potato: 'crate_potatoes',
  pot_empty: 'crate',   // generic crate of clean pots (no pot-crate art in the pack)
  // sundae tubs: filled ice-cream containers read clearly as flavour tubs.
  scoop_vanilla: 'icecream_container_icecream_vanilla',
  scoop_chocolate: 'icecream_container_icecream_chocolate',
  scoop_strawberry: 'icecream_container_icecream_strawberry',
  cherry: 'crate',      // cherries from a generic crate (no cherry-crate art)
};
