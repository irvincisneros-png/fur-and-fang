// Survive 15:00: scheduled valley events, forecast, ranger actions, stars and the run report.
import { P } from './params.js';
import { RNG } from './rng.js';
import { Simulation } from './sim.js';
import { drawGenotype, GENE_INFO } from './genetics.js';
import { alleleFreq, allelesPresent, meanHeterozygosity, composition, CAUSES, ALLELES } from './history.js';

const lerp = (a, b, t) => a + (b - a) * t;
export function track(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) { const [t0, v0] = keys[i - 1], [t1, v1] = keys[i]; return t1 === t0 ? v1 : lerp(v0, v1, (t - t0) / (t1 - t0)); }
  }
  return keys[keys.length - 1][1];
}

// 30 -> '30 s', 90 -> '1½ min', 120 -> '2 min'
export function roughTime(sec) {
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60), half = sec % 60 >= 30;
  return `${m}${half ? '½' : ''} min`;
}

export const REFLECTION = [
  'Pick one event from the run. Which allele helped the warren survive it, and why did that allele help in that environment?',
  'Mutations are random: they did not appear because the warren needed them. How did gene flow (translocation) or lucky mutations give the warren variation before each change arrived? What happens when the variation is missing?',
  'After the thaw, white fur went from helpful to harmful. What does this tell you about whether a trait is simply "good" or "bad"?',
];

export class Challenge {
  constructor(sim) {
    this.sim = sim;
    const rng = new RNG((sim.seed ^ 0x9e3779b9) >>> 0);
    this.rng = new RNG((sim.seed ^ 0x51ed270b) >>> 0);  // translocation draws
    const j = () => rng.int(13) - 6;                    // +/- 6 s jitter, same every run for a seed
    const tF = 120 + j(), tW = 240 + j(), tT = 420 + j(), tD = 510 + j(), tW2 = 660 + j(), tFin = 810 + j();
    const F = P.FOOD_BASE, D = P.SURVIVE_SECONDS;
    this.tracks = {
      snow: [[0, 0], [tW, 0], [tW + 60, 0.9], [tT, 0.9], [tT + 15, 0.05], [tW2, 0.05], [tW2 + 40, 0.95], [tW2 + 130, 0.95], [tFin, 0.5], [D, 0.5]],
      temp: [[0, 0.35], [tW, 0.35], [tW + 60, -0.8], [tT, -0.8], [tT + 30, 0.25], [tD, 0.25], [tD + 30, 0.9], [tD + 90, 0.9], [tD + 120, 0.25], [tW2, 0.2], [tW2 + 40, -0.9], [tW2 + 130, -0.9], [tFin, -0.3], [D, -0.3]],
      food: [[0, F], [tW, F], [tW + 60, F * 0.8], [tT, F * 0.8], [tT + 30, F], [tD, F], [tD + 30, F * 0.5], [tD + 90, F * 0.5], [tD + 120, F], [tW2, F], [tW2 + 40, F * 0.7], [tW2 + 130, F * 0.7], [tFin, F * 0.85], [D, F * 0.85]],
      tough: [[0, 0], [tD, 0], [tD + 30, 0.8], [tD + 90, 0.8], [tD + 120, 0.05], [tFin, 0.05], [tFin + 20, 0.3], [D, 0.3]],
      predators: [[0, 0], [tF - 1, 0], [tF + 4, 2], [tF + 60, 3], [tF + 120, 4], [tW2, 4], [tW2 + 60, 5], [D, 5]],
    };
    this.windows = [
      { id: 'spring', label: 'Lush spring', icon: '\u{1F331}', start: 0, end: tF, color: '#b9d98a' },
      { id: 'foxes', label: 'Foxes arrive', icon: '\u{1F98A}', start: tF, end: tW, color: '#f0b27a', announce: 'Foxes arrive: 2 foxes are moving into the valley', tip: 'Foxes catch the rabbits they can see. Brown fur hides on grass; white fur does not.' },
      { id: 'winter', label: 'Long winter', icon: '❄️', start: tW, end: tT, color: '#a9cbe8', announce: 'Cold front: snow arriving', tip: 'Snow is settling. White fur hides on snow, and long ears lose too much heat.' },
      { id: 'thaw', label: 'Thaw', icon: '\u{1F4A7}', start: tT, end: tD, color: '#9ed8c8', announce: 'Thaw: the snow melts fast, white rabbits will stand out', tip: 'The snow is gone. White fur was the helpful trait a minute ago; now it is the one foxes spot.' },
      { id: 'drought', label: 'Drought and heatwave', icon: '☀️', start: tD, end: tD + 120, color: '#f2cf6b', announce: 'Heatwave: hot, dry, woody food', tip: 'Hot, dry, and the plants turn woody. Long ears shed heat; long teeth can chew tough food.' },
      { id: 'calm', label: 'Calm spell', icon: '\u{1F33F}', start: tD + 120, end: tW2, color: '#d8e6b0', tip: 'A breather. Rebuild numbers and variation before the next winter.' },
      { id: 'winter2', label: 'Second winter', icon: '\u{1F328}️', start: tW2, end: tFin, color: '#8fb1d9', announce: 'Harsher cold front, and the foxes are at their peak', tip: 'A harsher winter, with more foxes than ever. Is white fur still in the warren?' },
      { id: 'finale', label: 'Mixed finale', icon: '⛅', start: tFin, end: D, color: '#d9b8d6', announce: 'Patchy snow, mild cold, many foxes', tip: 'Patchy snow: no single fur colour is safe everywhere. Variation is the insurance.' },
    ];
    this.trust = P.TRUST_START;
    this.lastTranslocate = -99; this.lastFence = -99;
    this.log = []; this.result = null; this.phaseId = null;
    sim.hooks.envDriver = (s) => this.applyEnv(s);
    sim.hooks.onGenStart = (s) => this.onGenStart(s);
    this.applyEnv(sim);
  }

  applyEnv(sim) {
    const t = sim.t, e = sim.env, k = this.tracks;
    e.snow = track(k.snow, t); e.temp = track(k.temp, t); e.food = track(k.food, t); e.tough = track(k.tough, t); e.predators = track(k.predators, t);
    // tell the UI / renderer when the valley moves into its next phase (banner, camera cue)
    const w = this.windowAt(t);
    if (w.id !== this.phaseId) { if (this.phaseId != null) sim.events.push({ type: 'phase', id: w.id, label: w.label, icon: w.icon, tip: w.tip || '', color: w.color, t }); this.phaseId = w.id; }
  }

  onGenStart(sim) {
    if (sim.gen > 0) {
      const c = sim.history.current.comp;
      const diverse = allelesPresent(c) >= 5 && meanHeterozygosity(c) >= 0.15;
      this.trust += P.TRUST_PER_GEN + (diverse ? P.TRUST_DIVERSITY : 0);
    }
    if (sim.t >= P.SURVIVE_SECONDS - 1e-6 && !sim.ended) {
      sim.ended = true; this.result = { outcome: sim.liveN >= 2 ? 'survived' : 'extinct', t: sim.t, gen: sim.gen };
    }
  }

  windowAt(t) { return this.windows.find((w) => t >= w.start && t < w.end) || this.windows[this.windows.length - 1]; }

  // What the forecast strip shows, and nothing more: the current phase, the next announced change and the one after it.
  // Timing is exact only inside the last FORECAST_LEAD seconds (a countdown); further out it is rough, to the nearest half minute.
  // `sec` is the number the strip displays, so a player (or a test) that reads only this object knows what a student knows.
  forecast(t = this.sim.t) {
    const cur = this.windowAt(t);
    const ahead = this.windows.filter((w) => w.announce && w.start > t);
    const item = (w) => {
      if (!w) return null;
      const exact = w.start - t, soon = exact <= P.FORECAST_LEAD;
      const sec = soon ? Math.ceil(exact) : Math.max(30, Math.round(exact / 30) * 30);
      return { id: w.id, label: w.label, icon: w.icon, announce: w.announce, soon, sec, text: soon ? `in ${sec} s` : `in about ${roughTime(sec)}` };
    };
    const next = item(ahead[0]), later = item(ahead[1]);
    return { current: cur, next, later, inSec: next && next.soon ? ahead[0].start - t : null };
  }

  get outcome() { return this.sim.extinct ? 'extinct' : this.result?.outcome || null; }
  get timeLeft() { return Math.max(0, P.SURVIVE_SECONDS - this.sim.t); }

  cooldown(action) {
    const cd = P.COOLDOWN_GENS[action]; if (!cd) return 0;
    const last = action === 'translocate' ? this.lastTranslocate : this.lastFence;
    return Math.max(0, last + cd - this.sim.gen);
  }
  // A fence bought this generation starts at the next one (foxes and hazards are set at the start of each generation).
  get fencePending() { return this.sim.gen === this.lastFence && this.sim.gen < this.sim.fenceUntil; }
  get fenceActive() { return this.sim.gen > this.lastFence && this.sim.gen < this.sim.fenceUntil; }
  get fenceGensLeft() { return this.fenceActive ? this.sim.fenceUntil - this.sim.gen : 0; }

  // Trust cost and group size of a translocation, and how newcomers come in: the tutorial overrides these (small, immediate).
  costOf(action) { return P.COST[action]; }
  get translocateCount() { return P.TRANSLOCATE_COUNT; }
  arrive(genotypes, source) { return this.sim.queueAdults(genotypes, source); }       // they walk in at the start of the next generation

  canAct(action) {
    if (this.sim.ended) return 'The run is over.';
    if (this.trust < this.costOf(action)) return `Needs ${this.costOf(action)} trust.`;
    const cd = this.cooldown(action); if (cd > 0) return `Ready in ${cd} generation${cd > 1 ? 's' : ''}.`;
    return null;
  }

  spend(action, extra = {}) { this.trust -= this.costOf(action); this.log.push({ action, gen: this.sim.gen, t: this.sim.t, ...extra }); }

  translocate(source) {
    const s = P.SOURCES[source]; if (!s) return { ok: false, reason: 'Unknown source.' };
    const why = this.canAct('translocate'); if (why) return { ok: false, reason: why };
    const room = P.CAP - this.sim.liveN - this.sim.pendingCount;     // the valley holds 600 at most: checked before any trust is spent
    if (room <= 0) return { ok: false, reason: `The valley is full (${P.CAP} rabbits). There is no room for newcomers.` };
    const want = this.translocateCount, n = Math.min(want, room);
    const gts = []; for (let i = 0; i < n; i++) gts.push(drawGenotype(s.freq, this.rng));
    this.arrive(gts, source);
    this.lastTranslocate = this.sim.gen;
    this.spend('translocate', { source, count: n, genotypes: gts });
    this.sim.events.push({ type: 'ordered', source, count: n, partial: n < want });
    return { ok: true, count: n, genotypes: gts, partial: n < want };
  }

  placePatch(type, x, z) {
    const why = this.canAct(type); if (why) return { ok: false, reason: why };
    const p = this.sim.addPatch(type, x, z);
    this.spend(type, { x, z });
    return { ok: true, patch: p };
  }
  clover(x, z) { return this.placePatch('clover', x, z); }
  shelter(x, z) { return this.placePatch('shelter', x, z); }

  fence() {
    const why = this.canAct('fence'); if (why) return { ok: false, reason: why };
    this.sim.fenceUntil = this.sim.gen + 1 + P.FENCE_GENS;
    this.lastFence = this.sim.gen;
    this.spend('fence');
    this.sim.events.push({ type: 'fence', untilGen: this.sim.fenceUntil });
    return { ok: true };
  }

  stars() {
    const comp = composition(this.sim.rabbits);
    const survived = this.outcome === 'survived';
    return { survived, population: survived && comp.n >= 40, diversity: survived && allelesPresent(comp) === 6, count: [survived, survived && comp.n >= 40, survived && allelesPresent(comp) === 6].filter(Boolean).length };
  }

  report() { return buildReport(this); }
}

export function createSurvive(opts = {}) {
  let challenge;
  const sim = new Simulation({ ...opts, mode: 'survive', setup: (s) => { challenge = new Challenge(s); } });
  return { sim, challenge };
}

// ---------- run report ----------
const CAUSE_PHRASE = { predator: 'were caught by foxes', cold: 'died of cold', heat: 'died of heat', starved: 'starved', old: 'died of old age' };
const ALLELE_NAME = { b: ['white fur', 'brown fur', 'fur'], e: ['long ears', 'short ears', 'ears'], T: ['long teeth', 'short teeth', 'teeth'] };
const RELEVANT = { b: ['predator'], e: ['cold', 'heat', 'predator'], T: ['starved'] };
const RABBIT_WORD = { white: 'white', brown: 'brown', longEars: 'long-eared', shortEars: 'short-eared', longTeeth: 'long-toothed', shortTeeth: 'short-toothed' };
const TRAIT_KEYS = { b: ['white', 'brown'], e: ['longEars', 'shortEars'], T: ['longTeeth', 'shortTeeth'] };
const pct = (x) => Math.round(x * 100) + '%';

function windowRates(records, g0, g1, key) {
  let n = 0; const d = Object.fromEntries(CAUSES.map((c) => [c, 0]));
  for (const r of records) if (r.gen >= g0 && r.gen <= g1) { n += r.traits[key].n; for (const c of CAUSES) d[c] += r.traits[key].d[c] || 0; }
  return { n, d, total: CAUSES.reduce((s, c) => s + d[c], 0) };
}

export function buildReport(ch) {
  const sim = ch.sim, recs = sim.history.records;
  const endGen = recs.length ? recs[recs.length - 1].gen : 0;
  const outcome = ch.outcome || 'in progress';
  const comp = composition(sim.rabbits);
  const stars = ch.stars();

  // Deaths are assigned by the moment they happened, to the event interval [start, end) that contains it (the last event runs to the end).
  const deathsByWindow = ch.windows.map((w, i) => {
    const d = sim.history.deathsBetween(w.start, i === ch.windows.length - 1 ? Infinity : w.end);
    return { id: w.id, label: w.label, deaths: d };
  });

  const cands = [];
  for (const w of ch.windows) {
    const g0 = Math.floor(w.start / P.GEN_LEN), g1 = Math.min(Math.ceil(w.end / P.GEN_LEN), endGen);
    const a = recs.find((r) => r.gen === g0), b = recs.find((r) => r.gen === g1);
    if (!a || !b || g1 <= g0 || !a.pop || !b.pop) continue;
    for (const al of ['b', 'e', 'T']) {
      const f0 = alleleFreq(a.comp, al), f1 = alleleFreq(b.comp, al);
      cands.push({ w, al, f0, f1, delta: f1 - f0, g0, g1 });
    }
  }
  cands.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  const used = new Set(), sentences = [];
  // Translocated adults that joined the warren in generations g0 to g1 (they arrive at the start of the generation after the order).
  const arrivedIn = (g0, g1) => ch.log.reduce((n, l) => (l.action === 'translocate' && l.gen + 1 >= g0 && l.gen + 1 <= g1 ? n + (l.count || 0) : n), 0);
  for (const c of cands) {
    if (sentences.length >= 3 || Math.abs(c.delta) < 0.04 || used.has(c.w.id)) continue;
    used.add(c.w.id);
    const [mut] = ALLELE_NAME[c.al]; const [km, kn] = TRAIT_KEYS[c.al];
    const up = c.delta > 0;
    const winKey = (up ? km : kn), loseKey = (up ? kn : km);
    const wr = windowRates(recs, c.g0, c.g1 - 1, winKey), lr = windowRates(recs, c.g0, c.g1 - 1, loseKey);
    // 1. What was observed: the frequency change itself, over the generations it was measured across (a little wider than the event).
    let text = `From generation ${c.g0} to ${c.g1} (around the ${c.w.label.toLowerCase()}), the ${mut} allele (${c.al}) ${up ? 'rose' : 'fell'} from ${pct(c.f0)} to ${pct(c.f1)} of the warren's alleles.`;
    // 2. Evidence about selection: how often each type died of the relevant hazard, out of the rabbits alive at the start of each generation.
    let best = null, bestDiff = 0;
    if (wr.n > 0 && lr.n > 0) for (const cause of RELEVANT[c.al]) { const diff = lr.d[cause] / lr.n - wr.d[cause] / wr.n; if (diff > bestDiff) { bestDiff = diff; best = cause; } }
    if (best && bestDiff >= 0.05) {
      const rl = lr.d[best] / lr.n, rw = wr.d[best] / wr.n;
      text += ` Counting the rabbits alive at the start of each of those generations, ${pct(rl)} of the ${RABBIT_WORD[loseKey]} ones ${CAUSE_PHRASE[best]}, against ${pct(rw)} of the ${RABBIT_WORD[winKey]} ones. That difference is consistent with selection favouring the ${RABBIT_WORD[winKey]} rabbits.`;
    } else {
      text += ' The death records show no clear difference between the two types, so this change is not evidence of selection on its own.';
    }
    // 3. Other things that also move allele frequencies.
    const gf = arrivedIn(c.g0, c.g1);
    const small = Math.min(...recs.filter((r) => r.gen >= c.g0 && r.gen <= c.g1).map((r) => r.pop));
    const other = [];
    if (gf > 0) other.push(`${gf} translocated rabbits joined in this period, and gene flow changes frequencies too`);
    if (small < 30) other.push(`the warren had as few as ${small} rabbit${small === 1 ? '' : 's'}, where chance (genetic drift) can shift frequencies even without selection`);
    if (other.length) text += ` Keep in mind that ${other.join(', and ')}.`;
    sentences.push(text);
  }
  const peak = recs.reduce((m, r) => (r.pop > m.pop ? r : m), { pop: 0, gen: 0 });
  const tot = sim.history.totalDeaths(); const top = CAUSES.filter((c) => c !== 'old').sort((x, y) => tot[y] - tot[x])[0];
  const lastGens = recs.slice(-5), lastDeaths = lastGens.reduce((o, r) => { for (const c of CAUSES) o[c] = (o[c] || 0) + (r.deaths[c] || 0); return o; }, {});
  const lastTop = CAUSES.filter((c) => c !== 'old').sort((x, y) => (lastDeaths[y] || 0) - (lastDeaths[x] || 0))[0];
  const causeWord = (c) => (c === 'predator' ? 'foxes' : c === 'starved' ? 'hunger' : c);
  const fillers = [
    `The warren peaked at ${peak.pop} rabbits in generation ${peak.gen}.`,
    `Across the whole run the biggest killer was ${causeWord(top)} (${tot[top]} deaths).`,
    outcome === 'extinct'
      ? `The warren died out in generation ${sim.gen}, during the ${ch.windowAt(sim.t).label.toLowerCase()}. In its last ${lastGens.length} generations the main cause of death was ${causeWord(lastTop)} (${lastDeaths[lastTop] || 0} deaths), and ${allelesPresent(recs[recs.length - 1].comp)} of the 6 alleles were still present at the start of the final generation, so these records alone cannot say whether the pressure, the small numbers or chance ended the warren.`
      : `${allelesPresent(comp)} of the 6 alleles were still present at the end, so the warren still carries variation for selection to work on.`,
  ];
  for (const f of fillers) if (sentences.length < 3) sentences.push(f);

  const minutes = Math.floor(sim.t / 60), secs = String(Math.floor(sim.t % 60)).padStart(2, '0');
  const headline = outcome === 'survived' ? `The warren survived the full 15:00 with ${comp.n} rabbits.`
    : outcome === 'extinct' ? `Extinct at ${minutes}:${secs}, generation ${sim.gen}.` : 'Run in progress.';
  return { outcome, headline, stars, sentences, deathsByWindow, questions: REFLECTION, finalPop: comp.n, allelesLeft: allelesPresent(comp), gen: sim.gen, t: sim.t, seed: sim.seedCode, actions: ch.log.length };
}
