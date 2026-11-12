// Colours, tunables and quality tiers for the Fur & Fang renderer.
import * as THREE from 'three';

export const VALLEY = 60;                 // sim half-extent (m); the render world is bigger (bowl rim + hills)
export const GENOTYPE_COLORS = { BB: 0xff8a1f, Bb: 0xa84dff, bb: 0x2ad4ee };   // genotype-view rings (carrier Bb = violet)
export const FUR = { brown: 0xc58d58, white: 0xf7f5f1 };

export const QUALITY = {
  low:   { pr: 1.25, shadows: false, outlines: false, particles: 0.3, grass: 1100, flowers: 0, snow: 700,  post: false, shadowSize: 1024, blob: true, lod: true },
  high:  { pr: 2.0,  shadows: true,  outlines: true,  particles: 1.0, grass: 3200, flowers: 500, snow: 2200, post: true, shadowSize: 2048, blob: false },
  ultra: { pr: 2.0,  shadows: true,  outlines: true,  particles: 1.0, grass: 5200, flowers: 900, snow: 3500, post: true, shadowSize: 4096, blob: false },
};

export const col = (h) => new THREE.Color(h);

// mulberry32, deterministic scatter
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export function hashId(id) {          // stable 0..1 from a rabbit id (number or string)
  let h = 2166136261; const s = String(id);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}
