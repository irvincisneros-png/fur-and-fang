// Two Lineages 10:00 (spec section 5): a flood splits the warren, each bank gets its own climate, the student keeps both
// lineages alive, predicts whether they are still one species, then the water drops and the kits give the answer.
import { P } from './params.js';
import { RNG } from './rng.js';
import { drawGenotype } from './genetics.js';
import { Challenge, track } from './challenge.js';
import { IslandSim, speciesLabel } from './islands.js';
import { composition, alleleFreq, allelesPresent, meanHeterozygosity } from './history.js';

export const L = {
  SECONDS: 600, START_POP: 24, FREQ: { b: 0.15, e: 0.15, T: 0.15 }, FOOD: [50, 40, 10], SUB_RATE: 0.11,
  FOX_W: [4, 6, 6], FOX_E: [4, 6], WINTER: -0.7, WINTER2: -0.85, HEAT: 0.8, HEAT2: 0.85,
  SPLIT: 90, PREDICT: 450, REJOIN: 480,
  CARRY_COST: 6, CARRY_COOLDOWN: 3, TEST_COST: 1, FENCE_COOLDOWN: 6, FENCE_GENS: 5,
  STAR_MIN: 6, STAR_POP: 30,
};

export class LineagesChallenge extends Challenge {
  constructor(sim) {
    super(sim);
    const rng = new RNG((sim.seed ^ 0x2545f491) >>> 0), j = () => rng.int(11) - 5;
    const tS = L.SPLIT, w1 = 120 + j(), e1 = 150 + j(), th = 270 + j(), w2 = 315 + j(), wet = 300 + j(), d2 = 345 + j(), R = L.REJOIN, D = L.SECONDS;
    const [FW, FE] = L.FOOD, [fw1, fw2, fw3] = L.FOX_W, [fe1, fe2] = L.FOX_E;
    this.rtracks = {
      0: { snow: [[0, 0], [w1, 0], [w1 + 30, 0.9], [th, 0.9], [th + 15, 0.2], [w2, 0.2], [w2 + 20, 0.95], [R - 10, 0.95], [R + 20, 0.2], [D, 0.2]],
        temp: [[0, 0.2], [w1, 0.2], [w1 + 30, L.WINTER], [th, L.WINTER], [th + 15, 0.1], [w2, 0.1], [w2 + 20, L.WINTER2], [R - 10, L.WINTER2], [R + 20, 0.1], [D, 0.1]],
        food: [[0, FW], [D, FW]], tough: [[0, 0], [R, 0], [R + 20, 0.1], [D, 0.1]],
        predators: [[0, 0], [w1, 0], [w1 + 2, fw1], [w1 + 80, fw2], [w2, fw2], [w2 + 20, fw3], [R, fw3], [R + 10, 2], [D, 2]] },
      1: { snow: [[0, 0], [R, 0], [R + 20, 0.2], [D, 0.2]],
        temp: [[0, 0.2], [e1, 0.2], [e1 + 30, L.HEAT], [wet, L.HEAT], [wet + 15, 0.2], [d2, 0.2], [d2 + 20, L.HEAT2], [R - 10, L.HEAT2], [R + 20, 0.1], [D, 0.1]],
        food: [[0, FE], [e1, FE], [e1 + 30, FE * 0.65], [wet, FE * 0.65], [wet + 15, FE], [d2, FE], [d2 + 20, FE * 0.6], [R - 10, FE * 0.6], [R + 20, FE], [D, FE]],
        tough: [[0, 0], [e1, 0], [e1 + 30, 0.7], [wet, 0.7], [wet + 15, 0.05], [d2, 0.05], [d2 + 20, 0.8], [R - 10, 0.8], [R + 20, 0.1], [D, 0.1]],
        predators: [[0, 0], [210 + j(), 0], [212, fe1], [d2, fe1], [d2 + 20, fe2], [R, fe2], [R + 10, 2], [D, 2]] },
    };
    this.windows = [
      { id: 'together', label: 'One valley', icon: '\u{1F331}', start: 0, end: tS, color: '#b9d98a', tip: 'Grow, and spread to both banks.' },
      { id: 'flood', label: 'Flood: the valley splits', icon: '\u{1F30A}', start: tS, end: w1, color: '#bfe3f5', announce: 'Flood: the river will split the valley into West and East', tip: 'Two populations, still one species. Nothing about the rabbits has changed.' },
      { id: 'apart1', label: 'West freezes, East bakes', icon: '❄️', start: w1, end: th, color: '#a9cbe8', announce: 'West: winter and foxes. East: heat and woody food', tip: 'Each bank now selects for different alleles.' },
      { id: 'thaw', label: 'West thaws, East cools', icon: '\u{1F4A7}', start: th, end: w2, color: '#9ed8c8', announce: 'A short thaw in the West and a wet spell in the East', tip: 'Conditions reverse for a while, on each bank separately.' },
      { id: 'apart2', label: 'Harder winter, drought again', icon: '\u{1F328}️', start: w2, end: R, color: '#8fb1d9', announce: 'West: a harder winter. East: drought again', tip: 'Keep both lineages above six rabbits until the water drops.' },
      { id: 'reunion', label: 'The crossing is back', icon: '☀️', start: R, end: D, color: '#f3e3b0', announce: 'Drought: the river drops and the crossing reopens', tip: 'Watch the kits with one parent from each side.' },
    ];
    this.lastCarry = -99; this.fenceLast = { 0: -99, 1: -99 }; this.prediction = null; this.predictAsked = false;
    this.snap = null; this.splitOrdered = false; this.rejoinOrdered = false; this.atRejoinCross = null;
    this.applyEnv(sim);
  }

  applyEnv(sim) {
    if (!this.rtracks || !sim.isl) return;
    const t = sim.t;
    for (const side of [0, 1]) {
      const k = this.rtracks[side], env = { snow: track(k.snow, t), temp: track(k.temp, t), food: track(k.food, t), tough: track(k.tough, t), predators: Math.round(track(k.predators, t)) };
      const regions = side === 0 ? [0] : [1, 2];
      for (const i of regions) Object.assign(sim.isl.regions[i].env, env, { food: i === 2 ? L.FOOD[2] * env.food / L.FOOD[1] : env.food });
    }
    sim.summarizeEnv();
    const w = this.windowAt(t);
    if (w.id !== this.phaseId) { if (this.phaseId != null) sim.events.push({ type: 'phase', id: w.id, label: w.label, icon: w.icon, tip: w.tip || '', color: w.color, t }); this.phaseId = w.id; }
  }

  // lineage counts by tag: West-born lineage (bit 1) and East-born lineage (bit 2), pure members only
  lineageCounts() {
    let w = 0, e = 0;
    for (const r of this.sim.rabbits) if (r.alive) { if (r.org === 1) w++; else if (r.org === 2) e++; }
    return { west: w, east: e };
  }

  onGenStart(sim) {
    if (!sim.isl) return;
    if (sim.gen > 0) {
      const c = sim.history.current.comp;
      this.trust += P.TRUST_PER_GEN + (allelesPresent(c) >= 5 && meanHeterozygosity(c) >= 0.15 ? P.TRUST_DIVERSITY : 0);
    }
    const t = sim.t;
    if (!this.splitOrdered && t >= L.SPLIT - P.GEN_LEN - 1e-6) { this.splitOrdered = true; sim.setWater({ river: 1 }); }
    if (!this.rejoinOrdered && t >= L.REJOIN - P.GEN_LEN - 1e-6) {
      this.rejoinOrdered = true;
      const pops = sim.isl.pops;
      this.snap = { gen: sim.gen, t, west: pops[0] ? pops[0].n : 0, east: pops[1] ? pops[1].n : 0, D: sim.distance(0, 1) };
      this.atRejoinCross = pops.length > 1 ? sim.testCross(0, 1) : null;
      sim.setWater({ river: 0 });
    }
    if (!this.predictAsked && t >= L.PREDICT - 1e-6) { this.predictAsked = true; sim.events.push({ type: 'predict', t }); }
    // a lineage lost before the reunion ends the run
    if (sim.isl.pops.length > 1 && t > L.SPLIT && t < L.REJOIN && !sim.ended) {
      const lost = sim.isl.pops.find((p) => p.n === 0);
      if (lost) { sim.ended = true; this.result = { outcome: 'lost', lineage: lost.name, t, gen: sim.gen }; sim.events.push({ type: 'lineagelost', name: lost.name, t, gen: sim.gen }); }
    }
    if (t >= L.SECONDS - 1e-6 && !sim.ended) { sim.ended = true; this.result = { outcome: 'done', t, gen: sim.gen }; }
  }

  get timeLeft() { return Math.max(0, L.SECONDS - this.sim.t); }
  get outcome() { return this.sim.extinct ? 'extinct' : this.result?.outcome || null; }
  costOf(action) { return action === 'carry' ? L.CARRY_COST : action === 'testcross' ? L.TEST_COST : P.COST[action]; }
  cooldown(action, side = 0) {
    if (action === 'carry') return Math.max(0, this.lastCarry + L.CARRY_COOLDOWN - this.sim.gen);
    if (action === 'fence') return Math.max(0, this.fenceLast[side] + L.FENCE_COOLDOWN - this.sim.gen);
    return 0;
  }
  canAct(action, side = 0) {
    if (this.sim.ended) return 'The run is over.';
    if (action === 'carry' && this.sim.isl.pops.length < 2) return 'Only while the river is in flood.';
    if (action === 'translocate') return 'No outside rabbits in this challenge: carry across instead.';
    if (this.trust < this.costOf(action)) return `Needs ${this.costOf(action)} trust.`;
    const cd = this.cooldown(action, side); if (cd > 0) return `Ready in ${cd} generation${cd > 1 ? 's' : ''}.`;
    return null;
  }
  translocate() { return { ok: false, reason: this.canAct('translocate') }; }
  // fence one bank (0 West, 1 East)
  fence(side = 0) {
    const why = this.canAct('fence', side); if (why) return { ok: false, reason: why };
    for (const i of side === 0 ? [0] : [1, 2]) this.sim.fenceRegion(i, L.FENCE_GENS);
    this.fenceLast[side] = this.sim.gen; this.spend('fence', { side });
    this.sim.events.push({ type: 'fence', side });
    return { ok: true };
  }
  // carry 4 adults: dir 0 = West to East, 1 = East to West
  carry(dir = 0) {
    const why = this.canAct('carry'); if (why) return { ok: false, reason: why };
    const r = dir === 0 ? this.sim.carry(0, 1, P.ISLANDS.CARRY_COUNT) : this.sim.carry(1, 0, P.ISLANDS.CARRY_COUNT);
    if (!r.ok) return r;
    this.lastCarry = this.sim.gen; this.spend('carry', { dir });
    return { ok: true };
  }
  testCross() {
    const why = this.canAct('testcross'); if (why) return { ok: false, reason: why };
    if (this.sim.isl.pops.length < 2) return { ok: false, reason: 'The lineages are already meeting: watch the kits.' };
    const r = this.sim.testCross(0, 1); if (!r.ok) return r;
    this.spend('testcross'); return r;
  }
  predict(band, reason = '') { this.prediction = { band, reason: String(reason).slice(0, 400), t: this.sim.t }; }

  // The answer: fertile cross kits / cross kits conceived since the reunion (or the test cross taken at the reunion).
  verdict() {
    const R = this.sim.reunionResult?.();
    if (R && R.conceived >= 10) return { source: 'reunion', conceived: R.conceived, born: R.born, fertile: R.fertile, phi: R.phi, label: speciesLabel(R.phi) };
    const c = this.atRejoinCross;
    if (c && c.ok) return { source: 'test', conceived: c.conceived, born: c.born, fertile: c.fertile, phi: c.phi, label: c.label };
    return null;
  }

  stars() {
    const s = this.snap, v = this.verdict();
    const alive = !!s && this.result?.outcome !== 'lost' && s.west >= L.STAR_MIN && s.east >= L.STAR_MIN;
    const big = alive && s.west >= L.STAR_POP && s.east >= L.STAR_POP;
    const right = alive && !!v && !!this.prediction && this.prediction.band === v.label.band;
    return { survived: alive, population: big, prediction: right, count: [alive, big, right].filter(Boolean).length };
  }

  report() { return buildLineagesReport(this); }
}

export function createLineages(opts = {}) {
  let challenge;
  const seedProbe = new IslandSim({ seedCode: opts.seedCode, mode: 'survive', startPop: 0 });   // only to read the seed
  const rng = new RNG((seedProbe.seed ^ 0x6c8e9cf5) >>> 0);
  const founders = Array.from({ length: L.START_POP }, () => drawGenotype(L.FREQ, rng));
  const sim = new IslandSim({ ...opts, seedCode: seedProbe.seedCode, mode: 'survive', founders, islands: { scenario: 'open', food: L.FOOD, subRate: L.SUB_RATE },
    setup: (s) => { challenge = new LineagesChallenge(s); } });
  return { sim, challenge };
}

// ---------- report (evidence first, never "need", never "became a species at") ----------
export function buildLineagesReport(ch) {
  const sim = ch.sim, recs = sim.history.records, s = ch.snap, v = ch.verdict();
  const at = (t) => recs.reduce((best, r) => (r.t <= t + 1e-6 ? r : best), recs[0]);
  const regFreq = (rec, regs, a) => { const comp = { n: 0, alleles: { B: 0, b: 0, E: 0, e: 0, T: 0, t: 0 } }; for (const i of regs) { const c = rec.reg?.[i]?.comp; if (!c) continue; comp.n += c.n; for (const k in comp.alleles) comp.alleles[k] += c.alleles[k]; } return comp.n ? alleleFreq(comp, a) : null; };
  const pct = (x) => (x == null ? '–' : Math.round(x * 100) + '%');
  const r0 = at(L.SPLIT + 1), r1 = at(Math.min(L.REJOIN - 1, sim.t));
  const lines = [];
  const NAMES = { b: 'White fur (b)', e: 'Long ears (e)', T: 'Long teeth (T)' };
  for (const a of ['b', 'e', 'T']) {
    const w0 = regFreq(r0, [0], a), w1 = regFreq(r1, [0], a), e0 = regFreq(r0, [1, 2], a), e1 = regFreq(r1, [1, 2], a);
    if (w0 != null && w1 != null && e0 != null && e1 != null && Math.abs((w1 - w0) - (e1 - e0)) > 0.15) { lines.push(`While apart, ${NAMES[a].toLowerCase()} went from ${pct(w0)} to ${pct(w1)} in the West and from ${pct(e0)} to ${pct(e1)} in the East.`); break; }
  }
  const deaths = (regs, cause) => recs.reduce((n, r) => n + (r.t >= L.SPLIT && r.t < L.REJOIN && r.reg ? regs.reduce((m, i) => m + (r.reg[i].deaths[cause] || 0), 0) : 0), 0);
  lines.push(`Death records while apart: the West lost ${deaths([0], 'cold')} rabbits to cold and ${deaths([0], 'predator')} to foxes; the East lost ${deaths([1, 2], 'heat')} to heat and ${deaths([1, 2], 'starved')} to hunger.`);
  const carries = ch.log.filter((x) => x.action === 'carry').length;
  if (carries) lines.push(`You carried rabbits across ${carries} time${carries > 1 ? 's' : ''}. That moved alleles between the banks and kept the lineages more alike.`);
  else lines.push('Nobody crossed while the river was up, so each lineage changed by selection and chance on its own.');
  if (v) lines.push(`After the reunion: ${v.conceived} cross kits conceived, ${v.born} born alive, ${v.fertile} able to breed (${pct(v.phi)}).${v.source === 'test' ? ' (Too few cross kits were born in the valley, so this uses a test cross taken at the reunion.)' : ''}`);
  return {
    headline: ch.result?.outcome === 'lost' ? `The ${ch.result.lineage} lineage died out at ${Math.floor(ch.result.t / 60)}:${String(Math.floor(ch.result.t % 60)).padStart(2, '0')}, generation ${ch.result.gen}. With one lineage left there is nothing to compare.` : v ? v.label.text : 'The run ended.',
    lines, verdict: v, prediction: ch.prediction, snap: s, stars: ch.stars(),
    questions: [
      'The two banks started with the same alleles. Why did they end up different? Use one piece of evidence from each graph.',
      'At the moment of the flood, were there two species? What changed between then and the reunion, and what did not?',
      `Your result was "${v ? (v.label.band === 'one' ? 'still one species' : v.label.band === 'two' ? 'two species' : 'in between') : 'unknown'}". What would you need to observe to be more sure? Why do biologists sometimes disagree about whether two populations are one species?`,
    ],
  };
}
