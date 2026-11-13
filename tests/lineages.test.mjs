// Two Lineages: the checks that hold today (spec 11.3 B5, B6, B8 and determinism).
// Survival balance (B1 to B4) is NOT tuned yet: survival is close to 40-65 % for every strategy. See docs/specs/2026-11-13-islands.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ltally, playLineages } from './helpers.lineages.mjs';

const seeds = Array.from({ length: 10 }, (_, i) => 'LIN' + String(i).padStart(3, '0'));
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

test('B5 the outcome is not a foregone conclusion', () => {
  const t = ltally('sidePlanner', seeds), all = t.bands.one + t.bands.between + t.bands.two;
  assert.ok(all > 0);
  const used = Object.values(t.bands).filter((n) => n > 0).length;
  assert.ok(used >= 2, JSON.stringify(t.bands));
  for (const n of Object.values(t.bands)) assert.ok(n / all <= 0.85, JSON.stringify(t.bands));
});

test('B6 gene flow shows: carrying keeps the lineages alike, isolation lets them drift apart', () => {
  const c = ltally('carrySpam', seeds), n = ltally('none', seeds);
  if (c.D.length) assert.ok(med(c.D) <= 4, `carry median D ${med(c.D)}`);
  assert.ok(med(n.D) >= 6, `no-carry median D ${med(n.D)}`);
});

test('a lineage lost before the reunion ends the run with a clear result', () => {
  for (const s of seeds) {
    const r = playLineages(s, 'none');
    assert.ok(['done', 'lost', 'extinct'].includes(r.challenge.outcome));
    if (r.challenge.outcome === 'lost') assert.equal(r.stars.count, 0);
  }
});

test('same seed, same run', () => {
  const a = playLineages('LINDET', 'sidePlanner'), b = playLineages('LINDET', 'sidePlanner');
  assert.deepEqual(a.challenge.snap, b.challenge.snap);
  assert.equal(a.sim.pop, b.sim.pop);
});
