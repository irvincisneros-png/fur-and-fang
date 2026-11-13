// Tutorial valley: a small scripted Survive-style run. Pure logic (no DOM). It is built by createTutorial() only,
// so Survive 15:00 (createSurvive) and its balance are untouched.
//   challenge.setScene(name)      switch the valley to one of TUTORIAL_SCENES (eased; a scene with `delay` is forecast first)
//   challenge.caughtSince(gen)    {brown, white} rabbits caught by foxes from that generation on
//   challenge.grantTrust(n)       top the trust budget up to n
//   challenge.sustain()           keep the warren big and varied enough to teach with (runs every generation)
import { P } from './params.js';
import { Simulation } from './sim.js';
import { Challenge } from './challenge.js';

const FOREVER = 1e9;
const ENV_KEYS = ['snow', 'temp', 'food', 'tough', 'predators'];
const F = P.FOOD_BASE;

export const TUTORIAL_SEED = 'TUTOR1';
export const TUTORIAL_MIN_POP = 12;
export const TUTORIAL_SCENES = {
  meadow: { label: 'Spring meadow', icon: '\u{1F331}', color: '#b9d98a', ramp: 2, env: { snow: 0, temp: 0, food: F, tough: 0, predators: 0 } },
  hunt: { label: 'Snow and foxes', icon: '\u{1F98A}', color: '#a9cbe8', ramp: 3, env: { snow: 0.92, temp: -0.1, food: F, tough: 0, predators: 3 } },
  calm: { label: 'Calm spell', icon: '\u{1F33F}', color: '#d8e6b0', ramp: 4, env: { snow: 0, temp: 0, food: F, tough: 0, predators: 1 } },
  front: { label: 'Cold front', icon: '❄️', color: '#a9cbe8', delay: P.FORECAST_LEAD, ramp: 15, announce: 'Cold front: snow arriving',
    tip: 'Snow is settling. White fur hides on snow; brown fur stands out.', env: { snow: 0.9, temp: -0.5, food: F, tough: 0, predators: 2 } },
};

// 24 founders, all short ears and short teeth: 6 BB, 8 Bb (brown carriers) and 10 bb (white), mixed across the warrens.
const FUR_ORDER = ['Bb', 'bb', 'BB', 'bb', 'Bb', 'bb', 'BB', 'Bb', 'bb', 'BB', 'Bb', 'bb'];
export const tutorialFounders = () => [...FUR_ORDER, ...FUR_ORDER].map((fur) => ({ fur, ears: 'EE', teeth: 'tt' }));

export class TutorialChallenge extends Challenge {
  constructor(sim) {
    super(sim);
    this.tutorial = true; this.trust = 0; this.scene = null; this.sceneGen = 0; this.sceneT = 0;
    this.setScene('meadow');
    for (const k of ENV_KEYS) this.tracks[k] = [[0, TUTORIAL_SCENES.meadow.env[k]]];     // the opening scene starts settled
    this.applyEnv(sim);
  }

  setScene(name) {
    const sc = TUTORIAL_SCENES[name]; if (!sc) return false;
    const sim = this.sim, t = sim.t, e = sim.env, d = sc.delay || 0, r = sc.ramp ?? 3;
    for (const k of ENV_KEYS) {
      const to = sc.env[k] ?? e[k];
      this.tracks[k] = d ? [[t, e[k]], [t + d, e[k]], [t + d + r, to]] : [[t, e[k]], [t + r, to]];
    }
    const win = { id: 'tut-' + name, label: sc.label, icon: sc.icon, color: sc.color, tip: sc.tip || '' };
    if (d) {            // forecast first: the strip counts down, then the valley changes and the phase is announced
      const cur = this.scene ? this.windowAt(t) : { id: 'tut-start', label: 'Calm', icon: '', color: '#d8e6b0' };
      this.windows = [{ ...cur, announce: undefined, start: 0, end: t + d }, { ...win, announce: sc.announce, start: t + d, end: FOREVER }];
      this.phaseId = cur.id;
    } else { this.windows = [{ ...win, start: 0, end: FOREVER }]; this.phaseId = win.id; }
    this.scene = name; this.sceneGen = sim.gen; this.sceneT = t;
    this.applyEnv(sim);
    return true;
  }

  onGenStart(sim) {               // no 15:00 limit here: the tutorial ends when the student finishes the steps
    if (sim.gen > 0) this.trust += P.TRUST_PER_GEN;
    this.sustain();
  }

  // Top the warren up so the lesson cannot dead-end: enough rabbits, and always some BB, Bb and bb to find.
  sustain() {
    const sim = this.sim, n = { BB: 0, Bb: 0, bb: 0 }, added = [];
    for (const r of sim.rabbits) if (r.alive) n[r.genotype.fur]++;
    const add = (fur) => { const home = sim.mrng.int(sim.burrows.length), b = sim.burrows[home]; n[fur]++; added.push(sim.spawn({ fur, ears: 'EE', teeth: 'tt' }, { age: 1, x: b.x + sim.mrng.range(-4, 4), z: b.z + sim.mrng.range(-4, 4), home }).id); };
    for (const fur of ['BB', 'Bb', 'bb']) while (n[fur] < 2) add(fur);
    for (let i = 0; n.BB + n.Bb + n.bb < TUTORIAL_MIN_POP; i++) add(['Bb', 'bb', 'BB'][i % 3]);
    return added;
  }

  caughtSince(gen = this.sceneGen) {
    const out = { brown: 0, white: 0 };
    for (const r of this.sim.history.records) if (r.gen >= gen) { out.brown += r.traits.brown.d.predator || 0; out.white += r.traits.white.d.predator || 0; }
    return out;
  }

  // Small, immediate translocations so each lesson step shows its result at once.
  costOf(action) { return action === 'translocate' ? P.TUTORIAL.translocateCost : P.COST[action]; }
  get translocateCount() { return P.TUTORIAL.translocateCount; }
  arrive(genotypes, source) { return this.sim.addAdults(genotypes, source).length; }

  grantTrust(n) { this.trust = Math.max(this.trust, n); return this.trust; }
  cooldown() { return 0; }        // the student uses each tool once or twice, back to back
}

export function createTutorial(opts = {}) {
  let challenge;
  const sim = new Simulation({
    seedCode: TUTORIAL_SEED, ...opts, mode: 'survive', founders: tutorialFounders(), mutationRate: 0, kitsFixed: 1,
    setup: (s) => { challenge = new TutorialChallenge(s); },
  });
  return { sim, challenge };
}
