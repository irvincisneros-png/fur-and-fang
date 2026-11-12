// Fur & Fang 3D world. See docs/SPEC.md "Sim <-> render contract".
//   const world = await createWorld(canvas, { quality: 'auto' });   // 'auto' | 'low' | 'high' | 'ultra'
//   world.update(sim, dt)  (every frame; also renders)   world.onEvents(events)
//   world.pick(x, y) -> rabbit id | null    world.groundPoint(x, y) -> {x, z} | null
//   world.follow(id | null)   world.setGenotypeView(bool)   world.resize()   world.dispose()
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { loadAll } from './models.js';
import { U } from './paint.js';
import { buildTerrain, buildStream, heightAt } from './terrain.js';
import { createSky, skyPalette } from './sky.js';
import { createSnow, createPuffs } from './fx.js';
import { createPost } from './post.js';
import { createProps } from './props.js';
import { Herd } from './rabbits.js';
import { Foxes } from './foxes.js';
import { QUALITY, VALLEY, clamp, smooth, lerp } from './palette.js';

const TIERS = ['low', 'high', 'ultra'];
const SUN_DIR = new THREE.Vector3(-0.55, 0.72, 0.4).normalize();

export async function createWorld(canvas, { quality = 'auto' } = {}) {
  const models = await loadAll();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfe8f2, 95, 360);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 2000);

  // ---- lights
  const hemi = new THREE.HemisphereLight(0xa6cdff, 0x7d9a6a, 1.45); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0cc, 2.5); sun.castShadow = true; scene.add(sun, sun.target);
  const sc = sun.shadow.camera; sc.left = sc.bottom = -44; sc.right = sc.top = 44; sc.near = 20; sc.far = 330;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05; sun.shadow.radius = 2.5;

  // ---- world pieces
  const sky = createSky(); scene.add(sky.group);
  const terrain = buildTerrain(); scene.add(terrain);
  const stream = buildStream(); scene.add(stream);
  const props = createProps(models.flora, QUALITY.high); scene.add(props.group);
  const snow = createSnow(QUALITY.ultra.snow); scene.add(snow.points);
  const puffs = createPuffs(); scene.add(puffs.points);
  const onPuff = (kind, x, z, v, hex) => {
    const y = heightAt(x, z), s = v ? v.size : 1;
    if (kind === 'dust') puffs.dust(x, y, z, 11, 0xe8d8b8, 0.95);
    else if (kind === 'pop') puffs.pop(x, y, z);
    else if (kind === 'sparkle') puffs.sparkle(x, y + 0.5 * s, z);
    else if (kind === 'frost') puffs.frost(x, y, z);
    else if (kind === 'wisp') puffs.wisp(x, y, z, hex);
  };
  const herd = new Herd(models.rabbit, { onPuff }); scene.add(herd.group);
  const foxes = new Foxes(models.fox, { herd, onPuff }); scene.add(foxes.group);
  const post = createPost(renderer);

  // ---- camera rig
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.screenSpacePanning = false;
  controls.minDistance = 4; controls.maxDistance = 125; controls.maxPolarAngle = 1.46; controls.minPolarAngle = 0.12;
  controls.zoomSpeed = 0.9; controls.rotateSpeed = 0.7; controls.panSpeed = 0.9;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.target.set(0, 1, -4); camera.position.set(-14, 30, 66); controls.update();
  let followId = null, followZoom = 0;

  // ---- state
  let qName = quality, tierIdx = quality === 'auto' ? 1 : TIERS.indexOf(quality), q = QUALITY[TIERS[Math.max(0, tierIdx)]];
  if (tierIdx < 0) { tierIdx = 1; qName = 'high'; q = QUALITY.high; }
  let prCap = 2, time = 0, genotypeView = false, disposed = false;
  const S = { snow: 0, temp: 0, food: 100, tough: 0 }; let foodRef = 60, dry = 0, heat = 0, firstEnv = true;
  const stats = { fps: 60, quality: TIERS[tierIdx], rabbits: 0, drawCalls: 0, triangles: 0 };
  let fpsAcc = 0, fpsN = 0, slowWin = 0, grace = 3.0;

  function applyQuality() {
    q = QUALITY[TIERS[tierIdx]]; stats.quality = TIERS[tierIdx];
    const pr = Math.min(window.devicePixelRatio || 1, q.pr, prCap);
    renderer.setPixelRatio(pr);
    const prev = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = q.shadows; sun.castShadow = q.shadows;
    if (sun.shadow.mapSize.x !== q.shadowSize) { sun.shadow.mapSize.set(q.shadowSize, q.shadowSize); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    if (prev !== q.shadows) scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
    props.setQuality(q); props.setShadows(q.shadows); herd.setShadows(q.shadows); foxes.setShadows(q.shadows); foxes.setOutlines(q.outlines);
    terrain.receiveShadow = q.shadows;
    resize();
  }

  function resize() {
    const w = Math.max(1, canvas.clientWidth || canvas.width), h = Math.max(1, canvas.clientHeight || canvas.height);
    renderer.setSize(w, h, false);
    const a = w / h; camera.aspect = a;
    // keep the horizontal field of view wide enough in portrait (phones)
    camera.fov = a >= 1.25 ? 42 : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(52) / 2) / a));
    camera.fov = clamp(camera.fov, 42, 88); camera.updateProjectionMatrix();
    const pr = renderer.getPixelRatio();
    post.resize(Math.floor(w * pr), Math.floor(h * pr));
    const k = (h * pr) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    snow.uni.uScale.value = k; puffs.uni.uScale.value = k;
  }

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null;
  if (ro) ro.observe(canvas);
  window.addEventListener('resize', resize);
  applyQuality();

  const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2(), _tmp = new THREE.Vector3();
  const world = {
    canvas, renderer, scene, camera, controls, stats,
    get quality() { return qName; },
    setQuality(name) {
      qName = name;
      if (name !== 'auto') tierIdx = Math.max(0, TIERS.indexOf(name)); else tierIdx = Math.max(tierIdx, 1);
      prCap = 2; applyQuality();
    },
    resize,

    update(sim, dt) {
      if (disposed) return;
      dt = clamp(dt || 0.016, 0.0005, 0.1); time += dt; U.uTime.value = time;
      const env = sim.env || {};
      // ---- environment -> uniforms (eased so sliders glide)
      const k = firstEnv ? 1 : 1 - Math.exp(-dt * 2.2); firstEnv = false;
      S.snow += ((env.snow ?? 0) - S.snow) * k; S.temp += ((env.temp ?? 0) - S.temp) * k;
      S.food += ((env.food ?? S.food) - S.food) * k; S.tough += ((env.tough ?? 0) - S.tough) * k;
      foodRef = Math.max(env.foodMax || 0, foodRef * 0.9995, S.food, 60);
      const foodN = clamp(S.food / foodRef);
      const dryT = clamp(Math.max(0, S.temp) * 0.85 + (1 - foodN) * 0.55 * clamp(S.temp + 0.6) + S.tough * 0.2 * Math.max(0, S.temp));
      dry += (dryT * (1 - S.snow * 0.8) - dry) * k;
      U.uSnow.value = S.snow; U.uTemp.value = S.temp; U.uDry.value = dry;
      const pal = skyPalette(S.snow, S.temp, dry);
      hemi.color.copy(pal.hemiS); hemi.groundColor.copy(pal.hemiG); hemi.intensity = pal.hemiI;
      sun.color.copy(pal.sun); sun.intensity = pal.sunI;
      scene.fog.color.copy(pal.hor); scene.fog.near = lerp(95, 55, pal.overcast * 0.8); scene.fog.far = lerp(360, 250, pal.overcast * 0.8);
      heat = smooth(0.25, 0.85, S.temp) * (0.55 + 0.45 * dry);

      // ---- actors
      herd.followId = followId;
      herd.genotypeView = genotypeView;
      const nR = (sim.rabbits || []).length;
      herd.setOutlines(q.outlines && (TIERS[tierIdx] === 'ultra' || nR <= 320));
      herd.update(sim, dt, time);
      foxes.update(sim, dt, time);
      props.update(sim, dt);
      puffs.update(dt);
      stats.rabbits = herd.v.size;

      // ---- falling snow
      const cold = smooth(0.12, -0.5, S.temp), fall = clamp(cold * (0.25 + 0.75 * smooth(0.0, 0.55, S.snow)) + 0.25 * smooth(0.55, 1, S.snow) * smooth(0.5, -0.2, S.temp));
      snow.uni.uOpacity.value = Math.min(0.95, fall * 1.1); snow.uni.uTime.value = time; snow.uni.uWind.value = 1.0 + 1.5 * fall;
      snow.geo.setDrawRange(0, Math.floor(Math.min(snow.max, q.snow) * clamp(fall * 1.15)));
      snow.points.visible = fall > 0.02 && q.snow > 0;
      snow.uni.uCenter.value.set(controls.target.x, 0, controls.target.z);

      // ---- camera: follow, limits
      if (followId != null) {
        const v = herd.position(followId);
        if (!v) followId = null;
        else {
          const tx = v.x, ty = v.y + 0.45 * v.size, tz = v.z, f = 1 - Math.exp(-dt * 5);
          const dx = (tx - controls.target.x) * f, dy = (ty - controls.target.y) * f, dz = (tz - controls.target.z) * f;
          controls.target.x += dx; controls.target.y += dy; controls.target.z += dz; camera.position.x += dx; camera.position.y += dy; camera.position.z += dz;
          if (followZoom > 0) {
            followZoom -= dt; _tmp.copy(camera.position).sub(controls.target); const L = _tmp.length(), want = clamp(L, 6, 15);
            if (L > want) camera.position.copy(controls.target).addScaledVector(_tmp.normalize(), lerp(L, want, 1 - Math.exp(-dt * 4)));
          }
        }
      }
      controls.target.x = clamp(controls.target.x, -VALLEY - 4, VALLEY + 4); controls.target.z = clamp(controls.target.z, -VALLEY - 4, VALLEY + 4);
      if (followId == null) controls.target.y += (heightAt(controls.target.x, controls.target.z) + 0.8 - controls.target.y) * (1 - Math.exp(-dt * 4));
      controls.update();
      const gy = heightAt(camera.position.x, camera.position.z) + 1.2;
      if (camera.position.y < gy) camera.position.y = gy;
      sky.update(pal, SUN_DIR, dt, camera.position);
      // sun + shadow frustum follow the orbit target (snapped to the shadow texel grid)
      const tx = Math.round(controls.target.x / 2) * 2, tz = Math.round(controls.target.z / 2) * 2;
      sun.target.position.set(tx, 0, tz); sun.position.set(tx + SUN_DIR.x * 150, SUN_DIR.y * 150, tz + SUN_DIR.z * 150);
      const sp = clamp(camera.position.distanceTo(controls.target) * 0.55, 30, 90); sc.left = sc.bottom = -sp; sc.right = sc.top = sp; sc.updateProjectionMatrix();

      // ---- render
      const usePost = q.post && heat > 0.06;
      if (!(usePost && post.render(scene, camera, time, heat))) renderer.render(scene, camera);
      stats.drawCalls = renderer.info.render.calls; stats.triangles = renderer.info.render.triangles;

      // ---- adaptive quality
      fpsAcc += dt; fpsN++;
      if (fpsAcc >= 1.0) {
        stats.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
        if (grace > 0) grace -= 1;
        else if (qName === 'auto') {
          if (stats.fps < 38) slowWin++; else slowWin = 0;
          if (slowWin >= 2) {
            slowWin = 0;
            if (tierIdx > 0 && prCap > 1.2 && tierIdx === 1) { prCap = 1.2; applyQuality(); }
            else if (tierIdx > 0) { tierIdx--; applyQuality(); }
          }
        }
      }
    },

    onEvents(events) {
      if (!events) return;
      for (const ev of events) {
        if (ev.type === 'gen') continue;
        herd.event(ev);
        if (ev.type === 'death' && ev.cause === 'predator') { /* the catch event (or the dying pose) spawns the puff */ }
      }
    },

    pick(clientX, clientY) { return herd.pick(clientX, clientY, camera, canvas.getBoundingClientRect()); },

    groundPoint(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      _ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      _ray.setFromCamera(_ndc, camera);
      const o = _ray.ray.origin, d = _ray.ray.direction;
      let t0 = 0, prev = o.y - heightAt(o.x, o.z);
      for (let t = 1; t < 700; t += Math.max(1, t * 0.03)) {
        const x = o.x + d.x * t, z = o.z + d.z * t, e = (o.y + d.y * t) - heightAt(x, z);
        if (e <= 0) {
          let a = t0, b = t;
          for (let i = 0; i < 12; i++) { const m = (a + b) / 2; const ex = (o.y + d.y * m) - heightAt(o.x + d.x * m, o.z + d.z * m); if (ex > 0) a = m; else b = m; }
          const px = o.x + d.x * b, pz = o.z + d.z * b;
          return Math.abs(px) <= VALLEY + 2 && Math.abs(pz) <= VALLEY + 2 ? { x: clamp(px, -VALLEY, VALLEY), z: clamp(pz, -VALLEY, VALLEY) } : null;
        }
        t0 = t; prev = e;
      }
      return null;
    },

    follow(id) { followId = id == null ? null : id; herd.followId = followId; if (followId != null) followZoom = 1.4; },
    setGenotypeView(on) { genotypeView = !!on; },

    dispose() {
      disposed = true;
      window.removeEventListener('resize', resize); if (ro) ro.disconnect();
      controls.dispose(); herd.dispose(); foxes.dispose(); props.dispose(); sky.dispose(); post.dispose();
      scene.traverse((o) => { if (o.geometry && !Object.values(models).some((s) => [...s.values()].includes(o.geometry))) o.geometry.dispose(); });
      for (const set of Object.values(models)) for (const g of set.values()) g.dispose();
      renderer.dispose(); try { renderer.forceContextLoss(); } catch (e) { /* ignore */ }
    },
  };
  return world;
}
