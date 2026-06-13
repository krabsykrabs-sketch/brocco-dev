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
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
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

document.getElementById('quitBtn').addEventListener('click', () => showLevelSelect());
document.getElementById('playBtn').addEventListener('click', () => {
  audio.init();
  showLevelSelect();
});
document.getElementById('backBtn').addEventListener('click', () => ui.showScreen('startScreen'));
document.getElementById('retryBtn').addEventListener('click', () => startLevel(game.levelIdx));
document.getElementById('nextBtn').addEventListener('click', () => startLevel(Math.min(game.levelIdx + 1, LEVELS.length - 1)));
document.getElementById('menuBtn').addEventListener('click', showLevelSelect);

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
document.getElementById('charsBtn').addEventListener('click', () => {
  ui.renderShop(save, selectedChar(), pickChar);
  ui.showScreen('shopScreen');
});
document.getElementById('shopBack').addEventListener('click', () => ui.showScreen('startScreen'));

ui.showScreen('startScreen');

// --- QA mode (?qa=…, ?seed=N) ---
const params = new URLSearchParams(location.search);
if (params.has('seed')) seedRng(parseInt(params.get('seed'), 10) || 1);
initQA(game, save, startLevel, params);
