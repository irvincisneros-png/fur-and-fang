// Islands update (docs/specs/2026-11-13-islands.md): water that splits the valley into populations, a hidden genome that
// drifts apart while they are separated, hybrid viability and fertility, storms (founder effect) and carrying (gene flow).
// Pure logic. IslandSim extends Simulation and overrides only what regions change, so classic modes are untouched.
import { P } from './params.js';
import { RNG } from './rng.js';
import { Simulation } from './sim.js';
import { DOM_SURVIVE, drawGenotype, cross, phenotype } from './genetics.js';
import { composition, alleleFreq, CAUSES } from './history.js';
import { streamX, STREAM_W, BANK, BURROWS, FORDS, fordPoint, channelX, inChannelSpan, regionOf, REGION_NAMES } from './valley.js';

const I = P.ISLANDS;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
const HAZ = ['predator', 'cold', 'heat', 'starved'];
const FULL = (1 << I.K) - 1;
export const popcount = (v) => { v >>>= 0; let c = 0; while (v) { v &= v - 1; c++; } return c; };
export const viability = (h) => 1 / (1 + Math.pow(h / I.H_V, I.S_V));
export const fertility = (h) => 1 / (1 + Math.pow(h / I.H_F, I.S_F));
export function speciesLabel(phi) {
  if (phi >= I.ONE_SPECIES) return { band: 'one', text: 'Still one species: they interbreed freely.' };
  if (phi >= I.TWO_SPECIES) return { band: 'between', text: 'In between: some hybrid kits fail or cannot breed. Biologists argue about cases like this.' };
  return { band: 'two', text: 'Two species (by the biological species concept): they can mate, but hybrids rarely survive and breed.' };
}

// Water switches -> which links are open -> populations (connected regions).
export function linksOpen(w) { return { WE: w.river === 0, WI: w.river === 0 && w.midFord === 0, IE: w.channel === 0 }; }
export function populationsOf(w) {
  const L = linksOpen(w), adj = [[], [], []];
  const join = (a, b) => { adj[a].push(b); adj[b].push(a); };
  if (L.WE) join(0, 1); if (L.WI) join(0, 2); if (L.IE) join(2, 1);
  const seen = [false, false, false], out = [];
  for (let s = 0; s < 3; s++) {
    if (seen[s]) continue;
    const comp = [], stack = [s]; seen[s] = true;
    while (stack.length) { const a = stack.pop(); comp.push(a); for (const b of adj[a]) if (!seen[b]) { seen[b] = true; stack.push(b); } }
    out.push(comp.sort());
  }
  return out;
}
export function popName(regions) {
  if (regions.length === 3) return 'Valley';
  if (regions.length === 2 && regions.includes(0) && regions.includes(1)) return 'Mainland';
  return regions.map((r) => REGION_NAMES[r]).join('+');
}
export const SCENARIOS = {
  open: { label: 'Open valley', water: { river: 0, midFord: 0, channel: 0 } },
  flood: { label: 'River flood', water: { river: 1, midFord: 0, channel: 0 } },
  storm: { label: 'Storm island', water: { river: 0, midFord: 1, channel: 1 } },
  three: { label: 'Three lands', water: { river: 1, midFord: 0, channel: 1 } },
};
export const LAND_PRESETS = {
  meadow: { label: 'Meadow', env: { snow: 0, temp: 0.1, tough: 0, predators: 0 } },
  alpine: { label: 'Alpine', env: { snow: 0.9, temp: -0.7, tough: 0, predators: 5 } },
  desert: { label: 'Desert', env: { snow: 0, temp: 0.8, tough: 0.7, predators: 4 } },
};
const REGION_CENTRE = [{ x: -26, z: 6 }, { x: 22, z: -18 }, { x: 22, z: 6 }];
const REGION_WEIGHT = [0.5, 0.4, 0.1];
const MIGRATE = 0.1;          // chance per generation that a rabbit moves to another land of its own population

export class IslandSim extends Simulation {
  constructor(opts = {}) {
    const { founders, startPop, islands = {}, setup, ...rest } = opts;
    super({ ...rest, startPop: 0, setup: (s) => { s._initIslands({ founders, startPop, islands, opts }); setup?.(s); } });
  }

  _initIslands({ founders, startPop, islands, opts }) {
    this.crng = new RNG((this.seed ^ 0x3C6EF372) >>> 0);   // clock, hidden gametes, hybrid draws, heal picks
    this.xrng = new RNG((this.seed ^ 0x7F4A7C15) >>> 0);   // test crosses only: measuring never changes the run
    const lab = I.LAB;
    this.lin = islands.lin || null;   // Two Lineages tuning (lineages.js): left null, the lab and every classic mode behave exactly as before
    if (this.mode !== 'survive') {
      this.cfg.kitsFixed = null; this.cfg.dominance = { ...(opts.dominance || DOM_SURVIVE) };
      this.cfg.mutationRate = opts.mutationRate ?? lab.mutationRate;
    }
    const base = { snow: 0, temp: 0.1, food: 0, tough: 0, predators: 0, ...(opts.env || {}) };
    const foods = islands.food || lab.food;
    const water = { ...(SCENARIOS[islands.scenario || 'open']?.water || SCENARIOS.open.water), ...(islands.water || {}) };
    this.isl = {
      regions: REGION_NAMES.map((name, i) => ({ id: i, name, env: { ...base, food: foods[i], ...(islands.envs?.[i] || {}) }, cap: I.CAP_SHARE[i], fenceUntil: -1 })),
      water, pending: null, riverLevel: water.river, channelLevel: water.channel, midLevel: water.midFord,
      subRate: islands.subRate ?? null, pops: [], dist: {}, crosses: [], splitGen: null, apartGens: 0, splitAt: {}, queue: [],
      stats: { conceived: 0, born: 0, fertile: 0, stillborn: 0, sterileBorn: 0, sameConceived: 0, sameBorn: 0, sameFertile: 0 },
      reunion: null, regBirths: [0, 0, 0], regDeaths: [{}, {}, {}],
    };
    this.burrows.forEach((b) => { b.region = regionOf(b.x, b.z); });
    this.isl.pops = this._pops();
    this.summarizeEnv();
    // founders: three to a warren across all eight warrens
    const n = founders ? founders.length : startPop ?? lab.startPop;
    // Storm island starts with an empty islet (it is waiting for castaways)
    const homes = this.burrows.map((b, i) => i).filter((i) => !(islands.scenario === 'storm' && this.burrows[i].region === 2));
    for (let i = 0; i < n; i++) {
      const bi = homes[Math.floor(i / 3) % homes.length], b = this.burrows[bi];
      const g = founders ? { ...founders[i] } : drawGenotype(islands.freq || lab.freq, this.rng);
      const r = this.spawn(g, { age: 1 + (i % 2), x: b.x + this.mrng.range(-3, 3), z: b.z + this.mrng.range(-3, 3), parents: [0, 0], silent: true, home: bi });
      this._clampToRegion(r, b.region, b);
    }
    for (const r of this.rabbits) r.org = this.lineageBit(r.region);
    if (this.isl.pops.length > 1) this.isl.splitGen = 0;   // built already split
  }

  // ---------- regions, water, populations ----------
  _pops() { return populationsOf(this.isl.water).map((regions) => ({ regions, name: popName(regions), n: 0 })); }
  popOfRegion(reg) { return this.isl.pops.findIndex((p) => p.regions.includes(reg)); }
  linkOpen(a, b) {
    if (a === b) return true;
    const L = linksOpen(this.isl.water), k = [a, b].sort().join('');
    return k === '01' ? L.WE : k === '02' ? L.WI : L.IE;
  }
  // lineage tag of a population: the bit of its lowest land (1 West, 2 East, 4 Islet), so colours stay with the land
  lineageBit(reg) { return 1 << this.isl.pops[this.popOfRegion(reg)].regions[0]; }
  reachable(a, b) { return this.popOfRegion(a) === this.popOfRegion(b); }
  riverHalf() { return STREAM_W + (I.FLOOD_W - STREAM_W) * this.isl.riverLevel; }
  channelHalf() { return I.CHANNEL_W * this.isl.channelLevel; }
  dry(x, z, pad = 0) {
    if (Math.abs(x - streamX(z)) < this.riverHalf() + BANK + pad) return false;
    if (this.isl.channelLevel > 0.02 && inChannelSpan(z) && Math.abs(x - channelX(z)) < (this.channelHalf() + BANK) + pad) return false;
    return true;
  }
  summarizeEnv() {
    const R = this.isl.regions, out = {};
    for (const k of ['snow', 'temp', 'food', 'tough', 'predators']) out[k] = k === 'food' || k === 'predators' ? R.reduce((s, r) => s + r.env[k], 0) : R.reduce((s, r, i) => s + r.env[k] * REGION_WEIGHT[i], 0);
    Object.assign(this.env, out);
  }
  setEnv(partial) { if (!this.isl) return super.setEnv(partial); for (const r of this.isl.regions) this._applyEnv(r, partial); this.summarizeEnv(); this.syncPredators(); }
  setPredators(n) { if (!this.isl) return super.setPredators(n); this.setEnv({ predators: n }); }
  _applyEnv(reg, partial) { Object.assign(reg.env, partial); if ('predators' in partial) reg.env.predators = clamp(Math.round(reg.env.predators), 0, 6); }
  setRegionEnv(i, partial) { this._applyEnv(this.isl.regions[i], partial); this.summarizeEnv(); this.syncPredators(); }
  setPopulationEnv(pi, partial) { const p = this.isl.pops[pi]; if (!p) return; for (const i of p.regions) this._applyEnv(this.isl.regions[i], partial); this.summarizeEnv(); this.syncPredators(); }
  fenceRegion(i, gens = P.FENCE_GENS) { this.isl.regions[i].fenceUntil = this.gen + 1 + gens; }

  // Queue new water; it takes effect at the next generation boundary. Cosmetic levels ease toward it meanwhile.
  setWater(w) {
    const target = { ...(this.isl.pending || this.isl.water), ...w };
    this.isl.pending = target;
    for (const what of ['river', 'midFord', 'channel']) if (target[what] !== this.isl.water[what]) this.events.push({ type: 'islwarn', what, to: target[what], atGen: this.gen + 1 });
    return { ok: true };
  }
  setScenario(id) { return this.setWater(SCENARIOS[id].water); }

  // ---------- spawning and membership ----------
  spawn(genotype, o = {}) {
    const r = super.spawn(genotype, o);
    if (this.isl) { r.region = regionOf(r.x, r.z); r.sterile = false; r.c0 = 0; r.c1 = 0; r.org = 1 << r.region; r.carry = null; }
    return r;
  }
  _clampToRegion(r, reg, fallback) {
    if (regionOf(r.x, r.z) === reg && this.dry(r.x, r.z)) { r.region = reg; return; }
    r.x = fallback.x; r.z = fallback.z; r.region = reg;
  }
  nearestBurrow(x, z) {
    if (!this.isl) return super.nearestBurrow(x, z);
    const reg = regionOf(x, z); let best = 0, bd = Infinity;
    this.burrows.forEach((b, i) => { const d = dist2(x, z, b.x, b.z) + (b.region === reg ? 0 : 1e6); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  // ---------- generation boundary ----------
  beginGeneration(births = 0) {
    if (!this.isl) return super.beginGeneration(births);
    const S = this.isl;
    // 1. water commits
    if (S.pending) {
      const before = S.pops.length, oldPops = S.pops;
      S.water = S.pending; S.pending = null;
      S.pops = this._pops();
      if (S.pops.length > before) {
        S.splitGen = this.gen;
        for (const r of this.rabbits) if (r.alive) r.org = this.lineageBit(r.region);   // membership, not position: frame-rate independent
        this.events.push({ type: 'split', pops: S.pops.map((p) => ({ name: p.name, regions: p.regions })), gen: this.gen, t: this.t });
      } else if (S.pops.length < before) {
        const joined = oldPops.filter((op) => !S.pops.some((np) => np.regions.join() === op.regions.join())).map((p) => p.name);
        const D = this._distBetween(oldPops);
        const cold = (i) => S.regions[i].env.snow >= 0.6 && S.regions[i].env.temp <= -0.4;
        const kind = S.water.channel === 0 && oldPops.some((p) => p.regions.length === 1 && p.regions[0] === 2) ? 'sandbar' : cold(0) && cold(1) ? 'ice' : 'drought';
        S.reunion = { gen: this.gen, conceived: 0, born: 0, fertile: 0, sameConceived: 0, sameBorn: 0, sameFertile: 0, joined, D };
        this.events.push({ type: 'rejoin', pops: S.pops.map((p) => ({ name: p.name, regions: p.regions })), joined, D, kind, gen: this.gen, t: this.t });
      }
    }
    // 2. storm / carry orders
    const q = S.queue; S.queue = [];
    for (const job of q) job.kind === 'storm' ? this._doStorm(job) : this._doCarry(job);
    // 3. membership. A rabbit's land changes only here, by a seeded draw (migration inside its population), never from where
    //    it happens to be standing, so a run does not depend on frame rate. Movement on screen follows membership.
    for (const r of this.rabbits) {
      if (!r.alive || r.carry) continue;
      const pop = S.pops[this.popOfRegion(r.region)];
      if (pop.regions.length > 1 && this.crng.next() < MIGRATE) { const others = pop.regions.filter((g) => g !== r.region); r.region = others[this.crng.int(others.length)]; r.home = this._burrowIn(r.region); }
      const here = regionOf(r.x, r.z);
      if (!this.reachable(r.region, here)) {   // stranded across a closed crossing (picture only): put it back on its own land
        const b = this.burrows[this._burrowIn(r.region, r.home)];
        r.x = b.x + this.mrng.range(-2, 2); r.z = b.z + this.mrng.range(-2, 2); r.route = null; r.wet = false; r.state = 'idle';
      }
    }
    // 4. the hidden-difference clock (only while split)
    this._clock();
    S.apartGens = S.pops.length > 1 && S.splitGen != null ? this.gen - S.splitGen : 0;
    this._updateDist();
    super.beginGeneration(births);
    // 5. per-region record
    const rec = this.history.current;
    rec.reg = [0, 1, 2].map((i) => {
      const comp = composition(this.rabbits.filter((r) => r.alive && r.region === i));
      const e = S.regions[i].env;
      return { n: comp.n, comp, births: S.regBirths[i], deaths: Object.fromEntries(CAUSES.map((c) => [c, 0])), env: { ...e, predators: this.predators.filter((p) => p.region === i).length } };
    });
    S.regBirths = [0, 0, 0];
    rec.isl = { water: { ...S.water }, pops: S.pops.map((p) => p.regions.slice()), dist: { ...S.dist }, apart: S.apartGens,
      cross: { conceived: S.stats.conceived, born: S.stats.born, fertile: S.stats.fertile }, stillborn: S.stats.stillborn, sterileBorn: S.stats.sterileBorn };
    for (const p of S.pops) p.n = this.rabbits.reduce((n, r) => n + (r.alive && p.regions.includes(r.region) ? 1 : 0), 0);
  }

  _clock() {
    const S = this.isl;
    if (S.pops.length < 2) return;
    for (let pi = 0; pi < S.pops.length; pi++) {
      if (this.crng.next() >= (S.subRate ?? I.SUB_RATE)) continue;
      const live = this.rabbits.filter((r) => r.alive);
      const members = live.filter((r) => S.pops[pi].regions.includes(r.region));
      if (!members.length) continue;
      // loci that are the same in every living rabbit in the whole valley
      let all1 = FULL, all0 = FULL;
      for (const r of live) { all1 &= r.c0 & r.c1; all0 &= ~(r.c0 | r.c1); }
      const uniform = (all1 | all0) & FULL, list = [];
      for (let k = 0; k < I.K; k++) if (uniform & (1 << k)) list.push(k);
      if (!list.length) continue;
      const k = list[this.crng.int(list.length)], bit = 1 << k, toOne = (all0 & bit) !== 0;
      for (const r of members) { if (toOne) { r.c0 |= bit; r.c1 |= bit; } else { r.c0 &= ~bit; r.c1 &= ~bit; } }
    }
  }

  // allele-1 frequency per hidden locus for a list of regions
  _hiddenFreq(regions) {
    const f = new Float64Array(I.K); let n = 0;
    for (const r of this.rabbits) {
      if (!r.alive || !regions.includes(r.region)) continue; n++;
      for (let k = 0; k < I.K; k++) f[k] += ((r.c0 >> k) & 1) + ((r.c1 >> k) & 1);
    }
    if (n) for (let k = 0; k < I.K; k++) f[k] /= 2 * n;
    return { f, n };
  }
  _D(a, b) { const A = this._hiddenFreq(a), B = this._hiddenFreq(b); if (!A.n || !B.n) return null; let d = 0; for (let k = 0; k < I.K; k++) d += Math.abs(A.f[k] - B.f[k]); return d; }
  _distBetween(pops) { return pops.length >= 2 ? this._D(pops[0].regions, pops[1].regions) ?? 0 : 0; }
  _updateDist() {
    const S = this.isl; S.dist = {};
    // distances between the three lands, so the meter keeps meaning after a reunion too
    for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) { const d = this._D([a], [b]); if (d != null) S.dist[`${a}-${b}`] = d; }
  }
  distance(popA = 0, popB = 1) { const S = this.isl, A = S.pops[popA], B = S.pops[popB]; if (!A || !B) return 0; return this._D(A.regions, B.regions) ?? 0; }

  // ---------- hazards per region ----------
  syncPredators() {
    if (!this.isl) return super.syncPredators();
    const added = [], was = this.predators.length;
    for (const reg of this.isl.regions) {
      const fence = this.gen < reg.fenceUntil || this.gen < this.fenceUntil;
      const target = Math.max(0, Math.round(reg.env.predators * (fence ? (this.lin?.fence ?? 0.5) : 1)));
      const mine = this.predators.filter((p) => p.region === reg.id);
      for (let k = mine.length; k < target; k++) {
        const c = REGION_CENTRE[reg.id], a = Math.atan2(c.z, c.x) + this.mrng.range(-0.5, 0.5);
        const pr = { id: this.nextPredId++, region: reg.id, x: Math.cos(a) * 55, z: Math.sin(a) * 55, targetId: null, state: 'trot', tx: c.x, tz: c.z, wait: 1, pounceT: 0, lastAt: -9 };
        this.predators.push(pr); added.push({ id: pr.id, x: pr.x, z: pr.z, region: reg.id });
      }
      for (let k = mine.length; k > target; k--) { const p = mine[k - 1]; this.predators.splice(this.predators.indexOf(p), 1); }
    }
    if (added.length) this.events.push({ type: 'foxin', added, count: this.predators.length, first: was === 0 });
  }

  _context(reg, live) {
    const E = this.isl.regions[reg].env, snow = clamp(E.snow, 0, 1), tough = clamp(E.tough, 0, 1);
    const preds = this.predators.filter((p) => p.region === reg), n = live.length, nPred = preds.length;
    // food is shared across the population the region belongs to
    const pop = this.isl.pops[this.popOfRegion(reg)];
    const food = pop.regions.reduce((s, i) => s + this.isl.regions[i].env.food, 0);
    let sumA = 0;
    for (const r of this.rabbits) if (r.alive && pop.regions.includes(r.region)) sumA += r.pheno.longTeeth ? 1 : 1 - P.TOUGH_PENALTY * tough;
    return {
      live, n, nPred, preds, tough, temp: E.temp,
      pp: nPred > 0 && n > 0 ? P.PRED_MAX * (1 - Math.exp(-P.PRED_KILLS * nPred / n)) : 0,
      camoW: lerp(P.CAMO.whiteGrass, P.CAMO.whiteSnow, snow), camoB: lerp(P.CAMO.brownGrass, P.CAMO.brownSnow, snow),
      shelters: this.patches.filter((p) => p.type === 'shelter' && regionOf(p.x, p.z) === reg),
      clovers: this.cloverCrowd().filter((c) => c.n > 0 && regionOf(c.p.x, c.p.z) === reg),
      c: food / Math.max(sumA, 1e-6),
    };
  }

  // Two Lineages: patches can cover more ground (this.lin.cloverR / shelterR), so one patch can serve a whole bank.
  addPatch(type, x, z) {
    const p = super.addPatch(type, x, z);
    if (this.lin) { p.radius = type === 'clover' ? this.lin.cloverR : this.lin.shelterR; p.expiresGen = this.gen + 1 + (type === 'clover' ? this.lin.cloverGens : this.lin.shelterGens); }
    return p;
  }

  // Per-generation death chances. Only the Two Lineages challenge (this.lin) changes them: spells can hit harder, and the
  // ranger tools can be stronger. Without this.lin it is exactly the classic rule.
  hazardsFor(r, X) {
    const k = this.lin;
    if (!k) return super.hazardsFor(r, X);
    const ph = r.pheno;
    let pPred = X.pp * (ph.white ? X.camoW : X.camoB) * (ph.longEars ? P.EARS_PRED : 1);
    if (pPred > 0) for (const s of X.shelters) if (dist2(r.x, r.z, s.x, s.z) < s.radius * s.radius) { pPred *= 1 - k.shelter; break; }
    let pCold = 0, pHeat = 0;
    if (X.temp < 0) pCold = (ph.longEars ? P.COLD_LONG : P.COLD_SHORT) * -X.temp * k.coldX;
    else if (X.temp > 0) pHeat = (ph.longEars ? P.HEAT_LONG : P.HEAT_SHORT) * X.temp * k.heatX;
    // brush also gives shade and a windbreak
    if (pCold + pHeat > 0) for (const s of X.shelters) if (dist2(r.x, r.z, s.x, s.z) < s.radius * s.radius) { pCold *= 1 - k.shelter; pHeat *= 1 - k.shelter; break; }
    const a = ph.longTeeth ? 1 : 1 - P.TOUGH_PENALTY * X.tough;
    const D = ph.longTeeth ? 1 + P.TEETH_COST : 1;
    let intake = a * Math.min(1, X.c / D);
    for (const cl of X.clovers) if (dist2(r.x, r.z, cl.p.x, cl.p.z) < cl.p.radius * cl.p.radius) intake += Math.min(1, k.clover / cl.n) / D;
    const pStarve = clamp(P.STARVE_K * (1 - Math.min(1, intake)), 0, 0.95);
    return [Math.min(0.95, pPred), Math.min(0.95, pCold), Math.min(0.95, pHeat), pStarve];
  }

  scheduleHazards() {
    if (!this.isl) return super.scheduleHazards();
    this.dooms = []; this.doomIdx = 0; this.chaseIdx = 0;
    for (let reg = 0; reg < 3; reg++) {
      const live = this.rabbits.filter((r) => r.alive && r.region === reg);
      if (!live.length) continue;
      const X = this._context(reg, live), preds = [];
      for (const r of live) {
        const p = this.hazardsFor(r, X);
        const u = [this.rng.next(), this.rng.next(), this.rng.next(), this.rng.next()];
        const tt = [this.rng.next(), this.rng.next(), this.rng.next(), this.rng.next()];
        let best = null;
        for (let k = 0; k < 4; k++) {
          if (u[k] >= p[k]) continue;
          const at = k === 0 ? 2.6 + tt[k] * 6.4 : 0.8 + tt[k] * 8.4;
          if (!best || at < best.at) best = { r, cause: HAZ[k], at };
        }
        if (best) { if (best.cause === 'predator') preds.push(best); else this.dooms.push(best); }
      }
      if (preds.length && X.nPred) {
        preds.sort((a, b) => a.at - b.at);
        for (const d of preds) {
          let pr = X.preds[0]; for (const q of X.preds) if (q.lastAt < pr.lastAt) pr = q;
          if (d.at - pr.lastAt < 2.4) d.at = Math.min(pr.lastAt + 2.4, 9.7);
          pr.lastAt = d.at; d.predId = pr.id; d.chase = false;
          this.dooms.push(d);
        }
      }
    }
    for (const pr of this.predators) pr.lastAt = -9;
    this.dooms.sort((a, b) => a.at - b.at);
  }

  kill(r, cause) {
    const was = r.alive;
    super.kill(r, cause);
    if (!this.isl || !was || r.alive) return;
    const rec = this.history.current?.reg?.[r.region]; if (rec) rec.deaths[cause] = (rec.deaths[cause] || 0) + 1;
    if (this.ended || this.isl.pops.length < 2) return;
    const pi = this.popOfRegion(r.region), p = this.isl.pops[pi];
    if (p && !this.rabbits.some((q) => q.alive && p.regions.includes(q.region))) this.events.push({ type: 'popextinct', pop: pi, name: p.name, gen: this.gen, t: this.t });
  }

  // ---------- breeding per population, with the hidden genome ----------
  breed() {
    if (!this.isl) return super.breed();
    const S = this.isl; let births = 0;
    for (const pop of S.pops) {
      const members = this.rabbits.filter((r) => r.alive && pop.regions.includes(r.region));
      const adults = members.filter((r) => r.age >= 1 && !r.sterile);
      const ceiling = pop.regions.reduce((s, i) => s + I.CAP_SHARE[i], 0);
      let count = members.length;
      this.rng.shuffle(adults);
      const food = pop.regions.reduce((s, i) => s + S.regions[i].env.food, 0) + this.cloverCrowd().filter((c) => pop.regions.includes(regionOf(c.p.x, c.p.z))).reduce((s, c) => s + Math.min(this.lin?.clover ?? P.CLOVER_FOOD, c.n), 0);
      const q = clamp((food / Math.max(1, members.length) - 0.5) / 1, 0, 1);
      for (let i = 0; i + 1 < adults.length; i += 2) {
        const A = adults[i], B = adults[i + 1];
        const kits = this.lin ? this._linKits(food, members.length) : this.cfg.kitsFixed ?? Math.min(P.KITS_MAX, P.KITS_MIN + Math.floor((P.KITS_MAX - P.KITS_MIN) * q + this.rng.next()));
        const crossKit = (A.org & B.org) === 0;
        for (let k = 0; k < kits; k++) {
          if (count >= ceiling || this.liveN >= P.CAP) break;
          const { genotype, mutations } = cross(A.genotype, B.genotype, this.rng, this.cfg.mutationRate);
          const m1 = (this.crng.next() * FULL) >>> 0, m2 = (this.crng.next() * FULL) >>> 0;
          const c0 = ((A.c0 & m1) | (A.c1 & ~m1)) & FULL, c1 = ((B.c0 & m2) | (B.c1 & ~m2)) & FULL;
          const h = popcount(c0 ^ c1), dv = this.crng.next(), df = this.crng.next();
          const born = dv < viability(h), fertile = born && df < fertility(h);
          this._tallyKit(crossKit, born, fertile);
          if (!born) { S.stats.stillborn++; this.events.push({ type: 'stillborn', parents: [A.id, B.id], x: A.x, z: A.z, h }); continue; }
          const kit = this.spawn(genotype, { age: 0, x: A.x + this.mrng.range(-2, 2), z: A.z + this.mrng.range(-2, 2), parents: [A.id, B.id], home: A.home });
          this._clampToRegion(kit, A.region, A);
          kit.c0 = c0; kit.c1 = c1; kit.org = A.org | B.org; kit.sterile = !fertile;
          if (!fertile) S.stats.sterileBorn++;
          if (crossKit) this.events.push({ type: 'hybrid', id: kit.id, sterile: kit.sterile, h });
          S.regBirths[kit.region]++;
          count++; births++; this.mutTally.births++;
          for (const mu of mutations) { this.mutTally.total++; this.mutTally.by[mu.allele]++; this.events.push({ type: 'mutation', id: kit.id, gene: mu.gene, allele: mu.allele, from: mu.from, planted: false, x: kit.x, z: kit.z }); }
        }
      }
    }
    return births;
  }
  // Two Lineages: litter size follows the food each rabbit has, so a bank settles near what its land feeds instead of
  // overshooting and crashing. Fractional litters are rounded on the same stream as the classic rule.
  _linKits(food, n) {
    const k = this.lin, x = clamp(k.kit0 + k.kitSlope * (food / Math.max(1, n) - 1), 0, P.KITS_MAX);
    return Math.floor(x + this.rng.next());
  }
  _tallyKit(crossKit, born, fertile) {
    const S = this.isl.stats, R = this.isl.reunion;
    if (crossKit) { S.conceived++; if (born) S.born++; if (fertile) S.fertile++; if (R) { R.conceived++; if (born) R.born++; if (fertile) R.fertile++; } }
    else { S.sameConceived++; if (born) S.sameBorn++; if (fertile) S.sameFertile++; if (R) { R.sameConceived++; if (born) R.sameBorn++; if (fertile) R.sameFertile++; } }
  }
  reunionResult() { const R = this.isl.reunion; if (!R) return null; const phi = R.conceived ? R.fertile / R.conceived : null; return { ...R, phi, label: phi == null ? null : speciesLabel(phi) }; }

  // Test cross in a pen: read-only, on its own random stream.
  testCross(popA = 0, popB = 1, pairs = I.TEST_PAIRS, kits = I.TEST_KITS) {
    const S = this.isl, A = S.pops[popA], B = S.pops[popB];
    if (!A || !B) return { ok: false, reason: 'There is only one population.' };
    const fa = this.rabbits.filter((r) => r.alive && r.age >= 1 && !r.sterile && A.regions.includes(r.region));
    const fb = this.rabbits.filter((r) => r.alive && r.age >= 1 && !r.sterile && B.regions.includes(r.region));
    if (!fa.length || !fb.length) return { ok: false, reason: 'One side has no adult that can breed.' };
    const x = this.xrng; let conceived = 0, born = 0, fertile = 0, sumH = 0;
    for (let p = 0; p < pairs; p++) {
      const a = fa[x.int(fa.length)], b = fb[x.int(fb.length)];
      for (let k = 0; k < kits; k++) {
        const m1 = (x.next() * FULL) >>> 0, m2 = (x.next() * FULL) >>> 0;
        const h = popcount((((a.c0 & m1) | (a.c1 & ~m1)) ^ ((b.c0 & m2) | (b.c1 & ~m2))) & FULL);
        conceived++; sumH += h;
        if (x.next() < viability(h)) { born++; if (x.next() < fertility(h)) fertile++; }
      }
    }
    const phi = fertile / conceived;
    const res = { ok: true, gen: this.gen, apart: S.apartGens, popA: A.name, popB: B.name, D: this.distance(popA, popB), pairs, conceived, born, fertile, phi, meanH: sumH / conceived, label: speciesLabel(phi) };
    S.crosses.push(res);
    this.events.push({ type: 'testcross', ...res });
    return res;
  }

  // ---------- storm (founder effect) and carrying (gene flow) ----------
  storm(n = 4) {
    const S = this.isl, w = S.pending || S.water;
    if (populationsOf(w).some((p) => p.includes(0) && p.includes(2))) return { ok: false, reason: 'The islet is not cut off: flood the channel first (Storm island).' };
    const src = S.pops[this.popOfRegion(0)];
    const adults = this.rabbits.filter((r) => r.alive && r.age >= 1 && src.regions.includes(r.region));
    if (adults.length < n + 2) return { ok: false, reason: 'Not enough adults on the mainland.' };
    S.queue.push({ kind: 'storm', n });
    return { ok: true };
  }
  carry(fromPop, toPop, n = I.CARRY_COUNT) {
    const S = this.isl;
    if (S.pops.length < 2 || !S.pops[fromPop] || !S.pops[toPop] || fromPop === toPop) return { ok: false, reason: 'There is nothing to carry across: the lands are joined.' };
    S.queue.push({ kind: 'carry', from: S.pops[fromPop].regions.slice(), to: S.pops[toPop].regions.slice(), n });
    return { ok: true };
  }
  _pick(regions, n) {
    const adults = this.rabbits.filter((r) => r.alive && r.age >= 1 && regions.includes(r.region));
    this.rng.shuffle(adults);
    return adults.slice(0, n);
  }
  _moveTo(r, reg) {
    const homes = this.burrows.map((b, i) => [b, i]).filter(([b]) => b.region === reg);
    const [b, bi] = homes[this.mrng.int(homes.length)];
    const fx = r.x, fz = r.z;
    r.x = b.x + this.mrng.range(-2.5, 2.5); r.z = b.z + this.mrng.range(-2.5, 2.5);
    this._clampToRegion(r, reg, b);
    r.home = bi; r.route = null; r.state = 'idle'; r.wait = 3; r.wet = false;
    r.carry = { fromX: fx, fromZ: fz, toX: r.x, toZ: r.z, t: 0, dur: 3 };
  }
  _doStorm({ n }) {
    const S = this.isl, src = S.pops[this.popOfRegion(0)];
    const pick = this._pick(src.regions, n);
    if (!pick.length) return;
    const before = composition(this.rabbits.filter((r) => r.alive && src.regions.includes(r.region)));
    const founders = composition(pick);
    const f = (c) => ({ b: alleleFreq(c, 'b'), e: alleleFreq(c, 'e'), T: alleleFreq(c, 'T') });
    for (const r of pick) { this._moveTo(r, 2); r.org = this.lineageBit(2); }
    this.isl.lastStorm = { gen: this.gen, ids: pick.map((r) => r.id), founders: f(founders), source: f(before), n: pick.length };
    this.events.push({ type: 'storm', ids: pick.map((r) => r.id), fromPop: src.name, to: 'Islet', founders: f(founders), source: f(before), gen: this.gen });
  }
  _doCarry({ from, to, n }) {
    const S = this.isl;
    const toPop = S.pops.find((p) => p.regions.join() === to.join()), fromPop = S.pops.find((p) => p.regions.join() === from.join());
    if (!toPop || !fromPop) return;
    const ceiling = to.reduce((s, i) => s + I.CAP_SHARE[i], 0);
    const room = Math.max(0, ceiling - this.rabbits.filter((r) => r.alive && to.includes(r.region)).length);
    const pick = this._pick(from, Math.min(n, room));
    if (!pick.length) return;
    // heal: compressed-time gene flow (spec 4.7)
    const A = this._hiddenFreq(from), B = this._hiddenFreq(to), diff = [];
    for (let k = 0; k < I.K; k++) if ((A.f[k] === 0 || A.f[k] === 1) && (B.f[k] === 0 || B.f[k] === 1) && A.f[k] !== B.f[k]) diff.push(k);
    const heal = Math.min(diff.length, Math.round(pick.length * I.CARRY_HEAL));
    for (let j = 0; j < heal; j++) {
      const idx = this.crng.int(diff.length), k = diff.splice(idx, 1)[0], bit = 1 << k, one = A.f[k] === 1;
      for (const r of this.rabbits) if (r.alive && to.includes(r.region)) { if (one) { r.c0 |= bit; r.c1 |= bit; } else { r.c0 &= ~bit; r.c1 &= ~bit; } }
    }
    const dest = to[0] === 2 && to.length === 1 ? 2 : to.includes(1) && !to.includes(0) ? 1 : to[0];
    for (const r of pick) this._moveTo(r, dest);
    this.events.push({ type: 'carry', ids: pick.map((r) => r.id), from: fromPop.name, to: toPop.name, healed: heal, gen: this.gen });
  }

  // ---------- movement (cosmetic, mrng only) ----------
  step(dt) {
    if (this.isl) {
      const S = this.isl, w = S.pending || S.water, k = dt / I.WATER_RAMP;
      const ease = (cur, tgt) => (cur < tgt ? Math.min(tgt, cur + k) : Math.max(tgt, cur - k));
      S.riverLevel = ease(S.riverLevel, w.river); S.channelLevel = ease(S.channelLevel, w.channel); S.midLevel = ease(S.midLevel, w.midFord);
      for (const r of this.rabbits) if (r.carry) { r.carry.t += dt; if (r.carry.t >= r.carry.dur) r.carry = null; }
    }
    super.step(dt);
  }

  setGoal(r, tx, tz) {
    if (!this.isl) return super.setGoal(r, tx, tz);
    const a = regionOf(r.x, r.z), b = regionOf(tx, tz);
    if (a === b || (a !== 0 && b !== 0 && this.isl.water.channel === 0)) { r.route = null; r.tx = tx; r.tz = tz; return; }   // same land, or islet<->east over the dry gully
    if (!this.linkOpen(a, b) || (a !== 0 && b !== 0)) { const h = this.burrows[r.home]; r.route = null; r.tx = h.x; r.tz = h.z; return; }
    const s = a === 0 ? -1 : 1;
    let zf;
    if (a === 2 || b === 2) zf = FORDS[1];
    else { zf = FORDS[0]; let bd = Infinity; for (const f of [FORDS[0], FORDS[2]]) { const d = Math.abs(f - r.z) + Math.abs(f - tz); if (d < bd) { bd = d; zf = f; } } }
    const p = fordPoint(zf, s), q = fordPoint(zf, -s);
    r.tx = p.x; r.tz = p.z;
    r.route = [{ x: q.x, z: q.z, wet: true }, { x: tx, z: tz }];
  }

  move(h) {
    if (!this.isl) return super.move(h);
    const m = this.mrng, preds = this.predators;
    const clovers = this.patches.filter((p) => p.type === 'clover'), shelters = this.patches.filter((p) => p.type === 'shelter');
    let anyDead = false;
    for (const pr of preds) {
      if (pr.state === 'pounce') { pr.pounceT -= h; if (pr.pounceT <= 0) { pr.state = 'idle'; pr.wait = 1; } continue; }
      if (pr.state === 'chase') {
        const t = this.registry.get(pr.targetId);
        if (!t || !t.alive) { pr.state = 'idle'; pr.targetId = null; continue; }
        const dx = t.x - pr.x, dz = t.z - pr.z, d = Math.hypot(dx, dz) || 1e-6;
        const sp = Math.min(P.PRED_MAX_SPEED, Math.max(P.PRED_SPEED, d / Math.max(0.1, pr.catchAt - this.genT)));
        const mv = Math.min(d, sp * h); pr.x += (dx / d) * mv; pr.z += (dz / d) * mv;
        continue;
      }
      if (pr.state === 'trot') {
        const dx = pr.tx - pr.x, dz = pr.tz - pr.z, d = Math.hypot(dx, dz);
        if (d < 0.8) { pr.state = 'idle'; pr.wait = m.range(1, 4); } else { const mv = Math.min(d, 2.6 * h); pr.x += (dx / d) * mv; pr.z += (dz / d) * mv; }
      } else {
        pr.wait -= h;
        if (pr.wait <= 0) {
          const c = REGION_CENTRE[pr.region]; let tx = c.x, tz = c.z;
          for (let k = 0; k < 8; k++) { const a = m.range(0, Math.PI * 2), rr = m.range(3, pr.region === 2 ? 9 : 24); const x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr; if (regionOf(x, z) === pr.region && this.dry(x, z)) { tx = x; tz = z; break; } }
          pr.tx = tx; pr.tz = tz; pr.state = 'trot';
        }
      }
    }
    for (const r of this.rabbits) {
      if (r.state === 'dying') { r.dyingT -= h; if (r.dyingT <= 0) anyDead = true; continue; }
      if (r.carry) continue;
      let danger = null, best = Infinity;
      const fr = r.pheno.longEars ? P.FLEE_R_LONG : P.FLEE_R_SHORT;
      for (const pr of preds) { const d2 = dist2(r.x, r.z, pr.x, pr.z); if (d2 < fr * fr && d2 < best) { best = d2; danger = pr; } }
      if (danger) {
        r.state = 'flee';
        let dx = r.x - danger.x, dz = r.z - danger.z;
        let tx = 0, tz = 0, ts = Infinity;
        for (const s of shelters) { const d2 = dist2(r.x, r.z, s.x, s.z); if (d2 < 900 && d2 < ts && regionOf(s.x, s.z) === r.region) { ts = d2; tx = s.x; tz = s.z; } }
        if (ts < Infinity && ts > 4) { dx = dx * 0.5 + (tx - r.x) * 0.1; dz = dz * 0.5 + (tz - r.z) * 0.1; }
        const d = Math.hypot(dx, dz) || 1;
        r.route = null; r.hurry = false;
        this.nudge(r, (dx / d) * P.FLEE_SPEED * h, (dz / d) * P.FLEE_SPEED * h, h);
        continue;
      }
      if (r.state === 'flee') { r.state = 'idle'; r.wait = 0.4; }
      if (r.state === 'hop') {
        const dx = r.tx - r.x, dz = r.tz - r.z, d = Math.hypot(dx, dz);
        if (d < 0.5) {
          const nx = r.route && r.route.shift();
          r.wet = false;
          if (nx) {
            // a crossing that closed while the rabbit was on its way: turn back
            if (nx.wet && !this.linkOpen(regionOf(r.x, r.z), regionOf(r.route[0]?.x ?? nx.x, r.route[0]?.z ?? nx.z))) { r.route = null; r.state = 'idle'; r.wait = 0.5; }
            else { r.tx = nx.x; r.tz = nx.z; if (nx.wet) r.wet = true; if (!r.route.length) r.route = null; }
          } else { r.state = 'idle'; r.hurry = false; r.wait = m.range(0.8, 3.5); }
        } else { const mv = Math.min(d, (r.hurry || r.wet ? P.ARRIVE_SPEED : P.HOP_SPEED) * h); this.nudge(r, (dx / d) * mv, (dz / d) * mv, h); }
      } else {
        r.wait -= h;
        if (r.wait <= 0) {
          r.wet = false;
          if (!this.dry(r.x, r.z)) {   // the water rose under it, or it was scared onto a ford: hop to the nearer shore of its own land
            const sx = streamX(r.z), lim = this.riverHalf() + BANK + 1;
            r.tx = Math.abs(r.x - sx) < lim ? sx + (r.x < sx ? -lim : lim) : r.x; r.tz = r.z;
            if (inChannelSpan(r.z) && Math.abs(r.x - channelX(r.z)) < this.channelHalf() + BANK + 1) r.tx = channelX(r.z) + (r.x < channelX(r.z) ? -1 : 1) * (this.channelHalf() + BANK + 1);
            r.route = null; r.wet = true;
          } else {
            const home = this._homeFor(r);
            const b = this.burrows[home]; r.home = home;
            let c = null;
            if (clovers.length && m.next() < 0.6) { c = clovers[m.int(clovers.length)]; if (regionOf(c.x, c.z) !== r.region) c = null; }
            if (c) {
              const a = m.range(0, Math.PI * 2), rr = Math.sqrt(m.next()) * c.radius * 0.8;
              const cx = c.x + Math.cos(a) * rr, cz = c.z + Math.sin(a) * rr;
              if (this.dry(cx, cz, 0.6) && regionOf(cx, cz) === r.region) this.setGoal(r, cx, cz); else this.setGoal(r, c.x, c.z);
            } else {
              const R = I.WANDER_R[b.region];
              let bx = b.x, bz = b.z, bestC = Infinity;
              for (let k = 0; k < 6; k++) {
                const a = m.range(0, Math.PI * 2), rr = Math.sqrt(m.next()) * R;
                const cx = clamp(b.x + Math.cos(a) * rr, -P.ROAM, P.ROAM), cz = clamp(b.z + Math.sin(a) * rr, -P.ROAM, P.ROAM);
                if (!this.dry(cx, cz, 1.5) || regionOf(cx, cz) !== b.region) continue;
                const cost = m.next();
                if (cost < bestC) { bestC = cost; bx = cx; bz = cz; }
              }
              this.setGoal(r, bx, bz);
            }
          }
          r.state = 'hop';
        }
      }
    }
    if (anyDead) this.prune();
  }

  // Mostly stay on the home warren; now and then move to another warren the rabbit can reach.
  _homeFor(r) {
    const here = this.burrows[r.home];
    if (here && here.region === r.region && this.mrng.next() > 0.15) return r.home;
    return this._burrowIn(r.region, null, this.mrng);
  }
  // a warren on land `reg` (keeps `prefer` if it is on that land; otherwise a random one, or the first)
  _burrowIn(reg, prefer = null, rng = null) {
    if (prefer != null && this.burrows[prefer]?.region === reg) return prefer;
    const opts = []; this.burrows.forEach((b, i) => { if (b.region === reg) opts.push(i); });
    return rng ? opts[rng.int(opts.length)] : opts[0];
  }

  nudge(r, dx, dz, h = 0.25) {
    if (!this.isl) return super.nudge(r, dx, dz);
    const ox = r.x;
    r.x += dx; r.z += dz;
    const d = Math.hypot(r.x, r.z);
    if (d > P.ROAM) { r.x *= P.ROAM / d; r.z *= P.ROAM / d; }
    if (r.wet && r.state !== 'flee') return;            // on a ford crossing (or wading out)
    // river: a rabbit never steps into the water; if the water rose under it, it is pushed out at about half a metre a second
    const push = (centre, lim, side) => {
      if (Math.abs(r.x - centre) >= lim) return;
      const target = centre + side * lim;
      if (Math.abs(ox - centre) >= lim - 0.05) { r.x = target; return; }      // walked into it: stop at the edge
      const stepOut = 0.6 * h + Math.abs(dx);                                   // the water rose under it: wade out
      r.x = side < 0 ? Math.max(target, r.x - stepOut) : Math.min(target, r.x + stepOut);
    };
    push(streamX(r.z), this.riverHalf() + BANK, ox < streamX(r.z) ? -1 : 1);
    if (this.isl.channelLevel > 0.02 && inChannelSpan(r.z)) push(channelX(r.z), this.channelHalf() + BANK, ox < channelX(r.z) ? -1 : 1);
  }
}

// ---------- factories and headless trials ----------
export function createIslandsLab(opts = {}) {
  return new IslandSim({ mode: 'islands', seedCode: opts.seedCode, islands: { scenario: opts.scenario || 'open', envs: opts.envs, food: opts.food, freq: opts.freq }, founders: opts.founders, startPop: opts.startPop, mutationRate: opts.mutationRate });
}

const freqs = (sim, regions) => { const c = composition(sim.rabbits.filter((r) => r.alive && regions.includes(r.region))); return { n: c.n, b: alleleFreq(c, 'b'), e: alleleFreq(c, 'e'), T: alleleFreq(c, 'T') }; };

// Storm a few rabbits onto the islet (same climate as the mainland) and see where its alleles end up.
export function founderTrial({ seedCode, founders = 4, gens = I.TRIAL_GENS } = {}) {
  const sim = createIslandsLab({ seedCode, scenario: 'storm' });
  sim.advance(3 * P.GEN_LEN);
  const start = freqs(sim, [0, 1]);
  const res = sim.storm(founders);
  if (!res.ok) return null;
  sim.advance(P.GEN_LEN);
  const st = sim.isl.lastStorm;
  sim.advance((gens - 1) * P.GEN_LEN);
  const islet = freqs(sim, [2]), main = freqs(sim, [0, 1]);
  return { seed: seedCode, founders, gens, start, founderFreq: st?.founders, islet, mainland: main, lost: ['b', 'e', 'T'].filter((a) => islet.n && (islet[a] === 0 || islet[a] === 1)).length };
}

// River flood, both banks Meadow; returns D and a test cross at each checkpoint.
export function divergenceTrial({ seedCode, gens = [10, 30, 50], carryEvery = 0 } = {}) {
  const sim = createIslandsLab({ seedCode, scenario: 'flood' });
  const out = []; const maxG = Math.max(...gens);
  for (let g = 1; g <= maxG + 1 && !sim.ended; g++) {
    if (carryEvery && g % carryEvery === 0) sim.carry(g % (2 * carryEvery) === 0 ? 0 : 1, g % (2 * carryEvery) === 0 ? 1 : 0, 4);
    sim.advance(P.GEN_LEN);
    if (gens.includes(sim.isl.apartGens)) out.push({ apart: sim.isl.apartGens, D: sim.distance(0, 1), cross: sim.testCross(0, 1) });
  }
  return { sim, out };
}
