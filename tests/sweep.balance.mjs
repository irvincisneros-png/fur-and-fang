// `npm run balance`: the balance targets over 40 seeds (AUD000-AUD039), then 80 fresh seeds as a check against over-fitting.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkTargets, balanceSeeds } from './helpers.mjs';

for (const [name, seeds, slack] of [['40 seeds (AUD)', balanceSeeds(40), 0], ['80 fresh seeds (QQQ)', balanceSeeds(80, 'QQQ'), 0.05]]) {
  test(`balance sweep: ${name}`, () => {
    for (const [ok, msg] of checkTargets(seeds, slack)) { console.log(`# ${ok ? 'ok  ' : 'FAIL'} ${msg}`); assert.ok(ok, msg); }
  });
}
