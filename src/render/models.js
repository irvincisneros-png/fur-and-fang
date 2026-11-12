// Loads the Blender-built GLBs (tools/blender/*.py) into Map(name -> BufferGeometry{position, normal, color(vec3), aMask}).
// Blender writes COLOR_0 as RGBA: rgb = painted value, alpha = fur mask (see build_rabbit.py). We split them here.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const cache = new Map();

export async function loadSet(url) {
  if (cache.has(url)) return cache.get(url);
  const p = (async () => {
    const gltf = await new GLTFLoader().loadAsync(url);
    const out = new Map();
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
      const n = g.attributes.position.count, rgb = new Float32Array(n * 3), mask = new Float32Array(n);
      const c = g.attributes.color;
      for (let i = 0; i < n; i++) {
        if (c) { rgb[i * 3] = c.getX(i); rgb[i * 3 + 1] = c.getY(i); rgb[i * 3 + 2] = c.getZ(i); mask[i] = c.itemSize === 4 ? c.getW(i) : 0; }
        else { rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = 0.8; }
      }
      g.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
      g.setAttribute('aMask', new THREE.BufferAttribute(mask, 1));
      if (!g.attributes.normal) g.computeVertexNormals();
      g.computeBoundingSphere();
      out.set(o.name, g);
    });
    return out;
  })();
  cache.set(url, p);
  return p;
}

export async function loadAll(base = new URL('../../assets/models/', import.meta.url).href) {
  const [rabbit, fox, flora] = await Promise.all(['rabbit.glb', 'fox.glb', 'flora.glb'].map((f) => loadSet(base + f)));
  return { rabbit, fox, flora };
}
