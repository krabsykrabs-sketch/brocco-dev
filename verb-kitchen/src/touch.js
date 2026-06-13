// Additive touch input for phones/tablets. Feeds the SAME state the keyboard
// uses — game.keys[] for movement, game.interactE()/spacePress() for actions —
// so no game logic is duplicated or changed and the keyboard path is untouched.
//
//   Left half  : floating joystick → sets keys w/a/s/d (8-way, matches keyboard)
//   Right side : "Pick/Drop" → E (edge),  "Chop" → Space (hold = continuous chop)
//
// Shown only on touch devices (pointer:coarse or first touch) and only while the
// HUD is up (the markup lives inside #hud). Perf-safe: rgba fills + transform/
// opacity only — no blur/filter/animated shadows (budget Android tablets).

export function initTouch(game) {
  const padZone = document.getElementById('padZone');
  const padBase = document.getElementById('padBase');
  const padKnob = document.getElementById('padKnob');
  const btnE = document.getElementById('tBtnE');
  const btnChop = document.getElementById('tBtnChop');
  if (!padZone || !btnE || !btnChop) return;

  // reveal controls on touch devices only (or ?touch=1 for testing)
  const enable = () => document.body.classList.add('touch');
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if (coarse || new URLSearchParams(location.search).has('touch')) enable();
  window.addEventListener('touchstart', enable, { once: true, passive: true });

  const DEAD = 15;      // px before movement starts
  const BASE_R = 56;    // knob travel radius
  let padId = null, ox = 0, oy = 0;

  const clearMove = () => { const k = game.keys; k.w = k.a = k.s = k.d = false; };
  const setMove = (dx, dy) => {
    const k = game.keys;
    k.w = k.a = k.s = k.d = false;            // only the 4 keys we drive
    const mag = Math.hypot(dx, dy);
    if (mag < DEAD) return;
    const t = mag * 0.38;                      // per-axis cut → snaps to 8 directions
    if (dx > t) k.d = true; else if (dx < -t) k.a = true;
    if (dy > t) k.s = true; else if (dy < -t) k.w = true;   // screen-down (+y) = forward (s)
  };

  // ---- floating joystick (left half) ----
  padZone.addEventListener('touchstart', (e) => {
    if (padId !== null) return;
    const t = e.changedTouches[0];
    padId = t.identifier; ox = t.clientX; oy = t.clientY;
    padBase.style.left = ox + 'px'; padBase.style.top = oy + 'px';
    padKnob.style.transform = 'translate(0px,0px)';
    padBase.classList.add('on');
    e.preventDefault();
  }, { passive: false });

  padZone.addEventListener('touchmove', (e) => {
    if (padId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== padId) continue;
      const dx = t.clientX - ox, dy = t.clientY - oy;
      setMove(dx, dy);
      const mag = Math.hypot(dx, dy) || 1;
      const cl = Math.min(mag, BASE_R);
      padKnob.style.transform = `translate(${dx / mag * cl}px, ${dy / mag * cl}px)`;
      e.preventDefault();
    }
  }, { passive: false });

  const endPad = (e) => {
    if (padId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier === padId) { padId = null; clearMove(); padBase.classList.remove('on'); }
    }
  };
  padZone.addEventListener('touchend', endPad, { passive: false });
  padZone.addEventListener('touchcancel', endPad, { passive: false });

  // ---- Pick / Drop → E (single press, guarded exactly like onKey) ----
  btnE.addEventListener('touchstart', (e) => {
    e.preventDefault();
    btnE.classList.add('pressed');
    if (game.running && !game.roundOver) game.interactE();
  }, { passive: false });
  const upE = () => btnE.classList.remove('pressed');
  btnE.addEventListener('touchend', upE);
  btnE.addEventListener('touchcancel', upE);

  // ---- Chop → Space (hold). touchstart = key down (flag + edge spacePress),
  //      touchend = key up. workStations() then chops while held, like the key. ----
  btnChop.addEventListener('touchstart', (e) => {
    e.preventDefault();
    btnChop.classList.add('pressed');
    game.keys[' '] = true;
    if (game.running && !game.roundOver) game.spacePress();
  }, { passive: false });
  const upChop = () => { btnChop.classList.remove('pressed'); game.keys[' '] = false; };
  btnChop.addEventListener('touchend', upChop);
  btnChop.addEventListener('touchcancel', upChop);
}
