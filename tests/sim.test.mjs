import test from 'node:test';
import assert from 'node:assert/strict';
import { RNG } from '../src/sim/rng.js';
import { cross, gamete, phenotype, DOM_EXPLORE, DOM_SURVIVE, FOUNDER, normalize } from '../src/sim/genetics.js';
import { Simulation } from '../src/sim/sim.js';
import { P } from '../src/sim/params.js';
import { CAUSES } from '../src/sim/history.js';

const founders = (n, g) => Array.from({ length: n }, () => ({ ...FOUNDER, ...g }));

test('Mendel: Bb x Bb gives about 1:2:1 over many seeds', () => {
  const counts = { BB: 0, Bb: 0, bb: 0 }; let total = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const rng = new RNG(seed);
    for (let i = 0; i < 100; i++) { const { genotype } = cross({ fur: 'Bb', ears: 'EE', teeth: 'tt' }, { fur: 'Bb', ears: 'EE', teeth: 'tt' }, rng, 0); counts[genotype.fur]++; total++; }
  }
  assert.ok(Math.abs(counts.BB / total - 0.25) < 0.01, JSON.stringify(counts));
  assert.ok(Math.abs(counts.Bb / total - 0.5) < 0.01, JSON.stringify(counts));
  assert.ok(Math.abs(counts.bb / total - 0.25) < 0.01, JSON.stringify(counts));
});

test('dominance switching changes the phenotype of heterozygotes', () => {
  const het = { fur: 'Bb', ears: 'Ee', teeth: 'Tt' };
  const a = phenotype(het, { fur: 'B', ears: 'E', teeth: 'T' });
  assert.deepEqual(a, { white: false, longEars: false, longTeeth: true });
  const b = phenotype(het, { fur: 'b', ears: 'e', teeth: 't' });
  assert.deepEqual(b, { white: true, longEars: true, longTeeth: false });
  assert.equal(phenotype({ fur: 'bb', ears: 'EE', teeth: 'tt' }, DOM_SURVIVE).white, true);
  assert.equal(phenotype({ fur: 'BB', ears: 'ee', teeth: 'TT' }, DOM_EXPLORE).longTeeth, true);
  // Sim.setDominance recomputes living rabbits
  const sim = new Simulation({ seedCode: 'DOM001', founders: [{ fur: 'Bb', ears: 'EE', teeth: 'tt' }, { fur: 'Bb', ears: 'EE', teeth: 'tt' }] });
  assert.equal(sim.rabbits[0].pheno.white, false);
  sim.setDominance('fur', 'b');
  assert.equal(sim.rabbits[0].pheno.white, true);
});

test('mutation rate: gametes flip at the configured rate, and never at zero', () => {
  const rng = new RNG(7); let m = 0; const N = 200000, rate = 0.006;
  for (let i = 0; i < N; i++) if (gamete('BB', 'fur', rng, rate).mutated) m++;
  assert.ok(Math.abs(m / N - rate) < 0.0008, `observed ${m / N}`);
  const r0 = new RNG(8);
  for (let i = 0; i < 5000; i++) assert.equal(gamete('BB', 'fur', r0, 0).mutated, false);
  assert.equal(normalize('b', 'B'), 'Bb');
});

test('determinism: same seed gives identical runs, different seed differs', () => {
  const run = (code) => {
    const s = new Simulation({ seedCode: code, env: { predators: 2, food: 80 } });
    s.advance(300);
    return JSON.stringify(s.history.records.map((r) => [r.pop, r.deaths, r.comp.alleles]));
  };
  assert.equal(run('SEED01'), run('SEED01'));
  assert.notEqual(run('SEED01'), run('SEED02'));
});

test('determinism does not depend on the frame step size', () => {
  const run = (dt) => { const s = new Simulation({ seedCode: 'FRAME1', env: { predators: 2 } }); s.advance(200, dt); return JSON.stringify(s.history.records.map((r) => r.comp.alleles)); };
  assert.equal(run(0.25), run(0.05));
});

test('every death records a cause and a generation', () => {
  const s = new Simulation({ seedCode: 'CAUSE1', env: { predators: 2, temp: -0.5, food: 40 } });
  s.advance(400);
  let dead = 0;
  for (const r of s.registry.values()) if (!r.alive) { dead++; assert.ok(CAUSES.includes(r.dyingCause), 'cause ' + r.dyingCause); assert.ok(Number.isInteger(r.diedGen)); }
  const histTotal = Object.values(s.history.totalDeaths()).reduce((a, b) => a + b, 0);
  assert.equal(histTotal, dead);
  const t = s.history.totalDeaths();
  assert.ok(t.predator > 0 && t.starved > 0 && t.old > 0, JSON.stringify(t));
});

// selection tests: a 50/50 founding population, huge food, one pressure at a time; compare death rates of the two phenotypes
function rate(sim, a, b, causes = CAUSES) {
  let na = 0, nb = 0, da = 0, db = 0;
  for (const r of sim.history.records) { na += r.traits[a].n; nb += r.traits[b].n; for (const c of causes) { da += r.traits[a].d[c] || 0; db += r.traits[b].d[c] || 0; } }
  return [da / na, db / nb];
}
const mixed = (gene, mut, norm) => [...founders(60, { [gene]: mut }), ...founders(60, { [gene]: norm })];

test('predation favours camouflage (brown on grass, white on snow)', () => {
  const pooled = (snow) => {
    let w = 0, b = 0;
    for (let i = 0; i < 6; i++) {
      const s = new Simulation({ seedCode: 'CAMO' + snow + i, founders: mixed('fur', 'bb', 'BB'), env: { food: 5000, predators: 5, snow }, mutationRate: 0 });
      s.advance(30);
      const [x, y] = rate(s, 'white', 'brown', ['predator']); w += x; b += y;
    }
    return [w, b];
  };
  let [w, b] = pooled(0);
  assert.ok(w > b * 1.8, `grass: white ${w} brown ${b}`);
  [w, b] = pooled(1);
  assert.ok(b > w * 1.8, `snow: white ${w} brown ${b}`);
});

test('cold favours short ears, heat favours long ears', () => {
  let s = new Simulation({ seedCode: 'COLD01', founders: mixed('ears', 'ee', 'EE'), env: { food: 5000, temp: -0.8 }, mutationRate: 0 });
  s.advance(40);
  let [l, sh] = rate(s, 'longEars', 'shortEars', ['cold']);
  assert.ok(l > sh * 3, `cold: long ${l} short ${sh}`);
  s = new Simulation({ seedCode: 'HEAT01', founders: mixed('ears', 'ee', 'EE'), env: { food: 5000, temp: 0.8 }, mutationRate: 0 });
  s.advance(40);
  [l, sh] = rate(s, 'longEars', 'shortEars', ['heat']);
  assert.ok(sh > l * 3, `heat: long ${l} short ${sh}`);
});

test('tough food favours long teeth', () => {
  const s = new Simulation({ seedCode: 'TOUGH1', founders: mixed('teeth', 'TT', 'tt'), env: { food: 5000, tough: 0.8 }, mutationRate: 0 });
  s.advance(40);
  const [lt, st] = rate(s, 'longTeeth', 'shortTeeth', ['starved']);
  assert.ok(st > lt * 2, `tough: long ${lt} short ${st}`);
});

test('long teeth cost a little when soft food is limited', () => {
  const s = new Simulation({ seedCode: 'COST01', founders: mixed('teeth', 'TT', 'tt'), env: { food: 60, tough: 0 }, mutationRate: 0 });
  s.advance(20);
  const [lt, st] = rate(s, 'longTeeth', 'shortTeeth', ['starved']);
  assert.ok(lt > st, `soft+limited: long ${lt} short ${st}`);
});

test('population never exceeds the cap of 600', () => {
  const s = new Simulation({ seedCode: 'CAP001', startPop: 40, env: { food: 100000 }, mutationRate: 0.01 });
  let max = 0;
  for (let i = 0; i < 400; i++) { s.step(1); max = Math.max(max, s.pop); }
  assert.ok(max <= P.CAP, 'max ' + max);
  assert.ok(max >= 550, 'should reach the cap, got ' + max);
});

test('planted mutation shows up in the next generation; bottleneck keeps >= 2', () => {
  const s = new Simulation({ seedCode: 'PLANT1', mutationRate: 0 });
  s.plantMutation('fur');
  s.advance(P.GEN_LEN);
  const ev = s.drainEvents().filter((e) => e.type === 'mutation');
  assert.equal(ev.length, 1); assert.equal(ev[0].planted, true); assert.equal(ev[0].allele, 'b');
  s.advance(100);
  s.bottleneck(0.9);
  assert.ok(s.pop >= 2);
});

test('lineage gives parents and grandparents', () => {
  const s = new Simulation({ seedCode: 'LINE01', env: { food: 500 } });
  s.advance(60);
  const kid = s.alive().find((r) => r.born >= 3);
  const tree = s.lineage(kid.id, 2);
  assert.equal(tree.parents.length, 2);
  assert.ok(tree.parents[0] && tree.parents[1]);
  assert.ok(tree.parents[0].parents[0]);
});
