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
    // the strip says when each bank's hard spell is on, and (roughly, then exactly) when the next one starts
    const spells = ['apart1', 'thaw', 'apart2'];
    const hard = spells.includes(f.current.id) || (f.next && spells.includes(f.next.id) && f.next.sec <= 30);
    // carry: give a bank an allele it is about to need, but only while the other bank has plenty and the donors can be spared
    if (sim.t < 230 && !ch.canAct('carry')) {
      const gapB = bankFreq(sim, [1, 2], 'b') - bankFreq(sim, [0], 'b'), gapE = bankFreq(sim, [0], 'e') - bankFreq(sim, [1, 2], 'e'), gapT = bankFreq(sim, [0], 'T') - bankFreq(sim, [1, 2], 'T');
      if (bankFreq(sim, [0], 'b') < 0.03 && gapB > 0.08 && e > 20) ch.carry(1); else if ((bankFreq(sim, [1, 2], 'e') < 0.03 && gapE > 0.08 || bankFreq(sim, [1, 2], 'T') < 0.03 && gapT > 0.08) && w > 20) ch.carry(0);
    }
    if (hard) {
      const weak = w <= e ? 0 : 1, strong = 1 - weak;
      const fence = (side) => !ch.canAct('fence', side) && ch.fence(side);
      const bank = (side) => (side === 0 ? W : E);
      // the weaker bank first: fence, then brush; then food for the East; then the other bank
      const covered = (type, b) => sim.patches.some((p) => p.type === type && p.x === b.x && p.z === b.z);
      const brush = (side) => !covered('shelter', bank(side)) && !ch.canAct('shelter') && (ch.shelter(bank(side).x, bank(side).z), true);
      if (fence(weak) || brush(weak)) return;
      if (!covered('clover', E) && !ch.canAct('clover')) { ch.clover(E.x, E.z); return; }
      if (fence(strong) || brush(strong)) return;
    }
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

// The Two Lineages targets (spec 11.3), in one place so `npm test` (few seeds, wide slack) and `npm run balance` (40 + 40 fresh seeds) check the same things.
export const lineageSeeds = (n, prefix = 'AUD') => Array.from({ length: n }, (_, i) => prefix + String(i).padStart(3, '0'));
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const cache = new Map();
export function cachedTally(strat, seeds) { const k = strat + '|' + seeds.join(); if (!cache.has(k)) cache.set(k, ltally(strat, seeds)); return cache.get(k); }
export function lineageTable(seeds) {
  const rows = {};
  for (const s of Object.keys(LSTRATS)) { const t = cachedTally(s, seeds); rows[s] = { alive: t.alive / t.n, bands: t.bands, medD: med(t.D), stars: t.stars }; }
  return rows;
}
export function checkLineageTargets(seeds, slack = 0) {
  const T = lineageTable(seeds), out = [], pc = (x) => Math.round(x * 100) + '%';
  const alive = (s) => T[s].alive;
  out.push([alive('none') <= 0.2 + slack, `B1 do nothing keeps both lineages alive in ${pc(alive('none'))} of runs (at most ${pc(0.2 + slack)})`]);
  out.push([T.none.stars[3] === 0, `B1 do nothing never earns 3 stars (${T.none.stars[3]})`]);
  out.push([alive('sidePlanner') >= 0.75 - slack, `B2 the forecast reader keeps both alive in ${pc(alive('sidePlanner'))} (at least ${pc(0.75 - slack)})`]);
  for (const s of ['carrySpam', 'cloverSpam', 'shelterSpam', 'fenceSpam']) out.push([alive(s) <= 0.5 + slack, `B3 ${s} ${pc(alive(s))} (at most ${pc(0.5 + slack)})`]);
  out.push([alive('panicky') >= 0.25 - slack && alive('panicky') <= 0.55 + slack, `B4 panicky ${pc(alive('panicky'))} (${pc(0.25 - slack)} to ${pc(0.55 + slack)})`]);
  const b = T.sidePlanner.bands, all = b.one + b.between + b.two, used = Object.values(b).filter((n) => n > 0).length;
  out.push([all > 0 && used >= 2 && Math.max(...Object.values(b)) / all <= 0.85 + slack, `B5 forecast reader's outcome labels ${JSON.stringify(b)}`]);
  out.push([T.carrySpam.medD == null || T.carrySpam.medD <= 4, `B6 carrying keeps the banks alike: median D ${T.carrySpam.medD} (at most 4)`]);
  out.push([T.none.medD != null && T.none.medD >= 6, `B6 isolation drifts them apart: median D ${T.none.medD} (at least 6)`]);
  return out;
}
