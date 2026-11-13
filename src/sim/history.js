// Per-generation records for graphs, reports and CSV.
import { GENES } from './genetics.js';

export const CAUSES = ['predator', 'cold', 'heat', 'starved', 'old', 'bottleneck'];
export const ALLELES = ['B', 'b', 'E', 'e', 'T', 't'];
export const TRAITS = ['white', 'brown', 'longEars', 'shortEars', 'longTeeth', 'shortTeeth'];

export function traitsOf(p) {
  return [p.white ? 'white' : 'brown', p.longEars ? 'longEars' : 'shortEars', p.longTeeth ? 'longTeeth' : 'shortTeeth'];
}

export function composition(rabbits) {
  const c = { n: 0, white: 0, brown: 0, longEars: 0, shortEars: 0, longTeeth: 0, shortTeeth: 0,
    geno: { fur: {}, ears: {}, teeth: {} }, alleles: { B: 0, b: 0, E: 0, e: 0, T: 0, t: 0 } };
  for (const r of rabbits) {
    if (!r.alive) continue;
    c.n++;
    for (const t of traitsOf(r.pheno)) c[t]++;
    for (const g of GENES) {
      const s = r.genotype[g];
      c.geno[g][s] = (c.geno[g][s] || 0) + 1;
      c.alleles[s[0]]++; c.alleles[s[1]]++;
    }
  }
  return c;
}

export function alleleFreq(comp, allele) {
  const n2 = comp.n * 2; return n2 ? comp.alleles[allele] / n2 : 0;
}
export function allelesPresent(comp) { return ALLELES.filter((a) => comp.alleles[a] > 0).length; }
export function meanHeterozygosity(comp) {
  if (!comp.n) return 0;
  let h = 0;
  for (const [a, b] of [['B', 'b'], ['E', 'e'], ['T', 't']]) { const p = alleleFreq(comp, a), q = alleleFreq(comp, b); h += 2 * p * q; }
  return h / 3;
}

const zeroCauses = () => Object.fromEntries(CAUSES.map((c) => [c, 0]));

export class History {
  constructor() { this.records = []; this.deathLog = []; }   // deathLog: [time, cause] for every death, so events can be totalled by time
  get current() { return this.records[this.records.length - 1]; }

  begin(sim, births = 0) {
    const comp = composition(sim.rabbits);
    const rec = {
      gen: sim.gen, t: sim.t, pop: comp.n, comp, births, mutations: sim.mutTally ? sim.mutTally.total - (this.mutSeen || 0) : 0,
      env: { snow: sim.env.snow, temp: sim.env.temp, food: sim.env.food, tough: sim.env.tough, predators: sim.predators.length },
      deaths: zeroCauses(), survivors: null, arrivals: sim.rabbits.reduce((n, r) => n + (r.alive && r.born === sim.gen && r.age > 0 && sim.gen > 0 ? 1 : 0), 0),
      traits: Object.fromEntries(TRAITS.map((k) => [k, { n: comp[k], d: zeroCauses() }])),
    };
    this.mutSeen = sim.mutTally ? sim.mutTally.total : 0;
    this.records.push(rec);
    return rec;
  }

  // A rabbit that joined during the generation (translocation, tutorial top-up): part of that generation's population at risk.
  entrant(r) {
    const rec = this.current; if (!rec) return;
    rec.arrivals++;
    for (const k of traitsOf(r.pheno)) rec.traits[k].n++;
  }

  death(r, cause, t = 0) {
    this.deathLog.push([t, cause]);
    const rec = this.current; if (!rec) return;
    rec.deaths[cause] = (rec.deaths[cause] || 0) + 1;
    for (const k of traitsOf(r.pheno)) rec.traits[k].d[cause] = (rec.traits[k].d[cause] || 0) + 1;
  }

  finishGen(liveCount) { if (this.current) this.current.survivors = liveCount; }

  totalDeaths(from = 0, to = Infinity) {
    const out = zeroCauses();
    for (const r of this.records) if (r.gen >= from && r.gen <= to) for (const c of CAUSES) out[c] += r.deaths[c] || 0;
    return out;
  }

  // Deaths by cause with t0 <= time < t1 (non-overlapping when the intervals are).
  deathsBetween(t0 = -Infinity, t1 = Infinity) {
    const out = zeroCauses();
    for (const [t, c] of this.deathLog) if (t >= t0 && t < t1) out[c]++;
    return out;
  }

  toCSV(seedCode = '') {
    const head = ['seed', 'generation', 'time_s', 'population', 'white_fur', 'brown_fur', 'long_ears', 'short_ears', 'long_teeth', 'short_teeth',
      'freq_b', 'freq_e', 'freq_T', 'births', 'arrivals', 'new_mutations', ...CAUSES.map((c) => 'deaths_' + c), 'snow', 'temp', 'food', 'tough', 'predators'];
    const rows = [head.join(',')];
    for (const r of this.records) {
      const c = r.comp;
      rows.push([seedCode, r.gen, r.t.toFixed(1), c.n, c.white, c.brown, c.longEars, c.shortEars, c.longTeeth, c.shortTeeth,
        alleleFreq(c, 'b').toFixed(4), alleleFreq(c, 'e').toFixed(4), alleleFreq(c, 'T').toFixed(4), r.births, r.arrivals || 0, r.mutations || 0,
        ...CAUSES.map((k) => r.deaths[k] || 0), r.env.snow.toFixed(2), r.env.temp.toFixed(2), r.env.food.toFixed(1), r.env.tough.toFixed(2), r.env.predators].join(','));
    }
    return rows.join('\n');
  }
}
