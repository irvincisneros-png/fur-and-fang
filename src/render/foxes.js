// Red foxes: a few articulated rigs (body, head, two-part tail, 4 legs) animated procedurally: idle sniff, trot, rotary gallop
// (gather / stretch with a moment in the air), crouch + pounce. The tail root sits inside the rump and the tip half trails the root.
// Pivot positions come from tools/blender/build_fox.py (three.js axes: +X nose, +Y up).
import * as THREE from 'three';
import { paintMaterial, outlineMaterial } from './paint.js';
import { heightAt, inStream, waterLevelAt } from './terrain.js';
import { clamp, lerp, smooth } from './palette.js';

const NECK = [0.60, 0.74], TAILB = [-0.50, 0.64], TAIL_MID = [-0.40, -0.03], HIPS = [[0.40, 0.15], [0.40, -0.15], [-0.40, 0.15], [-0.40, -0.15]];   // [x, z]; y = 0.5
const SCALE = 1.85, MAX = 10;
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

export class Foxes {
  constructor(geoms, { herd, onPuff }) {
    this.group = new THREE.Group(); this.herd = herd; this.onPuff = onPuff || (() => {});
    this.geoms = geoms; this.mat = paintMaterial({ snowCaps: false }); this.outMat = outlineMaterial({});
    this.f = new Map(); this.pool = []; this.outlines = false; this.shadows = true;
  }
  setOutlines(on) { this.outlines = on; for (const f of this.pool) for (const o of f.outs) o.visible = on; }
  setShadows(on) { this.shadows = on; for (const f of this.pool) for (const m of f.meshes) m.castShadow = on; }

  _mesh(rig, name, parent, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(this.geoms.get(name), this.mat); m.castShadow = this.shadows; m.position.set(x, y, z);
    const o = new THREE.Mesh(this.geoms.get(name), this.outMat); o.visible = this.outlines;
    m.add(o); parent.add(m); rig.meshes.push(m); rig.outs.push(o); return m;
  }

  _rig() {
    const root = new THREE.Group(), tilt = new THREE.Group(); root.add(tilt);
    const rig = { root, tilt, meshes: [], outs: [], legs: [], cycle: 0, sp: 0, vx: 0, vz: 0, yaw: 0, x: 0, z: 0, px: 0, pz: 0, state: 'wander', stateT: 0, scale: 0, head: null, tail: null, tail2: null, h: Math.random(), yawV: 0, lean: 0, tY: 0, tP: 0, t2Y: 0, t2P: 0, gal: 0 };
    this._mesh(rig, 'fox_body', tilt);
    const hp = new THREE.Group(); hp.position.set(NECK[0], NECK[1], 0); tilt.add(hp); this._mesh(rig, 'fox_head', hp); rig.head = hp;
    const tp = new THREE.Group(); tp.position.set(TAILB[0], TAILB[1], 0); tp.scale.set(0.95, 0.8, 0.8); tilt.add(tp); this._mesh(rig, 'fox_tail_a', tp); rig.tail = tp;
    const tp2 = new THREE.Group(); tp2.position.set(TAIL_MID[0], TAIL_MID[1], 0); tp.add(tp2); this._mesh(rig, 'fox_tail_b', tp2); rig.tail2 = tp2;
    for (const [x, z] of HIPS) { const lp = new THREE.Group(); lp.position.set(x, 0.5, z); tilt.add(lp); this._mesh(rig, 'fox_leg', lp); rig.legs.push(lp); }
    root.scale.setScalar(SCALE); this.group.add(root);
    return rig;
  }

  update(sim, dt, t) {
    const list = sim.predators || [], seen = new Set();
    for (const p of list) {
      seen.add(p.id);
      let f = this.f.get(p.id);
      if (!f) {
        f = this.pool.find((q) => !q.used) || (this.pool.length < MAX ? (this.pool.push(this._rig()), this.pool[this.pool.length - 1]) : null);
        if (!f) continue;
        f.used = true; f.x = f.px = p.x; f.z = f.pz = p.z; f.scale = 0; f.sp = 0; f.vx = f.vz = 0; f.yaw = Math.random() * 6; f.state = p.state; f.stateT = 0; f.root.visible = true; this.f.set(p.id, f);
        this.onPuff('dust', p.x, p.z, null);
      }
      if (f.state !== p.state) { f.state = p.state; f.stateT = 0; } else f.stateT += dt;
      f.target = p.targetId;
      const dx = p.x - f.x, dz = p.z - f.z;
      if (dx * dx + dz * dz > 144) { f.x = p.x; f.z = p.z; f.px = f.x; f.pz = f.z; } else { const k = 1 - Math.exp(-dt * 10); f.x += dx * k; f.z += dz * k; }
      this._pose(f, dt, t);
    }
    for (const [id, f] of this.f) if (!seen.has(id)) { f.used = false; f.root.visible = false; this.f.delete(id); this.onPuff('dust', f.x, f.z, null); }
  }

  _pose(f, dt, t) {
    if (dt > 0) {
      const k = 1 - Math.exp(-dt * 7);
      f.vx += ((f.x - f.px) / dt - f.vx) * k; f.vz += ((f.z - f.pz) / dt - f.vz) * k; f.px = f.x; f.pz = f.z;
      f.sp = Math.hypot(f.vx, f.vz);
    }
    f.scale = Math.min(1, f.scale + dt * 2.2);
    const st = f.state;
    // face the way it runs; while crouching/pouncing face the prey
    let yawT = f.yaw;
    const prey = f.target != null ? this.herd.position(f.target) : null;
    if (f.sp > 0.4 && st !== 'pounce') yawT = Math.atan2(-f.vz, f.vx);
    else if (prey && (st === 'pounce' || st === 'chase')) yawT = Math.atan2(-(prey.z - f.z), prey.x - f.x);
    const dy = angDiff(f.yaw, yawT) * (1 - Math.exp(-dt * (st === 'wander' ? 5 : 11)));
    f.yaw += dy;
    if (dt > 0) f.yawV += (dy / dt - f.yawV) * Math.min(1, dt * 8);
    const gallop = f.sp > 4.2 || st === 'chase' && f.sp > 2.5, trot = !gallop && f.sp > 0.45;
    f.gal += ((gallop ? 1 : 0) - f.gal) * Math.min(1, dt * 6);
    let y = 0, pitch = 0, hl = 0, hp = 0, tailY = 0, tailP = 0, tail2Y = 0, tail2P = 0, stretch = 1;
    const L = [0, 0, 0, 0], lift = [0, 0, 0, 0];          // leg swing (rad) and fold (0..1): front-left, front-right, hind-left, hind-right
    const rate = gallop ? 2.3 + 0.13 * f.sp : 1.7 + 0.32 * f.sp;
    if (trot || gallop) f.cycle = (f.cycle + dt * rate) % 1;
    const c = f.cycle * Math.PI * 2;
    if (st === 'pounce') {
      const e = f.stateT, crouch = smooth(0, 0.28, e), leap = smooth(0.28, 0.4, e) * (1 - smooth(0.78, 0.95, e));
      const lt = clamp((e - 0.28) / 0.5);
      y = crouch * -0.12 + Math.sin(Math.PI * lt) * 0.85 * (e > 0.28 ? 1 : 0);
      pitch = -0.28 * crouch + (e > 0.28 ? lerp(0.55, -0.7, lt) : 0) * leap;
      L[0] = L[1] = -0.5 * crouch + 1.0 * leap; L[2] = L[3] = 0.5 * crouch - 1.1 * leap;
      lift[0] = lift[1] = 0.5 * leap; stretch = 1 + 0.12 * leap;
      hp = -0.2 * crouch - 0.6 * smooth(0.55, 0.9, e); tailP = 0.25 - 0.5 * leap; tail2P = -0.3 * leap;
    } else if (gallop) {
      // rotary gallop: the hind pair drives, the body stretches and floats, the front pair reaches and lands; legs within a pair
      // strike a fraction apart, and each leg folds while it swings forward so it does not read as a stiff pendulum
      const ext = Math.sin(c), air = Math.max(0, Math.sin(c - 0.5));
      y = 0.07 + 0.17 * air; pitch = 0.16 * Math.cos(c - 0.3);
      stretch = 1 + 0.09 * ext;
      const sw = (ph) => Math.sin(c + ph), fold = (ph) => Math.max(0, Math.cos(c + ph));
      L[0] = 1.05 * sw(0.0); L[1] = 1.05 * sw(-0.55); L[2] = -1.0 * sw(0.35); L[3] = -1.0 * sw(-0.2);
      lift[0] = fold(0.0); lift[1] = fold(-0.55); lift[2] = Math.max(0, -Math.cos(c + 0.35)); lift[3] = Math.max(0, -Math.cos(c - 0.2));
      hp = -0.22 - pitch * 0.8 + 0.05 * ext;                    // the head stays level and low while the body rocks
      tailP = 0.05 - pitch * 0.9; tail2P = -0.12 * Math.cos(c - 1.2); tailY = 0.05 * Math.sin(c * 0.5);
    } else if (trot) {
      y = 0.05 * Math.abs(Math.sin(c)); pitch = 0.03 * Math.sin(c * 2);
      L[0] = L[3] = 0.6 * Math.sin(c); L[1] = L[2] = -0.6 * Math.sin(c);
      lift[0] = lift[3] = 0.55 * Math.max(0, Math.cos(c)); lift[1] = lift[2] = 0.55 * Math.max(0, -Math.cos(c));
      hp = -0.06 + 0.05 * Math.sin(c * 2 + 1) + (f.state === 'wander' ? -0.08 : 0); tailP = 0.14; tailY = 0.2 * Math.sin(c); tail2Y = 0.25 * Math.sin(c - 1.1); tail2P = -0.1;
    } else {
      // idle: sniff, look around, tail sway
      const sn = Math.max(0, Math.sin(t * 0.7 + f.h * 20) * 1.6 - 0.3);
      hp = -0.22 * Math.min(1, sn) + 0.05 * Math.sin(t * 9) * Math.min(1, sn); pitch = -0.04 * Math.min(1, sn);
      hl = 0.55 * Math.sin(t * 0.45 + f.h * 9); tailP = 0.38; tailY = 0.3 * Math.sin(t * 1.4 + f.h * 4); tail2Y = 0.35 * Math.sin(t * 1.4 + f.h * 4 - 1.0); tail2P = -0.28;
    }
    // lean into turns; the tail swings out the other way and its tip half lags the root
    const turn = clamp(f.yawV * 0.12, -0.45, 0.45) * (0.3 + 0.7 * f.gal);
    f.lean += (turn - f.lean) * Math.min(1, dt * 8);
    tailY += -f.lean * 1.1; tail2Y += -f.lean * 0.9;
    const kt = Math.min(1, dt * 14), kt2 = Math.min(1, dt * 7);
    f.tY += (tailY - f.tY) * kt; f.tP += (tailP - f.tP) * kt; f.t2Y += (tail2Y - f.t2Y) * kt2; f.t2P += (tail2P - f.t2P) * kt2;
    let gy = heightAt(f.x, f.z);
    if (inStream(f.x, f.z, 0.5)) gy = Math.max(gy, waterLevelAt(f.z) - 0.45 * SCALE);        // wades belly-deep, never dives under
    f.root.position.set(f.x, gy + Math.max(-0.12, y) * SCALE, f.z);
    f.root.rotation.y = f.yaw; f.root.scale.setScalar(SCALE * Math.max(0.01, f.scale));
    f.tilt.rotation.z = pitch; f.tilt.rotation.x = f.lean;
    f.tilt.scale.set(stretch, 1 / Math.sqrt(stretch), 1);
    f.head.rotation.set(0, hl + f.lean * 0.6, hp);
    f.tail.rotation.set(0, f.tY, f.tP); f.tail2.rotation.set(0, f.t2Y, f.t2P);
    for (let i = 0; i < 4; i++) { const g = f.legs[i]; g.rotation.z = L[i]; g.scale.y = 1 - 0.3 * lift[i]; g.position.y = 0.5 + 0.03 * lift[i]; }
  }

  dispose() { this.mat.dispose(); this.outMat.dispose(); }
}
