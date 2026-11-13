// The Islands update must not change Explore, Survive or Tutorial runs by a single random draw.
// Recorded on the code before Islands (commit 43d7de2) with `node tools/golden.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { goldenRuns } from '../tools/golden.mjs';

const RECORDED = { explore: '96f28eefc587cf06', survive: '97893e48051c6889', tutorial: 'fbb74528690599e3' };

test('classic modes replay exactly as before Islands', () => {
  assert.deepEqual(goldenRuns(), RECORDED);
});
