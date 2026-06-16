// The chef: a KayKit Adventurers character (player-selectable) + Rig_Medium
// animation clips, WASD movement with tile collision, one-item carry slot.
import * as THREE from 'three';
import { TILE, loadChefAssets, cloneChef, getModel } from './models.js';
import { audio } from './audio.js';

const SPEED = 7.2;          // world units/s (tile = 2)
const RADIUS = 0.42;
const TURN_LERP = 18;

let assets = null;          // {charScene, clips} for the selected character

export async function preloadChef(charName = 'rogue') {
  assets = await loadChefAssets(charName);   // GLTFs are cached, re-calls are cheap
}

export class Chef {
  // chefAssets lets a second chef (the co-op helper) use a DIFFERENT character
  // than the player; defaults to the player character loaded by preloadChef.
  constructor(world, chefAssets) {
    const a = chefAssets || assets;
    this.world = world;
    this.obj = new THREE.Group();
    this.body = cloneChef(a.charScene);
    this.body.scale.setScalar(1.15);
    this.obj.add(this.body);

    this.mixer = new THREE.AnimationMixer(this.body);
    this.actions = {};
    for (const name of ['Idle_A', 'Running_A', 'Chopping', 'PickUp', 'Holding_B', 'Working_A']) {
      const clip = a.clips[name];
      if (clip) this.actions[name] = this.mixer.clipAction(clip);
    }
    this.current = null;
    // chop staccato: loop only the first quarter of the clip — raised pose
    // down to board height (the full clip drives the knife through the
    // table to y≈0.6 and recovers slowly; profile measured in QA)
    this.chopWindow = (a.clips['Chopping']?.duration || 1) * 0.25;
    if (this.actions['Chopping']) this.actions['Chopping'].timeScale = 1.25;
    this.play('Idle_A');

    // carry anchor: held out in front, above shoulder height, so the big
    // chibi head never hides the item from the fixed top-down camera
    this.carryAnchor = new THREE.Group();
    this.carryAnchor.position.set(0, 1.42, 1.02);
    this.obj.add(this.carryAnchor);
    this.carried = null;          // logical item
    this.carriedMesh = null;

    // right-hand socket: the rig's attachment bone for held tools
    this.handSlot = null;
    this.body.traverse((o) => { if (o.isBone && o.name === 'handslotr') this.handSlot = o; });
    this.toolName = null;
    this.toolMesh = null;

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.facing = new THREE.Vector2(0, 1);   // grid-space dir (x, z)
    this.heading = 0;
    this.working = false;          // chopping at a board this frame
    this.workTool = 'knife';       // tool of the board being worked
    this.bobT = 0;
    this.squash = 0;               // squash impulse timer
    this.frozen = false;
  }

  play(name, fade = 0.12) {
    const next = this.actions[name];
    if (!next || this.current === next) return;
    next.reset().fadeIn(fade).play();
    if (this.current) this.current.fadeOut(fade);
    this.current = next;
  }

  setCarried(item, mesh) {
    if (this.carriedMesh) this.carryAnchor.remove(this.carriedMesh);
    this.carried = item;
    this.carriedMesh = mesh || null;
    if (mesh) {
      mesh.position.set(0, 0, 0);
      this.carryAnchor.add(mesh);
    }
    this.squash = 0.18;
    if (item) audio.pickup(); else audio.putdown();
  }

  /** Show/hide a tool in the right hand (knife / rollingpin / null). */
  setTool(name) {
    if (name === this.toolName) return;
    if (this.toolMesh && this.toolMesh.parent) this.toolMesh.parent.remove(this.toolMesh);
    this.toolMesh = null;
    this.toolName = name;
    if (name && this.handSlot) {
      const m = getModel(name);
      if (name === 'knife') {
        m.rotation.set(Math.PI, 0, -Math.PI / 2);  // blade forward, edge down
        m.position.set(0, 0.05, 0);
      } else {
        m.scale.setScalar(0.8);                 // pin is long — grip the middle
        m.position.set(0, 0.05, 0);
      }
      this.handSlot.add(m);
      this.toolMesh = m;
    }
  }

  /** Tile the chef is facing (for E / Space targeting). */
  targetTile() {
    const gx = (this.pos.x + this.facing.x * TILE * 0.72) / TILE + this.world.offX;
    const gz = (this.pos.z + this.facing.y * TILE * 0.72) / TILE + this.world.offZ;
    return { col: Math.round(gx), row: Math.round(gz) };
  }

  update(dt, input, fx) {
    this.mixer.update(dt);
    // staccato chop: restart the clip once it passes the top-of-swing window
    if (this.working) {
      const a = this.actions['Chopping'];
      if (a && a.time > this.chopWindow) a.time = 0;
    }
    // frozen = washing at the sink during a quiz: scrub away (no tool in hand)
    if (this.frozen) {
      this.setTool(null);
      this.play(this.actions['Working_A'] ? 'Working_A' : 'Idle_A');
      return;
    }

    let ix = input.x, iz = input.z;
    const mag = Math.hypot(ix, iz);
    if (mag > 0) { ix /= mag; iz /= mag; }

    this.setTool(this.working ? this.workTool : null);
    if (this.working) {
      this.play('Chopping');
    } else if (mag > 0) {
      this.play('Running_A');
    } else if (this.carried && this.actions['Holding_B']) {
      this.play('Holding_B');
    } else {
      this.play('Idle_A');
    }

    if (mag > 0 && !this.working) {
      // skid detection: sharp reversal at speed
      const sp = this.vel.length();
      if (sp > SPEED * 0.7) {
        const dot = (this.vel.x * ix + this.vel.z * iz) / (sp || 1);
        if (dot < -0.55) {
          fx && fx.dust(this.pos);
          audio.skid();
          this.squash = Math.max(this.squash, 0.14);
        }
      }
      this.facing.set(ix, iz);
      this.vel.set(ix * SPEED, 0, iz * SPEED);

      // axis-separated collision
      this.tryMove(this.vel.x * dt, 0);
      this.tryMove(0, this.vel.z * dt);
      this.bobT += dt * 11;
    } else {
      this.vel.set(0, 0, 0);
      this.bobT = 0;
    }

    // face movement direction
    const targetHeading = Math.atan2(this.facing.x, this.facing.y);
    let d = targetHeading - this.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.heading += d * Math.min(1, TURN_LERP * dt);
    this.obj.rotation.y = this.heading;

    // squash & stretch: run bob + pickup squash
    let sy = 1, sxz = 1;
    if (mag > 0) { sy += Math.sin(this.bobT) * 0.045; sxz = 1 / Math.sqrt(sy); }
    if (this.squash > 0) {
      this.squash -= dt;
      const k = Math.max(0, this.squash) / 0.18;
      sy *= 1 - 0.22 * Math.sin(k * Math.PI);
      sxz *= 1 + 0.13 * Math.sin(k * Math.PI);
    }
    this.body.scale.set(1.15 * sxz, 1.15 * sy, 1.15 * sxz);

    // carried item bob/wobble
    if (this.carriedMesh) {
      this.carriedMesh.position.y = Math.sin(this.bobT * 0.9) * 0.06;
      this.carriedMesh.rotation.z = Math.sin(this.bobT * 0.7) * 0.05;
    }

    this.obj.position.copy(this.pos);
  }

  tryMove(dx, dz) {
    const nx = this.pos.x + dx, nz = this.pos.z + dz;
    if (this.world.areaWalkable(nx, nz, RADIUS)) {
      this.pos.x = nx; this.pos.z = nz;
    }
  }
}
