// Survive 15:00: ranger actions, forecast strip, trust, end screen.
import { h } from './dom.js';
import { P } from '../sim/params.js';
import { drawAlleleChart, drawDeathBars, COLORS } from './graphs.js';

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const SRC_ORDER = ['alpine', 'desert', 'river'];
const FREQ_ROWS = [['b', 'Fur: white (b)', COLORS.b], ['e', 'Ears: long (e)', COLORS.e], ['T', 'Teeth: long (T)', COLORS.T]];

export function buildSurvive(root, ctx) {
  const { app, ui, tutorial } = ctx;
  const ch = () => app.challenge;
  root.innerHTML = '';
  const els = {};

  const srcBtns = SRC_ORDER.map((id) => {
    const s = P.SOURCES[id];
    const btn = h('button', { class: 'source', onclick: () => run(ch().translocate(id), null) },
      h('b', { text: s.name }), h('small', { text: s.blurb }),
      FREQ_ROWS.map(([al, lbl, col]) => h('div', { class: 'abar' }, h('span', { text: lbl }), h('i', { style: { '--w': Math.round(s.freq[al] * 100) + '%', '--c': col } }), h('span', { text: Math.round(s.freq[al] * 100) + '%' }))));
    btn.dataset.src = id; return btn;
  });
  els.translocate = h('div', { class: 'action' }, h('b', { text: 'Translocate' }), h('span', { class: 'cost', text: `${P.COST.translocate} trust` }),
    h('span', { class: 'desc', text: 'Bring 2 adult rabbits from a neighbouring population. This is gene flow: new alleles enter. Each card shows how common the new alleles are there.' }),
    h('div', { class: 'sources' }, srcBtns), h('span', { class: 'cd', id: 'cd-translocate' }));
  els.translocate.dataset.act = 'translocate';
  const placeAction = (type, title, desc) => {
    const btn = h('button', { class: 'btn small', text: 'Place on the ground', onclick: () => ui.beginPlace(type) });
    const box = h('div', { class: 'action' }, h('b', { text: title }), h('span', { class: 'cost', text: `${P.COST[type]} trust` }), h('span', { class: 'desc', text: desc }), btn, h('span', { class: 'cd' }));
    box.btn = btn; box.cd = box.querySelector('.cd'); box.dataset.act = type; return box;
  };
  els.clover = placeAction('clover', 'Plant clover patch', `Extra food for ${P.CLOVER_GENS} generations. Click the ground to place it. Takes effect next generation.`);
  els.shelter = placeAction('shelter', 'Brush shelter', `A hedge pile: rabbits near it face 30% fewer predator catches for ${P.SHELTER_GENS} generations.`);
  els.fence = h('div', { class: 'action' }, h('b', { text: 'Fox fence' }), h('span', { class: 'cost', text: `${P.COST.fence} trust` }),
    h('span', { class: 'desc', text: `Halves the foxes for ${P.FENCE_GENS} generations (from the next generation). Cooldown ${P.COOLDOWN_GENS.fence} generations.` }),
    h('button', { class: 'btn small', text: 'Build fence', onclick: () => run(ch().fence(), 'Fox fence up: half the foxes for three generations.') }), h('span', { class: 'cd' }));
  els.fence.btn = els.fence.querySelector('.btn'); els.fence.cd = els.fence.querySelector('.cd');

  const gv = h('input', { type: 'checkbox', id: 'gv2' });
  gv.addEventListener('change', () => ui.setGenotypeView(gv.checked));

  root.append(
    h('h3', { text: 'You are the ranger' }),
    h('p', { class: 'note', text: 'You cannot choose mutations. Habitat and gene flow are your tools, and each costs trust. Read the forecast: variation has to exist before the pressure arrives.' }),
    els.translocate, els.clover, els.shelter, els.fence,
    h('div', { class: 'row' }, gv, h('label', { for: 'gv2', text: 'Genotype view' })),
    tutorial ? '' : h('div', { class: 'btn-row' }, h('button', { class: 'btn small', text: 'Show the tips again', onclick: () => { ui.coach.start(true); } }), h('button', { class: 'btn small', text: 'Restart this seed', onclick: () => app.start('survive', app.sim.seedCode) }), h('button', { class: 'btn small', text: 'New seed', onclick: () => app.start('survive', null) })));

  function run(res, okMsg) {
    if (!res.ok) ui.toast(res.reason, 'bad'); else if (okMsg) ui.toast(okMsg, 'good');   // translocation announces itself when the rabbits appear
    ui.refresh(true);
  }

  return {
    update() {
      const c = ch(), dead = app.sim.ended;
      const cdT = c.cooldown('translocate');
      srcBtns.forEach((b) => { b.disabled = dead || !!c.canAct('translocate'); });
      const t = els.translocate.querySelector('.cd'); t.textContent = dead ? '' : cdT > 0 ? `Ready in ${cdT} generation${cdT > 1 ? 's' : ''}` : c.trust < P.COST.translocate ? 'Not enough trust yet' : '';
      for (const [k, el] of [['clover', els.clover], ['shelter', els.shelter], ['fence', els.fence]]) {
        const why = c.canAct(k); el.btn.disabled = dead || !!why; el.cd.textContent = dead ? '' : why || (k === 'fence' && c.fenceActive ? 'Fence is up' : '');
      }
    },
  };
}

// Forecast strip (top centre)
export function updateForecast(app, els) {
  const c = app.challenge; if (!c) return;
  const f = c.forecast();
  els.now.textContent = `${f.current.icon} ${f.current.label}`;
  if (f.next) {
    els.next.className = 'fc-next soon';
    els.next.textContent = `${f.next.icon} ${f.next.announce} in ${Math.ceil(f.inSec)} s`;
  } else { els.next.className = 'fc-next quiet'; els.next.textContent = 'Forecast: nothing in the next 20 s'; }
}

// ---------- End screen ----------
export function showEnd(root, ctx) {
  const { app } = ctx;
  const ch = app.challenge, sim = app.sim, rep = ch.report();
  const key = 'ff-reflect-' + sim.seedCode;
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(key) || '{}'); } catch { /* storage blocked */ }
  const win = rep.outcome === 'survived';
  const star = (got, label) => h('div', { class: 'star' + (got ? ' got' : '') }, h('span', { class: 's', text: '★' }), label);
  const alleleCanvas = h('canvas'), deathCanvas = h('canvas', { class: 'short' });
  const answers = rep.questions.map((q, i) => {
    const ta = h('textarea', { 'aria-label': 'Answer ' + (i + 1) }); ta.value = saved[i] || '';
    ta.addEventListener('input', () => { saved[i] = ta.value; try { localStorage.setItem(key, JSON.stringify(saved)); } catch { /* ignore */ } });
    return ta;
  });
  const text = () => [
    `Fur & Fang: Survive 15:00 (seed ${rep.seed})`, rep.headline,
    `Stars: survived ${rep.stars.survived ? 'yes' : 'no'}; population of 40+ ${rep.stars.population ? 'yes' : 'no'}; all six alleles present ${rep.stars.diversity ? 'yes' : 'no'}`, '',
    'What happened:', ...rep.sentences.map((s, i) => `${i + 1}. ${s}`), '',
    'Reflection:', ...rep.questions.map((q, i) => `${i + 1}. ${q}\n${answers[i].value || '(no answer)'}`),
  ].join('\n');
  const copyBtn = h('button', { class: 'btn', text: 'Copy my report', onclick: async () => { try { await navigator.clipboard.writeText(text()); copyBtn.textContent = 'Copied'; } catch { copyBtn.textContent = 'Copy failed: select the text and copy by hand'; } setTimeout(() => (copyBtn.textContent = 'Copy my report'), 2500); } });

  root.innerHTML = '';
  root.append(h('div', { class: 'end-inner' },
    h('h1', { text: win ? 'The warren survived!' : 'The warren died out' }),
    h('p', { class: 'pheno-line', text: rep.headline }),
    h('div', { class: 'stars' }, star(rep.stars.survived, 'Survived 15:00'), star(rep.stars.population, 'Population of 40 or more'), star(rep.stars.diversity, 'All six alleles present')),
    h('h2', { text: 'Allele frequencies, with the valley events shaded' }), alleleCanvas,
    h('div', { class: 'legend small-legend' }, [['b: white fur', COLORS.b], ['e: long ears', COLORS.e], ['T: long teeth', COLORS.T]].map(([n, c]) => h('span', { html: `<i style="background:${c}"></i>${n}` }))),
    h('h2', { text: 'Why rabbits died, event by event' }), deathCanvas,
    h('h2', { text: 'What happened' }), h('ol', { class: 'sentences' }, rep.sentences.map((s) => h('li', { text: s }))),
    h('h2', { text: 'Reflect' }),
    rep.questions.map((q, i) => h('div', { class: 'q' }, h('label', { text: `${i + 1}. ${q}` }), answers[i])),
    h('p', { class: 'note no-print', text: 'Your answers are kept on this device only.' }),
    h('div', { class: 'end-actions' }, copyBtn, h('button', { class: 'btn', text: 'Print', onclick: () => window.print() }),
      h('button', { class: 'btn primary', text: 'Play again (same seed)', onclick: () => { root.classList.add('hidden'); app.start('survive', sim.seedCode); } }),
      h('button', { class: 'btn', text: 'New seed', onclick: () => { root.classList.add('hidden'); app.start('survive', null); } }),
      h('button', { class: 'btn', text: 'Look at the valley', onclick: () => root.classList.add('hidden') }),
      h('button', { class: 'btn', text: 'Menu', onclick: () => { root.classList.add('hidden'); app.home(); } }))));
  root.classList.remove('hidden');
  root.scrollTop = 0;
  requestAnimationFrame(() => {
    drawAlleleChart(alleleCanvas, sim.history, { bands: ch.windows });
    drawDeathBars(deathCanvas, rep.deathsByWindow);
  });
  return rep;
}
export { mmss };
