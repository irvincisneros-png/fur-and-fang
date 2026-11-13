// Instanced rabbit herd: one InstancedMesh per part (body, left/right hind leg, left/right short/long ear, teeth), procedural
// hop / nibble / flee / death poses. Each leg and each ear is its own instance, so the legs kick a beat apart and the ears
// flop on their own springs. Part pivots (three.js axes: +X nose, +Y up, Z lateral; left = -Z) come from tools/blender/build_rabbit.py.
import * as THREE from 'three';
import { paintMaterial, outlineMaterial } from './paint.js';
import { heightAt, inStream, waterLevelAt } from './terrain.js';
import { FUR, GENOTYPE_COLORS, clamp, lerp, smooth, hashId } from './palette.js';

const CAP = 960;
export const RABBIT_SCALE = 1.9;      // stylised: rabbits are drawn ~1.9x life-size so a 120 m valley still reads
const HIP = [-0.14, 0.30], EAR = [0.27, 0.585, 0.075], GUM = [0.585, 0.352], PIV = [-0.05, 0.26];
const BROWN = new THREE.Color(FUR.brown), WHITE = new THREE.Color(FUR.white);
const RING = { BB: new THREE.Color(GENOTYPE_COLORS.BB), Bb: new THREE.Color(GENOTYPE_COLORS.Bb), bb: new THREE.Color(GENOTYPE_COLORS.bb) };
// Islands lineage view: West teal, East amber, Islet violet, mixed ancestry white, sterile grey
export const LINEAGE_COLORS = { 1: 0x1f9e8f, 2: 0xe8a33a, 4: 0x8e6cc8, mixed: 0xffffff, sterile: 0x8a8a8a };
const LIN = Object.fromEntries(Object.entries(LINEAGE_COLORS).map(([k, v]) => [k, new THREE.Color(v)]));
const easeOutBack = (t) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

const DUR = { predator: 0.55, cold: 2.9, heat: 2.7, starved: 2.9, old: 2.8, fade: 0.7 };

function furGenotype(g) {            // 'BB' | 'Bb' | 'bb' whatever the letter order
  const s = (g || 'BB'); const low = (s.match(/[a-z]/g) || []).length; return low === 0 ? 'BB' : low === 1 ? 'Bb' : 'bb';
}

export class Herd {
  constructor(geoms, { onPuff } = {}) {
    this.group = new THREE.Group();
    this.v = new Map(); this.done = new Map(); this.causes = new Map(); this.frame = 0; this.first = true; this.time = 0;
    this.onPuff = onPuff || (() => {});
    this.outlines = false;
    const mats = { fur: paintMaterial({ fur: true, fx: true, snowCaps: false }), plain: paintMaterial({ fur: true, fx: true }) };
    this.outMat = outlineMaterial({ fx: true });
    const mk = (name, cast = true) => {
      // full and cheap (LOD) geometry share the per-instance attributes, so swapping between them is free
      const aFur = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3).setUsage(THREE.DynamicDrawUsage);
      const aFx = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4).setUsage(THREE.DynamicDrawUsage);
      const prep = (src) => { const g = src.clone(); g.setAttribute('aFur', aFur); g.setAttribute('aFx', aFx); return g; };
      const g = prep(geoms.get(name)), lo = geoms.has(name + '_lod') ? prep(geoms.get(name + '_lod')) : g;
      const m = new THREE.InstancedMesh(g, mats.fur, CAP); m.frustumCulled = false; m.count = 0; m.castShadow = cast;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const o = new THREE.InstancedMesh(g, this.outMat, CAP); o.instanceMatrix = m.instanceMatrix; o.frustumCulled = false; o.count = 0; o.visible = false;
      this.group.add(m, o);
      return { mesh: m, out: o, fur: aFur, fx: aFx, n: 0, hi: g, lo };
    };
    this.p = {
      body: mk('rabbit_body'), hindL: mk('rabbit_hind_l'), hindR: mk('rabbit_hind_r'),
      earSL: mk('rabbit_ear_short_l'), earSR: mk('rabbit_ear_short_r'), earLL: mk('rabbit_ear_long_l'), earLR: mk('rabbit_ear_long_r'),
      teeth: mk('rabbit_teeth', false),
    };
    this.lod = false; this.marks = new Map();
    // genotype rings + follow marker
    const rg = new THREE.RingGeometry(0.62, 0.86, 28); rg.rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: false });
    this.rings = new THREE.InstancedMesh(rg, this.ringMat, CAP + 1); this.rings.count = 0; this.rings.frustumCulled = false; this.rings.visible = false; this.rings.renderOrder = 3;
    this.rings.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array((CAP + 1) * 3), 3);
    this.rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.rings);
    // follow marker: a bobbing little diamond above the followed rabbit
    const dg = new THREE.OctahedronGeometry(0.16, 0); dg.scale(1, 1.5, 1);
    this.marker = new THREE.Mesh(dg, new THREE.MeshBasicMaterial({ color: 0xffd447, fog: false })); this.marker.visible = false; this.marker.renderOrder = 4;
    this.group.add(this.marker);
    // blob shadows (low tier)
    const bg = new THREE.CircleGeometry(0.62, 14); bg.rotateX(-Math.PI / 2);
    this.blobMat = new THREE.MeshBasicMaterial({ color: 0x1b3320, transparent: true, opacity: 0.28, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, fog: false });
    this.blobs = new THREE.InstancedMesh(bg, this.blobMat, CAP); this.blobs.count = 0; this.blobs.frustumCulled = false; this.blobs.visible = false; this.blobs.renderOrder = 1;
    this.group.add(this.blobs);
    this.genotypeView = false; this.lineageView = false; this.followId = null; this.useBlob = false;
    this._m = { b: new THREE.Matrix4(), d: new THREE.Matrix4(), t: new THREE.Matrix4(), q: new THREE.Matrix4(), e: new THREE.Matrix4() };
    this._c = new THREE.Color();
  }

  setOutlines(on) { this.outlines = on; }
  setShadows(on) { for (const k in this.p) if (k !== 'teeth') this.p[k].mesh.castShadow = on; this.useBlob = !on; }
  setLod(on) { if (on === this.lod) return; this.lod = on; for (const k in this.p) { const p = this.p[k]; p.mesh.geometry = p.out.geometry = on ? p.lo : p.hi; } }
  /** ring these rabbits for a few seconds (newcomers from a translocation) */
  mark(ids, hex = 0xffd447, seconds = 9) { const c = new THREE.Color(hex); for (const id of ids) this.marks.set(id, { t: seconds, c }); }

  /** forget every rabbit: called when a new run starts (ids restart at 1, so nothing cached may carry over) */
  reset() {
    this.v.clear(); this.done.clear(); this.causes.clear(); this.marks.clear(); this.first = true; this.followId = null; this.marker.visible = false;
    for (const k in this.p) { this.p[k].n = 0; this.p[k].mesh.count = 0; this.p[k].out.count = 0; }
    this.rings.count = 0; this.blobs.count = 0;
  }

  _fur(h, white) {
    const c = (white ? WHITE : BROWN).clone();
    if (white) c.multiplyScalar(0.96 + 0.04 * h); else { c.multiplyScalar(0.84 + 0.3 * h); c.r *= 1.0 + 0.1 * (h - 0.5); c.b *= 1.0 - 0.18 * (h - 0.5); }
    return c;
  }

  /** keep the drawn traits in step with the sim (dominance can be switched mid-run in Explore) */
  _sync(v, r) {
    const ph = r.pheno || {}, white = !!ph.white;
    if (white !== v.white) { v.white = white; v.fur = this._fur(v.h, white); }
    v.longEars = !!ph.longEars; v.longTeeth = !!ph.longTeeth;
    v.geno = furGenotype(r.genotype && r.genotype.fur);
  }

  _make(r, born) {
    const h = hashId(r.id);
    const white = !!(r.pheno && r.pheno.white);
    const v = {
      id: r.id, h, x: r.x, z: r.z, px: r.x, pz: r.z, vx: 0, vz: 0, sp: 0, yaw: (h * 6.283), phase: 0, nib: 0, alert: 0,
      size: ((r.age || 0) < 1 ? 0.62 : 1) * RABBIT_SCALE, pop: born ? 0 : 1, popT: 0, dying: null, fur: this._fur(h, white), seen: 0, moving: false, fleeAmt: 0,
      white, longEars: !!(r.pheno && r.pheno.longEars), longTeeth: !!(r.pheno && r.pheno.longTeeth), geno: furGenotype(r.genotype && r.genotype.fur),
      y: 0, last: r, eL: 0.18, eR: 0.18, eLv: 0, eRv: 0, vy: 0, py: 0,
    };
    return v;
  }

  startDying(v, cause) {
    if (v.dying) return;
    cause = DUR[cause] ? cause : 'fade';
    v.dying = { cause, t: 0, dur: DUR[cause], puffed: false, sparkled: false };
  }

  event(ev) {
    const v = this.v.get(ev.id);
    switch (ev.type) {
      case 'birth': this.onPuff('pop', ev.x ?? (v && v.x) ?? 0, ev.z ?? (v && v.z) ?? 0, v); break;
      case 'mutation': this.onPuff('sparkle', ev.x ?? (v && v.x) ?? 0, ev.z ?? (v && v.z) ?? 0, v); break;
      case 'death':
        if (ev.id != null) this.causes.set(ev.id, ev.cause);
        if (v) this.startDying(v, ev.cause);
        break;
      case 'catch':
        if (ev.id != null) this.causes.set(ev.id, 'predator');
        if (v) { this.startDying(v, 'predator'); v.dying.puffed = true; }
        this.onPuff('dust', ev.x ?? (v && v.x) ?? 0, ev.z ?? (v && v.z) ?? 0, v);
        break;
    }
  }

  update(sim, dt, t) {
    this.time = t; this.frame++;
    const list = sim.rabbits || [];
    const f = this.frame, first = this.first;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      let v = this.v.get(r.id);
      if (!v && this.done.has(r.id)) { if (r.alive === false || r.state === 'dying') { this.done.set(r.id, f); continue; } this.done.delete(r.id); }          // finished its death animation; the sim may still list it
      if (!v) { v = this._make(r, !first); this.v.set(r.id, v); }
      v.seen = f; v.last = r;
      if (!v.dying && (r.alive === false || r.state === 'dying')) this.startDying(v, r.dyingCause || this.causes.get(r.id));
      if (!v.dying) {
        this._sync(v, r);
        v.org = r.org || 0; v.sterile = !!r.sterile;
        if (r.carry) { const c = r.carry, u = clamp(c.t / c.dur); v.x = lerp(c.fromX, c.toX, u); v.z = lerp(c.fromZ, c.toZ, u); v.arcY = Math.sin(Math.PI * u) * 3.2; v.spin = u * 6.283; } else { v.arcY = 0; v.spin = 0; }
        // follow the sim position smoothly (the sim ticks in steps)
        const dx = r.x - v.x, dz = r.z - v.z;
        if (r.carry) { /* drawn along the carry arc */ } else if (dx * dx + dz * dz > 100) { v.x = r.x; v.z = r.z; v.px = v.x; v.pz = v.z; } else { const k = 1 - Math.exp(-dt * 11); v.x += dx * k; v.z += dz * k; }
        v.tState = r.state;
        v.tSize = ((r.age || 0) < 1 ? 0.62 : 1) * RABBIT_SCALE;
      }
    }
    this.first = false;
    // rabbits that vanished from the sim without a death flag: let them finish out visually
    for (const [id, v] of this.v) {
      if (v.seen !== f && !v.dying) this.startDying(v, this.causes.get(id) || 'fade');
    }
    // per-rabbit pose + write instances
    const P = this.p; for (const k in P) P[k].n = 0;
    let nRing = 0, nBlob = 0;
    const del = [];
    const { b, d, t: tt, q, e } = this._m;
    const useRing = this.genotypeView || this.lineageView;
    for (const [id, v] of this.v) {
      if (v.dying) { v.dying.t += dt; if (v.dying.t >= v.dying.dur) { del.push(id); continue; } }
      this._pose(v, dt, t);
      if (v.out) continue;
      if (v.arcY) { v.y += v.arcY; v.yawR += v.spin; }
      const i = P.body.n;
      if (i >= CAP) break;
      // instance matrices
      b.makeTranslation(v.x, v.y, v.z).multiply(q.makeRotationY(v.yawR));
      if (v.roll) { d.makeTranslation(0, 0.28, 0).multiply(q.makeRotationX(v.roll)).multiply(tt.makeTranslation(0, -0.28, 0)); b.multiply(d); }
      d.makeTranslation(PIV[0], PIV[1], 0).multiply(q.makeRotationZ(v.pitch)).multiply(tt.makeScale(v.sx * v.size, v.sy * v.size, v.sz * v.size)).multiply(tt.makeTranslation(-PIV[0], -PIV[1], 0));
      b.multiply(d);
      const fur = v.fur, fx = v.fx;
      this._put(P.body, b, fur, fx);
      e.copy(b).multiply(this._pivRotZ(tt, HIP[0], HIP[1], v.hindL)); this._put(P.hindL, e, fur, fx);
      e.copy(b).multiply(this._pivRotZ(tt, HIP[0], HIP[1], v.hindR)); this._put(P.hindR, e, fur, fx);
      e.copy(b).multiply(this._earM(tt, d, -1, v.eL, v.splay)); this._put(v.longEars ? P.earLL : P.earSL, e, fur, fx);
      e.copy(b).multiply(this._earM(tt, d, 1, v.eR, v.splay)); this._put(v.longEars ? P.earLR : P.earSR, e, fur, fx);
      e.copy(b).multiply(tt.makeTranslation(GUM[0], GUM[1], 0)).multiply(q.makeScale(1, v.teeth * (v.longTeeth ? 1.45 : 0.4), v.longTeeth ? 1.25 : 1)).multiply(tt.makeTranslation(-GUM[0], -GUM[1], 0)); this._put(P.teeth, e, fur, fx);
      if (useRing && !v.dying) {
        const s = v.size * (!this.lineageView && v.geno === 'Bb' ? 1.12 + 0.06 * Math.sin(t * 3 + v.h * 9) : 1.0) * (0.9 + 0.1 * v.pop);
        tt.makeTranslation(v.x, this._ringY(v, s), v.z).multiply(q.makeScale(s, 1, s));
        const rc = this.lineageView ? (v.sterile ? LIN.sterile : LIN[v.org] || LIN.mixed) : RING[v.geno];
        this.rings.setMatrixAt(nRing, tt); this.rings.instanceColor.setXYZ(nRing, rc.r, rc.g, rc.b); nRing++;
      }
      if (this.useBlob) { tt.makeTranslation(v.x, v.y + 0.04, v.z).multiply(q.makeScale(v.size * 1.2 * v.sx, 1, v.size * 0.9 * v.sz)).multiply(e.makeRotationY(v.yawR)); this.blobs.setMatrixAt(nBlob++, tt); }
      const mk = this.marks.get(id);
      if (mk && !v.dying) {
        const pulse = 1.5 + 0.35 * Math.sin(t * 6), s = v.size * pulse;
        tt.makeTranslation(v.x, this._ringY(v, s) + 0.03, v.z).multiply(q.makeScale(s, 1, s));
        this.rings.setMatrixAt(nRing, tt); this.rings.instanceColor.setXYZ(nRing, mk.c.r, mk.c.g, mk.c.b); nRing++;
      }
      if (this.followId != null && v.id === this.followId) {
        this.marker.visible = !v.dying;
        this.marker.position.set(v.x, v.y + (v.longEars ? 1.3 : 1.05) * v.size + 0.12 * Math.sin(t * 3.2), v.z); this.marker.rotation.y = t * 1.6;
        tt.makeTranslation(v.x, this._ringY(v, v.size * 1.35) + 0.02, v.z).multiply(q.makeScale(v.size * 1.35, 1, v.size * 1.35));
        this.rings.setMatrixAt(nRing, tt); this.rings.instanceColor.setXYZ(nRing, 1, 0.9, 0.3); nRing++;
      }
    }
    if (this.followId == null || !this.v.has(this.followId)) this.marker.visible = false;
    for (const id of del) { this.v.delete(id); this.causes.delete(id); this.done.set(id, f); if (this.followId === id) this.followId = null; }
    for (const [id, fr] of this.done) if (fr < f - 1) this.done.delete(id);
    for (const [id, mk] of this.marks) { mk.t -= dt; if (mk.t <= 0 || !this.v.has(id)) this.marks.delete(id); }
    for (const k in P) {
      const p = P[k];
      p.mesh.count = p.n; p.out.count = p.n; p.out.visible = this.outlines && p.n > 0;
      p.mesh.instanceMatrix.needsUpdate = true; p.mesh.instanceMatrix.updateRanges && (p.mesh.instanceMatrix.updateRanges.length = 0);
      p.fur.needsUpdate = true; p.fx.needsUpdate = true;
    }
    this.rings.count = nRing; this.rings.visible = nRing > 0; this.rings.instanceMatrix.needsUpdate = true; this.rings.instanceColor.needsUpdate = true;
    this.blobs.count = nBlob; this.blobs.visible = this.useBlob && nBlob > 0; this.blobs.instanceMatrix.needsUpdate = true;
  }

  _ringY(v, s) {                       // lift the flat ring above the highest ground point under it (banks, slopes)
    const r = 0.86 * s; let y = heightAt(v.x, v.z);
    y = Math.max(y, heightAt(v.x + r, v.z), heightAt(v.x - r, v.z), heightAt(v.x, v.z + r), heightAt(v.x, v.z - r));
    return y + 0.05;
  }

  _pivRotZ(m, px, py, a) {
    const c = Math.cos(a), s = Math.sin(a);
    m.set(c, -s, 0, px - c * px + s * py, s, c, 0, py - s * px - c * py, 0, 0, 1, 0, 0, 0, 0, 1); return m;
  }

  /** ear: pitch back (a) about the lateral axis, then roll outward (splay) about the nose axis, both at the ear base; side -1 = left */
  _earM(m, tmp, side, a, splay) {
    const px = EAR[0], py = EAR[1], pz = side * EAR[2];
    m.makeTranslation(px, py, pz).multiply(tmp.makeRotationZ(a)).multiply(tmp.makeRotationX(side * splay)).multiply(tmp.makeTranslation(-px, -py, -pz));
    return m;
  }

  _put(p, m, fur, fx) {
    const i = p.n++;
    p.mesh.setMatrixAt(i, m);
    p.fur.setXYZ(i, fur.r, fur.g, fur.b); p.fx.setXYZW(i, fx[0], fx[1], fx[2], fx[3]);
  }

  _pose(v, dt, t) {
    const D = v.dying, h = v.h;
    v.out = false;
    // measured velocity -> speed / facing
    if (!D && dt > 0) {
      const ivx = (v.x - v.px) / dt, ivz = (v.z - v.pz) / dt, k = 1 - Math.exp(-dt * 9);
      v.vx += (ivx - v.vx) * k; v.vz += (ivz - v.vz) * k; v.px = v.x; v.pz = v.z;
      v.sp = Math.hypot(v.vx, v.vz);
      v.moving = v.moving ? v.sp > 0.28 : v.sp > 0.55;
      const flee = v.tState === 'flee';
      v.fleeAmt += ((flee ? 1 : 0) - v.fleeAmt) * (1 - Math.exp(-dt * 6));
      if (v.moving) { const yt = Math.atan2(-v.vz, v.vx); v.yaw += angDiff(v.yaw, yt) * (1 - Math.exp(-dt * (9 + 6 * v.fleeAmt))); }
      v.size += ((v.tSize ?? v.size) - v.size) * (1 - Math.exp(-dt * 1.2));
      if (v.pop < 1) { v.popT += dt; v.pop = clamp(v.popT / 0.5); }
    }
    let y = 0, pitch = 0, sx = 1, sy = 1, sz = 1, hind = 0.28, hind2 = null, ear = 0.18, earD = 0, splay = 0.1, teeth = 1, roll = 0, yawOff = 0;
    let fade = 1, frost = 0, grey = 0, heat = 0;
    const fl = v.fleeAmt;
    if (!D) {
      if (v.moving) {
        const A = lerp(0.24, 0.42, fl), hopLen = lerp(0.95, 1.8, fl) * RABBIT_SCALE;
        const rate = clamp(v.sp / hopLen, 1.4, 5.0);
        v.phase = (v.phase + dt * rate) % 1;
        v.nib += (0 - v.nib) * (1 - Math.exp(-dt * 8)); v.alert += (0 - v.alert) * (1 - Math.exp(-dt * 8));
      } else if (v.phase > 0) {
        v.phase += dt * 3.2; if (v.phase >= 1) v.phase = 0;
      }
      const ph = v.phase;
      const earK = v.longEars ? 1.35 : 1.0;
      if (v.phase > 0 || v.moving) {
        const airT = 0.68;
        if (ph < airT) {
          const u = ph / airT, s = Math.sin(Math.PI * u), A = lerp(0.24, 0.42, fl);
          y = A * s; pitch = lerp(0.42, -0.4, u) * (1 + 0.3 * fl);
          sx = 1 + 0.1 * s; sy = 1 + 0.07 * s; sz = 1 - 0.06 * s;
          ear = (0.12 + 0.62 * s) * earK + 0.5 * fl;
        } else {
          const w = (ph - airT) / (1 - airT), qv = Math.sin(Math.PI * w);
          sy = 1 - 0.2 * qv; sx = 1 + 0.12 * qv; sz = 1 + 0.08 * qv; pitch = -0.2 * (1 - w) + 0.1 * qv;
          ear = (0.1 - 0.3 * qv * earK) + 0.5 * fl;
        }
        // hind legs: push off, trail, swing through; the second leg runs a beat behind the first (which one leads is per rabbit)
        const kick = (p) => {
          if (p < airT) { const u = p / airT; return -0.95 * Math.sin(Math.PI * Math.min(1, u * 1.08)) - 0.1 + 0.25 * u * u; }
          const w = (p - airT) / (1 - airT); return 0.42 * Math.sin(Math.PI * w) + 0.1;
        };
        const lag = 0.085 - 0.03 * fl;
        hind = kick(ph); hind2 = kick((ph + 1 - lag) % 1);
        splay = 0.04 + 0.1 * fl; earD = 0.06 * Math.sin(ph * 6.283 + h * 6);
        teeth = 1;
      } else {
        // idle: nibble / look up / twitch, in short seed-shifted slots
        const slot = Math.floor(t * 0.4 + h * 13.0), r = (Math.sin(slot * 127.1 + h * 311.7) * 43758.5453) % 1, rr = r < 0 ? r + 1 : r;
        const nT = rr < 0.64 ? 1 : 0, aT = rr >= 0.64 && rr < 0.88 ? 1 : 0;
        v.nib += (nT - v.nib) * (1 - Math.exp(-dt * 5)); v.alert += (aT - v.alert) * (1 - Math.exp(-dt * 5));
        const chew = 0.5 + 0.5 * Math.sin(t * 11 + h * 20);
        pitch = -0.2 * v.nib - 0.16 * v.nib * chew + 0.28 * v.alert;
        teeth = 1 + v.nib * (0.15 + 0.3 * chew);
        sy = 1 + 0.05 * v.alert; y = 0;
        hind = 0.28; ear = 0.18 - 0.3 * v.alert + 0.06 * Math.sin(t * 2 + h * 5);
        ear *= v.longEars ? 1.2 : 1;
        // one ear at a time flicks or swivels; relaxed ears hang a little apart, alert ears stand together
        const tw = Math.sin(t * 1.3 + h * 9) > 0.9 ? 0.4 : 0, sw = 0.14 * Math.sin(t * 0.8 + h * 17) * v.nib;
        earD = (h > 0.5 ? 1 : -1) * tw + sw;
        splay = (v.longEars ? 0.3 : 0.16) * (1 - v.alert) + 0.05;
        yawOff = 0.5 * Math.sin(t * 0.55 + h * 6.0) * v.alert;
        sz = 1 + 0.015 * Math.sin(t * 2.2 + h * 4);              // breathing
        sx = 1 + 0.008 * Math.sin(t * 2.2 + h * 4);
      }
      const pp = v.pop < 1 ? easeOutBack(v.pop) : 1;
      sx *= pp; sy *= pp; sz *= pp;
    } else {
      const e = D.t, dur = D.dur;
      switch (D.cause) {
        case 'predator': {
          const k = smooth(0, 0.25, e); sy = 1 - 0.7 * k; sx = sz = 1 + 0.35 * k; ear = 0.9 * k; hind = 0.4 * k; splay = 0.5 * k;
          fade = 1 - smooth(0.25, dur, e);
          if (e > 0.3 && !D.puffed) { D.puffed = true; this.onPuff('dust', v.x, v.z, v); }
          break;
        }
        case 'cold': {
          const k = smooth(0, 0.9, e); pitch = -0.75 * k; sy = 1 - 0.32 * k; sx = 1 - 0.1 * k; ear = 0.2 + 0.7 * k; hind = 0.2 + 0.5 * k; splay = 0.1;
          frost = smooth(0.1, 1.3, e) * 0.95; fade = 1 - smooth(1.6, dur, e); y = Math.sin(e * 40) * 0.012 * (1 - k);     // shiver
          if (e > 0.25 && !D.sparkled) { D.sparkled = true; this.onPuff('frost', v.x, v.z, v); }
          break;
        }
        case 'heat': {
          const k = smooth(0, 0.8, e); sy = 1 - 0.28 * k + 0.035 * Math.sin(e * 16) * k; sx = 1 + 0.12 * k; sz = 1 + 0.16 * k; ear = 0.2 + 0.85 * k; hind = 0.2 + 0.7 * k; splay = 0.1 + 0.6 * k;
          pitch = -0.14 * k; heat = k * 0.9; grey = 0.1 * k; fade = 1 - smooth(1.4, dur, e);
          if (e > 0.3 && !D.sparkled) { D.sparkled = true; this.onPuff('wisp', v.x, v.z, v, 0xf0cfa0); }
          break;
        }
        case 'starved': {
          const k = smooth(0, 1.2, e); sx = sz = 1 - 0.26 * k; sy = 1 - 0.1 * k; pitch = -0.3 * k; ear = 0.2 + 0.6 * k; hind = 0.2 + 0.3 * k; grey = 0.75 * k; splay = 0.1 + 0.4 * k;
          fade = 1 - smooth(1.5, dur, e);
          if (e > 0.5 && !D.sparkled) { D.sparkled = true; this.onPuff('wisp', v.x, v.z, v); }
          break;
        }
        case 'old': {
          const k = smooth(0, 1.0, e); roll = 1.38 * k; sy = 1 - 0.08 * k; y = -0.06 * k; ear = 0.2 + 0.5 * k; hind = 0.2 + 0.4 * k; grey = 0.35 * k; splay = 0.1 + 0.3 * k;
          fade = 1 - smooth(1.4, dur, e);
          if (e > 0.9 && !D.sparkled) { D.sparkled = true; this.onPuff('wisp', v.x, v.z, v, 0xe8e4f4); }
          break;
        }
        default: { fade = 1 - smooth(0, dur, e); }
      }
    }
    // ground contact + slope
    let gh = heightAt(v.x, v.z);
    if (inStream(v.x, v.z, 0.9)) gh = Math.max(gh, waterLevelAt(v.z) + 0.1);        // fords: hop across on the stepping stones, not under the water
    v.y = gh + y * v.size;
    if (!D && v.moving) {
      const ca = Math.cos(v.yaw), sa = -Math.sin(v.yaw);
      pitch += Math.atan2(heightAt(v.x + ca * 0.4, v.z + sa * 0.4) - heightAt(v.x - ca * 0.4, v.z - sa * 0.4), 0.8) * 0.8;
    }
    v.yawR = v.yaw + yawOff;
    v.pitch = pitch; v.sx = sx; v.sy = sy; v.sz = sz; v.teeth = teeth; v.roll = roll;
    const lead = h > 0.5; v.hindL = lead || hind2 == null ? hind : hind2; v.hindR = !lead || hind2 == null ? hind : hind2;
    // ears: each one is a damped spring chasing its pose, shoved by the body's vertical speed, so they trail the hop and settle after it
    if (dt > 0) {
      const vy = clamp((y - v.py) / dt, -6, 6); v.py = y; v.vy += (vy - v.vy) * Math.min(1, dt * 20);
      const K = v.longEars ? 70 : 150, C = v.longEars ? 8.5 : 15, push = v.vy * (v.longEars ? 0.3 : 0.15), sd = Math.min(dt, 0.033);
      const tL = ear + earD + push, tR = ear - earD + push * 0.85;
      v.eLv += (K * (1 + 0.14 * (h - 0.5)) * (tL - v.eL) - C * v.eLv) * sd; v.eL = clamp(v.eL + v.eLv * sd, -0.7, 1.5);
      v.eRv += (K * (1 - 0.14 * (h - 0.5)) * (tR - v.eR) - C * v.eRv) * sd; v.eR = clamp(v.eR + v.eRv * sd, -0.7, 1.5);
      v.splay = (v.splay ?? splay) + (splay - (v.splay ?? splay)) * Math.min(1, dt * 7);
    } else if (v.splay == null) v.splay = splay;
    v.fx = v.fxArr || (v.fxArr = [1, 0, 0, 0]); v.fx[0] = fade; v.fx[1] = frost; v.fx[2] = grey; v.fx[3] = heat;
  }

  /** screen-space pick: nearest rabbit to the pointer, within a radius that scales with its apparent size */
  pick(clientX, clientY, camera, rect) {
    const w = rect.width, h = rect.height, mx = clientX - rect.left, my = clientY - rect.top;
    const vp = new THREE.Vector3(); let best = null, bd = 1e9;
    const camPos = camera.position, k = (h / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    for (const v of this.v.values()) {
      if (v.dying || v.out) continue;
      vp.set(v.x, v.y + 0.4 * v.size, v.z).project(camera);
      if (vp.z > 1 || vp.z < -1) continue;
      const sx = (vp.x * 0.5 + 0.5) * w, sy = (-vp.y * 0.5 + 0.5) * h;
      const dist = camPos.distanceTo(new THREE.Vector3(v.x, v.y, v.z));
      const rad = Math.max(18, (0.7 * v.size * k) / Math.max(dist, 1));
      const dd = Math.hypot(sx - mx, sy - my);
      if (dd < rad && dd / rad + dist * 0.0004 < bd) { bd = dd / rad + dist * 0.0004; best = v.id; }
    }
    return best;
  }

  position(id) { const v = this.v.get(id); return v && !v.dying ? v : null; }
  dispose() {
    for (const k in this.p) { this.p[k].mesh.geometry.dispose(); this.p[k].mesh.dispose(); this.p[k].out.dispose(); }
    this.rings.geometry.dispose(); this.ringMat.dispose(); this.rings.dispose(); this.blobs.geometry.dispose(); this.blobMat.dispose(); this.marker.geometry.dispose(); this.marker.material.dispose();
    this.outMat.dispose();
  }
}
