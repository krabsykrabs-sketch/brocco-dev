// Render a single preloaded restaurant model to a small icon (data URL) for the
// station help bubbles — so "bring a plate / use a bun" shows the ACTUAL game
// object instead of an emoji. Reuses the offscreen-render trick from
// portraits.js; cached per model name (these models never change in a session).
import * as THREE from 'three';
import { getModel } from './models.js';

const S = 128;                       // icon render size (square)
const cache = new Map();             // model name → data URL
let renderer = null, scene = null, cam = null;

function ensure() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(S, S, false);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x39406a, 1.5));
  const d = new THREE.DirectionalLight(0xfff4e2, 1.9);
  d.position.set(-2, 5, 3);
  scene.add(d);
  cam = new THREE.PerspectiveCamera(28, 1, 0.1, 60);
}

/** Cached data-URL icon of a preloaded restaurant model, framed from a high
 *  3/4 angle so even a flat plate still reads clearly as a plate. */
export function modelIcon(name) {
  if (cache.has(name)) return cache.get(name);
  ensure();
  const obj = getModel(name);
  scene.add(obj);
  obj.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(obj);
  const center = box.getCenter(new THREE.Vector3());
  const radius = box.getBoundingSphere(new THREE.Sphere()).radius || 0.5;

  const dir = new THREE.Vector3(0, 0.95, 0.5).normalize();   // look down ~62°, slight front tilt
  const half = THREE.MathUtils.degToRad(28 / 2);
  const dist = (radius / Math.sin(half)) * 1.02;             // fit the bounding sphere + a hair of margin
  cam.position.copy(center).addScaledVector(dir, dist);
  cam.lookAt(center);
  cam.updateProjectionMatrix();

  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(obj);
  cache.set(name, url);
  return url;
}
