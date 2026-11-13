import test from 'node:test';
import assert from 'node:assert/strict';
import { createSurvive } from '../src/sim/challenge.js';
import { P } from '../src/sim/params.js';
import { playRun, checkTargets } from './helpers.mjs';

const FAST = Array.from({ length: 20 }, (_, i) => 'BAL' + String(i).padStart(3, '0'));

test('balance (20 seeds): doing nothing fails, reading the forecast wins, no single button wins, panicking is mediocre', () => {
  // slack of 0.1 = two seeds either way on a sample this small; the 40-seed sweep is held to the exact targets
  for (const [ok, msg] of checkTargets(FAST, 0.1)) { console.log(`# ${ok ? 'ok' : 'FAIL'}: ${msg}`); assert.ok(ok, msg); }
});

test('balance: the forecast-only planner reads only what the strip shows', () => {
  const { challenge: ch } = createSurvive({ seedCode: 'CHAL01' });
  const f = ch.forecast();
  assert.deepEqual(Object.keys(f).sort(), ['current', 'inSec', 'later', 'next']);
  for (const k of ['id', 'label', 'icon', 'announce', 'soon', 'sec', 'text']) assert.ok(f.next && k in f.next, k);
});

test('challenge: forecast shows the next and the later change, exact only inside the last 20 s', () => {
  const { sim, challenge: ch } = createSurvive({ seedCode: 'CHAL01' });
  const ann = ch.windows.filter((w) => w.announce);
  const f0 = ch.forecast(0);
  assert.equal(f0.next.id, ann[0].id); assert.equal(f0.later.id, ann[1].id);
  assert.equal(f0.next.soon, false); assert.match(f0.next.text, /^in about /);
  assert.equal(f0.inSec, null);
  const winter = ch.windows.find((w) => w.id === 'winter');
  const f = ch.forecast(winter.start - 15);
  assert.equal(f.next.id, 'winter'); assert.equal(f.next.soon, true); assert.equal(f.next.sec, 15); assert.equal(f.inSec, 15);
  assert.equal(ch.forecast(ch.windows[ch.windows.length - 1].start + 1).next, null);
  assert.ok(sim);
});

test('challenge: trust and cooldowns are enforced, and newcomers arrive at the next generation', () => {
  const { sim, challenge: ch } = createSurvive({ seedCode: 'CHAL01' });
  assert.equal(ch.trust, P.TRUST_START);
  assert.equal(ch.translocate('alpine').ok, true);
  assert.equal(ch.trust, P.TRUST_START - P.COST.translocate);
  assert.equal(ch.translocate('desert').ok, false); // cooldown (and trust)
  assert.equal(sim.pop, P.SURVIVE_START_POP);       // nobody arrives mid-generation
  sim.drainEvents();
  sim.advance(P.GEN_LEN - sim.genT + 0.01);
  assert.equal(sim.drainEvents().find((e) => e.type === 'arrive').ids.length, P.TRANSLOCATE_COUNT);
  sim.advance(P.GEN_LEN * 3);
  assert.ok(ch.trust > P.TRUST_START - P.COST.translocate);
  assert.ok(ch.report().sentences.length === 3);
});

test('translocation: the 600 cap is checked before trust is spent, and a partial group is reported', () => {
  const { challenge: c1 } = createSurvive({ seedCode: 'CAP002' });
  // fill the valley in a throwaway sim by hand: 598 live rabbits leave room for two
  const sim = c1.sim;
  while (sim.liveN < P.CAP - 2) sim.spawn({ fur: 'BB', ears: 'EE', teeth: 'tt' }, { age: 1, silent: true });
  const before = c1.trust;
  const res = c1.translocate('river');
  assert.equal(res.ok, true); assert.equal(res.count, 2); assert.equal(res.partial, true);
  assert.equal(c1.trust, before - P.COST.translocate);
  c1.sim.advance(P.GEN_LEN - c1.sim.genT + 0.01);
  assert.ok(sim.liveN <= P.CAP);
  const { challenge: c2 } = createSurvive({ seedCode: 'CAP003' });
  while (c2.sim.liveN < P.CAP) c2.sim.spawn({ fur: 'BB', ears: 'EE', teeth: 'tt' }, { age: 1, silent: true });
  const t2 = c2.trust, r2 = c2.translocate('river');
  assert.equal(r2.ok, false); assert.match(r2.reason, /full/); assert.equal(c2.trust, t2);
});

test('challenge: schedule is identical per seed and different across seeds', () => {
  const a = createSurvive({ seedCode: 'SCHED1' }).challenge.windows.map((w) => w.start).join();
  const b = createSurvive({ seedCode: 'SCHED1' }).challenge.windows.map((w) => w.start).join();
  const c = createSurvive({ seedCode: 'SCHED2' }).challenge.windows.map((w) => w.start).join();
  assert.equal(a, b); assert.notEqual(a, c);
});

test('fence: reads "starts next generation" until it bites, and halves the foxes (rounded) once it does', () => {
  const { sim, challenge: ch } = createSurvive({ seedCode: 'FENCE1' });
  sim.advance(ch.windows.find((w) => w.id === 'foxes').start + 30 - sim.t);   // some foxes are about
  ch.trust = 50;
  const before = sim.predators.length;
  assert.ok(before >= 1);
  assert.equal(ch.fence().ok, true);
  assert.equal(ch.fencePending, true); assert.equal(ch.fenceActive, false);
  assert.equal(sim.predators.length, before);                                  // nothing has changed yet
  sim.advance(P.GEN_LEN - sim.genT + 0.01);
  assert.equal(ch.fenceActive, true); assert.equal(ch.fencePending, false);
  assert.ok(sim.predators.length <= Math.round(sim.env.predators * 0.5) + 0);
});

test('report: sentences, stars and bands for a finished run', () => {
  const r = playRun('REP001', 'forecast');
  const rep = r.challenge.report();
  assert.equal(rep.sentences.length, 3);
  assert.equal(rep.questions.length, 3);
  assert.ok(rep.stars.count >= 0 && rep.stars.count <= 3);
  assert.ok(/survived|Extinct/.test(rep.headline));
});

test('report: event death bars add up to every death exactly once (by timestamp)', () => {
  for (const s of ['AUD000', 'AUD002']) {
    const r = playRun(s, 'none'), rep = r.challenge.report();
    const sum = rep.deathsByWindow.reduce((n, w) => n + Object.values(w.deaths).reduce((a, b) => a + b, 0), 0);
    assert.equal(sum, r.sim.history.deathLog.length);
    assert.equal(sum, Object.values(r.sim.history.totalDeaths()).reduce((a, b) => a + b, 0));
  }
});

test('report: separates observed change from evidence, names gene flow and drift, and never blames a missing allele unchecked', () => {
  let sawFlow = false, sawEvidence = false;
  for (const [s, k] of [['AUD001', 'forecast'], ['AUD002', 'none'], ['AUD003', 'panicky'], ['AUD000', 'none']]) {
    const r = playRun(s, k), rep = r.challenge.report();
    for (const t of rep.sentences) {
      assert.ok(!/because (the|a) (needed )?allele/i.test(t) && !/nothing to work with/.test(t), t);
      assert.ok(!/ended to |rabbits suffered/.test(t), t);
      if (/^From generation \d+ to \d+/.test(t)) { assert.match(t, /(rose|fell) from \d+% to \d+%/); if (/consistent with selection|not evidence of selection/.test(t)) sawEvidence = true; }
      if (/translocated rabbits joined/.test(t)) sawFlow = true;
    }
  }
  assert.ok(sawFlow, 'a run with translocations mentions gene flow');
  assert.ok(sawEvidence, 'a change comes with an evidence sentence');
});
