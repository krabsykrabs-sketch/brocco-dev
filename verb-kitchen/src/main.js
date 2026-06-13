// Boot: save/load, screen navigation, renderer, QA entry.
import * as THREE from 'three';
import { Game } from './game.js';
import { ui } from './ui.js';
import { audio } from './audio.js';
import { LEVELS } from './levels.js';
import { charUnlocked } from './models.js';
import { seedRng } from './verbs.js';
import { initQA } from './qa.js';
import { initTouch } from './touch.js';

const diag = (m, force) => { try { if (window.__diag) window.__diag(m, force); } catch (e) {} };
diag('main.js: start');   // if this logs, the import map + module graph loaded fine

// Robust tap: bind pointerup (touch/pen) alongside click, deduped — some tablet
// browsers don't deliver a `click` after a touch, which leaves the menu buttons
// looking pressed but doing nothing.
function tap(el, fn) {
  if (!el) return;
  let viaPointer = false;
  el.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse') return;           // mouse → let the click handler run
    viaPointer = true; setTimeout(() => { viaPointer = false; }, 600);
    fn(e);
  });
  el.addEventListener('click', (e) => {
    if (viaPointer) { viaPointer = false; return; }  // already handled on pointerup
    fn(e);
  });
}

const SAVE_KEY = 'krabsy_vkitchen_save';

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.v === 2) return s;
      // v1 stored best SCORES (higher = better); v2 races the clock, so the
      // metric changed — keep stars + missed verbs, reset best TIMES.
      if (s && s.v === 1) return { v: 2, stars: s.stars || {}, bestTime: {}, missed: s.missed || [] };
    }
  } catch (e) {}
  return { v: 2, stars: {}, bestTime: {}, missed: [] };
}
function persistSave(save) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
}

const save = loadSave();

// --- renderer (created once) ---
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  diag('renderer ok');
} catch (err) {
  diag('✗ WebGL failed: ' + ((err && err.message) || err), true);   // force-show: this device can't run the 3D
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const game = new Game(renderer, save, (g) => persistSave(g.save));
initTouch(game);   // additive touch input → same game.keys / interactE / spacePress

// --- mute ---
const muteBtn = document.getElementById('muteBtn');
function renderMute() { muteBtn.textContent = audio.muted ? '🔇' : '🔊'; }
muteBtn.addEventListener('click', () => { audio.setMuted(!audio.muted); renderMute(); });
renderMute();

// Stop all sound when the game isn't visible AND focused — switching tabs or
// moving out of the browser shouldn't leave the music playing.
const setAudioActive = () => audio.setActive(document.hasFocus() && !document.hidden);
document.addEventListener('visibilitychange', setAudioActive);
window.addEventListener('blur', setAudioActive);
window.addEventListener('focus', setAudioActive);
setAudioActive();   // set the right state even if the page loaded in a background tab
// mobile: a ctx the OS suspended in the background only resumes on a user gesture
['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, () => audio.resume()));

// --- navigation ---
function showLevelSelect() {
  game.stopRound();
  ui.renderLevelGrid(save, (idx) => startLevel(idx));
  ui.showScreen('levelScreen');
}

async function startLevel(idx, opts = {}) {
  audio.init(); audio.resume();
  ui.fade(true);
  await game.startLevel(idx, opts);
  ui.fade(false);
}

tap(document.getElementById('quitBtn'), () => showLevelSelect());
tap(document.getElementById('playBtn'), () => { diag('Play tapped'); audio.init(); showLevelSelect(); });
tap(document.getElementById('backBtn'), () => ui.showScreen('startScreen'));
tap(document.getElementById('retryBtn'), () => startLevel(game.levelIdx));
tap(document.getElementById('nextBtn'), () => startLevel(Math.min(game.levelIdx + 1, LEVELS.length - 1)));
tap(document.getElementById('menuBtn'), () => showLevelSelect());

// --- character selection (persists; game.preload reads the key) ---
const CHAR_KEY = 'krabsy_vkitchen_char';
function selectedChar() {
  try {
    const c = localStorage.getItem(CHAR_KEY);
    if (c && charUnlocked(c, save)) return c;   // must be unlocked, else fall back
  } catch (e) {}
  return 'rogue';
}
function pickChar(id) {
  if (!charUnlocked(id, save)) return;
  try { localStorage.setItem(CHAR_KEY, id); } catch (e) {}
  audio.init();
  ui.renderShop(save, selectedChar(), pickChar);   // refresh the "✓ Selected" highlight
}
tap(document.getElementById('charsBtn'), () => {
  diag('Characters tapped');
  ui.renderShop(save, selectedChar(), pickChar);
  ui.showScreen('shopScreen');
});
tap(document.getElementById('shopBack'), () => ui.showScreen('startScreen'));

ui.showScreen('startScreen');
diag('boot ok · menu shown');

// --- QA mode (?qa=…, ?seed=N) ---
const params = new URLSearchParams(location.search);
if (params.has('seed')) seedRng(parseInt(params.get('seed'), 10) || 1);
initQA(game, save, startLevel, params);
