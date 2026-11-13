// Particles: falling snow (GPU-animated), plus a small CPU pool for dust puffs, sparkles, birth pops, frost. Heat shimmer lives in post.js.
import * as THREE from 'three';
import { rng } from './palette.js';
import { heightAt, inStream, waterLevelAt } from './terrain.js';

const SOFT = /* glsl */`
float soft(vec2 c){ float d = length(c - 0.5)*2.0; return smoothstep(1.0, 0.25, d); }
float star(vec2 c){ vec2 p = abs(c - 0.5)*2.0; float a = pow(max(1.0 - p.x*p.y*3.2, 0.0), 2.0); float b = smoothstep(1.0, 0.0, length(p)); return clamp(a*b*1.6, 0.0, 1.0); }
`;

export function createSnow(maxCount) {
  const r = rng(77), pos = new Float32Array(maxCount * 3), seed = new Float32Array(maxCount);
  for (let i = 0; i < maxCount; i++) { pos[i * 3] = r(); pos[i * 3 + 1] = r(); pos[i * 3 + 2] = r(); seed[i] = r(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const u = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(96, 38, 96) }, uOpacity: { value: 0 }, uScale: { value: 600 }, uWind: { value: 1.2 } };
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: u, fog: false,
    vertexShader: `uniform float uTime; uniform vec3 uCenter; uniform vec3 uBox; uniform float uScale; uniform float uWind; attribute float aSeed; varying float vA;
void main(){
  vec3 p = position*uBox;
  p.y -= uTime*(1.1 + aSeed*1.3);
  p.x += uTime*uWind*(0.6 + aSeed*0.6) + sin(uTime*0.9 + aSeed*40.0)*0.7;
  p.z += cos(uTime*0.7 + aSeed*30.0)*0.7;
  p = mod(p, uBox);
  vec3 w = vec3(uCenter.x - uBox.x*0.5 + p.x, p.y, uCenter.z - uBox.z*0.5 + p.z);
  vec4 mv = viewMatrix*vec4(w, 1.0);
  gl_Position = projectionMatrix*mv;
  gl_PointSize = clamp((0.09 + aSeed*0.08)*uScale/max(-mv.z, 0.5), 1.5, 14.0);
  vA = smoothstep(130.0, 20.0, -mv.z) * smoothstep(0.0, 1.5, p.y);
}`,
    fragmentShader: `uniform float uOpacity; varying float vA; ${SOFT}
void main(){ float a = soft(gl_PointCoord)*vA*uOpacity; if (a < 0.01) discard; gl_FragColor = vec4(vec3(1.0), a); 
#include <colorspace_fragment>
}`,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 5;
  return { points: pts, uni: u, max: maxCount, geo: g };
}

export function createPuffs(max = 360) {
  const pos = new Float32Array(max * 3), size = new Float32Array(max), color = new Float32Array(max * 3), alpha = new Float32Array(max), kind = new Float32Array(max);
  const vel = new Float32Array(max * 3), age = new Float32Array(max).fill(1e9), life = new Float32Array(max).fill(1), grow = new Float32Array(max), size0 = new Float32Array(max), a0 = new Float32Array(max), drag = new Float32Array(max), grav = new Float32Array(max);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aColor', new THREE.BufferAttribute(color, 3)); g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1)); g.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
  const u = { uScale: { value: 600 } };
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: u, fog: false,
    vertexShader: `uniform float uScale; attribute float aSize; attribute vec3 aColor; attribute float aAlpha; attribute float aKind; varying vec3 vC; varying float vA; varying float vK;
void main(){ vec4 mv = modelViewMatrix*vec4(position, 1.0); gl_Position = projectionMatrix*mv; gl_PointSize = clamp(aSize*uScale/max(-mv.z, 0.5), 0.0, 220.0); vC = aColor; vA = aAlpha; vK = aKind; }`,
    fragmentShader: `varying vec3 vC; varying float vA; varying float vK; ${SOFT}
void main(){ float s = vK > 0.5 ? star(gl_PointCoord) : soft(gl_PointCoord); float a = s*vA; if (a < 0.01) discard; gl_FragColor = vec4(vC*(vK > 0.5 ? 1.25 : 1.0), a); 
#include <colorspace_fragment>
}`,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 6;
  let head = 0;
  const tc = new THREE.Color();
  function spawn(x, y, z, vx, vy, vz, s, grw, lifeS, hex, a, k, dr = 1.5, gv = 0) {
    const i = head; head = (head + 1) % max;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    size0[i] = s; grow[i] = grw; life[i] = lifeS; age[i] = 0; a0[i] = a; kind[i] = k; drag[i] = dr; grav[i] = gv;
    tc.set(hex); color[i * 3] = tc.r; color[i * 3 + 1] = tc.g; color[i * 3 + 2] = tc.b;
  }
  const R = Math.random;
  return {
    points: pts, uni: u, geo: g,
    dust(x, y, z, n = 10, hex = 0xe7d6b6, s = 0.9) {
      for (let i = 0; i < n; i++) { const a = R() * 6.283, v = 0.8 + R() * 1.6; spawn(x + Math.cos(a) * 0.2, y + 0.15, z + Math.sin(a) * 0.2, Math.cos(a) * v, 0.6 + R() * 0.9, Math.sin(a) * v, s * (0.55 + R() * 0.5), 1.6, 0.9 + R() * 0.5, hex, 0.8, 0, 3, -0.6); }
    },
    pop(x, y, z, hex = 0xffd9ec) {                // birth: a small ring of soft pops
      for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283, v = 1.0 + R() * 0.4; spawn(x, y + 0.25, z, Math.cos(a) * v, 0.5 + R() * 0.5, Math.sin(a) * v, 0.28, 0.5, 0.7, hex, 0.9, 1, 2.2, -0.5); }
    },
    sparkle(x, y, z) {                             // mutation: golden stars spiralling up
      for (let i = 0; i < 22; i++) {
        const a = R() * 6.283, v = 0.4 + R() * 1.0; spawn(x + Math.cos(a) * 0.15, y + 0.2 + R() * 0.3, z + Math.sin(a) * 0.15, Math.cos(a) * v, 1.4 + R() * 1.6, Math.sin(a) * v, 0.34 + R() * 0.3, -0.12, 1.5 + R() * 0.9, i % 3 ? 0xffe36a : 0xfff7d0, 1.0, 1, 1.4, -0.2);
      }
      spawn(x, y + 0.6, z, 0, 0.3, 0, 1.6, 1.2, 0.9, 0xfff2a8, 0.5, 0, 2, 0);
    },
    frost(x, y, z) { for (let i = 0; i < 12; i++) { const a = R() * 6.283, v = 0.3 + R() * 0.6; spawn(x, y + 0.2, z, Math.cos(a) * v, 0.5 + R(), Math.sin(a) * v, 0.2, 0.2, 1.2, 0xcfeaff, 0.9, 1, 1.6, -0.3); } },
    wisp(x, y, z, hex = 0xdadada) { for (let i = 0; i < 5; i++) { const a = R() * 6.283; spawn(x, y + 0.2, z, Math.cos(a) * 0.3, 0.5 + R() * 0.4, Math.sin(a) * 0.3, 0.5, 1.3, 1.4, hex, 0.5, 0, 1.5, -0.2); } },
    reset() { for (let i = 0; i < max; i++) { age[i] = life[i]; alpha[i] = 0; } },
    update(dt) {
      for (let i = 0; i < max; i++) {
        if (age[i] >= life[i]) { alpha[i] = 0; continue; }
        age[i] += dt; const t = Math.min(1, age[i] / life[i]), dk = Math.exp(-drag[i] * dt);
        vel[i * 3] *= dk; vel[i * 3 + 1] = vel[i * 3 + 1] * dk + grav[i] * dt; vel[i * 3 + 2] *= dk;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        size[i] = Math.max(0.01, size0[i] * (1 + grow[i] * t));
        alpha[i] = a0[i] * (t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88) ** 1.2;
      }
      for (const k of ['position', 'aSize', 'aAlpha', 'aColor', 'aKind']) g.attributes[k].needsUpdate = true;
    },
  };
}

// A flat band (plus a faint fill) that hugs the terrain: the placement preview, the reach of live patches, and event pings.
export function createGroundRing({ color = 0xffffff, opacity = 0.9, fill = 0.14, width = 0.5, seg = 56 } = {}) {
  const band = new THREE.BufferGeometry(), disc = new THREE.BufferGeometry();
  const bp = new Float32Array((seg + 1) * 2 * 3), dp = new Float32Array((seg + 2) * 3), bi = [], di = [];
  for (let i = 0; i < seg; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; bi.push(a, c, b, b, c, d); di.push(0, i + 2, i + 1); }
  band.setAttribute('position', new THREE.BufferAttribute(bp, 3).setUsage(THREE.DynamicDrawUsage)); band.setIndex(bi);
  disc.setAttribute('position', new THREE.BufferAttribute(dp, 3).setUsage(THREE.DynamicDrawUsage)); disc.setIndex(di);
  const mk = (o) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: o, depthWrite: false, fog: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const mBand = mk(opacity), mDisc = mk(fill);
  const group = new THREE.Group(), a = new THREE.Mesh(band, mBand), b = new THREE.Mesh(disc, mDisc);
  a.frustumCulled = b.frustumCulled = false; a.renderOrder = 3; b.renderOrder = 3; group.add(b, a); group.visible = false;
  const gy = (x, z) => { let y = heightAt(x, z); if (inStream(x, z, 0.4)) y = Math.max(y, waterLevelAt(z)); return y + 0.16; };
  let lx = NaN, lz = NaN, lr = NaN;
  return {
    group,
    set(x, z, r) {
      if (x === lx && z === lz && r === lr) return; lx = x; lz = z; lr = r;
      const ri = Math.max(0.05, r - width);
      dp[0] = x; dp[1] = gy(x, z); dp[2] = z;
      for (let i = 0; i <= seg; i++) {
        const t = (i / seg) * Math.PI * 2, cx = Math.cos(t), cz = Math.sin(t), ox = x + cx * r, oz = z + cz * r, ix = x + cx * ri, iz = z + cz * ri, oy = gy(ox, oz);
        bp[i * 6] = ox; bp[i * 6 + 1] = oy; bp[i * 6 + 2] = oz; bp[i * 6 + 3] = ix; bp[i * 6 + 4] = gy(ix, iz); bp[i * 6 + 5] = iz;
        dp[(i + 1) * 3] = ox; dp[(i + 1) * 3 + 1] = oy; dp[(i + 1) * 3 + 2] = oz;
      }
      band.attributes.position.needsUpdate = true; disc.attributes.position.needsUpdate = true;
    },
    style(hex, o = opacity, f = fill) { mBand.color.set(hex); mDisc.color.set(hex); mBand.opacity = o; mDisc.opacity = f; },
    show(v) { group.visible = v; },
    dispose() { band.dispose(); disc.dispose(); mBand.dispose(); mDisc.dispose(); },
  };
}

// Event pings: a few rings that spread out from a spot and fade (foxes entering, newcomers arriving, a patch going down).
export function createPings(n = 6) {
  const group = new THREE.Group(), pool = [];
  for (let i = 0; i < n; i++) { const r = createGroundRing({ fill: 0, width: 0.7, seg: 40 }); r.t = 1e9; group.add(r.group); pool.push(r); }
  return {
    group,
    ping(x, z, hex = 0xffffff, radius = 9, waves = 3) {
      for (let w = 0; w < waves; w++) {
        const r = pool.reduce((a, b) => (b.t > a.t ? b : a));
        r.t = -w * 0.45; r.x = x; r.z = z; r.hex = hex; r.rad = radius; r.dur = 1.5;
      }
    },
    reset() { for (const r of pool) { r.t = 1e9; r.show(false); } },
    update(dt) {
      for (const r of pool) {
        if (r.t >= (r.dur || 0)) { r.show(false); continue; }
        r.t += dt; if (r.t < 0) { r.show(false); continue; }
        const u = Math.min(1, r.t / r.dur), e = 1 - (1 - u) * (1 - u);
        r.set(r.x, r.z, 1 + e * r.rad); r.style(r.hex, 0.9 * (1 - u), 0); r.show(true);
      }
    },
    dispose() { for (const r of pool) r.dispose(); },
  };
}
