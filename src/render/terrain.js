// Bowl-shaped meadow: height function (shared with sim-facing code), terrain mesh with painted ground shader, stream.
import * as THREE from 'three';
import { U, NOISE_GLSL } from './paint.js';
import { clamp, smooth } from './palette.js';

export const EXTENT = 150;          // terrain half-size (m); sim valley is +-60, the rest is the rim and far hills

// ---- value noise (CPU), smooth
function h2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vn(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

import { streamX, STREAM_W, channelX, CHANNEL } from '../sim/valley.js';   // one stream for the sim and the picture
export { streamX };
const CARVE = 1.15;

function baseHeight(x, z) {
  const r = Math.hypot(x, z);
  let h = (vn(x * 0.03 + 3, z * 0.03) - 0.5) * 3.0 + (vn(x * 0.085, z * 0.085 + 9) - 0.5) * 0.9;
  // gentle flattening in the middle where the rabbits roam
  const mid = 1 - smooth(14, 55, r) * 0.0;
  h *= 0.55 + 0.45 * smooth(10, 60, r);
  h += 0.0009 * r * r;                                         // saucer
  const rim = clamp((r - 66) / 70);
  h += rim * rim * 26 + clamp((r - 100) / 50) * 14;          // the hills that make it a bowl
  h += (vn(x * 0.05 + 20, z * 0.05 + 4) - 0.5) * 10 * smooth(75, 120, r);
  return h * mid;
}

export function heightAt(x, z) {
  let h = baseHeight(x, z);
  const d = Math.abs(x - streamX(z));
  const t = clamp((d - 8) / (0.5 - 8));
  h -= CARVE * t * t * (3 - 2 * t);
  return h;
}
export function waterLevelAt(z) { return baseHeight(streamX(z), z) - CARVE + 0.5; }
export function wetAt(x, z) { return 1 - smooth(3.0, 10.0, Math.abs(x - streamX(z))); }
export function inStream(x, z, pad = 0) { return Math.abs(x - streamX(z)) < STREAM_W + pad; }
export function normalAt(x, z, e = 0.8) {
  const dx = heightAt(x + e, z) - heightAt(x - e, z), dz = heightAt(x, z + e) - heightAt(x, z - e);
  const n = new THREE.Vector3(-dx, 2 * e, -dz); return n.normalize();
}

const v3 = (hex) => { const c = new THREE.Color(hex); return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`; };

export function groundMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: false });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    const head = 'uniform float uSnow; uniform float uTemp; uniform float uDry; uniform float uTime; uniform vec3 uSnowCol; uniform float uOutScale;';
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aWet; varying float vWet; varying vec3 vWP; varying float vNY;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
vWet = aWet; vec4 wp = modelMatrix*vec4(transformed, 1.0); vWP = wp.xyz; vNY = normalize(mat3(modelMatrix)*objectNormal).y;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
${head}
${NOISE_GLSL}
varying float vWet; varying vec3 vWP; varying float vNY;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 p = vWP.xz;
  float n1 = fbm(p*0.06 + 3.0), n2 = fbm(p*0.35), n3 = vnoise(p*2.6), n4 = vnoise(p*0.9 + 40.0);
  // lush: two greens in broad brush patches, tonal flecks, a few clover-pale patches
  vec3 lush = mix(${v3(0x4aa043)}, ${v3(0x76bd52)}, smoothstep(0.3, 0.7, n1));         
  lush = mix(lush, ${v3(0x8ccc5e)}, smoothstep(0.62, 0.8, n4)*0.5);
  lush *= 0.9 + 0.2*n2 + 0.05*(n3-0.5);
  // dry gold, with scuffs of bare dirt
  vec3 dry = mix(${v3(0xd2b25e)}, ${v3(0xb89648)}, smoothstep(0.3, 0.75, n1));
  dry = mix(dry, ${v3(0xa58358)}, smoothstep(0.5, 0.75, n2)*0.55);
  dry *= 0.92 + 0.16*n3;
  float lDry = eDry(p), lTemp = eTemp(p), lSnow = eSnow(p);
  float dl = smoothstep(0.0, 1.0, lDry*1.35 + (n1-0.5)*0.8 - 0.2);
  vec3 g = mix(lush, dry, dl);
  // cold: duller, bluer ground between snow patches
  float cold = clamp(-lTemp, 0.0, 1.0) + lSnow*0.5;
  g = mix(g, g*vec3(0.8, 0.9, 0.82) + vec3(0.0, 0.01, 0.03), clamp(cold, 0.0, 1.0)*0.7);
  // slopes show rock and earth
  float steep = smoothstep(0.80, 0.55, vNY);
  g = mix(g, mix(${v3(0xa09483)}, ${v3(0x80766a)}, n2), steep*0.85);
  // wet banks near the stream: dark, pebbly
  float wet = smoothstep(0.0, 1.0, vWet);
  g = mix(g, ${v3(0x5c5a44)}*(0.8 + 0.5*n3), wet*0.65);
  g = mix(g, ${v3(0x9a948a)}*(0.7 + 0.6*n3), smoothstep(0.78, 1.0, vWet)*0.5);
  // snow: patchy at mid values, thin slushy edge, blue-white
  float cov = snowCover(p, vNY, vWet);
  float edge = smoothstep(0.0, 0.3, cov)*(1.0 - smoothstep(0.55, 1.0, cov));
  g = mix(g, g*0.8, edge*0.35*step(0.02, lSnow));
  vec3 sn = mix(uSnowCol, uSnowCol*vec3(0.93, 0.96, 1.0), n2) * (0.94 + 0.06*n3);
  g = mix(g, sn, cov);
  diffuseColor.rgb = g;
}`);
  };
  return m;
}

export function buildTerrain() {
  const N = 220, size = EXTENT * 2;
  const geo = new THREE.PlaneGeometry(size, size, N, N); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, wet = new Float32Array(pos.count), nrm = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, heightAt(x, z)); wet[i] = wetAt(x, z);
  }
  for (let i = 0; i < pos.count; i++) {
    const n = normalAt(pos.getX(i), pos.getZ(i), 1.2); nrm[i * 3] = n.x; nrm[i * 3 + 1] = n.y; nrm[i * 3 + 2] = n.z;
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('aWet', new THREE.BufferAttribute(wet, 1));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, groundMaterial());
  mesh.receiveShadow = true;
  return mesh;
}

// ---- stream: a ribbon following streamX(z) with animated ripples, foam edge and a clear see-through blend.
// Built once at its widest (flood) width; uHalfW sets how much of it shows, uLift raises it, uSilt muddies it.
// opts.channel builds the Islands side channel instead (follows the ground, fills from upstream with uFill).
export function buildStream(opts = {}) {
  const ch = !!opts.channel;
  const z0 = ch ? CHANNEL.z0 : -EXTENT * 0.95, z1 = ch ? CHANNEL.z1 : EXTENT * 0.95, segs = ch ? 64 : 150, across = ch ? 8 : 10;
  const hwMax = ch ? 3.6 : 7.6, path = ch ? channelX : streamX;
  const pos = [], uv = [], idx = [], gnd = [];
  for (let i = 0; i <= segs; i++) {
    const z = z0 + (z1 - z0) * i / segs, cx = path(z), yFlat = ch ? 0 : waterLevelAt(z);
    for (let j = 0; j <= across; j++) {
      const u = j / across, x = cx + (u * 2 - 1) * hwMax;
      pos.push(x, ch ? heightAt(x, z) + 0.06 : yFlat, z); uv.push(u, ch ? i / segs : z * 0.1); gnd.push(heightAt(x, z));
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < across; j++) {
    const a = i * (across + 1) + j, b = a + 1, c = a + across + 1, d = c + 1; idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aGround', new THREE.Float32BufferAttribute(gnd, 1));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uHalfW: { value: ch ? 0 : STREAM_W + 0.55 }, uMaxW: { value: hwMax }, uLift: { value: 0 }, uSilt: { value: 0 }, uFill: { value: ch ? 0 : 1e6 }, uIce: { value: 0 }, uTime: U.uTime, uSnow: U.uSnow, uTemp: U.uTemp, uSun: { value: new THREE.Vector3(0.5, 0.8, 0.3) }, uDeep: { value: new THREE.Color(0x3d9fb5) }, uShallow: { value: new THREE.Color(0x8fdcc9) }, uSky: { value: new THREE.Color(0xbfe3f5) } }]),
    vertexShader: `uniform float uLift; attribute float aGround; varying vec2 vUv; varying vec3 vW;
#include <fog_pars_vertex>
void main(){ vUv = uv; vec3 pp = position; pp.y += uLift; if (uLift > 0.01) pp.y = max(pp.y, aGround + 0.08 + 0.1*uLift); vec4 wp = modelMatrix*vec4(pp,1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix*wp; gl_Position = projectionMatrix*mvPosition;
#include <fog_vertex>
}`,
    fragmentShader: `uniform float uHalfW; uniform float uMaxW; uniform float uSilt; uniform float uFill; uniform float uIce; uniform float uTime; uniform float uSnow; uniform float uTemp; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky; varying vec2 vUv; varying vec3 vW;
${NOISE_GLSL.split('// @@REGION')[0]}
#include <fog_pars_fragment>
void main(){
  float e = abs(vUv.x*2.0 - 1.0)*uMaxW/max(uHalfW, 0.001);
  if (e > 1.0 || vUv.y > uFill) discard;
  vec2 p = vW.xz;
  float flow = uTime*(0.5 + uSilt*0.6);
  float r = fbm(vec2(p.x*0.9, p.y*0.35 - flow)*1.2) + 0.5*vnoise(vec2(p.x*2.6, p.y*0.9 - flow*1.7));
  float streak = smoothstep(0.78, 0.95, fbm(vec2(p.x*1.6 + 3.0, p.y*0.5 - flow*1.3)*2.0));
  vec3 c = mix(uShallow, uDeep, smoothstep(1.0, 0.0, e)*0.85);
  c += (r-0.7)*0.12;
  c = mix(c, uSky, 0.18);
  c += streak*vec3(0.5, 0.55, 0.55);
  float foam = smoothstep(0.78, 0.96, e + (vnoise(p*3.0 + uTime*0.4)-0.5)*0.12);
  c = mix(c, vec3(0.97), foam*0.9);
  float ice = clamp(uSnow*1.1 + max(0.0, -uTemp)*0.6 - 0.45, 0.0, 0.85)*(1.0 - uSilt);       // freezes at the edges in winter
  c = mix(c, vec3(0.86, 0.94, 1.0), ice*smoothstep(0.25, 0.9, e));
  c = mix(c, vec3(0.10, 0.16, 0.11) + (r-0.7)*0.05 + streak*0.12, uSilt*0.8);                    // flood: deep silty green (linear)
  c = mix(c, vec3(0.88, 0.95, 1.0)*(0.92 + 0.1*r), uIce);                                       // ice bridge: frozen over
  float front = smoothstep(uFill - 0.06, uFill, vUv.y);
  c = mix(c, vec3(0.97), front*0.8);
  float a = mix(mix(0.82, 0.94, uSilt), 1.0, smoothstep(0.55, 0.95, e)) * (1.0 - smoothstep(0.96, 1.0, e)*0.6);
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`,
  });
  const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 2;
  return mesh;
}
