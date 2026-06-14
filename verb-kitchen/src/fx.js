// Particles (smoke, sparkles, dust) + DOM score popups. Pooled and capped.
import * as THREE from 'three';

const MAX_PARTICLES = 90;

function dotTexture(color, soft = true) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 32;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(16, 16, 2, 16, 16, 15);
  g.addColorStop(0, color);
  g.addColorStop(1, soft ? 'rgba(0,0,0,0)' : color + '00');
  c.fillStyle = g;
  c.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(cv);
}

export class FX {
  constructor(scene, camera, renderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.parts = [];
    this.mats = {
      smoke: new THREE.SpriteMaterial({ map: dotTexture('rgba(70,70,80,0.85)'), transparent: true, depthWrite: false }),
      spark: new THREE.SpriteMaterial({ map: dotTexture('rgba(46,230,192,0.95)'), transparent: true, depthWrite: false }),
      dust: new THREE.SpriteMaterial({ map: dotTexture('rgba(220,220,210,0.8)'), transparent: true, depthWrite: false }),
      amber: new THREE.SpriteMaterial({ map: dotTexture('rgba(255,207,94,0.95)'), transparent: true, depthWrite: false }),
      steam: new THREE.SpriteMaterial({ map: dotTexture('rgba(235,240,250,0.55)'), transparent: true, depthWrite: false, opacity: 0.7 }),
    };
    this.smokeSources = new Set();   // stations currently smoking
    this.smokeT = 0;
  }

  emit(kind, pos, opts = {}) {
    if (this.parts.length >= MAX_PARTICLES) return;
    const s = new THREE.Sprite(this.mats[kind]);
    s.position.copy(pos);
    s.scale.setScalar(opts.size || 0.5);
    s.userData = {
      vel: opts.vel || new THREE.Vector3((Math.random() - 0.5) * 1.2, 1.6 + Math.random(), (Math.random() - 0.5) * 1.2),
      life: opts.life || 1,
      t: 0,
      grow: opts.grow || 0,
    };
    this.scene.add(s);
    this.parts.push(s);
  }

  smoke(pos) {
    this.emit('smoke', pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.2, (Math.random() - 0.5) * 0.5)),
      { size: 0.5 + Math.random() * 0.5, life: 1.4, grow: 1.2, vel: new THREE.Vector3((Math.random() - 0.5) * 0.4, 2.2, (Math.random() - 0.5) * 0.4) });
  }
  sparkle(pos) {
    for (let i = 0; i < 7; i++) this.emit('spark', pos, { size: 0.3, life: 0.7 });
  }
  steam(pos) {
    // gentle hot-food wisp: small, slow, drifts up and fades
    this.emit('steam', pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.1, (Math.random() - 0.5) * 0.3)),
      { size: 0.22 + Math.random() * 0.15, life: 1.1, grow: 0.55, vel: new THREE.Vector3((Math.random() - 0.5) * 0.2, 1.1, (Math.random() - 0.5) * 0.2) });
  }
  dust(pos) {
    for (let i = 0; i < 4; i++) {
      this.emit('dust', pos.clone().add(new THREE.Vector3(0, 0.15, 0)),
        { size: 0.35, life: 0.45, vel: new THREE.Vector3((Math.random() - 0.5) * 2.4, 0.8, (Math.random() - 0.5) * 2.4) });
    }
  }
  coins(pos) {
    for (let i = 0; i < 5; i++) this.emit('amber', pos, { size: 0.28, life: 0.8 });
  }

  update(dt) {
    // continuous smoke from burnt stations
    this.smokeT -= dt;
    if (this.smokeT <= 0 && this.smokeSources.size) {
      for (const st of this.smokeSources) this.smoke(new THREE.Vector3(st.pos.x, st.topY + 0.3, st.pos.z));
      this.smokeT = 0.12;
    }
    for (const s of [...this.parts]) {
      const u = s.userData;
      u.t += dt;
      if (u.t >= u.life) {
        this.scene.remove(s);
        this.parts.splice(this.parts.indexOf(s), 1);
        continue;
      }
      s.position.addScaledVector(u.vel, dt);
      const k = u.t / u.life;
      s.scale.setScalar(s.scale.x + u.grow * dt * 0.5 + 0.001);
      if (k > 0.7) s.scale.multiplyScalar(1 - (k - 0.7) * 0.12);
    }
  }

  /** Speech bubble at a world position — a station "telling" you something
   *  (e.g. the oven showing a plate "bring a plate"). `icons` is an array of
   *  image data-URLs (rendered game objects, see icons.js) shown side by side;
   *  a plain string is treated as emoji text. Throttled against key-mashing. */
  bubble(worldPos, icons) {
    const now = performance.now();
    if (now < (this._bubbleT || 0)) return;
    this._bubbleT = now + 900;
    const v = worldPos.clone().project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    const x = (v.x * 0.5 + 0.5) * r.width + r.left;
    const y = (-v.y * 0.5 + 0.5) * r.height + r.top;
    const el = document.createElement('div');
    el.className = 'fxbubble';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    if (Array.isArray(icons)) {
      for (const src of icons) {
        const img = document.createElement('img');
        img.src = src; img.alt = '';
        el.appendChild(img);
      }
    } else {
      el.textContent = icons;   // emoji fallback
    }
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('out'), 1100);
    setTimeout(() => el.remove(), 1600);
  }

  /** DOM popup at a world position (+12 🪙 etc). */
  pop(worldPos, text, color = 'var(--amber)') {
    const v = worldPos.clone().project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    const x = (v.x * 0.5 + 0.5) * r.width + r.left;
    const y = (-v.y * 0.5 + 0.5) * r.height + r.top;
    const el = document.createElement('div');
    el.className = 'fxpop';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.color = color;
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  clear() {
    for (const s of this.parts) this.scene.remove(s);
    this.parts = [];
    this.smokeSources.clear();
  }
}
