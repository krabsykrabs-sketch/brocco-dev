// One AssetPack = one loaded catalog. Loads GLTF models on demand, forces
// every mesh onto the pack's single shared atlas material (so all instances
// share one material), caches templates + measurements, and can spin up
// translucent "ghost" clones for the placement preview.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class AssetPack {
  constructor(manifest) {
    this.manifest = manifest;
    this.base = manifest.basePath;
    this.loader = new GLTFLoader();
    this.templates = new Map();   // name -> Object3D (template)
    this.pending = new Map();     // name -> Promise<Object3D>
    this.boxes = new Map();       // name -> {height,minY,radius}
    this.sharedMat = null;        // the single atlas material for this pack
    this.ghostMat = null;
  }

  url(name) { return this.base + name + '.gltf'; }

  /** Load (once) a model template; resolves to the cached template. */
  ensure(name) {
    if (this.templates.has(name)) return Promise.resolve(this.templates.get(name));
    if (this.pending.has(name)) return this.pending.get(name);
    const p = new Promise((resolve, reject) => {
      this.loader.load(this.url(name), (gltf) => {
        const tpl = gltf.scene;
        tpl.traverse((o) => {
          if (!o.isMesh) return;
          if (!this.sharedMat) {
            this.sharedMat = o.material;
            this.sharedMat.metalness = 0;
            this.sharedMat.roughness = 0.9;
            if (this.sharedMat.map) {
              this.sharedMat.map.colorSpace = THREE.SRGBColorSpace;
              this.sharedMat.map.magFilter = THREE.NearestFilter;
            }
          }
          o.material = this.sharedMat;
        });
        this.templates.set(name, tpl);
        resolve(tpl);
      }, undefined, (err) => reject(err));
    });
    this.pending.set(name, p);
    return p;
  }

  /** Clone of a loaded template (null if not yet loaded). */
  instance(name) {
    const tpl = this.templates.get(name);
    return tpl ? tpl.clone(true) : null;
  }

  /** Cached local-space bounds of a loaded template. */
  measure(name) {
    if (this.boxes.has(name)) return this.boxes.get(name);
    const tpl = this.templates.get(name);
    if (!tpl) return { height: 1, minY: 0, radius: 0.5 };
    const box = new THREE.Box3().setFromObject(tpl);
    const m = {
      height: Math.max(0.001, box.max.y - box.min.y),
      minY: box.min.y,
      radius: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2,
      sizeX: box.max.x - box.min.x,
      sizeZ: box.max.z - box.min.z,
    };
    this.boxes.set(name, m);
    return m;
  }

  ghostMaterial() {
    if (!this.ghostMat) {
      this.ghostMat = this.sharedMat ? this.sharedMat.clone() : new THREE.MeshStandardMaterial();
      this.ghostMat.transparent = true;
      this.ghostMat.opacity = 0.5;
      this.ghostMat.depthWrite = false;
    }
    return this.ghostMat;
  }

  /** Translucent clone for the hover preview. */
  makeGhost(name) {
    const inst = this.instance(name);
    if (!inst) return null;
    const gm = this.ghostMaterial();
    inst.traverse((o) => { if (o.isMesh) o.material = gm; });
    return inst;
  }
}
