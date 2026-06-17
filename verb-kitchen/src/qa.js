// QA hook (window.__VK) + ?qa= frozen scenes for headless screenshots.
import { makeIngredient, makePlate, buildItemMesh } from './stations.js';
import { ITEMS } from './recipes.js';
import { modelIcon } from './icons.js';
import { seedRng } from './verbs.js';
import { ui } from './ui.js';

export function initQA(game, save, startLevel, params) {
  const VK = {
    game, save,
    state() {
      return {
        level: game.level?.id,
        score: game.score,
        combo: game.combo,
        elapsed: Math.round(game.elapsed * 10) / 10,
        served: game.orders?.served,
        total: game.orders?.total,
        washProgress: game.washProgress,
        questionOpen: game.questionOpen,
        carried: game.carried(),
        rackPlates: game.rackStation?.plates,
        dirtyPlates: game.sinkStation?.dirtyPlates,
        tickets: game.orders?.tickets.map((t) => t.dish),
        queued: game.orders?.queue?.length,
        stations: game.world?.stations.filter((s) => s.item || s.state !== 'idle')
          .map((s) => ({ type: s.type, item: s.item?.type === 'plate' ? `plate[${s.item.contents}]` : s.item?.id, state: s.state })),
        fps: Math.round(game.fpsAvg),
        roundOver: game.roundOver,
      };
    },
    teleport(col, row) {
      const p = game.world.tileWorld(col, row);
      game.chef.pos.set(p.x, 0, p.z);
    },
    face(dx, dz) { game.chef.facing.set(dx, dz); },
    give(id) {
      const item = id === 'plate' ? makePlate([]) : makeIngredient(id);
      game.chef.setCarried(item, buildItemMesh(item));
    },
    givePlate(contents) {
      const p = makePlate(contents);
      game.chef.setCarried(p, buildItemMesh(p));
    },
    clearHands() { game.chef.setCarried(null); },
    pressE() { game.interactE(); },
    holdSpace(seconds) {           // simulate held Space for n seconds of game time
      game.keys[' '] = true;
      let left = seconds;
      while (left > 0) { const dt = Math.min(left, 1 / 30); game.update(dt); left -= dt; }
      game.keys[' '] = false;
    },
    pressSpace() { game.spacePress(); },
    tick(seconds) {                // advance game time deterministically
      let left = seconds;
      while (left > 0) { const dt = Math.min(left, 1 / 30); game.update(dt); left -= dt; }
    },
    spawnTicket(dish) { return game.orders.spawn(dish); },
    clearTickets() { for (const t of [...game.orders.tickets]) game.orders.remove(t, 'gone'); },
    dirtyPlates(n) {
      game.sinkStation.dirtyPlates = n;
      game.sinkStation.refreshStack();
    },
    openQuestion() { game.quiz.openQuestion(); },
    currentQuestion() { return game.quiz.current; },
    answer(correct) {
      const q = game.quiz.current;
      if (!q) return false;
      game.quiz.lockUntil = 0;
      const idx = correct ? q.chips.indexOf(q.answer) : q.chips.findIndex((c) => c !== q.answer);
      game.quiz.answer(idx);
      return true;
    },
    continueAfterWrong() { game.quiz.nextAfterWrong(); },
    setElapsed(s) { game.elapsed = s; },
    setWashProgress(n) { game.washProgress = n; },
    endRound() { game.endRound(); },
    freeze(on = true) { game.qaFrozen = on; },
    setNoSpawn(on = true) { game.orders.spawningEnabled = !on; },
    startLevel,
    saveRaw: () => localStorage.getItem('krabsy_vkitchen_save'),
  };
  game.carried = () => {
    const c = game.chef?.carried;
    if (!c) return null;
    return c.type === 'plate' ? `plate[${c.contents}]${c.dish ? ':' + c.dish : ''}` : c.id;
  };
  window.__VK = VK;

  const qa = params.get('qa');
  if (!qa) return;

  seedRng(42);

  (async () => {
    const scene = qa;
    const lvIdx = { level1: 0, level2: 1, level3: 2, level4: 3, coop: 3, level5: 4, split: 4, level6: 5, soup: 5, level7: 6, icecream: 6, question: 0, burn: 1, stars: 0, recipe: 0, recipeload: 0, washing: 0, shop: 0 }[scene] ?? 0;
    if (scene === 'loading') {       // loader overlay showcase (stays up)
      ui.loading(true);
      window.__VK_READY = true;
      return;
    }
    if (scene === 'menu') {          // level-select showcase with sample progress
      const fake = { stars: { garden: 4, burger: 3, pizzapalace: 1 },
                     bestTime: { garden: 58, burger: 152, pizzapalace: 240 } };
      ui.renderLevelGrid(fake, () => {});
      ui.showScreen('levelScreen');
      window.__VK_READY = true;
      return;
    }
    if (scene === 'shop') {          // character shop: 7 stars → 3 unlocked, 2 locked
      save.stars = { garden: 4, burger: 3 };
      ui.renderShop(save, 'rogue', () => {});
      ui.showScreen('shopScreen');
      window.__VK_READY = true;
      return;
    }
    await startLevel(lvIdx, { skipCountdown: true });
    VK.setNoSpawn(true);

    const put = (col, row, item) => {
      const st = game.world.stationAtTile(col, row);
      if (st) st.setItem(item, false);
    };
    if (scene === 'level1' || scene === 'level2' || scene === 'level3') {
      VK.spawnTicket(null);
      VK.spawnTicket(null);
      if (scene === 'level2') {
        // showcase: the three finished burgers + a plate-less permutation
        put(2, 2, makePlate(['bun', 'patty_cooked']));                                       // hamburger
        put(3, 2, makePlate(['bun', 'patty_cooked', 'cheese_chopped']));                     // cheeseburger
        put(4, 2, makePlate(['bun', 'patty_cooked', 'cheese_chopped', 'lettuce_chopped']));  // big burger
        put(7, 4, makeIngredient('burgerwip_cheese'));   // plate-less: bun + cheese (open, no patty)
        put(2, 5, makeIngredient('cheese_chopped'));     // chopped cheese slice on a board (sits on top)
      }
      VK.tick(0.5);
    } else if (scene === 'soup' || scene === 'level6') {
      // soup-level showcase: a soup ticket + the pipeline staged on counters —
      // a finished bowl of soup plated, a full pot ready to boil, and a chopped
      // onion on the cutting board.
      VK.spawnTicket('garden_soup');
      VK.spawnTicket('garden_soup');
      put(7, 4, makePlate(['soup']));                          // finished garden soup, plated
      put(6, 4, makeIngredient('potwip_onion_carrot_potato')); // full pot, ready for the stove
      put(2, 2, makeIngredient('onion_chopped'));              // a chopped onion on a board
      VK.tick(0.5);
    } else if (scene === 'icecream' || scene === 'level7') {
      // sundae-level showcase: two sundae tickets + the cold-assembly pipeline
      // staged on counters — a finished sundae plated (renders as a bowl of ice
      // cream on the plate), a part-built one (a scoop in the bowl, no cherry
      // yet), and a loose cherry topping ready to add.
      VK.spawnTicket('sundae_neapolitan');
      VK.spawnTicket('sundae_deluxe');
      put(7, 1, makePlate(['scoop_vanilla', 'cherry']));                 // finished Vanilla Sundae, plated (bowl look)
      put(6, 1, makePlate(['scoop_chocolate', 'scoop_strawberry']));     // part-built deluxe — two scoops, cherry still to come
      put(6, 2, makeIngredient('cherry'));                               // a loose cherry topping
      VK.tick(0.5);
    } else if (scene === 'coop') {
      // co-op helper showcase: with no demand gate it stocks both boards (slowly,
      // unhurried), then parks in the bottom-left idle corner. No RNG in the bot.
      VK.tick(28);
    } else if (scene === 'split') {
      // split-kitchen showcase: a few orders → the planner cuts only what they
      // need (no duplicates of free slices) onto the pass pool, then idles.
      VK.spawnTicket('salad');
      VK.spawnTicket('cheeseburger');
      VK.spawnTicket('bigburger');
      VK.tick(60);
    } else if (scene === 'chop') {
      // frozen mid-chop: progress bar visible over the cutting board
      const board = game.world.stations.find((s) => s.type === 'board');
      VK.give('lettuce');
      VK.teleport(board.col, board.row - 1);   // stand INSIDE the kitchen
      VK.face(0, 1);
      VK.pressE();
      VK.holdSpace(1.25);   // freeze at the TOP of the knife swing
      VK.freeze(true);
    } else if (scene === 'carry') {
      // worst case for carry visibility: chef faces away from the camera
      // (head between camera and item) holding the smallest item
      VK.give('ketchup');
      VK.teleport(4, 3);
      VK.face(0, -1);
      VK.tick(0.3);
      VK.freeze(true);
    } else if (scene === 'question') {
      VK.spawnTicket('salad');
      VK.dirtyPlates(2);
      VK.setWashProgress(1);          // show the 3-segment wash bar mid-progress
      VK.tick(0.3);
      VK.openQuestion();
    } else if (scene === 'recipe') {
      ui.showTutorial(game.level);                  // loaded state (Start button)
    } else if (scene === 'recipeload') {
      ui.showTutorial(game.level, new Promise(() => {}));  // frozen loading state
    } else if (scene === 'washing') {
      // chef's dishwashing pose at the sink (no quiz card)
      const sink = game.world.stations.find((s) => s.type === 'sink');
      VK.teleport(sink.col, sink.row + 1); VK.face(0, -1);
      game.chef.frozen = true;
      VK.tick(0.6);                 // advance into the Working_A loop
      VK.freeze(true);              // hold the frame for the screenshot
    } else if (scene === 'burn') {
      VK.spawnTicket('hamburger');
      const stove = game.world.stations.find((s) => s.type === 'stove');
      stove.startCooking(makeIngredient('patty_cooked'));
      stove.state = 'ready';
      VK.tick(12.5);             // ride through burn → smoke
    } else if (scene === 'stars') {
      game.score = 250;
      game.quiz.missedThisRound = ['go|past', 'eat|pp'];
      VK.endRound();
    } else if (scene === 'bubble') {
      // showcase the help-bubble icons: rendered game objects (plate, bun),
      // NOT emoji. Built persistently (no auto-remove) for a clean screenshot.
      VK.tick(0.2); ui.fade(false);     // reveal the kitchen behind the bubbles
      const showBubble = (icons, left, top) => {
        const el = document.createElement('div');
        el.className = 'fxbubble';
        el.style.left = left + 'px'; el.style.top = top + 'px';
        for (const src of icons) { const img = document.createElement('img'); img.src = src; img.alt = ''; el.appendChild(img); }
        document.body.appendChild(el);
      };
      showBubble([modelIcon('plate')], 150, 320);                                   // oven / hatch: bring a plate
      showBubble([modelIcon('plate'), modelIcon('food_ingredient_bun')], 300, 320); // stove: plate or bun
    }
    window.__VK_READY = true;
  })();
}
