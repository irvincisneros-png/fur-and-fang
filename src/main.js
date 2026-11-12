// Fur & Fang: boot, app state, main loop.
import { Simulation } from './sim/sim.js';
import { createSurvive } from './sim/challenge.js';
import { randomSeedCode } from './sim/rng.js';
import { createDebugView } from './ui/debugView.js';
import { UI } from './ui/ui.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);

const app = {
  mode: null, sim: null, challenge: null, world: null, paused: false, speed: 1, ui: null,
  async start(mode, seedCode) {
    const seed = (seedCode || '').trim().toUpperCase() || randomSeedCode();
    if (mode === 'survive') { const r = createSurvive({ seedCode: seed }); app.sim = r.sim; app.challenge = r.challenge; }
    else { app.sim = new Simulation({ mode: 'explore', seedCode: seed }); app.challenge = null; }
    app.mode = mode; app.speed = 1;
    await ensureWorld();
    app.world.follow?.(null);
    app.ui.startMode(mode);
    app.world.resize?.();
  },
  home() {
    app.ui.setPaused(true);
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
$('#go-survive').addEventListener('click', () => app.start('survive', $('#seed-input').value));
$('#title').classList.add('show');
requestAnimationFrame(frame);
if (params.get('mode') === 'explore' || params.get('mode') === 'survive') app.start(params.get('mode'), params.get('seed'));
