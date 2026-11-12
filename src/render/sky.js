// Sky gradient dome, painted puffy clouds, and the palette that follows snow / temp / drought.
import * as THREE from 'three';
import { clamp, lerp, rng } from './palette.js';

const C = (h) => new THREE.Color(h);
const P = {
  lush: { zen: C(0x4a9be4), hor: C(0xcfe8f2), sun: C(0xfff0cc), hemiS: C(0xa6cdff), hemiG: C(0x7d9a6a), sunI: 2.5, hemiI: 1.45, cloud: C(0xffffff), cloudA: 0.95 },
  cold: { zen: C(0x86a2c6), hor: C(0xdbe4ed), sun: C(0xf2f5ff), hemiS: C(0xb4c9f0), hemiG: C(0x9aa6b8), sunI: 1.75, hemiI: 1.75, cloud: C(0xd7dde8), cloudA: 1.0 },
  hot:  { zen: C(0x5f9bd9), hor: C(0xf5e0b0), sun: C(0xffd49a), hemiS: C(0xd8d6c4), hemiG: C(0xb89a62), sunI: 2.9, hemiI: 1.25, cloud: C(0xfff3de), cloudA: 0.4 },
};
const tmp = new THREE.Color();
function mix3(key, wc, wh) {      // lush -> (cold, hot) weights
  const out = P.lush[key].clone();
  if (wc > 0) out.lerp(P.cold[key], wc);
  if (wh > 0) out.lerp(P.hot[key], wh);
  return out;
}
function mixN(key, wc, wh) {
  let v = P.lush[key]; v = lerp(v, P.cold[key], wc); return lerp(v, P.hot[key], wh);
}
export function skyPalette(snow, temp, dry) {
  const wc = clamp(Math.max(0, -temp) * 0.55 + snow * 0.6), wh = clamp(Math.max(0, temp) * 0.75 + dry * 0.25) * (1 - wc);
  return {
    zen: mix3('zen', wc, wh), hor: mix3('hor', wc, wh), sun: mix3('sun', wc, wh), hemiS: mix3('hemiS', wc, wh), hemiG: mix3('hemiG', wc, wh), cloud: mix3('cloud', wc, wh),
    sunI: mixN('sunI', wc, wh), hemiI: mixN('hemiI', wc, wh), cloudA: mixN('cloudA', wc, wh), overcast: wc, hot: wh,
  };
}

const CELL_W = 640, CELL_H = 320;
function paintClouds() {
  const c = document.createElement('canvas'); c.width = CELL_W * 3; c.height = CELL_H;
  const x = c.getContext('2d'), r = rng(2025);
  for (let cell = 0; cell < 3; cell++) {
    x.save(); x.translate(cell * CELL_W, 0); x.beginPath(); x.rect(0, 0, CELL_W, CELL_H); x.clip();
    const base = CELL_H * 0.78, puffs = [], n = 12 + cell * 2;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n, bell = Math.sin(u * Math.PI), px = CELL_W * (0.12 + 0.76 * u) + (r() - 0.5) * 22, rad = 30 + bell * (40 + r() * 34);
      puffs.push({ x: px, y: base - rad * 0.5, r: rad });
      if (bell > 0.45) puffs.push({ x: px + (r() - 0.5) * 30, y: base - rad * 0.8 - bell * (30 + r() * 56), r: rad * (0.6 + r() * 0.26) });
    }
    puffs.sort((a, b) => a.y - b.y);
    for (const p of puffs) {
      const g = x.createRadialGradient(p.x - p.r * 0.2, p.y - p.r * 0.34, p.r * 0.1, p.x, p.y, p.r);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(246,248,252,1)'); g.addColorStop(0.9, 'rgba(198,208,222,1)');
      g.addColorStop(0.97, 'rgba(190,200,216,0.7)'); g.addColorStop(1, 'rgba(190,200,216,0)');
      x.fillStyle = g; x.beginPath(); x.arc(p.x, p.y, p.r, 0, 6.2832); x.fill();
    }
    x.globalCompositeOperation = 'destination-out';
    const f = x.createLinearGradient(0, base - 12, 0, base + 14); f.addColorStop(0, 'rgba(0,0,0,0)'); f.addColorStop(1, 'rgba(0,0,0,1)');
    x.fillStyle = f; x.fillRect(0, base - 12, CELL_W, CELL_H);
    x.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

const CLOUDS = [ // azimuth, elevation (deg), width (m), cell
  [0.4, 10, 620, 0], [1.3, 7, 520, 2], [2.2, 12, 700, 1], [3.0, 8, 560, 2], [3.9, 11, 640, 0], [4.7, 7, 600, 1], [5.5, 13, 540, 2], [0.9, 24, 420, 1], [4.2, 26, 440, 2],
];
const DIST = 720;

export function createSky() {
  const group = new THREE.Group();
  const uni = { uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0.5, 0.7, 0.3).normalize() }, uSunCol: { value: new THREE.Color() }, uOver: { value: 0 } };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: uni,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uOver; varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir); float h = d.y;
  vec3 c = mix(uHor, uZen, pow(clamp(h, 0.0, 1.0), 0.5));
  c = mix(c, uHor, smoothstep(0.0, -0.25, h));
  float s = max(dot(d, uSunDir), 0.0);
  c += uSunCol*(pow(s, 900.0)*2.0 + pow(s, 14.0)*0.22 + pow(s, 3.0)*0.06)*(1.0 - uOver*0.85);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`,
  }));
  dome.renderOrder = -10; dome.frustumCulled = false; group.add(dome);

  // clouds
  const pos = [], uv = [], idx = [];
  CLOUDS.forEach(([az, el, w, cell], i) => {
    const e = el * Math.PI / 180, ce = Math.cos(e), cx = Math.sin(az) * ce, cy = Math.sin(e), cz = Math.cos(az) * ce, h = w * (CELL_H / CELL_W);
    const rx = Math.cos(az), rz = -Math.sin(az);
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      pos.push(cx * DIST + rx * (u - 0.5) * w, cy * DIST + (v - 0.5) * h, cz * DIST + rz * (u - 0.5) * w); uv.push((cell + u) / 3, v);
    }
    const b = i * 4; idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); cg.setIndex(idx);
  const map = paintClouds();
  const cu = { uMap: { value: map }, uTint: { value: new THREE.Color(1, 1, 1) }, uAlpha: { value: 1 }, uShade: { value: new THREE.Color(0.72, 0.8, 0.92) } };
  const clouds = new THREE.Mesh(cg, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, uniforms: cu,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D uMap; uniform vec3 uTint; uniform float uAlpha; uniform vec3 uShade; varying vec2 vUv;
void main(){ vec4 t = texture2D(uMap, vUv); if (t.a < 0.01) discard;
  float l = dot(t.rgb, vec3(0.333)); vec3 c = mix(uShade, vec3(1.0), smoothstep(0.62, 1.0, l))*uTint;
  gl_FragColor = vec4(c, t.a*uAlpha);
  #include <colorspace_fragment>
}`,
  }));
  clouds.renderOrder = -9; clouds.frustumCulled = false; group.add(clouds);
  let drift = 0;
  return {
    group, uni,
    update(pal, sunDir, dt, camPos) {
      uni.uZen.value.copy(pal.zen); uni.uHor.value.copy(pal.hor); uni.uSunCol.value.copy(pal.sun); uni.uSunDir.value.copy(sunDir); uni.uOver.value = pal.overcast;
      cu.uTint.value.copy(pal.cloud); cu.uAlpha.value = pal.cloudA;
      cu.uShade.value.set(0.74, 0.82, 0.94).lerp(tmp.set(0.55, 0.6, 0.7), pal.overcast).lerp(tmp.set(0.9, 0.78, 0.62), pal.hot);
      drift += dt * 0.004; clouds.rotation.y = drift;
      group.position.copy(camPos);
    },
    dispose() { dome.geometry.dispose(); dome.material.dispose(); cg.dispose(); clouds.material.dispose(); map.dispose(); },
  };
}
