// Two Lineages: the balance targets (spec 11.3 B1 to B6) on a few seeds with wide slack, plus determinism and the lost-lineage ending.
// `npm run balance` checks the same targets over 40 seeds (AUD) and then 40 fresh seeds (QQQ) with a tight slack.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playLineages, checkLineageTargets, lineageSeeds, cachedTally } from './helpers.lineages.mjs';

const seeds = lineageSeeds(12, 'LIN');

test('balance targets B1 to B6 hold on a small sample (wide slack: the full sweep is `npm run balance`)', () => {
  for (const [ok, msg] of checkLineageTargets(seeds, 0.2)) assert.ok(ok, msg);
});

test('a lineage lost before the reunion ends the run with a clear result', () => {
  for (const s of seeds) {
    const r = playLineages(s, 'none');
    assert.ok(['done', 'lost', 'extinct'].includes(r.challenge.outcome));
    if (r.challenge.outcome === 'lost') { assert.equal(r.stars.count, 0); assert.ok(r.challenge.result.t < 480); }
  }
});

test('the forecast reader beats doing nothing on the same seeds', () => {
  const a = cachedTally('sidePlanner', seeds), n = cachedTally('none', seeds);
  assert.ok(a.alive >= n.alive + 3, `planner ${a.alive} vs nothing ${n.alive} of ${seeds.length}`);
});

test('same seed, same run', () => {
  const a = playLineages('LINDET', 'sidePlanner'), b = playLineages('LINDET', 'sidePlanner');
  assert.deepEqual(a.challenge.snap, b.challenge.snap);
  assert.equal(a.sim.pop, b.sim.pop);
});
