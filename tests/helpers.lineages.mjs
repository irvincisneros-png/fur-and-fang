// Benchmark players for Two Lineages. They read only what the HUD shows: the forecast strip, the two population counts,
// each bank's allele bars, trust and whether a button is enabled.
import { createLineages, L } from '../src/sim/lineages.js';
import { composition, alleleFreq } from '../src/sim/history.js';
import { BURROWS } from '../src/sim/valley.js';

const bankFreq = (sim, regs, a) => alleleFreq(composition(sim.rabbits.filter((r) => r.alive && regs.includes(r.region))), a);
const warren = (regs) => BURROWS.find((b, i) => regs.includes(i === 0 ? 2 : b.x < 0 ? 0 : 1)) || BURROWS[1];
const W = BURROWS[1], E = BURROWS[2];

export function sidePlanner(ch) {
  const sim = ch.sim;
  return () => {
    const pops = sim.isl.pops, f = ch.forecast();
    if (!ch.prediction && ch.predictAsked) predictFromCrosses(ch);
    if (pops.length < 2) return;
    const w = pops[0].n, e = pops[1].n;
    const hard = (id) => (f.current.id === id) || (f.next && f.next.id === id && f.next.sec <= 30);
    // early carries: give each bank the allele its coming climate calls for, from the bank that has more of it
    if (sim.t < 230 && !ch.canAct('carry')) {
      const gapB = bankFreq(sim, [1, 2], 'b') - bankFreq(sim, [0], 'b'), gapE = bankFreq(sim, [0], 'e') - bankFreq(sim, [1, 2], 'e'), gapT = bankFreq(sim, [0], 'T') - bankFreq(sim, [1, 2], 'T');
      if (bankFreq(sim, [0], 'b') < 0.03 && gapB > 0.08 && e > 20) ch.carry(1); else if ((bankFreq(sim, [1, 2], 'e') < 0.03 && gapE > 0.08 || bankFreq(sim, [1, 2], 'T') < 0.03 && gapT > 0.08) && w > 20) ch.carry(0);
    }
    const weak = w <= e ? 0 : 1;
    // fences before each bank's hard spell, shelters and clover on the weaker bank with what is left
    const foxW = sim.isl.regions[0].env.predators, foxE = sim.isl.regions[1].env.predators;
    if (foxW >= 3 && !ch.canAct('fence', 0) && (w <= e || ch.trust >= 16)) ch.fence(0);
    else if (foxE >= 3 && !ch.canAct('fence', 1)) ch.fence(1);
    else if (ch.trust >= 6 && !ch.canAct('shelter') && Math.min(w, e) < 70) { const b = weak === 0 ? W : E; ch.shelter(b.x, b.z); }
    else if (ch.trust >= 6 && !ch.canAct('clover') && e < 70) ch.clover(E.x, E.z);
    if (sim.t > 330 && sim.t < 445 && ch.trust > 2 && !sim.isl.crosses.some((c) => c.gen >= sim.gen - 5)) ch.testCross();
  };
}
// predicts from the most recent test cross it can see (as a student reading the table would)
function predictFromCrosses(ch) {
  const c = ch.sim.isl.crosses[ch.sim.isl.crosses.length - 1];
  const phi = c ? c.phi : 0.6;
  ch.predict(phi >= 0.8 ? 'one' : phi >= 0.2 ? 'between' : 'two', 'From the latest test cross.');
}
const spam = (fn) => (ch) => () => { if (!ch.prediction && ch.predictAsked) ch.predict('between', 'guess'); fn(ch, ch.sim); };
export const LSTRATS = {
  none: (ch) => () => { if (!ch.prediction && ch.predictAsked) ch.predict('one', 'guess'); },
  sidePlanner,
  carrySpam: spam((ch, sim) => { if (!ch.canAct('carry')) ch.carry(sim.gen % 2); }),
  cloverSpam: spam((ch) => { if (!ch.canAct('clover')) ch.clover(W.x, W.z); }),
  shelterSpam: spam((ch) => { if (!ch.canAct('shelter')) ch.shelter(W.x, W.z); }),
  fenceSpam: spam((ch) => { if (!ch.canAct('fence', 0)) ch.fence(0); else if (!ch.canAct('fence', 1)) ch.fence(1); }),
  panicky: spam((ch, sim) => { if (!ch.canAct('clover')) ch.clover(E.x, E.z); if (!ch.canAct('carry')) ch.carry(1); }),
};
export function playLineages(seedCode, strat = 'none') {
  const { sim, challenge } = createLineages({ seedCode });
  const act = (LSTRATS[strat] || LSTRATS.none)(challenge);
  while (!sim.ended) { act(); sim.advance(1); }
  return { sim, challenge, stars: challenge.stars(), verdict: challenge.verdict() };
}
export function ltally(strat, seeds) {
  const out = { alive: 0, stars: [0, 0, 0, 0], bands: { one: 0, between: 0, two: 0 }, D: [], n: seeds.length };
  for (const s of seeds) {
    const r = playLineages(s, strat);
    if (r.stars.survived) { out.alive++; if (r.verdict) out.bands[r.verdict.label.band]++; if (r.challenge.snap) out.D.push(r.challenge.snap.D); }
    out.stars[r.stars.count]++;
  }
  return out;
}
