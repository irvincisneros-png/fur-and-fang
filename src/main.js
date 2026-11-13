// Fur & Fang: boot, app state, main loop.
import { Simulation } from './sim/sim.js';
import { createSurvive } from './sim/challenge.js';
import { createTutorial } from './sim/tutorial.js';
import { createIslandsLab } from './sim/islands.js';
import { Tutorial } from './ui/tutorial.js';
import { randomSeedCode } from './sim/rng.js';
import { createDebugView } from './ui/debugView.js';
import { UI } from './ui/ui.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);

const app = {
  mode: null, sim: null, challenge: null, world: null, paused: false, speed: 1, ui: null,
  async start(mode, seedCode, opts = {}) {
    const seed = (seedCode || '').trim().toUpperCase() || randomSeedCode();
    if (mode === 'tutorial') { const r = createTutorial(); app.sim = r.sim; app.challenge = r.challenge; }
    else if (mode === 'survive') { const r = createSurvive({ seedCode: seed }); app.sim = r.sim; app.challenge = r.challenge; }
    else if (mode === 'islands') {
      app.sim = createIslandsLab({ seedCode: seed, scenario: opts.scenario || 'open', envs: opts.envs });
      app.challenge = null; app.islandsReopenAt = opts.reopenAt ?? null; app.islandsCarries = 0;
      if (!opts.scenario) app.islandsDone = [];
    }
    else { app.sim = new Simulation({ mode: 'explore', seedCode: seed }); app.challenge = null; }
    app.mode = mode; app.speed = 1;
    await ensureWorld();
    app.world.follow?.(null); app.world.clearKeys?.();
    app.ui.startMode(mode);
    app.world.resize?.();
  },
  home() {
    app.ui.setPaused(true); app.ui.cancelEnd(); app.ui.tutorial.stop(); app.world?.clearKeys?.();
    $('#app').classList.add('hidden'); $('#end').classList.add('hidden'); $('#title').classList.add('show');
  },
};
window.__ff = app; // handy for debugging in the console

let worldPromise = null;
function useDebugView(reason) {
  console.info('Using the 2D view:', reason);
  $('#gl').classList.add('hidden');
  app.world = createDebugView($('#dbg'));
  return app.world;
}
function ensureWorld() {
  if (app.world) return Promise.resolve(app.world);
  worldPromise ??= (async () => {
    if (params.get('view') === '2d') return useDebugView('requested');
    try {
      const mod = await import('./render/world.js');
      const w = await mod.createWorld($('#gl'), { quality: params.get('quality') || 'auto' });
      app.world = w; $('#dbg').classList.add('hidden');
      return w;
    } catch (err) {
      return useDebugView(err && err.message ? err.message : err);
    }
  })();
  return worldPromise;
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000, dt = Math.min(0.1, raw); last = now;
  const { sim, world } = app;
  if (!sim || !world || $('#app').classList.contains('hidden')) return;
  const simDt = app.paused || sim.ended ? 0 : dt * (app.mode === 'survive' ? 1 : app.speed);
  if (simDt > 0) sim.step(simDt);
  const events = sim.drainEvents();
  if (events.length) app.ui.onEvents(events);
  try {
    if (events.length) world.onEvents(events);
    world.update(sim, simDt, raw);
  } catch (err) {
    if (world.kind === 'debug') { if (!app._dbgErr) { app._dbgErr = true; console.error('2D view error', err); } return; }
    console.error('Renderer failed, switching to the 2D view', err);
    try { world.dispose?.(); } catch { /* ignore */ }
    app.world = null; worldPromise = null; $('#gl').classList.add('hidden');
    app.world = createDebugView($('#dbg')); worldPromise = Promise.resolve(app.world);
    app.world.setGenotypeView(app.ui.genoView);
  }
  app.ui.refresh();
}

app.ui = new UI(app);
$('#go-explore').addEventListener('click', () => app.start('explore', $('#seed-input').value));
$('#go-tutorial').addEventListener('click', () => app.start('tutorial'));
$('#go-islands').addEventListener('click', () => { app.islandsInv = 0; app.start('islands', $('#seed-input').value, { scenario: 'flood', envs: [{ snow: 0.9, temp: -0.7, tough: 0, predators: 5 }, { snow: 0, temp: 0.8, tough: 0.7, predators: 4 }, { snow: 0, temp: 0.8, tough: 0.7, predators: 4 }] }); });
// First Survive launch on this device: offer the tutorial once.
const OFFER_KEY = 'ff-tutorial-offer-v1';
let offered = false;
try { offered = localStorage.getItem(OFFER_KEY) === 'done'; } catch { /* storage blocked: offer once per visit */ }
const closeOffer = (mode) => { $('#tut-offer').classList.add('hidden'); app.start(mode, mode === 'survive' ? $('#seed-input').value : null); };
$('#go-survive').addEventListener('click', () => {
  if (offered || Tutorial.seen()) { app.start('survive', $('#seed-input').value); return; }
  offered = true; try { localStorage.setItem(OFFER_KEY, 'done'); } catch { /* storage blocked */ }
  $('#tut-offer').classList.remove('hidden'); $('#offer-tutorial').focus();
});
$('#offer-tutorial').addEventListener('click', () => closeOffer('tutorial'));
$('#offer-survive').addEventListener('click', () => closeOffer('survive'));
$('#title').classList.add('show');
requestAnimationFrame(frame);
if (['explore', 'survive', 'tutorial', 'islands'].includes(params.get('mode'))) app.start(params.get('mode'), params.get('seed'));
