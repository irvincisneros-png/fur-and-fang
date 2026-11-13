// Fingerprints of the classic modes (Explore, Survive, Tutorial). The Islands update must never change them.
// `node tools/golden.mjs` prints the current values; tests/golden.test.mjs compares against the recorded ones.
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Simulation } from '../src/sim/sim.js';
import { createSurvive } from '../src/sim/challenge.js';
import { createTutorial } from '../src/sim/tutorial.js';
import { forecastPlayer } from '../tests/helpers.mjs';

export function fingerprint(sim) {
  const h = createHash('sha256');
  h.update(sim.history.toCSV(sim.seedCode));
  for (const r of sim.rabbits) if (r.alive) h.update(`${r.id}|${r.genotype.fur}${r.genotype.ears}${r.genotype.teeth}|${r.x.toFixed(6)}|${r.z.toFixed(6)}\n`);
  return h.digest('hex').slice(0, 16);
}

export function goldenRuns() {
  const a = new Simulation({ mode: 'explore', seedCode: 'GOLD01', env: { snow: 0.6, temp: -0.3, food: 140, tough: 0.3 } });
  a.setPredators(2);
  for (let g = 0; g < 40 && !a.ended; g++) a.advance(10);
  const { sim: b, challenge } = createSurvive({ seedCode: 'GOLD02' });
  const act = forecastPlayer(challenge);
  while (!b.ended) { act(); b.advance(1); }
  const { sim: c } = createTutorial();
  for (let g = 0; g < 30 && !c.ended; g++) c.advance(10);
  return { explore: fingerprint(a), survive: fingerprint(b), tutorial: fingerprint(c) };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(goldenRuns(), null, 2));
