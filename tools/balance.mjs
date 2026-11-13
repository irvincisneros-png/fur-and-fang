// Balance table for Survive 15:00: node tools/balance.mjs [seeds=40] [strategy ...]
import { STRATEGIES, STRATEGY_LABEL, tally, balanceSeeds } from '../tests/helpers.mjs';

const n = Number(process.argv[2]) || 40, only = process.argv.slice(3);
const seeds = balanceSeeds(n);
console.log(`| Strategy | Survived (${n} seeds) | 1★ / 2★ / 3★ |\n|---|---:|---:|`);
for (const k of Object.keys(STRATEGIES)) {
  if (only.length && !only.includes(k)) continue;
  const r = tally(k, seeds);
  console.log(`| ${STRATEGY_LABEL[k]} | ${r.survived}/${n} (${(100 * r.survived / n).toFixed(1)}%) | ${r.stars[1]} / ${r.stars[2]} / ${r.stars[3]} |`);
}
