import test from 'node:test';
import assert from 'node:assert/strict';
import { createSurvive } from '../src/sim/challenge.js';
import { P } from '../src/sim/params.js';
import { playRun } from './helpers.mjs';

const SEEDS = Array.from({ length: 20 }, (_, i) => 'BAL' + String(i).padStart(3, '0'));

test('balance: a do-nothing ranger usually goes extinct (>= 60 % of 20 seeds)', () => {
  let ext = 0; for (const s of SEEDS) if (!playRun(s, 'none').survived) ext++;
  console.log(`# do-nothing: extinct ${ext}/20 (${ext * 5}%)`);
  assert.ok(ext >= 12, `extinct only ${ext}/20`);
});

test('balance: a sensible ranger usually survives (>= 80 % of 20 seeds)', () => {
  let ok = 0; for (const s of SEEDS) if (playRun(s, 'sensible').survived) ok++;
  console.log(`# sensible: survived ${ok}/20 (${ok * 5}%)`);
  assert.ok(ok >= 16, `survived only ${ok}/20`);
});

test('challenge: forecast appears 20 s ahead, trust and cooldowns are enforced', () => {
  const { sim, challenge: ch } = createSurvive({ seedCode: 'CHAL01' });
  const winter = ch.windows.find((w) => w.id === 'winter');
  assert.equal(ch.forecast(winter.start - 30).next, null);
  assert.equal(ch.forecast(winter.start - 15).next.id, 'winter');
  assert.equal(ch.trust, P.TRUST_START);
  assert.equal(ch.translocate('alpine').ok, true);
  assert.equal(ch.trust, P.TRUST_START - P.COST.translocate);
  assert.equal(ch.translocate('desert').ok, false); // cooldown (and trust)
  assert.equal(sim.pop, P.SURVIVE_START_POP + 2);
  sim.advance(P.GEN_LEN * 3);
  assert.ok(ch.trust > P.TRUST_START - P.COST.translocate);
  assert.ok(ch.report().sentences.length === 3);
});

test('challenge: schedule is identical per seed and different across seeds', () => {
  const a = createSurvive({ seedCode: 'SCHED1' }).challenge.windows.map((w) => w.start).join();
  const b = createSurvive({ seedCode: 'SCHED1' }).challenge.windows.map((w) => w.start).join();
  const c = createSurvive({ seedCode: 'SCHED2' }).challenge.windows.map((w) => w.start).join();
  assert.equal(a, b); assert.notEqual(a, c);
});

test('report: sentences, stars and bands for a finished run', () => {
  const r = playRun('REP001', 'sensible');
  const rep = r.challenge.report();
  assert.equal(rep.sentences.length, 3);
  assert.equal(rep.questions.length, 3);
  assert.ok(rep.stars.count >= 0 && rep.stars.count <= 3);
  assert.ok(/survived|Extinct/.test(rep.headline));
});
