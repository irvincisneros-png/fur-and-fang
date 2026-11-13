// `npm run balance`: the Two Lineages targets (spec 11.3) over 40 seeds (AUD000-AUD039), then 40 fresh seeds (QQQ) with 5 points of slack
// as a check against over-fitting. Prints a table per sample.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkLineageTargets, lineageSeeds, lineageTable } from './helpers.lineages.mjs';

for (const [name, seeds, slack] of [['40 seeds (AUD)', lineageSeeds(40), 0], ['40 fresh seeds (QQQ)', lineageSeeds(40, 'QQQ'), 0.05]]) {
  test(`lineages balance sweep: ${name}`, () => {
    const T = lineageTable(seeds);
    for (const [k, v] of Object.entries(T)) console.log(`# ${k.padEnd(12)} both alive ${Math.round(v.alive * 100)}%  labels ${JSON.stringify(v.bands)}  median D ${v.medD}  stars ${JSON.stringify(v.stars)}`);
    for (const [ok, msg] of checkLineageTargets(seeds, slack)) { console.log(`# ${ok ? 'ok  ' : 'FAIL'} ${msg}`); assert.ok(ok, msg); }
  });
}
