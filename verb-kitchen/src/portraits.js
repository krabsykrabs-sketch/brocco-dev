// Render each character to a head-shot portrait (data URL) for the shop cards.
// A tiny offscreen alpha renderer frames the head/shoulders, cropping the
// T-pose arms. Results are cached per character (the model never changes).
import * as THREE from 'three';
import { loadChefAssets, cloneChef } from './models.js';

const W = 256, H = 300;
const cache = new Map();
let renderer = null, scene = null, cam = null;

function ensure() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W, H, false);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x39406a, 1.6));
  const d = new THREE.DirectionalLight(0xfff4e2, 1.7);
  d.position.set(-2.5, 5, 4);
  scene.add(d);
  cam = new THREE.PerspectiveCamera(26, W / H, 0.1, 60);
}

/** Portrait data URL for a character (cached). Needs the GLBs to load. */
export async function characterPortrait(name) {
  if (cache.has(name)) return cache.get(name);
  ensure();
  const assets = await loadChefAssets(name);
  const body = cloneChef(assets.charScene);
  body.scale.setScalar(1.15);
  scene.add(body);
  // strike the idle pose (arms down) rather than the default T-pose
  const idle = assets.clips['Idle_A'];
  if (idle) {
    const mixer = new THREE.AnimationMixer(body);
    mixer.clipAction(idle).play();
    mixer.update(0.6);                 // settle a fraction into the loop
  }
  body.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(body);
  const h = (box.max.y - box.min.y) || 2;
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  const aimY = box.max.y - 0.24 * h;            // head + a little neck/collar
  cam.position.set(cx + 0.05, aimY + 0.12 * h, cz + 1.78 * h);   // pulled back (less zoomed)
  cam.lookAt(cx, aimY, cz);
  cam.updateProjectionMatrix();

  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(body);
  cache.set(name, url);
  return url;
}
