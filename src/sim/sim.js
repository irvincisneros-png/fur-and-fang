// Fur & Fang simulation core. Pure logic: no DOM, no three.
import { P } from './params.js';
import { RNG, seedFromCode, codeFromSeed, randomSeedCode } from './rng.js';
import { GENES, GENE_INFO, FOUNDER, DOM_SURVIVE, DOM_EXPLORE, phenotype, cross, normalize } from './genetics.js';
import { History, composition } from './history.js';
import { streamX, WATER_LIM, BURROWS, FORDS, ARRIVE_FROM, sideOf, inWater, fordPoint } from './valley.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const WET_PAD = 1.5;                  // hop targets keep this much further back from the water than the hard limit
const CELL = 6;
const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);

export class Simulation {
  constructor(opts = {}) {
    this.mode = opts.mode || 'explore';
    const survive = this.mode === 'survive';
    this.seedCode = opts.seedCode || randomSeedCode();
    this.seed = seedFromCode(this.seedCode);
    this.rng = new RNG(this.seed);                 // genetics + hazards: fixed order, independent of frame rate
    this.mrng = new RNG((this.seed ^ 0xA5A5A5A5) >>> 0); // cosmetic movement
    this.cfg = {
      mutationRate: opts.mutationRate ?? (survive ? P.MUT_SURVIVE : P.MUT_EXPLORE),
      dominance: { ...(opts.dominance || (survive ? DOM_SURVIVE : DOM_EXPLORE)) },
      kitsFixed: opts.kitsFixed ?? (survive ? null : P.KITS_EXPLORE),
    };
    this.env = { snow: 0, temp: survive ? 0.35 : 0, food: survive ? P.FOOD_BASE : 100, tough: 0, predators: 0, ...(opts.env || {}) };
    this.t = 0; this.gen = 0; this.genT = 0; this.nextId = 1; this.nextPredId = 1; this.nextPatchId = 1;
    this.rabbits = []; this.predators = []; this.patches = []; this.events = [];
    this.registry = new Map();
    this.hooks = {}; this.history = new History();
    this.fenceUntil = -1; this.pendingMutations = new Set();
    this.dooms = []; this.doomIdx = 0; this.chaseIdx = 0;
    this.liveN = 0; this.ended = false; this.extinct = false; this.extinctAt = null; this.lastBirths = 0;

    this.burrows = BURROWS.map((b) => ({ ...b }));   // fixed warrens on both banks (the renderer draws mounds at the same spots)
    this.density = new Map(); this.densityT = -9; this.eastShare = 0.5;

    const founders = opts.founders;
    const n = founders ? founders.length : opts.startPop ?? (survive ? P.SURVIVE_START_POP : P.EXPLORE_START_POP);
    for (let i = 0; i < n; i++) {
      const bi = Math.floor(i / 3) % 4, b = this.burrows[bi];   // threes: a pair starts together, twelve cover two warrens on each bank
      this.spawn(founders ? { ...founders[i] } : { ...FOUNDER }, { age: survive ? 1 + (i % 2) : 1, x: b.x + this.mrng.range(-4, 4), z: b.z + this.mrng.range(-4, 4), parents: [0, 0], silent: true, home: bi });
    }
    opts.setup?.(this);
    this.beginGeneration();
  }

  // ---------- public helpers ----------
  get pop() { return this.liveN; }
  alive() { return this.rabbits.filter((r) => r.alive); }
  getRabbit(id) { return this.registry.get(id) || null; }
  drainEvents() { const e = this.events; this.events = []; return e; }
  composition() { return composition(this.rabbits); }
  get dominance() { return this.cfg.dominance; }

  setEnv(partial) { Object.assign(this.env, partial); this.syncPredators(); }
  setPredators(n) { this.env.predators = clamp(Math.round(n), 0, 12); this.syncPredators(); }
  setMutationRate(r) { this.cfg.mutationRate = clamp(r, 0, 0.2); }
  setDominance(gene, allele) {
    this.cfg.dominance[gene] = allele;
    for (const r of this.rabbits) r.pheno = phenotype(r.genotype, this.cfg.dominance);
  }
  plantMutation(gene) { this.pendingMutations.add(gene); }

  foodSupply() {
    let f = this.env.food;
    for (const p of this.patches) if (p.type === 'clover') f += P.CLOVER_FOOD;
    return f;
  }

  addPatch(type, x, z) {
    const radius = type === 'clover' ? P.CLOVER_RADIUS : P.SHELTER_RADIUS;
    const gens = type === 'clover' ? P.CLOVER_GENS : P.SHELTER_GENS;
    const p = { id: this.nextPatchId++, type, x: clamp(x, -P.ROAM, P.ROAM), z: clamp(z, -P.ROAM, P.ROAM), radius, expiresGen: this.gen + 1 + gens };
    this.patches.push(p);
    this.events.push({ type: 'patch', patch: p });
    return p;
  }

  // ---------- creation ----------
  spawn(genotype, { age = 0, x, z, parents = [0, 0], silent = false, arrived = false, home = null } = {}) {
    const rnd = this.mrng.int(this.burrows.length);
    let px = clamp(x ?? this.burrows[home ?? rnd].x, -P.ROAM, P.ROAM); const pz = clamp(z ?? this.burrows[home ?? rnd].z, -P.ROAM, P.ROAM);
    const sx = streamX(pz), off = px - sx; if (Math.abs(off) < WATER_LIM) px = sx + (off < 0 ? -WATER_LIM : WATER_LIM);   // never born in the water
    if (home == null) home = this.nearestBurrow(px, pz);
    const r = {
      id: this.nextId++, genotype, pheno: phenotype(genotype, this.cfg.dominance), age, alive: true, x: px, z: pz,
      state: 'idle', dyingCause: null, dyingT: 0, parents, born: this.gen, home, tx: 0, tz: 0, wait: this.mrng.range(0, 2), diedGen: null,
      route: null, wet: false, hurry: false,
    };
    this.rabbits.push(r); this.registry.set(r.id, r); this.liveN++;
    if (!silent) this.events.push({ type: 'birth', id: r.id, x: r.x, z: r.z, parents, kit: age === 0, arrived });
    return r;
  }

  nearestBurrow(x, z, side = sideOf(x, z)) {
    let best = 0, bd = Infinity;
    this.burrows.forEach((b, i) => { const d = dist2(x, z, b.x, b.z) + (b.side === side ? 0 : 1e6); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  // Gene flow: adults walk in from the valley rim (so the player sees them come) and settle at the nearest warren on that bank.
  addAdults(genotypes, source = '') {
    const out = [];
    const from = ARRIVE_FROM[source], a = (from ? from.angle : this.mrng.range(0, Math.PI * 2)) + this.mrng.range(-0.18, 0.18);
    const ex = Math.cos(a) * (P.ROAM - 1), ez = Math.sin(a) * (P.ROAM - 1);
    const home = this.nearestBurrow(ex * 0.6, ez * 0.6, sideOf(ex, ez)), b = this.burrows[home];
    genotypes.forEach((g, i) => {
      const r = this.spawn(g, { age: 1, x: ex + this.mrng.range(-1.5, 1.5), z: ez + this.mrng.range(-1.5, 1.5), arrived: true, home });
      this.setGoal(r, b.x + this.mrng.range(-3, 3), b.z + this.mrng.range(-3, 3)); r.hurry = true; r.wait = 0.3 + i * 0.5;
      out.push(r);
    });
    this.events.push({ type: 'arrive', ids: out.map((r) => r.id), source, x: ex, z: ez, toX: b.x, toZ: b.z, edge: from ? from.edge : '' });
    return out;
  }

  // Set a hop target. If it is across the stream, route over the nearest stepping-stone ford.
  setGoal(r, tx, tz) {
    const s = sideOf(r.x, r.z);
    if (sideOf(tx, tz) === s) { r.route = null; r.tx = tx; r.tz = tz; return; }
    let zf = FORDS[0], bd = Infinity;
    for (const f of FORDS) { const d = Math.abs(f - r.z) + Math.abs(f - tz); if (d < bd) { bd = d; zf = f; } }
    const a = fordPoint(zf, s), b = fordPoint(zf, -s);
    r.tx = a.x; r.tz = a.z;
    r.route = [{ x: b.x, z: b.z, wet: true }, { x: tx, z: tz }];
  }

  syncPredators() {
    const target = Math.max(0, Math.round(this.env.predators * (this.gen < this.fenceUntil ? 0.5 : 1)));
    const was = this.predators.length, added = [];
    while (this.predators.length < target) {
      const a = this.mrng.range(0, Math.PI * 2);
      const pr = { id: this.nextPredId++, x: Math.cos(a) * 55, z: Math.sin(a) * 55, targetId: null, state: 'trot', tx: Math.cos(a) * 30, tz: Math.sin(a) * 30, wait: 1, pounceT: 0, lastAt: -9 };
      this.predators.push(pr); added.push({ id: pr.id, x: pr.x, z: pr.z });
    }
    if (added.length) this.events.push({ type: 'foxin', added, count: this.predators.length, first: was === 0 });   // foxes trot in from the rim
    while (this.predators.length > target) this.predators.pop();
  }

  // ---------- generation cycle ----------
  beginGeneration(births = 0) {
    this.genT = 0;
    this.syncPredators();
    this.history.begin(this, births);
    this.hooks.onGenStart?.(this);
    this.syncPredators();
    this.scheduleHazards();
    this.events.push({ type: 'gen', gen: this.gen, t: this.t });
  }

  scheduleHazards() {
    this.dooms = []; this.doomIdx = 0; this.chaseIdx = 0;
    const live = this.rabbits.filter((r) => r.alive);
    const n = live.length; if (!n) return;
    const E = this.env, snow = clamp(E.snow, 0, 1), tough = clamp(E.tough, 0, 1);
    const nPred = this.predators.length;
    const pp = nPred > 0 ? P.PRED_MAX * (1 - Math.exp(-P.PRED_KILLS * nPred / n)) : 0;
    const camoW = lerp(P.CAMO.whiteGrass, P.CAMO.whiteSnow, snow), camoB = lerp(P.CAMO.brownGrass, P.CAMO.brownSnow, snow);
    const shelters = this.patches.filter((p) => p.type === 'shelter');

    let sumA = 0;
    for (const r of live) sumA += r.pheno.longTeeth ? 1 : 1 - P.TOUGH_PENALTY * tough;
    const c = this.foodSupply() / Math.max(sumA, 1e-6); // food per unit of chewable demand

    const preds = [];
    for (const r of live) {
      const ph = r.pheno;
      let pPred = pp * (ph.white ? camoW : camoB) * (ph.longEars ? P.EARS_PRED : 1);
      if (pPred > 0) for (const s of shelters) if (dist2(r.x, r.z, s.x, s.z) < s.radius * s.radius) { pPred *= 1 - P.SHELTER_REDUCTION; break; }
      let pCold = 0, pHeat = 0;
      if (E.temp < 0) pCold = (ph.longEars ? P.COLD_LONG : P.COLD_SHORT) * -E.temp;
      else if (E.temp > 0) pHeat = (ph.longEars ? P.HEAT_LONG : P.HEAT_SHORT) * E.temp;
      const a = ph.longTeeth ? 1 : 1 - P.TOUGH_PENALTY * tough;
      const D = ph.longTeeth ? 1 + P.TEETH_COST : 1;
      const sat = a * Math.min(1, c / D);
      const pStarve = clamp(P.STARVE_K * (1 - sat), 0, 0.95);

      const u = [this.rng.next(), this.rng.next(), this.rng.next(), this.rng.next()];
      const tt = [this.rng.next(), this.rng.next(), this.rng.next(), this.rng.next()];
      const p = [pPred, pCold, pHeat, pStarve], cause = ['predator', 'cold', 'heat', 'starved'];
      let best = null;
      for (let k = 0; k < 4; k++) {
        if (u[k] >= p[k]) continue;
        const at = k === 0 ? 2.6 + tt[k] * 6.4 : 0.8 + tt[k] * 8.4;
        if (!best || at < best.at) best = { r, cause: cause[k], at };
      }
      if (best) { if (best.cause === 'predator') preds.push(best); else this.dooms.push(best); }
    }
    if (preds.length && nPred) {
      preds.sort((a, b) => a.at - b.at);
      for (const d of preds) {
        let pi = 0; for (let i = 1; i < nPred; i++) if (this.predators[i].lastAt < this.predators[pi].lastAt) pi = i;
        const pr = this.predators[pi];
        if (d.at - pr.lastAt < 2.4) d.at = Math.min(pr.lastAt + 2.4, 9.7);
        pr.lastAt = d.at; d.predId = pr.id; d.chase = false;
        this.dooms.push(d);
      }
    }
    for (const pr of this.predators) pr.lastAt = -9;
    this.dooms.sort((a, b) => a.at - b.at);
  }

  step(dt) {
    let rem = dt;
    while (rem > 1e-9 && !this.ended) {
      const h = Math.min(rem, P.MAX_SUBSTEP, P.GEN_LEN - this.genT);
      rem -= h; this.t += h; this.genT += h;
      this.hooks.envDriver?.(this);
      this.runDooms();
      this.move(h);
      if (this.genT >= P.GEN_LEN - 1e-9) this.endGeneration();
    }
    if (this.ended) this.prune();
  }

  advance(seconds, dt = P.MAX_SUBSTEP) { for (let s = 0; s < seconds && !this.ended; s += dt) this.step(Math.min(dt, seconds - s)); }

  runDooms() {
    // chases start a couple of seconds before the catch so the predator can be seen coming
    while (this.chaseIdx < this.dooms.length) {
      const d = this.dooms[this.chaseIdx];
      if (d.at - P.CHASE_LEAD > this.genT) break;
      this.chaseIdx++;
      if (d.cause !== 'predator' || !d.r.alive) continue;
      const pr = this.predators.find((p) => p.id === d.predId); if (!pr) continue;
      let dx = pr.x - d.r.x, dz = pr.z - d.r.z, dd = Math.hypot(dx, dz);
      if (dd > 18) { if (dd < 1e-6) { dx = 1; dz = 0; dd = 1; } pr.x = d.r.x + (dx / dd) * 18; pr.z = d.r.z + (dz / dd) * 18; }
      pr.targetId = d.r.id; pr.state = 'chase'; pr.catchAt = d.at;
    }
    while (this.doomIdx < this.dooms.length && this.dooms[this.doomIdx].at <= this.genT + 1e-9) this.resolve(this.dooms[this.doomIdx++]);
  }

  resolve(d) {
    const r = d.r; if (!r.alive) return;
    if (d.cause === 'predator') {
      const pr = this.predators.find((p) => p.id === d.predId) || this.predators[0];
      if (!pr) return; // predators were removed: the rabbit gets away
      pr.x = r.x + 0.6; pr.z = r.z; pr.targetId = null; pr.state = 'pounce'; pr.pounceT = 0.7;
      this.events.push({ type: 'catch', predatorId: pr.id, id: r.id, x: r.x, z: r.z });
    }
    this.kill(r, d.cause);
  }

  kill(r, cause) {
    if (!r.alive) return;
    r.alive = false; r.state = 'dying'; r.dyingCause = cause; r.diedGen = this.gen; r.diedT = this.t;
    r.dyingT = cause === 'predator' ? 0.6 : cause === 'bottleneck' ? 0.8 : 2.2;
    this.liveN--; this.removedPending = true;
    this.history.death(r, cause);
    this.events.push({ type: 'death', id: r.id, cause, x: r.x, z: r.z, gen: this.gen });
    if (this.liveN <= 0 && !this.extinct) {
      this.extinct = true; this.extinctAt = this.t; this.ended = true;
      this.events.push({ type: 'extinct', t: this.t, gen: this.gen });
    }
  }

  endGeneration() {
    while (this.doomIdx < this.dooms.length) this.resolve(this.dooms[this.doomIdx++]); // anything left
    if (this.ended) return;
    for (const r of this.rabbits) { if (r.alive) { r.age++; if (r.age >= P.MAX_AGE) this.kill(r, 'old'); } }
    if (this.ended) return;
    this.history.finishGen(this.liveN);
    const births = this.breed();
    this.gen++;
    this.patches = this.patches.filter((p) => p.expiresGen > this.gen);
    this.pruneRegistry();
    this.beginGeneration(births);
  }

  breed() {
    const adults = this.rabbits.filter((r) => r.alive && r.age >= 1);
    this.rng.shuffle(adults);
    const survive = this.mode === 'survive';
    const perHead = this.foodSupply() / Math.max(1, this.liveN);
    const q = clamp((perHead - 0.5) / 1, 0, 1);
    let births = 0;
    for (let i = 0; i + 1 < adults.length; i += 2) {
      const A = adults[i], B = adults[i + 1];
      const kits = this.cfg.kitsFixed ?? Math.min(P.KITS_MAX, P.KITS_MIN + Math.floor((P.KITS_MAX - P.KITS_MIN) * q + this.rng.next()));
      for (let k = 0; k < kits; k++) {
        if (this.liveN >= P.CAP) return births;
        const { genotype, mutations } = cross(A.genotype, B.genotype, this.rng, this.cfg.mutationRate);
        const planted = [];
        if (this.pendingMutations.size) {
          for (const gene of this.pendingMutations) {
            const m = GENE_INFO[gene].mutant, idx = this.rng.int(2), s = genotype[gene];
            const arr = [s[0], s[1]]; arr[idx] = m; genotype[gene] = normalize(arr[0], arr[1]);
            planted.push({ gene, allele: m, from: GENE_INFO[gene].normal });
          }
          this.pendingMutations.clear();
        }
        const kit = this.spawn(genotype, { age: 0, x: A.x + this.mrng.range(-2, 2), z: A.z + this.mrng.range(-2, 2), parents: [A.id, B.id] });
        births++;
        for (const m of mutations) this.events.push({ type: 'mutation', id: kit.id, gene: m.gene, allele: m.allele, from: m.from, planted: false, x: kit.x, z: kit.z });
        for (const m of planted) this.events.push({ type: 'mutation', id: kit.id, gene: m.gene, allele: m.allele, from: m.from, planted: true, x: kit.x, z: kit.z });
      }
    }
    return births;
  }

  // Randomly remove ~90 % (genetic drift demo). Keeps at least 2.
  bottleneck(frac = 0.9) {
    const live = this.alive(); this.rng.shuffle(live);
    const keep = Math.max(2, Math.ceil(live.length * (1 - frac)));
    for (let i = keep; i < live.length; i++) this.kill(live[i], 'bottleneck');
    this.events.push({ type: 'bottleneck', removed: Math.max(0, live.length - keep) });
  }

  pruneRegistry() {
    if (this.registry.size < 3000) return;
    for (const [id, r] of this.registry) if (!r.alive && r.diedGen !== null && r.diedGen < this.gen - 20) this.registry.delete(id);
  }

  // Pedigree: {rabbit, parents:[tree|null, tree|null]} to `depth` generations back.
  lineage(id, depth = 2) {
    const r = this.registry.get(id); if (!r) return null;
    const node = { rabbit: r, parents: [null, null] };
    if (depth > 0 && r.parents[0]) node.parents = r.parents.map((pid) => this.lineage(pid, depth - 1));
    return node;
  }

  // ---------- movement (cosmetic) ----------
  prune() {
    if (!this.removedPending) return;
    let any = false;
    for (const r of this.rabbits) if (r.state === 'dying' && r.dyingT <= 0) { any = true; break; }
    if (any) this.rabbits = this.rabbits.filter((r) => !(r.state === 'dying' && r.dyingT <= 0));
  }

  move(h) {
    const m = this.mrng, preds = this.predators;
    const clovers = this.patches.filter((p) => p.type === 'clover'), shelters = this.patches.filter((p) => p.type === 'shelter');
    let anyDead = false;
    if (this.t - this.densityT > 1) {
      this.densityT = this.t; this.density.clear();
      let east = 0, all = 0;
      for (const q of this.rabbits) if (q.alive) { const k = Math.floor(q.x / CELL) * 1000 + Math.floor(q.z / CELL); this.density.set(k, (this.density.get(k) || 0) + 1); all++; if (sideOf(q.x, q.z) > 0) east++; }
      this.eastShare = all ? east / all : 0.5;
    }
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
        if (pr.wait <= 0) { const a = m.range(0, Math.PI * 2), r = m.range(10, 45); pr.tx = Math.cos(a) * r; pr.tz = Math.sin(a) * r; pr.state = 'trot'; }
      }
    }
    for (const r of this.rabbits) {
      if (r.state === 'dying') { r.dyingT -= h; if (r.dyingT <= 0) anyDead = true; continue; }
      // danger
      let danger = null, best = Infinity;
      const fr = r.pheno.longEars ? P.FLEE_R_LONG : P.FLEE_R_SHORT;
      for (const pr of preds) { const d2 = dist2(r.x, r.z, pr.x, pr.z); if (d2 < fr * fr && d2 < best) { best = d2; danger = pr; } }
      if (danger) {
        r.state = 'flee';
        let dx = r.x - danger.x, dz = r.z - danger.z;
        let tx = 0, tz = 0, ts = Infinity;
        for (const s of shelters) { const d2 = dist2(r.x, r.z, s.x, s.z); if (d2 < 900 && d2 < ts) { ts = d2; tx = s.x; tz = s.z; } }
        if (ts < Infinity && ts > 4) { dx = dx * 0.5 + (tx - r.x) * 0.1; dz = dz * 0.5 + (tz - r.z) * 0.1; }
        const d = Math.hypot(dx, dz) || 1;
        r.route = null; r.hurry = false;
        this.nudge(r, (dx / d) * P.FLEE_SPEED * h, (dz / d) * P.FLEE_SPEED * h);
        continue;
      }
      if (r.state === 'flee') { r.state = 'idle'; r.wait = 0.4; }
      if (r.state === 'hop') {
        const dx = r.tx - r.x, dz = r.tz - r.z, d = Math.hypot(dx, dz);
        if (d < 0.5) {
          const nx = r.route && r.route.shift();
          r.wet = false;
          if (nx) { r.tx = nx.x; r.tz = nx.z; if (nx.wet) r.wet = true; if (!r.route.length) r.route = null; }
          else { r.state = 'idle'; r.hurry = false; r.wait = m.range(0.8, 3.5); }
        } else { const mv = Math.min(d, (r.hurry || r.wet ? P.ARRIVE_SPEED : P.HOP_SPEED) * h); this.nudge(r, (dx / d) * mv, (dz / d) * mv); }
      } else {
        r.wait -= h;
        if (r.wait <= 0) {
          const sx0 = streamX(r.z), off0 = r.x - sx0;
          if (Math.abs(off0) < WATER_LIM) { r.wet = true; r.route = null; r.tx = sx0 + (off0 < 0 ? -1 : 1) * (WATER_LIM + 1); r.tz = r.z; }   // stranded mid-ford after a scare: hop straight out
          else if (r.route || r.hurry) { r.wet = false; /* already has somewhere to go (a newcomer walking in) */ }
          else {
            r.wet = false;
            const side = sideOf(r.x, r.z);
            let c = null;
            if (clovers.length && m.next() < 0.6) { c = clovers[m.int(clovers.length)]; if (sideOf(c.x, c.z) !== side && m.next() > 0.3) c = null; }
            if (c) {
              const a = m.range(0, Math.PI * 2), rr = Math.sqrt(m.next()) * c.radius * 0.8;
              let cx = c.x + Math.cos(a) * rr; const cz = c.z + Math.sin(a) * rr;
              const sx = streamX(cz), cs = sideOf(c.x, c.z), lim = WATER_LIM + 0.6; if ((cx - sx) * cs < lim) cx = sx + cs * lim;   // the part of a patch that hangs over the water is not grazed
              this.setGoal(r, cx, cz);
            } else {
              // drift between warrens so the valley fills out: mostly along the same bank, now and then across a ford
              const roll = m.next();
              const crowd = (side > 0 ? this.eastShare : 1 - this.eastShare) - 0.5;      // > 0 on the busier bank: more reason to cross
              if (roll < 0.02 + Math.max(0, crowd) * 0.8) { const other = []; this.burrows.forEach((q, i) => { if (q.side !== side) other.push(i); }); r.home = other[m.int(other.length)]; }
              else if (roll < 0.2 || this.burrows[r.home].side !== side) { const same = []; this.burrows.forEach((q, i) => { if (q.side === side) same.push(i); }); r.home = same[m.int(same.length)]; }
              const b = this.burrows[r.home];
              let bx = b.x, bz = b.z, bestC = Infinity;
              for (let k = 0; k < 4; k++) {   // mild separation: of a few candidate spots, take the least crowded dry one on the burrow's bank
                const a = m.range(0, Math.PI * 2), rr = Math.sqrt(m.next()) * 20;
                const cx = clamp(b.x + Math.cos(a) * rr, -P.ROAM, P.ROAM), cz = clamp(b.z + Math.sin(a) * rr, -P.ROAM, P.ROAM);
                const cost = (inWater(cx, cz, WET_PAD) || sideOf(cx, cz) !== b.side ? 1e6 : 0) + (this.density.get(Math.floor(cx / CELL) * 1000 + Math.floor(cz / CELL)) || 0) + m.next() * 0.5;
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

  nudge(r, dx, dz) {
    r.x += dx; r.z += dz;
    const d = Math.hypot(r.x, r.z);
    if (d > P.ROAM) { r.x *= P.ROAM / d; r.z *= P.ROAM / d; }
    const sx = streamX(r.z), off = r.x - sx;
    if (Math.abs(off) >= WATER_LIM) { if (r.state === 'flee') r.wet = false; }   // a rabbit scared off a ford runs out and stays out
    else if (!r.wet) r.x = sx + (off < 0 ? -WATER_LIM : WATER_LIM); // keep out of the water, except on a ford crossing
  }
}
