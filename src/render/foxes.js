// Red foxes: a few articulated rigs (body, head, tail, 4 legs) animated procedurally: idle sniff, trot, gallop chase, crouch + pounce.
// Pivot positions come from tools/blender/build_fox.py (three.js axes: +X nose, +Y up).
import * as THREE from 'three';
import { paintMaterial, outlineMaterial } from './paint.js';
import { heightAt } from './terrain.js';
import { clamp, lerp, smooth } from './palette.js';

const NECK = [0.60, 0.74], TAILB = [-0.62, 0.58], HIPS = [[0.40, 0.15], [0.40, -0.15], [-0.40, 0.15], [-0.40, -0.15]];   // [x, z]; y = 0.5
const SCALE = 1.7, MAX = 10;
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
    const rig = { root, tilt, meshes: [], outs: [], legs: [], cycle: 0, sp: 0, vx: 0, vz: 0, yaw: 0, x: 0, z: 0, px: 0, pz: 0, state: 'wander', stateT: 0, scale: 0, head: null, tail: null, h: Math.random() };
    this._mesh(rig, 'fox_body', tilt);
    const hp = new THREE.Group(); hp.position.set(NECK[0], NECK[1], 0); tilt.add(hp); this._mesh(rig, 'fox_head', hp); rig.head = hp;
    const tp = new THREE.Group(); tp.position.set(TAILB[0], TAILB[1], 0); tilt.add(tp); this._mesh(rig, 'fox_tail', tp); rig.tail = tp;
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
    f.yaw += angDiff(f.yaw, yawT) * (1 - Math.exp(-dt * (st === 'wander' ? 5 : 11)));
    const gallop = f.sp > 4.2 || st === 'chase' && f.sp > 2.5, trot = !gallop && f.sp > 0.45;
    let y = 0, pitch = 0, legAmp = 0, hl = 0, hp = 0, tailY = 0, tailP = 0;
    const L = [0, 0, 0, 0];
    const rate = gallop ? 2.7 + 0.18 * f.sp : 1.7 + 0.32 * f.sp;
    if (trot || gallop) f.cycle = (f.cycle + dt * rate) % 1;
    const c = f.cycle * Math.PI * 2;
    if (st === 'pounce') {
      const e = f.stateT, crouch = smooth(0, 0.28, e), leap = smooth(0.28, 0.4, e) * (1 - smooth(0.78, 0.95, e));
      const lt = clamp((e - 0.28) / 0.5);
      y = crouch * -0.12 + Math.sin(Math.PI * lt) * 0.85 * (e > 0.28 ? 1 : 0);
      pitch = -0.28 * crouch + (e > 0.28 ? lerp(0.55, -0.7, lt) : 0) * leap;
      L[0] = L[1] = -0.5 * crouch + 1.0 * leap; L[2] = L[3] = 0.5 * crouch - 1.1 * leap;
      hp = -0.2 * crouch - 0.6 * smooth(0.55, 0.9, e); tailP = 0.2; tailY = 0;
    } else if (gallop) {
      y = 0.11 * Math.sin(c) + 0.1; pitch = 0.14 * Math.cos(c);
      L[0] = L[1] = 0.95 * Math.sin(c); L[2] = L[3] = 0.95 * Math.sin(c + 1.9);
      hp = -0.18 + 0.1 * Math.sin(c); tailP = 0.18; tailY = 0.05 * Math.sin(c * 2);
    } else if (trot) {
      y = 0.025 * Math.abs(Math.sin(c)) * 2; pitch = 0.03 * Math.sin(c * 2);
      L[0] = L[3] = 0.6 * Math.sin(c); L[1] = L[2] = -0.6 * Math.sin(c);
      hp = -0.06 + 0.05 * Math.sin(c * 2 + 1) + (f.state === 'wander' ? -0.08 : 0); tailP = 0.05; tailY = 0.22 * Math.sin(c);
    } else {
      // idle: sniff, look around, tail sway
      const sn = Math.max(0, Math.sin(t * 0.7 + f.h * 20) * 1.6 - 0.3);
      hp = -0.22 * Math.min(1, sn) + 0.05 * Math.sin(t * 9) * Math.min(1, sn); y = 0; pitch = -0.04 * Math.min(1, sn);
      hl = 0.55 * Math.sin(t * 0.45 + f.h * 9); tailY = 0.3 * Math.sin(t * 1.4 + f.h * 4); tailP = 0.1;
      for (let i = 0; i < 4; i++) L[i] = 0;
    }
    f.root.position.set(f.x, heightAt(f.x, f.z) + Math.max(-0.12, y) * SCALE, f.z);
    f.root.rotation.y = f.yaw; f.root.scale.setScalar(SCALE * Math.max(0.01, f.scale));
    f.tilt.rotation.z = pitch;
    f.head.rotation.set(0, hl, hp);
    f.tail.rotation.set(0, tailY, tailP);
    for (let i = 0; i < 4; i++) f.legs[i].rotation.z = L[i];
  }

  dispose() { this.mat.dispose(); this.outMat.dispose(); }
}
