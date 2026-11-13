// Islands update: unit checks from docs/specs/2026-11-13-islands.md section 11.2 (fast versions).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../src/sim/params.js';
import { BURROWS, regionOf, streamX, channelX } from '../src/sim/valley.js';
import { composition, alleleFreq } from '../src/sim/history.js';
import { createIslandsLab, populationsOf, viability, fertility, divergenceTrial, founderTrial, LAND_PRESETS, speciesLabel } from '../src/sim/islands.js';

const I = P.ISLANDS;
const freq = (sim, regs, a) => alleleFreq(composition(sim.rabbits.filter((r) => r.alive && regs.includes(r.region))), a);
const sd = (xs) => { const m = xs.reduce((s, x) => s + x, 0) / xs.length; return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length); };

test('U1 geometry: warrens sit in their lands, islet warren clear of flood water', () => {
  assert.deepEqual(BURROWS.map((b) => regionOf(b.x, b.z)), [2, 0, 1, 0, 1, 0, 1, 0]);
  const isl = BURROWS[0];
  assert.ok(isl.x - streamX(isl.z) > I.FLOOD_W + 5);
  assert.ok(channelX(isl.z) - isl.x > I.CHANNEL_W + 5);
  for (let z = -10; z <= 22; z += 0.5) assert.ok(Math.hypot(channelX(z) + I.CHANNEL_W + 1, z) < P.ROAM);
});

test('U2 populations for every water combination', () => {
  const want = {
    '000': [[0, 1, 2]], '100': [[0], [1, 2]], '010': [[0, 1, 2]], '001': [[0, 1, 2]],
    '110': [[0], [1, 2]], '101': [[0], [1], [2]], '011': [[0, 1], [2]], '111': [[0], [1], [2]],
  };
  for (const [k, v] of Object.entries(want)) assert.deepEqual(populationsOf({ river: +k[0], midFord: +k[1], channel: +k[2] }), v, k);
});

test('U3/U6 the flood is a barrier: no rabbit changes population and kits stay with their parents', () => {
  for (const seed of ['BAR1', 'BAR2']) {
    const s = createIslandsLab({ seedCode: seed, scenario: 'flood' });
    const pop = new Map();
    for (let g = 0; g < 15; g++) {
      for (const r of s.rabbits) if (r.alive) {
        const p = s.popOfRegion(r.region);
        if (pop.has(r.id)) assert.equal(pop.get(r.id), p, `rabbit ${r.id} crossed`);
        pop.set(r.id, p);
        if (r.parents[0] && pop.has(r.parents[0])) assert.equal(pop.get(r.parents[0]), p);
      }
      s.advance(P.GEN_LEN);
    }
  }
});

test('U4 reopening mixes the lands again', () => {
  const s = createIslandsLab({ seedCode: 'MIX1', scenario: 'flood' });
  s.advance(5 * P.GEN_LEN); s.setScenario('open'); s.advance(7 * P.GEN_LEN);
  assert.equal(s.isl.pops.length, 1);
  assert.ok(s.reunionResult().conceived > 0, 'cross kits after the reunion');
});

test('U5 each bank selects for its own climate', () => {
  let ok = 0;
  for (let i = 0; i < 6; i++) {
    const s = createIslandsLab({ seedCode: 'SEL' + i, scenario: 'flood' });
    s.setPopulationEnv(0, LAND_PRESETS.alpine.env); s.setPopulationEnv(1, LAND_PRESETS.desert.env);
    s.advance(12 * P.GEN_LEN);
    if (freq(s, [0], 'e') < 0.4 && freq(s, [1, 2], 'e') > 0.8 && freq(s, [0], 'b') > freq(s, [1, 2], 'b')) ok++;
    const cold = s.history.records.reduce((n, r) => n + (r.reg ? r.reg[1].deaths.cold + r.reg[2].deaths.cold : 0), 0);
    assert.equal(cold, 0, 'no cold deaths in the hot East');
  }
  assert.ok(ok >= 5, `selection differed on ${ok}/6 seeds`);
});

test('U7 per-population ceilings and the 600 cap', () => {
  const s = createIslandsLab({ seedCode: 'CAP1', scenario: 'three', food: [600, 600, 600] });
  for (let g = 0; g < 12; g++) {
    s.advance(P.GEN_LEN);
    assert.ok(s.pop <= P.CAP);
    for (const p of s.isl.pops) assert.ok(p.n <= p.regions.reduce((t, i) => t + I.CAP_SHARE[i], 0) + 0, `${p.name} ${p.n}`);
  }
});

test('U8/U12 hidden clock: D stays 0 in an open valley, climbs while apart, same-population kits always fine', () => {
  const o = createIslandsLab({ seedCode: 'CLK0' }); o.advance(20 * P.GEN_LEN);
  assert.equal(Object.values(o.isl.dist).reduce((a, b) => a + b, 0), 0);
  const ds = []; let lastD = 0;
  for (let i = 0; i < 16; i++) {
    const s = createIslandsLab({ seedCode: 'CLK' + (i + 1), scenario: 'flood' });
    lastD = 0;
    for (let g = 0; g < 31; g++) { s.advance(P.GEN_LEN); const d = s.distance(0, 1); assert.ok(d >= lastD - 1e-9, 'D never falls without carrying'); lastD = d; }
    ds.push(lastD);
    const st = s.isl.stats; assert.equal(st.sameBorn, st.sameConceived); assert.equal(st.sameFertile, st.sameConceived);
  }
  const mean = ds.reduce((a, b) => a + b, 0) / ds.length;
  assert.ok(mean > 7.5 && mean < 12.5, `mean D at 30 apart = ${mean}`);
});

test('U10 hybrid functions match the spec table', () => {
  const rows = [[0, 1, 1], [4, 0.99, 0.9], [8, 0.84, 0.37], [12, 0.5, 0.1], [20, 0.11, 0.01]];
  for (const [h, v, f] of rows) { assert.ok(Math.abs(viability(h) - v) < 0.006, `V(${h})`); assert.ok(Math.abs(fertility(h) - f) < 0.006, `F(${h})`); }
  assert.equal(speciesLabel(0.9).band, 'one'); assert.equal(speciesLabel(0.5).band, 'between'); assert.equal(speciesLabel(0.1).band, 'two');
});

test('U11 dose-response: longer apart, fewer fertile hybrids', () => {
  const by = { 10: [], 30: [], 50: [] };
  for (let i = 0; i < 12; i++) for (const o of divergenceTrial({ seedCode: 'DOSE' + i }).out) by[o.apart].push(o.cross.phi);
  const m = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  assert.ok(m(by[10]) > m(by[30]) && m(by[30]) > m(by[50]));
  assert.ok(m(by[10]) >= 0.7, `phi at 10 = ${m(by[10])}`);
  assert.ok(m(by[50]) <= 0.15, `phi at 50 = ${m(by[50])}`);
});

test('U13 a test cross never changes the run', () => {
  const run = (cross) => {
    const s = createIslandsLab({ seedCode: 'TC1', scenario: 'flood' });
    for (let g = 0; g < 12; g++) { if (cross && g > 4) s.testCross(0, 1); s.advance(P.GEN_LEN); }
    return s.rabbits.filter((r) => r.alive).map((r) => `${r.id}${r.genotype.fur}${r.c0}${r.x.toFixed(4)}`).join();
  };
  assert.equal(run(true), run(false));
});

test('U14 carrying rabbits keeps the lineages alike', () => {
  const m = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const withC = [], without = [];
  for (let i = 0; i < 8; i++) {
    withC.push(divergenceTrial({ seedCode: 'GF' + i, gens: [30], carryEvery: 3 }).out[0].D);
    without.push(divergenceTrial({ seedCode: 'GF' + i, gens: [30] }).out[0].D);
  }
  assert.ok(m(withC) <= 3, `with carrying ${m(withC)}`);
  assert.ok(m(without) >= 7, `without ${m(without)}`);
});

test('U15 sterile rabbits never become parents', () => {
  const s = createIslandsLab({ seedCode: 'STER1', scenario: 'flood' });
  s.advance(40 * P.GEN_LEN); s.setScenario('open'); s.advance(8 * P.GEN_LEN);
  const sterile = new Set(); for (const [id, r] of s.registry) if (r.sterile) sterile.add(id);
  assert.ok(sterile.size > 0, 'some sterile hybrids exist after 40 generations apart');
  for (const r of s.registry.values()) for (const p of r.parents) assert.ok(!sterile.has(p));
});

test('U16 storm moves exactly n adults to the islet, refused when the islet is reachable', () => {
  const o = createIslandsLab({ seedCode: 'ST0' });
  assert.equal(o.storm(4).ok, false);
  const s = createIslandsLab({ seedCode: 'ST1', scenario: 'storm' });
  const before = s.rabbits.filter((r) => r.alive && r.region === 2).length;
  s.advance(2 * P.GEN_LEN);
  assert.equal(s.storm(4).ok, true);
  s.advance(P.GEN_LEN);
  const st = s.isl.lastStorm;
  assert.equal(st.ids.length, 4);
  for (const id of st.ids) assert.equal(s.getRabbit(id).region, 2);
  const c = composition(st.ids.map((id) => s.getRabbit(id)));
  assert.ok(Math.abs(alleleFreq(c, 'b') - st.founders.b) < 1e-9);
  assert.ok(before >= 0);
});

test('U17/U18 founder effect is chance: islets scatter far more than the mainland, with no bias', () => {
  const four = [], sixteen = [], main = [];
  for (let i = 0; i < 24; i++) {
    const a = founderTrial({ seedCode: 'FND' + i, founders: 4 }); if (a) { four.push(a.islet.b); main.push(a.mainland.b); }
    const b = founderTrial({ seedCode: 'FND' + i, founders: 16 }); if (b) sixteen.push(b.islet.b);
  }
  assert.ok(sd(four) > 2.5 * sd(main), `sd 4 founders ${sd(four)} vs mainland ${sd(main)}`);
  assert.ok(sd(sixteen) < sd(four));
  assert.ok(sd(main) > 0, 'drift happens on the mainland too');
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  assert.ok(Math.abs(mean(four) - mean(main)) < 0.15, 'no selection bias on the islet');
});

test('U19 determinism: same seed and commands give the same run at any step size', () => {
  const run = (dt) => {
    const s = createIslandsLab({ seedCode: 'DET1' });
    const cmds = { 3: () => s.setScenario('flood'), 8: () => s.carry(0, 1, 4), 12: () => s.setScenario('open') };
    for (let g = 0; g < 16; g++) { cmds[g]?.(); for (let t = 0; t < P.GEN_LEN - 1e-9; t += dt) s.step(dt); }
    return s.rabbits.filter((r) => r.alive).map((r) => `${r.id}${r.genotype.fur}${r.genotype.ears}${r.c0}|${r.c1}`).join();
  };
  assert.equal(run(0.25), run(0.1));
});

test('U20 region blocks add up to the valley each generation', () => {
  const s = createIslandsLab({ seedCode: 'HIS1', scenario: 'three' });
  s.advance(8 * P.GEN_LEN);
  for (const rec of s.history.records) {
    assert.equal(rec.reg.reduce((n, r) => n + r.n, 0), rec.pop);
    for (const c of Object.keys(rec.deaths)) assert.equal(rec.reg.reduce((n, r) => n + (r.deaths[c] || 0), 0), rec.deaths[c] || 0, c);
  }
});

test('U21 split and rejoin events fire once each, after a warning', () => {
  const s = createIslandsLab({ seedCode: 'EV1' });
  const seen = [];
  const drain = () => { for (const e of s.drainEvents()) if (['islwarn', 'split', 'rejoin'].includes(e.type)) seen.push(e.type); };
  s.advance(2 * P.GEN_LEN); drain();
  s.setScenario('flood'); drain(); s.advance(3 * P.GEN_LEN); drain();
  s.setScenario('open'); drain(); s.advance(2 * P.GEN_LEN); drain();
  assert.deepEqual(seen, ['islwarn', 'split', 'islwarn', 'rejoin']);
});
