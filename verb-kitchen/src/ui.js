// Screens (start / level select / post-level), HUD, hint bar.
import { LEVELS, PLACEHOLDERS } from './levels.js';
import { VERBS } from './verbs.js';
import { CHEF_CHARACTERS, totalStars } from './models.js';
import { characterPortrait } from './portraits.js';

const $ = (id) => document.getElementById(id);

// Robust tap: pointerup (touch/pen) + click, deduped — some tablet browsers
// don't fire `click` after a touch, which would make level/character cards inert.
function tap(el, fn) {
  let viaPointer = false;
  el.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse') return;
    viaPointer = true; setTimeout(() => { viaPointer = false; }, 600);
    fn(e);
  });
  el.addEventListener('click', (e) => {
    if (viaPointer) { viaPointer = false; return; }
    fn(e);
  });
}

function fmtTime(sec) {
  const t = Math.max(0, Math.round(sec));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export const ui = {
  showScreen(id) {
    const screens = ['startScreen', 'levelScreen', 'shopScreen', 'post'];
    for (const s of screens) $(s).classList.toggle('hidden', s !== id);
    if (!id) for (const s of screens) $(s).classList.add('hidden');
  },

  /** Character shop: portrait cards, threshold-unlocked by total stars. */
  renderShop(save, selected, onSelect) {
    const grid = $('shopGrid');
    grid.innerHTML = '';
    const total = totalStars(save);
    $('shopStars').textContent = total;
    const entries = Object.entries(CHEF_CHARACTERS).sort((a, b) => (a[1].cost || 0) - (b[1].cost || 0));
    for (const [id, def] of entries) {
      const unlocked = total >= (def.cost || 0);
      const card = document.createElement('div');
      card.className = 'charCard' + (unlocked ? '' : ' locked') + (id === selected ? ' active' : '');
      const tag = !unlocked ? `<div class="ctag cost">⭐ ${def.cost}</div>`
        : (id === selected ? '<div class="ctag sel">✓ Selected</div>' : '<div class="ctag">Select</div>');
      card.innerHTML = `<div class="cportrait"><img alt="${def.name}"></div>` +
        `<div class="cname">${def.name}</div>${tag}` +
        (unlocked ? '' : '<div class="clock">🔒</div>');
      if (unlocked) { card.style.cursor = 'pointer'; tap(card, () => onSelect(id)); }
      grid.appendChild(card);
      characterPortrait(id).then((url) => { const img = card.querySelector('img'); if (img) img.src = url; }).catch(() => {});
    }
  },

  hud(on) { $('hud').classList.toggle('on', on); },

  renderLevelGrid(save, onPick) {
    const grid = $('levelGrid');
    grid.innerHTML = '';
    LEVELS.forEach((lv, i) => {
      const stars = save.stars[lv.id] || 0;
      const best = save.bestTime[lv.id];
      // first 3 levels are always open; later ones need ≥1 star in the previous
      const locked = i >= 3 && (save.stars[LEVELS[i - 1].id] || 0) < 1;
      const [, s2, s3, sA] = lv.starTimes;   // 1★ is just "finish" now (no time)
      // 3 normal stars (filled/empty) + the author star ONLY when earned (never empty)
      const starStr = [1, 2, 3].map((n) => `<span class="${n <= stars ? '' : 'off'}">⭐</span>`).join('')
        + (stars >= 4 ? '<span class="author">★</span>' : '');
      // the three target times are always visible; the author time hides until gold (3★)
      const tgt = (cls, label, secs) => `<div class="tgt ${cls}"><b>${label}</b>${fmtTime(secs)}</div>`;
      const targets =
        `<div class="tgt"><b>★</b>finish</div>` + tgt('', '★★', s2) + tgt('gold', '★★★', s3) +
        `<div class="tgt author"><b>★</b>${stars >= 3 ? fmtTime(sA) : '?:??'}</div>`;
      const el = document.createElement('div');
      el.className = 'lvl' + (locked ? ' locked' : '');
      el.innerHTML = `${locked ? '<div class="lock">🔒</div>' : ''}<div class="em">${lv.emoji}</div>` +
        `<div class="nm">Level ${lv.num}</div><div class="stars">${starStr}</div>` +
        `<div class="best">${best != null ? '⏱ ' + fmtTime(best) : '&nbsp;'}</div>` +
        `<div class="targets">${targets}</div>`;
      if (!locked) {
        el.style.cursor = 'pointer';
        tap(el, () => onPick(i));
      }
      grid.appendChild(el);
    });
    for (const ph of PLACEHOLDERS) {
      const el = document.createElement('div');
      el.className = 'lvl locked teaser';
      el.innerHTML = `<div class="lock">🔒</div><div class="em">${ph.emoji}</div>` +
        `<div class="nm">Level ${ph.num}</div><div class="soon">coming soon</div>`;
      grid.appendChild(el);
    }
  },

  setCoins(v) { $('coinVal').textContent = v; },
  setTime(sec) { $('timeVal').textContent = fmtTime(sec); },          // count-UP clock
  setOrders(served, total) { $('ordersVal').textContent = `${served}/${total}`; },
  setWashProgress(n, total) {
    const bar = $('washBar');
    if (bar) [...bar.querySelectorAll('.seg')].forEach((s, i) => s.classList.toggle('on', i < n));
    const lbl = $('washLabel');
    if (lbl) lbl.textContent = `🍽️ ${n}/${total}`;
  },

  /** Celebratory confetti burst from the top of the wash card. */
  confetti() {
    const card = $('quizCard');
    const r = card ? card.getBoundingClientRect()
                   : { left: innerWidth / 2, top: innerHeight * 0.3, width: 0, height: 0 };
    const cx = r.left + r.width / 2, top = r.top + 14;
    const colors = ['#2ee6c0', '#ff8585', '#ffcf5e', '#7cc0ff', '#ffffff'];
    for (let i = 0; i < 42; i++) {
      const d = document.createElement('div');
      d.className = 'confetti';
      d.style.left = cx + 'px';
      d.style.top = top + 'px';
      d.style.background = colors[i % colors.length];
      d.style.setProperty('--dx', (Math.random() * 520 - 260) + 'px');
      d.style.setProperty('--dy', (140 + Math.random() * 320) + 'px');
      d.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
      d.style.animationDelay = (Math.random() * 0.08) + 's';
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 1400);
    }
  },
  setCombo(n) {
    const pill = $('comboPill');
    pill.classList.toggle('on', n >= 2);
    if (n >= 2) $('comboVal').textContent = 'x' + n;
  },
  setPlates() {},   // plate-count HUD removed (the bottom-left counter was noise)
  hint(text) { $('hint').textContent = text || ''; },

  // --- guided tutorial banner (salad level) ---
  tutorialStep(icon, text, n, total) {
    const el = $('tutorial');
    el.classList.remove('done');
    el.innerHTML = `<div class="tStep">Step ${n} of ${total}</div>` +
      `<div class="tBody"><span class="tIcon">${icon}</span><span>${text}</span></div>`;
    el.classList.remove('on'); void el.offsetWidth;   // restart the slide-in
    el.classList.add('on');
  },
  tutorialDone(text) {
    const el = $('tutorial');
    el.classList.add('done');
    el.innerHTML = `<div class="tBody"><span class="tIcon">✅</span><span>${text}</span></div>`;
    el.classList.remove('on'); void el.offsetWidth;
    el.classList.add('on');
    clearTimeout(this._tutT);
    this._tutT = setTimeout(() => el.classList.remove('on'), 5200);
  },
  tutorialHide() { clearTimeout(this._tutT); $('tutorial').classList.remove('on'); },

  /** Recipe card that doubles as the loading screen: framed image + title +
   *  instruction, with a pizza-building animation in place of the button until
   *  `loadPromise` (assets + image) resolves. Resolves when the player taps Start. */
  showTutorial(level, loadPromise) {
    return new Promise((resolve) => {
      const t = level.tutorial || {};
      const ov = $('recipe'), btn = $('recipeBtn'), img = $('recipeImg');
      $('recipeTitle').textContent = t.title || level.name;
      $('recipeText').textContent = t.text || '';
      let imgP = Promise.resolve();
      if (t.image) {
        img.src = t.image;
        img.style.display = 'block';
        imgP = (img.complete && img.naturalWidth)
          ? Promise.resolve()
          : new Promise((res) => { img.onload = res; img.onerror = res; });
      } else {
        img.style.display = 'none';
      }
      // start in loading state: animation shown, button hidden
      btn.style.display = 'none';
      this.recipeLoading(true);
      ov.classList.remove('hidden');
      const go = () => { btn.removeEventListener('click', go); this.recipeLoading(false); ov.classList.add('hidden'); resolve(); };
      btn.addEventListener('click', go);
      // everything loaded → swap the pizza animation for the Start button.
      // Tolerate a failed preload/image (a single bad asset must never softlock
      // the loading screen) — show the button anyway.
      Promise.all([Promise.resolve(loadPromise).catch(() => {}), imgP]).then(() => {
        this.recipeLoading(false);
        btn.style.display = '';
      });
    });
  },

  /** Pizza-building animation inside the recipe card while assets load. */
  recipeLoading(on) {
    const box = $('recipeLoader');
    if (box) box.style.display = on ? 'flex' : 'none';
    clearInterval(this._rLoadTimer);
    if (!on) return;
    const MSGS = ['Heating the ovens', 'Sharpening the knives', 'Stocking the crates',
                  'Polishing the plates', 'Rolling out the dough', 'Tying the apron'];
    const pie = $('recipeLoaderPizza'), msg = $('recipeLoaderMsg');
    let step = 0;
    const SLICES = 8;
    const draw = () => {
      const deg = (step % (SLICES + 1)) * (360 / SLICES);
      if (pie) pie.style.background =
        `radial-gradient(circle at 32% 30%, #ff8585 0 6px, transparent 7px),` +
        `radial-gradient(circle at 68% 55%, #ff8585 0 6px, transparent 7px),` +
        `radial-gradient(circle at 42% 70%, #ff8585 0 6px, transparent 7px),` +
        `conic-gradient(#ffcf5e ${deg}deg, #5d4327 ${deg}deg)`;
      if (step % 3 === 0 && msg) msg.textContent = MSGS[(step / 3 | 0) % MSGS.length];
      step++;
    };
    draw();
    this._rLoadTimer = setInterval(draw, 260);
  },

  renderPost(level, elapsed, score, stars, missedKeys, bestTime, hasNext, isNewBest) {
    $('postTitle').textContent = `${level.emoji} Level ${level.num} — all served!`;
    $('postScore').textContent = fmtTime(elapsed);
    $('postCoins').textContent = `🪙 ${score} earned`;
    $('postBest').textContent = isNewBest ? '🎉 New best time!' : (bestTime != null ? `Best: ⏱ ${fmtTime(bestTime)}` : '');
    const starEls = [...$('postStars').children];   // [⭐, ⭐, ⭐, author ★]
    starEls.forEach((el, i) => {
      el.classList.remove('on', 'off2');
      if (i === 3) {
        // author star: shown only when earned, never as an empty slot
        el.style.display = stars >= 4 ? '' : 'none';
        if (stars >= 4) setTimeout(() => el.classList.add('on'), 350 + i * 420);
      } else if (i < stars) {
        setTimeout(() => el.classList.add('on'), 350 + i * 420);
      } else {
        el.classList.add('off2');
      }
    });
    // the author time stays secret until the gold (3rd) star is reached
    const sA = level.starTimes[3];
    const authEl = $('postAuthor');
    if (authEl) {
      if (stars >= 4) authEl.textContent = `★ Author star earned! (author time ⏱ ${fmtTime(sA)})`;
      else if (stars >= 3) authEl.textContent = `★ Author time: ⏱ ${fmtTime(sA)} — beat it for the 4th star!`;
      else authEl.textContent = '';
    }
    const box = $('missedBox');
    const list = $('missedList');
    list.innerHTML = '';
    const uniq = [...new Set(missedKeys.map((k) => k.split('|')[0]))];
    box.classList.toggle('empty', uniq.length === 0);
    for (const base of uniq.slice(0, 6)) {
      const v = VERBS.find((x) => x.v === base);
      if (!v) continue;
      const row = document.createElement('div');
      row.innerHTML = `<span class="form-base">${v.v}</span> → <span class="form-past">${v.past}</span> → <span class="form-pp">${v.pp}</span>`;
      list.appendChild(row);
    }
    $('nextBtn').style.display = hasNext && stars >= 1 ? '' : 'none';
    this.showScreen('post');
  },

  async countdown() {
    const cd = $('countdown'), num = $('countNum');
    cd.classList.add('on');
    for (const n of ['3', '2', '1', 'GO!']) {
      num.textContent = n;
      num.style.animation = 'none';
      void num.offsetWidth;          // restart CSS animation
      num.style.animation = '';
      await new Promise((r) => setTimeout(r, n === 'GO!' ? 550 : 750));
    }
    cd.classList.remove('on');
  },

  fade(on) { $('fader').classList.toggle('on', on); },
  loadingNote(t) { $('loadingNote').textContent = t || ''; },

  /** Full-screen loading overlay: a pizza builds slice by slice. */
  loading(on) {
    $('loader').classList.toggle('hidden', !on);
    clearInterval(this._loadTimer);
    if (!on) return;
    const MSGS = ['Rolling the dough', 'Firing up the oven', 'Sharpening the knives',
                  'Polishing the plates', 'Reading the order tickets', 'Tying the apron'];
    const pie = $('loaderPizza'), msg = $('loaderMsg');
    let step = 0;
    const SLICES = 8;
    const draw = () => {
      const n = step % (SLICES + 1);                      // 0..8 slices, then restart
      const deg = n * (360 / SLICES);
      // cheese wedge over dark crust, thin coral "pepperoni" ring on the cheese
      pie.style.background =
        `radial-gradient(circle at 32% 30%, #ff8585 0 7px, transparent 8px),` +
        `radial-gradient(circle at 68% 55%, #ff8585 0 7px, transparent 8px),` +
        `radial-gradient(circle at 42% 70%, #ff8585 0 7px, transparent 8px),` +
        `conic-gradient(#ffcf5e ${deg}deg, #5d4327 ${deg}deg)`;
      if (step % 3 === 0) msg.textContent = MSGS[(step / 3 | 0) % MSGS.length];
      step++;
    };
    draw();
    this._loadTimer = setInterval(draw, 260);
  },
};
