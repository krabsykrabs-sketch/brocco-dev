// Compact orbit/pan/zoom camera controller. Left mouse is intentionally NOT
// used here — it belongs to the editor (place/select). Camera uses:
//   Right-drag           orbit
//   Middle-drag          pan
//   Shift + Right-drag   pan
//   Wheel                zoom
import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class OrbitController {
  constructor(camera, dom) {
    this.cam = camera;
    this.dom = dom;
    this.target = new THREE.Vector3(0, 0, 0);
    this.theta = Math.PI * 0.25;   // azimuth
    this.phi = Math.PI * 0.34;     // polar (from +Y)
    this.radius = 30;
    this.minR = 4; this.maxR = 160;
    this.minPhi = 0.12; this.maxPhi = Math.PI / 2 - 0.03;
    this.rotSpeed = 0.005;
    this.zoomStep = 1.12;
    this._drag = null;
    this.onClick = null;   // fired on a right-button click (press+release, no drag)
    this._bind();
    this.update();
  }

  _bind() {
    const d = this.dom;
    d.addEventListener('contextmenu', (e) => e.preventDefault());
    d.addEventListener('pointerdown', (e) => {
      let mode = null;
      if (e.button === 2) mode = e.shiftKey ? 'pan' : 'orbit';
      else if (e.button === 1) mode = 'pan';
      if (!mode) return;
      this._drag = { mode, button: e.button, x: e.clientX, y: e.clientY, downX: e.clientX, downY: e.clientY };
      try { d.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    });
    d.addEventListener('pointermove', (e) => {
      if (!this._drag) return;
      const dx = e.clientX - this._drag.x;
      const dy = e.clientY - this._drag.y;
      this._drag.x = e.clientX; this._drag.y = e.clientY;
      if (this._drag.mode === 'orbit') {
        this.theta -= dx * this.rotSpeed;
        this.phi = clamp(this.phi - dy * this.rotSpeed, this.minPhi, this.maxPhi);
      } else {
        this._pan(dx, dy);
      }
      this.update();
    });
    d.addEventListener('pointerup', (e) => {
      if (!this._drag) return;
      const moved = Math.hypot(e.clientX - this._drag.downX, e.clientY - this._drag.downY);
      const rightClick = this._drag.button === 2 && moved < 5;
      try { d.releasePointerCapture(e.pointerId); } catch (_) {}
      this._drag = null;
      if (rightClick && this.onClick) this.onClick();
    });
    d.addEventListener('pointercancel', (e) => {
      if (!this._drag) return;
      try { d.releasePointerCapture(e.pointerId); } catch (_) {}
      this._drag = null;
    });
    d.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = e.deltaY > 0 ? this.zoomStep : 1 / this.zoomStep;
      this.radius = clamp(this.radius * f, this.minR, this.maxR);
      this.update();
    }, { passive: false });
  }

  _pan(dx, dy) {
    // pan the target across the ground plane, relative to view direction
    const fwd = new THREE.Vector3();
    this.cam.getWorldDirection(fwd);
    fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, this.cam.up).normalize();
    const scale = this.radius * 0.0016;
    this.target.addScaledVector(right, -dx * scale);
    this.target.addScaledVector(fwd, dy * scale);
  }

  isDragging() { return !!this._drag; }

  update() {
    const sinP = Math.sin(this.phi);
    this.cam.position.set(
      this.target.x + this.radius * sinP * Math.sin(this.theta),
      this.target.y + this.radius * Math.cos(this.phi),
      this.target.z + this.radius * sinP * Math.cos(this.theta),
    );
    this.cam.lookAt(this.target);
  }

  frame(cols, rows, tile) {
    this.target.set(0, 0, 0);
    this.theta = Math.PI * 0.25;
    this.phi = Math.PI * 0.34;
    this.radius = Math.max(cols, rows) * tile * 0.95 + 8;
    this.update();
  }
}
