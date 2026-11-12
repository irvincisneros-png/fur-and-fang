// Explore mode controls (teacher sandbox).
import { h, slider, download } from './dom.js';
import { GENE_INFO } from '../sim/genetics.js';

const PRESETS = [
  { id: 'snowy', label: 'Snowy alpine', env: { snow: 0.9, temp: -0.8, food: 100, tough: 0 }, predators: 2 },
  { id: 'hot', label: 'Hot dry plain', env: { snow: 0, temp: 0.8, food: 50, tough: 0.7 }, predators: 0 },
  { id: 'lush', label: 'Lush meadow', env: { snow: 0, temp: 0.2, food: 250, tough: 0 }, predators: 0 },
];

const tempWord = (v) => (v < -0.25 ? 'cold' : v > 0.25 ? 'hot' : 'mild');

export function buildExplore(root, ctx) {
  const { app, ui } = ctx;
  const sim = () => app.sim;
  const sliders = {};
  let predOn = false, predCount = 2;
  root.innerHTML = '';

  const setEnv = (p) => { sim().setEnv(p); };
  const applyPredators = () => sim().setPredators(predOn ? predCount : 0);

  // ----- Valley -----
  sliders.snow = slider({ label: 'Snow cover', min: 0, max: 1, step: 0.01, value: sim().env.snow, fmt: (v) => Math.round(v * 100) + '%', onInput: (v) => setEnv({ snow: v }) });
  sliders.temp = slider({ label: 'Temperature', min: -1, max: 1, step: 0.01, value: sim().env.temp, fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} ${tempWord(v)}`, onInput: (v) => setEnv({ temp: v }) });
  sliders.food = slider({ label: 'Food (rabbits supported)', min: 10, max: 600, step: 5, value: sim().env.food, fmt: (v) => Math.round(v), onInput: (v) => setEnv({ food: v }) });
  sliders.tough = slider({ label: 'Tough, woody food', min: 0, max: 1, step: 0.01, value: sim().env.tough, fmt: (v) => Math.round(v * 100) + '%', onInput: (v) => setEnv({ tough: v }) });
  const predBox = h('input', { type: 'checkbox', id: 'pred-on' });
  predBox.addEventListener('change', () => { predOn = predBox.checked; applyPredators(); });
  const predSlider = slider({ label: 'Number of foxes', min: 1, max: 8, step: 1, value: predCount, fmt: (v) => v, onInput: (v) => { predCount = v; if (predOn) applyPredators(); } });
  const syncAll = () => {
    const e = sim().env;
    sliders.snow.set(e.snow); sliders.temp.set(e.temp); sliders.food.set(e.food); sliders.tough.set(e.tough);
    predOn = e.predators > 0; if (predOn) predCount = e.predators; predBox.checked = predOn; predSlider.set(predCount);
  };
  const preset = (p) => { sim().setEnv(p.env); sim().setPredators(p.predators); syncAll(); ui.toast(`Preset: ${p.label}`, 'info'); };

  const valley = h('details', { open: true }, h('summary', { text: 'The valley' }),
    h('div', { class: 'btn-row' }, PRESETS.map((p) => h('button', { class: 'btn small', text: p.label, onclick: () => preset(p) }))),
    sliders.snow, sliders.temp, sliders.food, sliders.tough,
    h('div', { class: 'row' }, predBox, h('label', { for: 'pred-on', text: 'Predators (foxes)' })), predSlider,
    h('p', { class: 'note', text: 'Changes to the valley bite from the next generation.' }));

  // ----- Genes -----
  const domSelects = {};
  const DOM_OPTS = {
    fur: [['B', 'B (brown) dominant over b (white)'], ['b', 'b (white) dominant over B (brown)']],
    ears: [['E', 'E (short) dominant over e (long)'], ['e', 'e (long) dominant over E (short)']],
    teeth: [['t', 't (short) dominant over T (long)'], ['T', 'T (long) dominant over t (short)']],
  };
  const domRows = Object.keys(DOM_OPTS).map((g) => {
    const sel = h('select', { 'aria-label': GENE_INFO[g].label + ' dominance' }, DOM_OPTS[g].map(([v, t]) => h('option', { value: v, text: t })));
    sel.value = sim().dominance[g];
    sel.addEventListener('change', () => { sim().setDominance(g, sel.value); });
    domSelects[g] = sel;
    return h('div', { class: 'row' }, h('label', { text: GENE_INFO[g].label }), sel);
  });
  const mutSlider = slider({ label: 'Random mutation rate', min: 0, max: 0.05, step: 0.001, value: sim().cfg.mutationRate, fmt: (v) => (v * 100).toFixed(1) + '%', onInput: (v) => sim().setMutationRate(v) });
  const plantBtns = {};
  const planted = h('div', { class: 'btn-row' }, ['fur', 'ears', 'teeth'].map((g) => {
    const info = GENE_INFO[g];
    const b = h('button', { class: 'btn small', text: `${info.label}: ${info.mutantTrait} (${info.mutant})`, onclick: () => { sim().plantMutation(g); b.classList.add('on'); b.textContent = `${info.mutant} planted for next generation`; ui.toast(`Teacher mutation planted: ${info.mutantTrait} (${info.mutant}) appears in the next generation`, 'mut'); } });
    plantBtns[g] = b; return b;
  }));
  const genes = h('details', { open: true }, h('summary', { text: 'Genes' }),
    h('p', { class: 'note', text: 'Which allele is dominant? Pick it for each gene.' }), domRows,
    mutSlider,
    h('h3', { text: 'Teacher: plant a mutation' }), planted,
    h('p', { class: 'note', text: 'Real mutations are random: they happen whether or not they help. This button is a classroom shortcut.' }),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn small danger', text: 'Bottleneck: remove 90% at random', onclick: () => { sim().bottleneck(0.9); } })));

  // ----- View -----
  const gv = h('input', { type: 'checkbox', id: 'gv' });
  gv.addEventListener('change', () => ui.setGenotypeView(gv.checked));
  const view = h('details', {}, h('summary', { text: 'View' }),
    h('div', { class: 'row' }, gv, h('label', { for: 'gv', text: 'Genotype view' })),
    h('p', { class: 'note', text: 'Rings show the fur genotype: dark = BB, orange = Bb carrier, blue = bb. Click a rabbit for its family tree.' }));

  // ----- Teaching -----
  const poeBody = h('div', { class: 'poe' }, 'Loading prompts…');
  let prompts = [], pi = 0;
  const showPrompt = () => {
    const p = prompts[pi]; if (!p) return;
    poeBody.innerHTML = '';
    poeBody.append(h('h4', { text: `${pi + 1}/${prompts.length}  ${p.title}` }),
      h('p', {}, h('span', { class: 'tag', text: 'Predict ' }), p.predict),
      h('p', {}, h('span', { class: 'tag', text: 'Observe ' }), p.run),
      h('p', {}, h('span', { class: 'tag', text: 'Explain ' }), p.explain),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn small', text: 'Previous', onclick: () => { pi = (pi + prompts.length - 1) % prompts.length; showPrompt(); } }),
        h('button', { class: 'btn small primary', text: 'Set up', onclick: () => applySetup(p) }),
        h('button', { class: 'btn small', text: 'Next', onclick: () => { pi = (pi + 1) % prompts.length; showPrompt(); } })));
  };
  const applySetup = (p) => {
    const s = p.setup || {};
    if (s.env) sim().setEnv(s.env);
    if (s.predators != null) sim().setPredators(s.predators);
    if (s.mutationRate != null) { sim().setMutationRate(s.mutationRate); mutSlider.set(s.mutationRate); }
    for (const g of s.plant || []) plantBtns[g]?.click();
    if (s.genotypeView) { gv.checked = true; ui.setGenotypeView(true); }
    syncAll();
    ui.toast('Experiment set up. Make your prediction, then press play.', 'info');
  };
  fetch('src/content/prompts.json').then((r) => r.json()).then((d) => { prompts = d; showPrompt(); }).catch(() => { poeBody.textContent = 'Prompts could not be loaded.'; });

  const seedInput = h('input', { type: 'text', maxlength: 6, value: sim().seedCode, 'aria-label': 'Seed code', style: { width: '7em', textTransform: 'uppercase', letterSpacing: '0.1em' } });
  const teach = h('details', { open: true }, h('summary', { text: 'Predict, observe, explain' }), poeBody,
    h('h3', { text: 'Run' }),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn small', text: 'Export CSV', onclick: () => download(`fur-and-fang-${sim().seedCode}.csv`, sim().history.toCSV(sim().seedCode)) }),
      h('button', { class: 'btn small', text: 'Restart', onclick: () => app.start('explore', sim().seedCode) }),
      h('button', { class: 'btn small', text: 'New seed', onclick: () => app.start('explore', null) })),
    h('div', { class: 'row' }, h('label', { text: 'Seed code' }), seedInput, h('button', { class: 'btn small', text: 'Replay', onclick: () => app.start('explore', seedInput.value || null) })),
    h('p', { class: 'note', text: 'The same seed code replays the same random events, so a class can compare runs.' }));

  root.append(valley, genes, view, teach);
  applyPredators();
  return { update() {
    for (const g of Object.keys(plantBtns)) if (!sim().pendingMutations.has(g) && plantBtns[g].classList.contains('on')) { plantBtns[g].classList.remove('on'); const i = GENE_INFO[g]; plantBtns[g].textContent = `${i.label}: ${i.mutantTrait} (${i.mutant})`; }
  } };
}
