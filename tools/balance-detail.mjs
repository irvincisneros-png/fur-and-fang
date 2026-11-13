// Where runs end, per strategy: node tools/balance-detail.mjs strategy [seeds=40]
import { playRun, balanceSeeds } from '../tests/helpers.mjs';
import { alleleFreq } from '../src/sim/history.js';
import { P } from '../src/sim/params.js';
const over = JSON.parse(process.env.FF || '{}');
for (const [k, v] of Object.entries(over)) { if (k === 'river') P.SOURCES.river.freq = { b: v, e: v, T: v }; else if (k.includes('.')) { const [a, b] = k.split('.'); P[a][b] = v; } else P[k] = v; }
for (const strat of process.argv[2].split(',')) {
  const seeds = balanceSeeds(Number(process.argv[3]) || 40);
  const byWin = {}; let surv = 0; const pops = [];
  const traj = {};
  for (const s of seeds) {
    const r = playRun(s, strat);
    for (const w of r.challenge.windows) { const rec = r.sim.history.records.find((x) => x.t >= w.start); (traj[w.id] ??= []).push(rec ? [rec.pop, alleleFreq(rec.comp, 'b'), alleleFreq(rec.comp, 'e'), alleleFreq(rec.comp, 'T')] : null); }
    if (r.survived) { surv++; pops.push(r.sim.pop); continue; }
    const w = r.challenge.windowAt(r.sim.t).id; byWin[w] = (byWin[w] || 0) + 1;
  }
  console.log(strat, 'survived', surv, 'extinct in', byWin, 'final pops', pops.sort((a, b) => a - b).join(' '));
  for (const [id, a] of Object.entries(traj)) { const v = a.filter(Boolean); const m = (i) => (v.reduce((s, x) => s + x[i], 0) / Math.max(1, v.length)); console.log(`  at ${id.padEnd(8)} alive ${String(v.length).padStart(2)}  pop ${m(0).toFixed(0).padStart(4)}  b ${m(1).toFixed(2)}  e ${m(2).toFixed(2)}  T ${m(3).toFixed(2)}`); }
}
