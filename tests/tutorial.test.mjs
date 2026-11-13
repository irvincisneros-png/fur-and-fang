import test from 'node:test';
import assert from 'node:assert/strict';
import { createTutorial, TUTORIAL_SCENES, TUTORIAL_MIN_POP } from '../src/sim/tutorial.js';
import { createSurvive } from '../src/sim/challenge.js';
import { P } from '../src/sim/params.js';

const furCounts = (sim) => { const n = { BB: 0, Bb: 0, bb: 0 }; for (const r of sim.rabbits) if (r.alive) n[r.genotype.fur]++; return n; };

test('tutorial: starts in a calm meadow with mixed brown and white rabbits and hidden carriers', () => {
  const { sim, challenge: ch } = createTutorial();
  assert.equal(ch.tutorial, true);
  assert.equal(sim.pop, 24);
  const n = furCounts(sim), comp = sim.composition();
  assert.ok(n.BB >= 2 && n.Bb >= 2 && n.bb >= 2);
  assert.ok(comp.white >= 6 && comp.brown >= 6);
  assert.equal(sim.env.snow, 0); assert.equal(sim.env.predators, 0); assert.equal(sim.predators.length, 0);
  assert.equal(ch.forecast().next, null);
  sim.advance(P.GEN_LEN * 2);
  assert.equal(sim.history.totalDeaths().predator, 0);
});

test('tutorial: the hunt scene brings snow and foxes, and foxes catch more brown rabbits than white', () => {
  const { sim, challenge: ch } = createTutorial();
  sim.advance(13);
  assert.equal(ch.setScene('nope'), false);
  assert.equal(ch.setScene('hunt'), true);
  const g0 = sim.gen;
  sim.advance(5);
  assert.ok(Math.abs(sim.env.snow - TUTORIAL_SCENES.hunt.env.snow) < 1e-9);
  sim.advance(P.GEN_LEN * 4);
  assert.equal(sim.predators.length, 3);
  const c = ch.caughtSince(g0);
  assert.ok(c.brown + c.white >= 6, `only ${c.brown + c.white} caught`);
  assert.ok(c.brown > c.white * 1.5, `brown ${c.brown} vs white ${c.white}`);
  assert.deepEqual(ch.caughtSince(), c);     // defaults to the generation the scene began in
});

test('tutorial: never ends or dies out, and always keeps carriers to find', () => {
  const { sim, challenge: ch } = createTutorial();
  ch.setScene('hunt');
  for (let g = 0; g < 120; g++) {
    sim.advance(P.GEN_LEN);
    assert.ok(!sim.ended && !sim.extinct, `ended at generation ${sim.gen}`);
  }
  assert.ok(sim.t > P.SURVIVE_SECONDS);     // well past the Survive time limit
  ch.sustain();
  const n = furCounts(sim);
  assert.ok(n.BB >= 2 && n.Bb >= 2 && n.bb >= 2);
  assert.ok(sim.pop >= TUTORIAL_MIN_POP && sim.pop <= P.CAP);
});

test('tutorial: the cold front is forecast 20 s ahead, then arrives and is announced', () => {
  const { sim, challenge: ch } = createTutorial();
  ch.setScene('calm'); sim.advance(6); sim.drainEvents();
  ch.setScene('front');
  const f = ch.forecast();
  assert.equal(f.next.announce, 'Cold front: snow arriving');
  assert.ok(Math.abs(f.inSec - P.FORECAST_LEAD) < 1e-6);
  assert.equal(f.current.label, 'Calm spell');
  sim.advance(10);
  assert.ok(sim.env.snow < 0.05);            // nothing changes until the forecast runs out
  assert.equal(sim.drainEvents().filter((e) => e.type === 'phase').length, 0);
  sim.advance(30);
  assert.ok(sim.env.snow > 0.85);
  const ph = sim.drainEvents().filter((e) => e.type === 'phase');
  assert.equal(ph.length, 1); assert.equal(ph[0].label, 'Cold front');
  assert.equal(ch.forecast().next, null);
});

test('tutorial: trust is granted by the script and ranger tools have no cooldown', () => {
  const { sim, challenge: ch } = createTutorial();
  assert.equal(ch.trust, 0);
  assert.equal(ch.translocate('alpine').ok, false);
  assert.equal(ch.grantTrust(P.TUTORIAL.translocateCost), P.TUTORIAL.translocateCost);
  const pop = sim.pop;
  assert.equal(ch.translocate('alpine').ok, true);
  assert.equal(sim.pop, pop + P.TUTORIAL.translocateCount);   // the tutorial's newcomers arrive at once
  ch.grantTrust(P.TUTORIAL.translocateCost);
  assert.equal(ch.translocate('river').ok, true);
  ch.grantTrust(P.COST.shelter);
  assert.equal(ch.shelter(5, 5).ok, true);
  assert.deepEqual(ch.log.map((l) => l.action), ['translocate', 'translocate', 'shelter']);
  assert.equal(ch.grantTrust(1), ch.trust);  // never lowers the budget
});

test('tutorial: building one leaves Survive 15:00 exactly as it was', () => {
  const run = () => { const { sim, challenge } = createSurvive({ seedCode: 'TUTOR1' }); sim.advance(P.GEN_LEN * 6); return JSON.stringify([challenge.windows, challenge.trust, sim.pop, sim.composition()]); };
  const before = run();
  const t = createTutorial(); t.challenge.setScene('hunt'); t.sim.advance(P.GEN_LEN * 3);
  assert.equal(run(), before);
  const { sim, challenge } = createSurvive({ seedCode: 'TUTOR1' });
  assert.equal(challenge.tutorial, undefined);
  assert.equal(sim.pop, P.SURVIVE_START_POP);
  assert.equal(challenge.cooldown('translocate'), 0);
  challenge.translocate('alpine');
  assert.equal(challenge.cooldown('translocate'), P.COOLDOWN_GENS.translocate);
});
