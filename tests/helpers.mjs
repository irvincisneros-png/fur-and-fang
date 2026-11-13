import { createSurvive } from '../src/sim/challenge.js';
import { P } from '../src/sim/params.js';

// ---------- benchmark players ----------
// Each takes a Challenge and returns act(), which the runner calls once a second of sim time (a student clicking about that often).

// The warren the most rabbits are near: where a student looking at the valley would put a patch.
function busiestBurrow(sim) {
  let best = sim.burrows[0], bn = -1;
  for (const b of sim.burrows) {
    let n = 0; for (const r of sim.rabbits) if (r.alive && (r.x - b.x) ** 2 + (r.z - b.z) ** 2 < 100) n++;
    if (n > bn) { bn = n; best = b; }
  }
  return best;
}

// Knows the whole schedule in advance (more than the forecast strip shows). Kept as an upper bound.
export function sensiblePlayer(ch) {
  const sim = ch.sim;
  const w = Object.fromEntries(ch.windows.map((x) => [x.id, x]));
  const gensTo = (id) => (w[id].start - sim.t) / P.GEN_LEN;
  return () => {
    const g = gensTo;
    const t = sim.t, ready = !ch.cooldown('translocate');
    if (ready) {
      if (g('winter') > 0 && g('winter') < 14) ch.translocate('alpine');
      else if (t >= w.thaw.start && g('drought') > 0) ch.translocate('desert');
      else if (t >= w.calm.start && g('winter2') > 0 && g('winter2') < 14) ch.translocate('alpine');
      else if (g('finale') > 0 && g('finale') < 6) ch.translocate('river');
    }
    if (sim.env.predators > 0 && sim.pop < 90 && ch.trust >= 16 && !ch.canAct('shelter')) { const b = busiestBurrow(sim); ch.shelter(b.x, b.z); }
    if (sim.env.food < P.FOOD_BASE * 0.8 && ch.trust >= 14 && !ch.canAct('clover')) { const b = busiestBurrow(sim); ch.clover(b.x, b.z); }
    if (sim.env.predators >= 4 && sim.pop < 80 && ch.trust >= 20 && !ch.canAct('fence')) ch.fence();
  };
}

// What each announced change calls for, in the words of its forecast line and the source cards.
const SOURCE_FOR = { winter: 'alpine', winter2: 'alpine', thaw: 'desert', drought: 'desert', finale: 'river' };

// Forecast-only planner: uses ONLY what the HUD shows. ch.forecast() is exactly the forecast strip (current phase, next and
// later change, with the displayed rough or countdown time); beyond that it reads the rabbit count, the trust total, the fox
// count and whether a button is enabled.
export function forecastPlayer(ch) {
  const sim = ch.sim;
  return () => {
    const f = ch.forecast();
    // Which change to get ready for: the next one once it is within about two minutes (recessive alleles need a head start),
    // otherwise the one the valley is in now. Foxes need no new allele, so look past them to the change after.
    let src = null;
    if (f.next && SOURCE_FOR[f.next.id] && (f.next.sec <= 120 || !SOURCE_FOR[f.current.id])) src = SOURCE_FOR[f.next.id];
    else if (f.next && !SOURCE_FOR[f.next.id] && f.later) src = SOURCE_FOR[f.later.id];
    else src = SOURCE_FOR[f.current.id] || null;
    if (src && !ch.canAct('translocate')) ch.translocate(src);
    const foxes = sim.predators.length;
    // habitat tools with what is left over, keeping enough back for the next translocation
    const spare = ch.trust - P.COST.translocate;
    if (f.current.id === 'drought' && spare >= P.COST.clover && !ch.canAct('clover')) { const b = busiestBurrow(sim); ch.clover(b.x, b.z); }
    else if (foxes > 0 && sim.pop < 30 && spare >= P.COST.fence && !ch.canAct('fence')) ch.fence();
    else if (foxes > 0 && sim.pop < 60 && spare >= P.COST.shelter + 4 && !ch.canAct('shelter')) { const b = busiestBurrow(sim); ch.shelter(b.x, b.z); }
  };
}

// Panicky spender: no plan, never looks ahead. Spends the moment a button lights up, reacting to what is on screen right now.
export function panickyPlayer(ch) {
  const sim = ch.sim;
  return () => {
    const cur = ch.forecast().current.id;
    const src = sim.env.snow > 0.3 ? 'alpine' : cur === 'drought' ? 'desert' : 'river';
    if (!ch.canAct('translocate')) ch.translocate(src);
    if (!ch.canAct('clover')) { const b = busiestBurrow(sim); ch.clover(b.x, b.z); }
  };
}

const spam = (fn) => (ch) => () => fn(ch, ch.sim);
export const STRATEGIES = {
  none: () => () => {},
  panicky: panickyPlayer,
  forecast: forecastPlayer,
  spamRiver: spam((ch) => ch.translocate('river')),
  spamAlpine: spam((ch) => ch.translocate('alpine')),
  spamDesert: spam((ch) => ch.translocate('desert')),
  spamClover: spam((ch, sim) => { if (!ch.canAct('clover')) { const b = busiestBurrow(sim); ch.clover(b.x, b.z); } }),
  spamShelter: spam((ch, sim) => { if (!ch.canAct('shelter')) { const b = busiestBurrow(sim); ch.shelter(b.x, b.z); } }),
  spamFence: spam((ch) => ch.fence()),
  lowPop: spam((ch, sim) => { if (sim.pop < 8) ch.translocate('river'); }),
  lateRescue: spam((ch, sim) => { if (sim.pop < 10 && sim.genT >= 9) ch.translocate('river'); }),
  sensible: sensiblePlayer,
};
export const SINGLE_ACTION_SPAM = ['spamRiver', 'spamAlpine', 'spamDesert', 'spamClover', 'spamShelter', 'spamFence'];
export const STRATEGY_LABEL = {
  none: 'Do nothing', panicky: 'Panicky spender', forecast: 'Forecast-only planner', spamRiver: 'Spam River forest', spamAlpine: 'Spam Alpine ridge',
  spamDesert: 'Spam Desert flats', spamClover: 'Spam clover', spamShelter: 'Spam brush shelter', spamFence: 'Spam fox fence',
  lowPop: 'Translocate only below 8 rabbits', lateRescue: 'Rescue below 10 just before the boundary', sensible: 'Schedule-aware player (knows more than the HUD)',
};

export function playRun(seedCode, strategy = 'none') {
  const { sim, challenge } = createSurvive({ seedCode });
  const act = (STRATEGIES[strategy] || STRATEGIES.none)(challenge);
  while (!sim.ended) { act(); sim.advance(1); }
  return { sim, challenge, survived: challenge.outcome === 'survived', stars: challenge.stars() };
}

export const balanceSeeds = (n = 40, prefix = 'AUD') => Array.from({ length: n }, (_, i) => prefix + String(i).padStart(3, '0'));

// {survived, stars:[n0,n1,n2,n3]} for one strategy over a list of seeds.
export function tally(strategy, seeds) {
  const out = { survived: 0, stars: [0, 0, 0, 0], n: seeds.length };
  for (const s of seeds) { const r = playRun(s, strategy); if (r.survived) out.survived++; out.stars[r.stars.count]++; }
  return out;
}
