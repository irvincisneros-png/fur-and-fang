// Seeded random numbers (mulberry32). Pure logic: no DOM.
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed) { this.seed = seed >>> 0; this._f = mulberry32(this.seed); }
  next() { return this._f(); }
  range(a, b) { return a + (b - a) * this._f(); }
  int(n) { return Math.floor(this._f() * n); }
  chance(p) { return this._f() < p; }
  pick(arr) { return arr[this.int(arr.length)]; }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = this.int(i + 1); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }
}

const CODE_LEN = 6;
export function codeFromSeed(n) { return (n >>> 0).toString(36).toUpperCase().slice(-CODE_LEN).padStart(CODE_LEN, '0'); }
export function seedFromCode(code) {
  const s = String(code || '').trim().toUpperCase();
  if (/^[0-9A-Z]{1,6}$/.test(s)) return parseInt(s, 36) >>> 0;
  let h = 2166136261;                     // any other text: hash it
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function randomSeedCode() { return codeFromSeed(Math.floor(Math.random() * 2176782336)); }
