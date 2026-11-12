import { createSurvive } from '../src/sim/challenge.js';
import { P } from '../src/sim/params.js';

// A player who knows the schedule: gene flow in good time before each change, and uses habitat tools.
export function sensiblePlayer(ch) {
  const sim = ch.sim;
  const w = Object.fromEntries(ch.windows.map((x) => [x.id, x]));
  const gensTo = (id) => (w[id].start - sim.t) / P.GEN_LEN;
  return () => {
    const g = gensTo;
    // gene flow in good time before each change: Alpine whites before a winter, Desert long ears/teeth before the drought
    const t = sim.t, ready = !ch.cooldown('translocate');
    if (ready) {
      if (g('winter') > 0 && g('winter') < 14) ch.translocate('alpine');
      else if (t >= w.thaw.start && g('drought') > 0) ch.translocate('desert');
      else if (t >= w.calm.start && g('winter2') > 0 && g('winter2') < 14) ch.translocate('alpine');
      else if (g('finale') > 0 && g('finale') < 6) ch.translocate('river');
    }
    const ph = sim.rabbits.filter((r) => r.alive);
    if (sim.env.predators > 0 && ph.length < 90 && ch.trust >= 16 && !ch.canAct('shelter')) {
      const b = sim.burrows[sim.gen % sim.burrows.length]; ch.shelter(b.x, b.z);
    }
    if (sim.env.food < P.FOOD_BASE * 0.8 && ch.trust >= 14 && !ch.canAct('clover')) { const b = sim.burrows[(sim.gen + 2) % sim.burrows.length]; ch.clover(b.x, b.z); }
    if (sim.env.predators >= 4 && ph.length < 80 && ch.trust >= 20 && !ch.canAct('fence')) ch.fence();
  };
}

export function playRun(seedCode, strategy) {
  const { sim, challenge } = createSurvive({ seedCode });
  const act = strategy === 'sensible' ? sensiblePlayer(challenge) : null;
  while (!sim.ended) {
    if (act) act();
    sim.advance(P.GEN_LEN);
  }
  return { sim, challenge, survived: challenge.outcome === 'survived' };
}
