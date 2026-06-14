// Core game orchestrator: scene, loop, interactions, scoring, round flow.
import * as THREE from 'three';
import { TILE, preloadRestaurant, charUnlocked } from './models.js';
import { ITEMS, DISHES, matchDish, canPlate, combine, itemModelNames } from './recipes.js';
import { LEVELS, levelModelNames } from './levels.js';
import { World } from './world.js';
import { Chef, preloadChef } from './chef.js';
import { makeIngredient, makePlate, buildItemMesh, drawRing } from './stations.js';
import { Orders } from './orders.js';
import { SinkQuiz } from './sink.js';
import { FX } from './fx.js';
import { modelIcon } from './icons.js';
import { ui } from './ui.js';
import { audio } from './audio.js';

const CHOP_TIME = 1.4;
const PLATE_RETURN_DELAY = 5;
const ANSWERS_PER_PLATE = 3;       // correct verb answers needed to wash one plate

export class Game {
  constructor(renderer, save, onRoundEnd) {
    this.renderer = renderer;
    this.save = save;
    this.onRoundEnd = onRoundEnd;
    this.scene = null;
    this.camera = null;
    this.running = false;
    this.keys = {};
    this.qaFrozen = false;
    this.fpsAvg = 60;

    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('resize', () => this.onResize());
  }

  async preload(level) {
    // The recipe card IS the loading screen now (see startLevel), so no
    // separate full-screen loader here — just resolve when assets are ready.
    let charName = 'rogue';
    try {
      const c = localStorage.getItem('krabsy_vkitchen_char');
      if (c && charUnlocked(c, this.save)) charName = c;
    } catch (e) {}
    await Promise.all([
      preloadRestaurant([...levelModelNames(level), ...itemModelNames()]),
      preloadChef(charName),
    ]);
  }

  async startLevel(levelIdx, opts = {}) {
    this.levelIdx = levelIdx;
    this.level = LEVELS[levelIdx];
    // The recipe card doubles as the loading screen: it appears immediately
    // with a pizza-building animation, and the "Let's cook!" button only
    // unlocks once all assets (models + the recipe image) have loaded.
    const loadP = this.preload(this.level);
    if (!opts.skipCountdown) await ui.showTutorial(this.level, loadP);
    else await loadP;

    // --- scene ---
    this.disposeScene();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c1430);
    this.scene.fog = new THREE.Fog(0x0c1430, 40, 80);

    this.world = new World(this.level);
    this.scene.add(this.world.group);

    const hemi = new THREE.HemisphereLight(0xbfd6ff, 0x303a55, 1.15);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2dd, 1.6);
    sun.position.set(-6, 14, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const ext = Math.max(this.world.cols, this.world.rows) * TILE * 0.65;
    sun.shadow.camera.left = -ext; sun.shadow.camera.right = ext;
    sun.shadow.camera.top = ext; sun.shadow.camera.bottom = -ext;
    sun.shadow.camera.far = 50;
    sun.shadow.bias = -0.0008;
    this.scene.add(sun);

    // --- camera: fixed angled top-down, fit whole kitchen ---
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
    this.fitCamera();

    // --- actors ---
    this.chef = new Chef(this.world);
    this.chef.pos.copy(this.world.spawn);
    this.scene.add(this.chef.obj);

    this.fx = new FX(this.scene, this.camera, this.renderer);
    this.quiz = new SinkQuiz(this);
    this.orders = new Orders(this.level);

    this.sinkStation = this.world.stations.find((s) => s.type === 'sink');
    this.rackStation = this.world.stations.find((s) => s.type === 'rack');
    this.hatchStation = this.world.stations.find((s) => s.type === 'hatch');
    this.rackStation.plates = this.level.plates;
    // Tutorial (Garden Bistro): seed one dirty plate at the sink so the player
    // meets the wash-by-grammar loop right away — 1 clean plate + 1 dirty.
    // Kept in game logic (not a level field) to avoid touching the frozen
    // level-data shape the parallel level-editor session is built against.
    this.sinkStation.dirtyPlates = this.level.id === 'garden' ? 1 : 0;
    this.rackStation.refreshStack();
    this.sinkStation.refreshStack();
    for (const s of this.level.startItems || []) {
      const st = this.world.stationAtTile(s.c, s.r);
      if (st) st.setItem(makeIngredient(s.item), false);
    }

    // --- round state ---
    this.score = 0;
    this.combo = 0;
    this.elapsed = 0;                // count-UP clock (deliver all orders fast!)
    this.washProgress = 0;           // correct answers banked toward the next clean plate
    this.washTarget = ANSWERS_PER_PLATE;
    this.questionOpen = false;
    this.plateReturns = [];          // timers for dirty plates in transit
    this.roundOver = false;
    this.lastHint = null;

    ui.showScreen(null);
    ui.hud(true);
    ui.setCoins(0); ui.setCombo(0); ui.setTime(this.elapsed);
    ui.setPlates(this.rackStation.plates);
    ui.setOrders(0, this.orders.total);

    this.onResize();
    if (!opts.skipCountdown) {
      this.renderOnce();
      await ui.countdown();
    }
    audio.music(this.levelIdx);
    this.clock = new THREE.Clock();
    this.running = true;
    if (!this._loopStarted) { this._loopStarted = true; this.loop(); }
  }

  fitCamera() {
    const w = this.world.cols * TILE, d = this.world.rows * TILE;
    const pitch = THREE.MathUtils.degToRad(56);
    const target = new THREE.Vector3(0, 0, -d * 0.06);
    const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
    // tight side margin (the kitchen is rectangular now that the floor/wall
    // overhang is trimmed) so the kitchen fills the portrait width → more zoom;
    // keep a deeper front/back margin for the back wall + front counters
    const mx = 0.4;
    const corners = [
      new THREE.Vector3(-w / 2 - mx, 0, -d / 2 - 1), new THREE.Vector3(w / 2 + mx, 0, -d / 2 - 1),
      new THREE.Vector3(-w / 2 - mx, 0, d / 2 + 1), new THREE.Vector3(w / 2 + mx, 0, d / 2 + 1),
      new THREE.Vector3(0, 4, -d / 2),
    ];
    let dist = 8;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    for (let i = 0; i < 60; i++) {
      this.camera.position.copy(target).addScaledVector(dir, dist);
      this.camera.lookAt(target);
      this.camera.updateMatrixWorld();
      this.camera.updateProjectionMatrix();
      let fits = true;
      for (const c of corners) {
        const p = c.clone().project(this.camera);
        if (Math.abs(p.x) > 0.94 || Math.abs(p.y) > 0.92) { fits = false; break; }
      }
      if (fits) break;
      dist += 1.2;
    }
  }

  onResize() {
    if (!this.camera) return;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.fitCamera();
  }

  // ---------- input ----------
  onKey(e, down) {
    const k = e.key.toLowerCase();
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    if (down && this.quiz && this.quiz.open) {
      if (this.quiz.handleKey(e.key)) return;
    }
    this.keys[k] = down;
    if (!this.running || this.roundOver) return;
    if (down && !e.repeat) {
      if (k === 'e') this.interactE();
      if (k === ' ') this.spacePress();
    }
  }

  inputVector() {
    let x = 0, z = 0;
    if (this.keys['a'] || this.keys['arrowleft']) x -= 1;
    if (this.keys['d'] || this.keys['arrowright']) x += 1;
    if (this.keys['w'] || this.keys['arrowup']) z -= 1;
    if (this.keys['s'] || this.keys['arrowdown']) z += 1;
    return { x, z };
  }

  targetStation() {
    const { col, row } = this.chef.targetTile();
    return this.world.stationAtTile(col, row);
  }

  // ---------- E: pick up / put down ----------
  interactE() {
    if (this.questionOpen) return;
    const st = this.targetStation();
    if (!st) return;
    const held = this.chef.carried;

    switch (st.type) {
      case 'crate': {
        if (!held) {
          const item = makeIngredient(st.crateItem);
          this.chef.setCarried(item, buildItemMesh(item));
        } else if (held.type === 'ing' && held.id === st.crateItem) {
          // put a mistakenly-grabbed ingredient back into its OWN box
          this.chef.setCarried(null);
          audio.putdown();
          this.fx.pop(st.pos.clone().setY(1.5), `${ITEMS[st.crateItem].emoji}↩`, 'var(--muted)');
        } else this.reject(st);
        break;
      }
      case 'rack': {
        if (!held && st.plates > 0) {
          st.plates--; st.refreshStack();
          ui.setPlates(st.plates);
          const p = makePlate([]);
          this.chef.setCarried(p, buildItemMesh(p));
        } else if (held && held.type === 'ing' && ITEMS[held.id].plateable && st.plates > 0 && canPlate([], held.id)) {
          // grab a clean plate AND set the held item on it in one move
          st.plates--; st.refreshStack();
          ui.setPlates(st.plates);
          const p = makePlate([]);
          this.plateAdd(p, held.id);
          if (held.steam > 0) p.steam = held.steam;
          this.chef.setCarried(p, buildItemMesh(p));
          if (p.dish) { audio.ding(); this.fx.sparkle(st.pos.clone().setY(st.topY + 0.5)); } else audio.clatter();
        } else if (held && held.type === 'plate' && !held.dirty && held.contents.length === 0) {
          st.plates++; st.refreshStack();
          ui.setPlates(st.plates);
          this.chef.setCarried(null);
          audio.clatter();
        } else this.reject(st);
        break;
      }
      case 'trash': {
        if (held && held.type === 'ing' && ITEMS[held.id].reusable) {
          this.reject(st);            // the only ketchup bottle is not trash
        } else if (held && held.type === 'ing') {
          this.chef.setCarried(null);
          audio.trash();
          this.fx.pop(st.pos.clone().setY(1.6), '🗑️', 'var(--muted)');
        } else if (held && held.type === 'plate' && held.contents.length) {
          held.contents = []; held.dish = null;
          this.chef.setCarried(held, buildItemMesh(held));
          audio.trash();
        } else this.reject(st);
        break;
      }
      case 'hatch': {
        if (held && held.type === 'plate' && held.dish) {
          const res = this.orders.serve(held.dish);
          if (res) { this.serveSuccess(held, res, st); break; }
        }
        // trying to send out food that isn't on a plate → show the "use a plate" bubble
        if (held && held.type === 'ing') this.fx.bubble(st.pos.clone().setY(st.topY + 1.15), [modelIcon('plate')]);
        this.reject(st);
        break;
      }
      case 'board': {
        if (held && held.type === 'ing' && !st.item) {
          const def = ITEMS[held.id];
          // a raw choppable needs the matching tool; a cut/finished item can
          // just be parked here (set it down to free a hand, grab it later)
          if (!def.chopTo || (def.tool || 'knife') === (st.tool || 'knife')) {
            st.setItem(held);
            if (def.interim) st.progress = 0.5;   // resume the bar at halfway
            this.chef.setCarried(null);
          } else this.reject(st);
        } else if (held && held.type === 'plate' && !held.dirty && st.item && st.item.type === 'ing' &&
                   ITEMS[st.item.id].plateable && canPlate(held.contents, st.item.id)) {
          // scoop a chopped ingredient straight onto the plate in hand
          const ing = st.takeItem();
          this.plateAdd(held, ing.id);
          if (ing.steam > 0) held.steam = Math.max(held.steam || 0, ing.steam);
          this.chef.setCarried(held, buildItemMesh(held));
          if (held.dish) { audio.ding(); this.fx.sparkle(st.pos.clone().setY(st.topY + 0.5)); }
        } else if (!held && st.item) {
          const it = st.takeItem();
          this.chef.setCarried(it, buildItemMesh(it));
        } else this.reject(st);
        break;
      }
      case 'stove':
      case 'oven': {
        const wantsBake = st.type === 'oven';
        // 1) put a raw item on to cook / bake
        if (held && held.type === 'ing' && !st.item) {
          const def = ITEMS[held.id];
          const ok = wantsBake ? !!def.bakeTo : (!!def.cookTo || (!!def.burnTo && !def.bakeTo));
          if (ok) { st.startCooking(held); this.chef.setCarried(null); }
          else this.reject(st);
          break;
        }
        const ready = st.item && st.state === 'ready';
        const burnt = st.item && st.state === 'burnt';
        // 2) take a baked pizza — too hot for bare hands, needs an empty plate
        if (wantsBake && (ready || burnt)) {
          if (held && held.type === 'plate' && !held.dirty && held.contents.length === 0) {
            this.takeHotOntoPlate(st, held);
          } else { this.reject(st); this.fx.bubble(st.pos.clone().setY(st.topY + 1.15), [modelIcon('plate')]); }
          break;
        }
        // 3) take a cooked patty — a plate, or a bun (→ bun+patty). NOT bare hands.
        if (st.type === 'stove' && ready) {
          const ontoBurger = held && held.type === 'ing' && combine(held.id, st.item.id);
          if (held && held.type === 'plate' && !held.dirty && canPlate(held.contents, st.item.id)) {
            this.takeHotOntoPlate(st, held);
          } else if (ontoBurger) {
            // slide the patty straight onto a held bun / partial burger
            const it = st.clearCooking();
            const carry = makeIngredient(ontoBurger);
            if (it.steam > 0) carry.steam = it.steam;
            this.chef.setCarried(carry, buildItemMesh(carry));
            this.updateSizzle();
            audio.putdown();
          } else { this.reject(st); this.fx.bubble(st.pos.clone().setY(st.topY + 1.15), [modelIcon('plate'), modelIcon('food_ingredient_bun')]); }
          break;
        }
        // 4) bare-hand take what's left: a burnt patty (→ trash) or a mid-cook item
        if (!held && st.item) {
          const wasBurnt = st.state === 'burnt';
          const it = st.clearCooking();
          this.chef.setCarried(it, buildItemMesh(it));
          if (wasBurnt) this.stopSmoke(st);
          this.updateSizzle();
          break;
        }
        this.reject(st);
        break;
      }
      case 'sink': {
        this.spacePress(true);       // E also opens the wash question
        break;
      }
      case 'counter': {
        this.counterInteract(st, held);
        break;
      }
    }
    this.refreshHint(true);
  }

  counterInteract(st, held) {
    if (!held && st.item) {
      const it = st.takeItem();
      this.chef.setCarried(it, buildItemMesh(it));
      return;
    }
    if (held && !st.item) {
      st.setItem(held);
      this.chef.setCarried(null);
      return;
    }
    if (held && st.item) {
      // plate on counter + plateable in hand
      if (st.item.type === 'plate' && !st.item.dirty && held.type === 'ing' &&
          ITEMS[held.id].plateable && canPlate(st.item.contents, held.id)) {
        this.plateAdd(st.item, held.id);
        if (held.steam > 0) st.item.steam = Math.max(st.item.steam || 0, held.steam);
        st.setItem(st.item);
        this.chef.setCarried(null);
        if (st.item.dish) { audio.ding(); this.fx.sparkle(st.pos.clone().setY(st.topY + 0.5)); }
        return;
      }
      // plate in hand + plateable on counter
      if (held.type === 'plate' && !held.dirty && st.item.type === 'ing' &&
          ITEMS[st.item.id].plateable && canPlate(held.contents, st.item.id)) {
        const ing = st.takeItem();
        this.plateAdd(held, ing.id);
        if (ing.steam > 0) held.steam = Math.max(held.steam || 0, ing.steam);
        this.chef.setCarried(held, buildItemMesh(held));
        if (held.dish) { audio.ding(); this.fx.sparkle(st.pos.clone().setY(st.topY + 0.5)); }
        return;
      }
      // pizza assembly: base on counter + addition in hand
      if (st.item.type === 'ing' && held.type === 'ing') {
        let result = combine(st.item.id, held.id);
        if (result) {
          st.setItem(makeIngredient(result));
          // reusable tools (ketchup bottle) stay in hand after use
          if (!ITEMS[held.id].reusable) this.chef.setCarried(null);
          this.fx.sparkle(st.pos.clone().setY(st.topY + 0.5));
          return;
        }
        result = combine(held.id, st.item.id);
        if (result) {
          const r = makeIngredient(result);
          if (!ITEMS[st.item.id].reusable) st.takeItem();
          this.chef.setCarried(r, buildItemMesh(r));
          this.fx.sparkle(st.pos.clone().setY(st.topY + 0.5));
          return;
        }
      }
    }
    this.reject(st);
  }

  reject(st) {
    audio.reject();
    if (st && st.itemMesh) {
      st.itemMesh.userData.drop = 0.12;   // little hop = "nope"
    }
  }

  /** Add a plateable ingredient to a plate, unpacking combos (burgerwip → bun + fillings). */
  plateAdd(plate, ingId) {
    const parts = ITEMS[ingId].expandsTo || [ingId];
    for (const p of parts) plate.contents.push(p);
    plate.dish = matchDish(plate.contents);
  }

  /** Slide hot food (baked pizza / cooked patty) from stove/oven onto a plate. */
  takeHotOntoPlate(st, plate) {
    const wasBurnt = st.state === 'burnt';
    const it = st.clearCooking();
    plate.contents.push(it.id);
    plate.dish = matchDish(plate.contents);
    if (it.steam > 0) plate.steam = Math.max(plate.steam || 0, it.steam);
    this.chef.setCarried(plate, buildItemMesh(plate));
    if (wasBurnt) this.stopSmoke(st);
    this.updateSizzle();
    if (plate.dish) { audio.ding(); this.fx.sparkle(st.pos.clone().setY(st.topY + 0.5)); }
  }

  // ---------- Space: work station ----------
  spacePress(fromE = false) {
    if (this.questionOpen) return;
    const st = this.targetStation();
    if (st && st.type === 'sink') {
      if (st.dirtyPlates > 0) this.quiz.openQuestion();
      else { this.reject(null); this.fx.pop(st.pos.clone().setY(1.8), 'no dirty plates ✨', 'var(--teal)'); }
    }
  }

  workStations(dt) {
    this.chef.working = false;
    this.chopBoard = null;             // board whose resting tool is "in hand" this frame
    if (!this.keys[' '] || this.questionOpen) return;
    const st = this.targetStation();
    if (st && st.type === 'board' && st.item && st.item.type === 'ing') {
      const def = ITEMS[st.item.id];
      if (def.chopTo) {
        this.chef.working = true;
        this.chef.workTool = st.tool || 'knife';
        this.chopBoard = st;           // hide this board's resting tool while chopping

        const before = st.progress;
        st.progress += dt / (def.chopTime || CHOP_TIME);
        if (Math.floor(before * 5) !== Math.floor(st.progress * 5)) audio.chop();
        // two-stage chains share ONE continuous bar: swap to the interim
        // model at 50% without resetting progress, finish at 100%
        if (ITEMS[def.chopTo]?.interim) {
          if (st.progress >= 0.5) st.setItem(makeIngredient(def.chopTo), true, true);
        } else if (st.progress >= 1) {
          st.setItem(makeIngredient(def.chopTo));
          this.fx.sparkle(st.pos.clone().setY(st.topY + 0.4));
        }
      }
    }
  }

  // ---------- serving / scoring ----------
  serveSuccess(plate, res, hatch) {
    const d = DISHES[plate.dish];
    this.combo++;
    const bonus = Math.min(Math.max(this.combo - 1, 0), 3) * 5;
    const orderBonus = res.inOrder ? 5 : 0;     // served the oldest ticket first
    const gained = d.coins + bonus + orderBonus;
    this.score += gained;
    this.chef.setCarried(null);
    audio.serve();
    ui.setCoins(this.score);
    ui.setCombo(this.combo);
    ui.setOrders(res.served, res.total);
    this.fx.coins(hatch.pos.clone().setY(1.8));
    this.fx.pop(hatch.pos.clone().setY(1.8), `+${gained} 🪙${bonus ? ' 🔥' : ''}${orderBonus ? ' 📋' : ''}`);
    if (this.orders.allServed()) {
      this.fx.pop(hatch.pos.clone().setY(2.3), 'all served! 🎉', 'var(--teal)');
      setTimeout(() => { if (!this.roundOver) this.endRound(); }, 900);
    } else {
      // plate comes back dirty in a few seconds
      this.plateReturns.push(PLATE_RETURN_DELAY + Math.random() * 2);
    }
  }

  // ---------- sink callbacks ----------
  onQuestionOpen() {
    this.questionOpen = true;
    this.chef.frozen = true;
    audio.duck(true);
  }
  onQuestionClose() {
    this.questionOpen = false;
    this.chef.frozen = false;
    audio.duck(false);
  }
  /** One correct verb answer = 1/3 of a wash. Three banked → one clean plate.
   *  Progress is kept if the player leaves the sink mid-wash. */
  onWashCorrect() {
    this.washProgress++;
    if (this.washProgress >= ANSWERS_PER_PLATE) {
      this.washProgress = 0;
      this.sinkStation.dirtyPlates--;
      this.sinkStation.refreshStack();
      this.rackStation.plates++;
      this.rackStation.refreshStack();
      ui.setPlates(this.rackStation.plates);
      ui.setWashProgress(0, ANSWERS_PER_PLATE);
      audio.washComplete();                 // triumphant fanfare
      ui.confetti();                        // confetti burst over the quiz card
      this.fx.sparkle(this.rackStation.pos.clone().setY(this.rackStation.topY + 0.5));
      return { plateDone: true, noMoreDirty: this.sinkStation.dirtyPlates <= 0 };
    }
    ui.setWashProgress(this.washProgress, ANSWERS_PER_PLATE);
    return { plateDone: false };
  }
  onPlateMissed(q) {
    if (!this.save.missed.includes(q.verb)) this.save.missed.push(q.verb);
  }

  // ---------- smoke / alarm ----------
  startSmoke(st) {
    this.fx.smokeSources.add(st);
    audio.alarm(true);
  }
  stopSmoke(st) {
    this.fx.smokeSources.delete(st);
    if (this.fx.smokeSources.size === 0) audio.alarm(false);
  }
  updateSizzle() {
    const any = this.world.stations.some((s) => s.type === 'stove' && (s.state === 'cooking' || s.state === 'ready'));
    audio.sizzle(any);
  }

  // hot food (fresh patty / baked pizza) breathes steam wherever it sits
  updateSteam(dt) {
    this.steamT = (this.steamT || 0) - dt;
    const emit = this.steamT <= 0;
    if (emit) this.steamT = 0.45;
    const tick = (item, pos) => {
      if (!item || !(item.steam > 0)) return;
      item.steam -= dt;
      if (emit) this.fx.steam(pos);
    };
    for (const st of this.world.stations) {
      tick(st.item, st.pos.clone().setY(st.topY + 0.35));
    }
    tick(this.chef.carried, this.chef.pos.clone().setY(1.7));
  }

  // ---------- hint bar ----------
  refreshHint(force = false) {
    const st = this.targetStation();
    const held = this.chef.carried;
    let text = '';
    if (st) {
      if (st.type === 'crate') text = held ? '' : `E — grab ${ITEMS[st.crateItem].emoji}`;
      else if (st.type === 'board') {
        const heldPlate = held && held.type === 'plate' && !held.dirty;
        if (st.item && ITEMS[st.item.id]?.interim) text = 'halfway — keep chopping!';
        else if (st.item && ITEMS[st.item.id]?.chopTo) text = `hold Space — ${ITEMS[st.item.id].chopVerb || 'chop'}!`;
        else if (st.item && heldPlate && ITEMS[st.item.id]?.plateable && canPlate(held.contents, st.item.id)) text = 'E — add to plate 🍽️';
        else if (st.item && !held) text = 'E — take it';
        else if (held && held.type === 'ing' && ITEMS[held.id].chopTo) {
          const need = ITEMS[held.id].tool || 'knife';
          if (need === (st.tool || 'knife')) text = 'E — put it on the board';
          else text = need === 'rollingpin' ? 'dough needs the rolling pin 🥖' : 'that needs the cutting board 🔪';
        }
        else if (held && held.type === 'ing') text = 'E — set it down';
      }
      else if (st.type === 'stove' || st.type === 'oven') {
        const emptyPlate = held && held.type === 'plate' && !held.dirty && held.contents.length === 0;
        const heldDef = held && held.type === 'ing' ? ITEMS[held.id] : null;
        if (st.state === 'ready') {
          if (st.type === 'oven') text = emptyPlate ? 'E — plate the pizza!' : 'too hot! bring a clean plate 🍽️';
          else {
            const onBun = held && held.type === 'ing' && st.item && combine(held.id, st.item.id);
            text = emptyPlate ? 'E — plate the patty!' : onBun ? 'E — patty on the bun!' : 'too hot! use a plate or bun 🍽️🍞';
          }
        } else if (st.state === 'burnt') {
          if (st.type === 'oven') text = emptyPlate ? 'E — plate it… for the trash 💀' : 'too hot! bring a clean plate 🍽️';
          else text = held ? 'free a hand to bin it 💀' : 'E — bin the burnt patty 💀';
        }
        else if (st.state === 'cooking') text = 'cooking…';
        // a pizza still missing a must-have topping can't go in the oven yet
        else if (heldDef && st.type === 'oven' && !heldDef.bakeTo &&
                 (heldDef.compose === 'pizza' || held.id === 'dough_base')) {
          const have = heldDef.toppings || [];
          const need = [];
          if (!have.includes('sauce')) need.push('🥫');
          if (!have.includes('cheese')) need.push('🧀');
          text = `add ${need.join(' + ')} first 🍕`;
        }
        else if (held) text = 'E — start cooking';
      }
      else if (st.type === 'sink') text = st.dirtyPlates > 0 ? 'Space — wash a plate 🧽' : 'no dirty plates';
      else if (st.type === 'rack') text = held ? '' : 'E — take a clean plate';
      else if (st.type === 'hatch') text = (held && held.type === 'plate' && held.dish) ? 'E — serve! 🛎️' : 'serving hatch';
      else if (st.type === 'trash') text = held ? 'E — throw away' : '';
      else if (st.type === 'counter') {
        if (held && st.item) text = 'E — combine';
        else if (held) text = 'E — put down';
        else if (st.item) text = 'E — pick up';
      }
    }
    if (text !== this.lastHint || force) {
      ui.hint(text);
      this.lastHint = text;
    }
  }

  // ---------- main loop ----------
  loop() {
    requestAnimationFrame(() => this.loop());
    if (!this.running || !this.scene) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.fpsAvg = this.fpsAvg * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
    if (!this.qaFrozen) this.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  renderOnce() {
    if (this.scene && this.camera) this.renderer.render(this.scene, this.camera);
  }

  update(dt) {
    if (this.roundOver) { this.chef.update(dt, { x: 0, z: 0 }, this.fx); this.fx.update(dt); return; }

    // count-UP clock — keeps running during sink questions, so quick verb
    // recall (and not dawdling at the sink) earns a better time
    this.elapsed += dt;
    ui.setTime(this.elapsed);

    this.chef.update(dt, this.questionOpen ? { x: 0, z: 0 } : this.inputVector(), this.fx);
    this.workStations(dt);

    // stations (cooking pauses during questions)
    for (const st of this.world.stations) {
      for (const ev of st.update(dt, this.questionOpen)) {
        if (ev === 'ready') {
          audio.ding();
          this.fx.pop(st.pos.clone().setY(st.topY + 1), 'ready!', 'var(--teal)');
          if (ITEMS[st.item.id]?.steamy) st.item.steam = 14;   // hot & ready
        }
        if (ev === 'burnt') { this.startSmoke(st); this.fx.pop(st.pos.clone().setY(st.topY + 1), 'burnt! 🔥', 'var(--coral)'); }
      }
      // the resting board tool vanishes while it's being used (it's "in the
      // chef's hand") and returns the moment chopping stops
      if (st.toolMesh) st.toolMesh.visible = (st !== this.chopBoard);
      // cutting-board progress ring
      if (st.type === 'board' && st.ring) {
        const choppable = st.item && st.item.type === 'ing' && ITEMS[st.item.id].chopTo;
        st.ring.visible = !!(choppable && st.progress > 0);
        if (st.ring.visible) drawRing(st.ring, st.progress, '#ffcf5e');
      }
    }
    this.updateSizzle();
    this.updateSteam(dt);

    // orders stream in from the fixed queue (no expiry — deliver them all)
    this.orders.update(dt);

    // dirty plates in transit back to the sink
    for (let i = this.plateReturns.length - 1; i >= 0; i--) {
      this.plateReturns[i] -= dt;
      if (this.plateReturns[i] <= 0) {
        this.plateReturns.splice(i, 1);
        this.sinkStation.dirtyPlates++;
        this.sinkStation.refreshStack();
        audio.putdown();
      }
    }

    // target-tile highlight
    const t = this.chef.targetTile();
    const st = this.world.stationAtTile(t.col, t.row);
    this.world.highlight.visible = !!st;
    if (st) this.world.highlight.position.set(st.pos.x, 1.12, st.pos.z);

    this.refreshHint();
    this.fx.update(dt);
  }

  endRound() {
    this.roundOver = true;
    audio.stopAll();
    audio.serve();
    if (this.quiz.open) this.quiz.close();
    this.orders.clear();
    ui.hud(false);

    const lv = this.level;
    const t = this.elapsed;
    const [, s2, s3, sA] = lv.starTimes;     // s1 (1★) is now just "finish" — always ≥1
    let stars = 1;                            // completing the level always earns ≥1 star
    if (t <= s2) stars = 2;
    if (t <= s3) stars = 3;
    if (t <= sA) stars = 4;                   // author star (hardest)
    const prevStars = this.save.stars[lv.id] || 0;
    const prevBest = this.save.bestTime[lv.id];      // best = FASTEST time (lower is better)
    const isNewBest = prevBest == null || t < prevBest;
    this.save.stars[lv.id] = Math.max(prevStars, stars);
    if (isNewBest) this.save.bestTime[lv.id] = t;
    this.onRoundEnd(this);

    ui.renderPost(lv, t, this.score, stars, this.quiz.missedThisRound, this.save.bestTime[lv.id],
      this.levelIdx < LEVELS.length - 1, isNewBest);
  }

  stopRound() {
    this.running = false;
    audio.stopAll();
    if (this.quiz && this.quiz.open) this.quiz.close();
    if (this.orders) this.orders.clear();
    ui.hud(false);
  }

  disposeScene() {
    if (!this.scene) return;
    this.scene.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
      }
    });
    this.scene = null;
  }
}
