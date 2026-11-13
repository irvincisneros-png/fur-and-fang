// Try parameter overrides against the benchmark players: node tools/tune.mjs '{"PRED_KILLS":18}' [strategies] [seeds]
import { P } from '../src/sim/params.js';
import { STRATEGIES, tally, balanceSeeds } from '../tests/helpers.mjs';
const over = JSON.parse(process.argv[2] || '{}');
for (const [k, v] of Object.entries(over)) { if (k === 'river') P.SOURCES.river.freq = { b: v, e: v, T: v }; else if (k.includes('.')) { const [a, b] = k.split('.'); P[a][b] = v; } else P[k] = v; }
const strats = (process.argv[3] || 'none,panicky,forecast,spamRiver,spamAlpine,spamDesert,spamClover,spamShelter,spamFence').split(',');
const seeds = balanceSeeds(Number(process.argv[4]) || 40, process.argv[5] || "AUD");
const out = [];
for (const s of strats) { const r = tally(s, seeds); out.push(`${s} ${r.survived}(${r.stars[3]}*)`); }
console.log(JSON.stringify(over), '\n  ', out.join('  '));
