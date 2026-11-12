// Static scenery (hand-placed landmarks + seeded scatter), grass tufts, and the live clover / brush-shelter patches from the sim.
import * as THREE from 'three';
import { paintMaterial, outlineMaterial } from './paint.js';
import { heightAt, inStream, normalAt, streamX, wetAt } from './terrain.js';
import { rng, clamp, hashId } from './palette.js';

const eb = (t) => { const c1 = 1.8, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

function compose(m, x, y, z, s, rot, tx = 0, tz = 0, sy = s) {
  _e.set(tx, rot, tz); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(s, sy, s); return m.compose(_p, _q, _s);
}

export function createProps(models, quality) {
  const group = new THREE.Group();
  const R = rng(4242);
  const mats = {
    tree: paintMaterial({ foliage: true, snowCaps: true }), rock: paintMaterial({ snowCaps: true }), plain: paintMaterial({ snowCaps: true, foliage: true }),
    grass: paintMaterial({ grass: true, double: true }), flower: paintMaterial({ flower: true, double: true }),
  };
  const outM = outlineMaterial({});
  const statics = [];                       // {mesh, out}
  const place = {};                         // model -> [matrix]
  const put = (name, x, z, s = 1, rot = R() * 6.283, sink = 0.04) => {
    const y = heightAt(x, z) - sink * s; (place[name] ||= []).push(compose(new THREE.Matrix4(), x, y, z, s, rot, 0, 0));
  };
  const ok = (x, z, pad = 2.5) => !inStream(x, z, pad);
  const at = (cx, cz, r) => { const a = R() * 6.283, d = Math.sqrt(R()) * r; return [cx + Math.cos(a) * d, cz + Math.sin(a) * d]; };

  // ---- hero landmarks
  put('gum_a', -41, 23, 1.75, 0.6);                                   // the Elder, west of the meadow
  put('gum_b', -33, 30, 1.0, 2.1); put('gum_a', -47, 14, 1.15, 4.0);
  put('gum_b', 15, -34, 1.25, 1.0); put('gum_a', 24, -43, 1.0, 3.0); put('gum_b', 8, -46, 0.9, 5.2);
  for (const [x, z, s] of [[-9, 40, 1], [5, 46, 1.2], [-24, -36, 1], [47, 20, 1.1], [-52, -7, 1.2], [36, 40, 0.9]]) put('wattle_a', x, z, s, R() * 6);
  // pine grove NE
  for (let i = 0; i < 12; i++) { const [x, z] = at(44, -30, 11); if (ok(x, z)) put(R() < 0.55 ? 'pine_a' : 'pine_b', x, z, 0.85 + R() * 0.55); }
  for (let i = 0; i < 6; i++) { const [x, z] = at(-26, -44, 8); if (ok(x, z)) put(R() < 0.5 ? 'pine_a' : 'pine_b', x, z, 0.8 + R() * 0.5); }
  // the tor: a boulder cluster
  put('boulder_a', 34, -3, 1.0, 0.3, 0.3); put('boulder_b', 38.5, 1, 1.0, 2.3, 0.2); put('boulder_a', 37, -8, 0.6, 4.1, 0.15);
  for (let i = 0; i < 7; i++) { const [x, z] = at(36, -3, 7); put(['rock_a', 'rock_b', 'rock_c'][i % 3], x, z, 0.9 + R() * 0.9); }
  put('boulder_b', -46, -26, 0.9, 1.0, 0.2); put('boulder_a', -43, -30, 0.6, 3.0, 0.1); put('rock_c', -48, -22, 1.4);
  put('boulder_a', 6, 53, 0.9, 5.0, 0.2); put('boulder_b', 12, 55, 0.7, 2.0);
  // rim: pines on the hills, a few big rocks
  for (let i = 0; i < 70; i++) {
    const a = R() * 6.283, d = 66 + R() * 40, x = Math.cos(a) * d, z = Math.sin(a) * d;
    put(R() < 0.6 ? 'pine_a' : (R() < 0.5 ? 'pine_b' : 'gum_b'), x, z, 1.1 + R() * 1.1);
  }
  for (let i = 0; i < 16; i++) { const a = R() * 6.283, d = 64 + R() * 30; put(R() < 0.5 ? 'boulder_a' : 'boulder_b', Math.cos(a) * d, Math.sin(a) * d, 1.0 + R() * 1.4); }
  // stepping stones across the stream
  for (let k = 0; k < 5; k++) { const z = 3.5 + (k % 2) * 0.6, x = streamX(z) + (k - 2) * 1.55; put('rock_a', x, z + k * 0.2, 0.62, R() * 6, 0.12); }
  put('log_a', streamX(-14) + 6.5, -14, 1.3, 0.5, 0.0);
  put('log_a', -20, 44, 1.0, 2.2, 0.0);
  // bank rocks and scattered rocks, shrubs
  for (let i = 0; i < 18; i++) { const z = -70 + R() * 140, x = streamX(z) + (R() < 0.5 ? -1 : 1) * (4.2 + R() * 1.6); put(['rock_a', 'rock_b', 'rock_c'][i % 3], x, z, 0.7 + R() * 0.8); }
  for (let i = 0; i < 40; i++) { const [x, z] = at(0, 0, 62); if (Math.hypot(x, z) > 14 && ok(x, z, 1.5)) put(['rock_a', 'rock_b', 'rock_c'][i % 3], x, z, 0.6 + R() * 1.0); }
  for (let i = 0; i < 70; i++) { const [x, z] = at(0, 0, 66); if (Math.hypot(x, z) > 11 && ok(x, z, 1.5)) put(R() < 0.65 ? 'shrub_a' : 'shrub_b', x, z, 0.8 + R() * 0.8, undefined, 0.0); }
  // burrow mounds (warrens)
  const WARREN = [[-30, -18], [-25, -23], [-33, -23], [29, 21], [23, 27], [-6, 36], [-12, 33], [44, -12]];
  for (const [x, z] of WARREN) { put('burrow_mound', x, z, 1.1 + R() * 0.3, 0.2 + R() * 6, 0.05); }

  // ---- instanced meshes
  const matFor = (n) => n.startsWith('gum') || n.startsWith('pine') || n.startsWith('wattle') ? mats.tree : n.startsWith('shrub') ? mats.plain : mats.rock;
  for (const [name, list] of Object.entries(place)) {
    const g = models.get(name); if (!g) continue;
    const im = new THREE.InstancedMesh(g, matFor(name), list.length); list.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = true; im.receiveShadow = true; group.add(im);
    const o = new THREE.InstancedMesh(g, outM, list.length); o.instanceMatrix = im.instanceMatrix; o.visible = false; group.add(o);
    statics.push({ mesh: im, out: o });
  }

  // ---- grass and flowers (scatter once, draw the first N for the quality tier)
  const scatter = (n, minR, maxR, flower) => {
    const arr = [];
    let guard = 0;
    while (arr.length < n && guard++ < n * 6) {
      const r = Math.sqrt(R()) * maxR, a = R() * 6.283, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (inStream(x, z, 0.6)) continue;
      const nrm = normalAt(x, z, 1.5); if (nrm.y < 0.8) continue;
      const wet = wetAt(x, z); if (wet > 0.85 && R() < 0.7) continue;
      arr.push(compose(new THREE.Matrix4(), x, heightAt(x, z) - 0.02, z, (flower ? 0.9 : 0.8) + R() * 0.7, R() * 6.283, 0, 0));
    }
    return arr;
  };
  const gm = scatter(5200, 0, 86), fm = scatter(900, 0, 62, true);
  const tuft = new THREE.InstancedMesh(models.get('grass_tuft'), mats.grass, gm.length); gm.forEach((m, i) => tuft.setMatrixAt(i, m)); tuft.count = 0; tuft.frustumCulled = false;
  // tall tufts: along the stream banks and by rocks, fixed count
  const tm = [];
  for (let i = 0; i < 160; i++) { const z = -75 + R() * 150, x = streamX(z) + (R() < 0.5 ? -1 : 1) * (4 + R() * 3.5); tm.push(compose(new THREE.Matrix4(), x, heightAt(x, z) - 0.02, z, 0.9 + R() * 0.8, R() * 6.283)); }
  const tall = new THREE.InstancedMesh(models.get('grass_tall'), mats.grass, tm.length); tm.forEach((m, i) => tall.setMatrixAt(i, m)); tall.frustumCulled = false;
  const flo = new THREE.InstancedMesh(models.get('flower_tuft'), mats.flower, fm.length); fm.forEach((m, i) => flo.setMatrixAt(i, m)); flo.count = 0; flo.frustumCulled = false;
  group.add(tuft, tall, flo);

  // ---- live patches from the sim
  const cap = 48;
  const cloverM = new THREE.InstancedMesh(models.get('clover_patch'), mats.plain, cap); cloverM.count = 0; cloverM.frustumCulled = false; cloverM.receiveShadow = true;
  const shelM = new THREE.InstancedMesh(models.get('brush_pile'), mats.rock, cap); shelM.count = 0; shelM.frustumCulled = false; shelM.castShadow = true; shelM.receiveShadow = true;
  const shelO = new THREE.InstancedMesh(models.get('brush_pile'), outM, cap); shelO.instanceMatrix = shelM.instanceMatrix; shelO.count = 0; shelO.frustumCulled = false; shelO.visible = false;
  group.add(cloverM, shelM, shelO);
  const patches = new Map();

  const api = {
    group, statics,
    setQuality(q) {
      tuft.count = Math.min(gm.length, q.grass); flo.count = Math.min(fm.length, q.flowers); flo.visible = q.flowers > 0;
      for (const s of statics) s.out.visible = q.outlines;
      shelO.visible = q.outlines;
      this._outlines = q.outlines;
    },
    setShadows(on) { for (const s of statics) s.mesh.castShadow = on; shelM.castShadow = on; },
    update(sim, dt) {
      const seen = new Set();
      for (const p of sim.patches || []) {
        seen.add(p.id);
        let r = patches.get(p.id);
        if (!r) { r = { id: p.id, t: 0, out: false }; patches.set(p.id, r); }
        r.x = p.x; r.z = p.z; r.type = p.type; r.rad = p.radius || 3; r.out = false; r.gen = p.expiresGen;
      }
      let nc = 0, ns = 0;
      for (const [id, r] of patches) {
        if (!seen.has(id)) r.out = true;
        r.t += r.out ? -dt * 1.6 : dt * 1.6;
        if (r.out && r.t < -0.05) { patches.delete(id); continue; }
        r.t = clamp(r.t, -0.1, 1.2);
        const k = r.out ? clamp(r.t) : eb(clamp(r.t));
        const h = hashId(id);
        if (r.type === 'shelter') {
          if (ns >= cap) continue;
          const s = Math.max(0.01, k) * (r.rad * 0.55 + 0.6);
          shelM.setMatrixAt(ns++, compose(_m, r.x, heightAt(r.x, r.z) - 0.02, r.z, s, h * 6.283));
        } else {
          if (nc >= cap) continue;
          const s = Math.max(0.01, k) * r.rad;
          cloverM.setMatrixAt(nc++, compose(_m, r.x, heightAt(r.x, r.z) + 0.01, r.z, s, h * 6.283, 0, 0, s * 0.8 + 0.2));
        }
      }
      cloverM.count = nc; shelM.count = ns; shelO.count = ns; cloverM.instanceMatrix.needsUpdate = true; shelM.instanceMatrix.needsUpdate = true;
    },
    dispose() { /* geometries are shared with the model cache; materials only */ for (const k in mats) mats[k].dispose(); outM.dispose(); },
  };
  return api;
}
