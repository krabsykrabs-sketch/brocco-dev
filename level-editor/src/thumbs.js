// Lazy palette thumbnails. One small offscreen renderer draws each model to a
// dataURL the first time its tile scrolls into view (which also warms the pack
// template cache, so the first placement of that model is instant).
import * as THREE from 'three';

export class ThumbRenderer {
  constructor(pack, size = 128) {
    this.pack = pack;
    this.size = size;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(size, size);
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x40506a, 1.25));
    const dir = new THREE.DirectionalLight(0xffffff, 1.15);
    dir.position.set(4, 7, 5);
    this.scene.add(dir);
    this.cam = new THREE.PerspectiveCamera(33, 1, 0.05, 200);
    this.cache = new Map();
  }

  async render(name) {
    if (this.cache.has(name)) return this.cache.get(name);
    await this.pack.ensure(name);
    const inst = this.pack.instance(name);
    if (!inst) return null;

    const box = new THREE.Box3().setFromObject(inst);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.5 || 0.5;
    inst.position.sub(center);          // center on origin
    this.scene.add(inst);

    const dist = (radius / Math.tan((this.cam.fov * Math.PI / 180) / 2)) * 1.45;
    this.cam.position.set(dist * 0.85, dist * 0.8, dist);
    this.cam.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.cam);
    const url = this.renderer.domElement.toDataURL('image/png');

    this.scene.remove(inst);
    this.cache.set(name, url);
    return url;
  }
}
