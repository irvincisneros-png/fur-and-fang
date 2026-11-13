// Two Lineages 10:00: ranger panel, prediction stop and end screen (spec sections 5 and 7.8).
import { h } from './dom.js';
import { P } from '../sim/params.js';
import { alleleFreq, composition } from '../sim/history.js';
import { L } from '../sim/lineages.js';
import { LINEAGE_HEX } from './legend.js';
import { COLORS } from './graphs.js';

const pct = (v) => (v == null ? '–' : Math.round(v * 100) + '%');
const BANDS = [['one', 'Still one species', 'They will interbreed freely.'], ['between', 'In between', 'Some hybrid kits will fail or be unable to breed.'], ['two', 'Two species', 'They can mate, but hybrids will rarely survive and breed.']];

export function buildLineages(root, ctx) {
  const { app, ui } = ctx;
  const ch = () => app.challenge, sim = () => app.sim;
  root.innerHTML = '';
  const W = sim().burrows[1], E = sim().burrows[2];
  const bankBars = (regs) => {
    const c = composition(sim().rabbits.filter((r) => r.alive && regs.includes(r.region)));
    return h('div', { class: 'src-bars' }, [['b', 'White fur (b)'], ['e', 'Long ears (e)'], ['T', 'Long teeth (T)']].map(([a, t]) =>
      h('div', { class: 'bar-row' }, h('span', { text: t }), h('i', { class: 'bar' }, h('b', { style: { width: pct(c.n ? alleleFreq(c, a) : 0), background: COLORS[a] } })), h('em', { text: c.n ? pct(alleleFreq(c, a)) : '–' }))));
  };
  const btn = (label, cost, fn) => h('button', { class: 'btn small act', onclick: () => { const r = fn(); if (r && !r.ok) ui.toast(r.reason, 'bad'); else app.ui.refresh(true); } }, label, h('small', { text: ` ${cost} trust` }));
  const carryWE = btn('Carry 4: West → East', L.CARRY_COST, () => ch().carry(0));
  const carryEW = btn('Carry 4: East → West', L.CARRY_COST, () => ch().carry(1));
  const fenceW = btn('Fox fence: West', P.COST.fence, () => ch().fence(0));
  const fenceE = btn('Fox fence: East', P.COST.fence, () => ch().fence(1));
  const clover = btn('Clover patch', P.COST.clover, () => { ui.beginPlace('clover'); return { ok: true }; });
  const shelter = btn('Brush shelter', P.COST.shelter, () => { ui.beginPlace('shelter'); return { ok: true }; });
  const test = btn('Test cross', L.TEST_COST, () => { const r = ch().testCross(); if (r.ok) ui.toast(`Test cross: ${pct(r.born / r.conceived)} of kits born alive, ${pct(r.phi)} able to breed.`, 'info', 7000); return r; });
  const banks = h('div', { class: 'banks' });
  const meter = h('div', { class: 'meter-box' });
  const lv = h('input', { type: 'checkbox', id: 'lv2' });
  lv.addEventListener('change', () => { ui.setGenotypeView(false); app.world?.setLineageView?.(lv.checked); });
  root.append(
    h('details', { open: true }, h('summary', { text: 'Two lineages' }),
      h('p', { class: 'note', text: 'A flood will split the warren. Keep both lineages alive (at least 6 each) until the water drops at 8:00. Then find out: are they still one species?' }), banks),
    h('details', { open: true }, h('summary', { text: 'Ranger tools' }),
      h('div', { class: 'act-col' }, carryWE, carryEW),
      h('p', { class: 'note', text: 'Carrying moves alleles between the banks and keeps the lineages alike. It works only while the river is up.' }),
      h('div', { class: 'act-col' }, fenceW, fenceE, clover, shelter),
      h('p', { class: 'note', text: `Your tools work on the bank you use them on. A fence starts next generation and lasts ${L.FENCE_GENS}.` })),
    h('details', { open: true }, h('summary', { text: 'Still one species?' }), meter, h('div', { class: 'act-col' }, test),
      h('div', { class: 'row' }, lv, h('label', { for: 'lv2', text: 'Lineage view' })),
      h('p', { class: 'legend-line' }, [['West', LINEAGE_HEX[1]], ['East', LINEAGE_HEX[2]], ['Mixed', '#ffffff'], ['Cannot breed', '#8a8a8a']].map(([t, c]) => h('span', {}, h('i', { class: 'sw', style: { background: c } }), t + '  ')))));
  let banksKey = '';
  return {
    update() {
      const c = ch(), s = sim(); if (!c || !s.isl) return;
      const pops = s.isl.pops, key = pops.map((p) => p.name).join() + s.gen;
      if (key !== banksKey) {
        banksKey = key; banks.innerHTML = '';
        if (pops.length < 2) banks.append(h('p', { class: 'note', text: s.t < L.REJOIN ? `One valley: ${s.pop} rabbits. The flood comes at about 1:30.` : 'The crossing is back: the lineages are meeting.' }));
        else pops.slice(0, 2).forEach((p, i) => banks.append(h('div', { class: 'land', style: { borderColor: LINEAGE_HEX[1 << p.regions[0]] } }, h('b', { text: `${i === 0 ? 'West' : 'East'} lineage: ${p.n} rabbits` }), bankBars(p.regions))));
      }
      meter.innerHTML = '';
      if (pops.length > 1) { const d = s.distance(0, 1); meter.append(h('div', { class: 'meter' }, h('span', { class: 'm-lbl', text: 'Hidden DNA differences: West and East' }), h('div', { class: 'm-bar' }, h('i', { style: { width: (d / P.ISLANDS.K * 100).toFixed(1) + '%' } })), h('span', { class: 'm-val', text: d.toFixed(1) }))); }
      const last = s.isl.crosses[s.isl.crosses.length - 1];
      if (last) meter.append(h('p', { class: 'note', text: `Last test cross (generation ${last.gen}): ${pct(last.born / last.conceived)} born alive, ${pct(last.phi)} able to breed.` }));
      const set = (b, why) => { b.disabled = !!why; b.title = why || ''; };
      set(carryWE, c.canAct('carry')); set(carryEW, c.canAct('carry')); set(fenceW, c.canAct('fence', 0)); set(fenceE, c.canAct('fence', 1));
      set(clover, c.canAct('clover')); set(shelter, c.canAct('shelter')); set(test, c.canAct('testcross') || (pops.length < 2 ? 'Only while the lineages are apart.' : null));
    },
  };
}

// The prediction stop at 7:30: pauses the run until the student picks a label and gives a reason.
export function showPrediction(app, ui) {
  const ch = app.challenge, sim = app.sim;
  ui.setPaused(true);
  const box = document.getElementById('predict') || document.body.appendChild(h('div', { id: 'predict', class: 'overlay predict-card', role: 'dialog', 'aria-modal': 'true' }));
  let pick = ch.prediction?.band || null;
  const reason = h('textarea', { rows: 3, placeholder: 'One sentence: what evidence did you use?', 'aria-label': 'Reason' }); reason.value = ch.prediction?.reason || '';
  const go = h('button', { class: 'btn primary', text: 'Lock in and continue', disabled: pick ? null : true, onclick: () => { ch.predict(pick, reason.value); box.classList.add('hidden'); ui.setPaused(false); } });
  const opts = BANDS.map(([k, t, d]) => h('button', { class: 'mode-card pick' + (pick === k ? ' on' : ''), onclick: (e) => { pick = k; box.querySelectorAll('.pick').forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); go.disabled = false; } }, h('b', { text: t }), h('small', { text: d })));
  const d = sim.isl.pops.length > 1 ? sim.distance(0, 1).toFixed(1) : '–';
  const crosses = sim.isl.crosses.map((c) => `gen ${c.gen}: ${pct(c.phi)} able to breed`).join('; ') || 'none yet';
  box.innerHTML = '';
  box.append(h('div', { class: 'end-inner' },
    h('h1', { text: 'Predict before the water drops' }),
    h('p', { text: `In 30 seconds the crossing reopens and West and East rabbits can meet. Hidden DNA differences now: ${d}. Your test crosses: ${crosses}.` }),
    h('div', { class: 'mode-cards' }, opts), reason, h('div', { class: 'end-actions' }, go)));
  box.classList.remove('hidden');
}

export function showLineagesEnd(root, app) {
  const ch = app.challenge, sim = app.sim, rep = ch.report();
  const star = (got, label) => h('div', { class: 'star' + (got ? ' got' : '') }, h('span', { class: 's', text: '★' }), label);
  const v = rep.verdict, p = rep.prediction;
  const qs = rep.questions.map((q, i) => h('div', { class: 'q' }, h('label', { text: `${i + 1}. ${q}` }), h('textarea', { 'aria-label': 'Answer ' + (i + 1) })));
  const text = () => [`Fur & Fang: Two Lineages (seed ${sim.seedCode})`, rep.headline, ...rep.lines, p ? `My prediction: ${p.band} (${p.reason})` : '', ...rep.questions.map((q, i) => `${i + 1}. ${q}\n${qs[i].querySelector('textarea').value || '(no answer)'}`)].join('\n');
  root.innerHTML = '';
  root.append(h('div', { class: 'end-inner' },
    h('h1', { text: ch.result?.outcome === 'lost' ? 'A lineage died out' : 'The reunion' }),
    h('p', { class: 'pheno-line', text: rep.headline }),
    h('div', { class: 'stars' }, star(rep.stars.survived, 'Both lineages alive at 8:00'), star(rep.stars.population, 'Both had 30 or more'), star(rep.stars.prediction, 'Your prediction matched')),
    v ? h('div', { class: 'f-box' }, h('b', { class: 'f-title', text: v.source === 'test' ? 'Test cross at the reunion' : 'Cross kits after the reunion' }),
      [['Conceived', v.conceived], ['Born alive', v.born], ['Able to breed', v.fertile]].map(([t, n]) => h('div', { class: 'f-row' }, h('span', { text: t }), h('i', { style: { width: (v.conceived ? n / v.conceived * 100 : 0) + '%' } }), h('b', { text: n })))) : null,
    p ? h('p', { class: 'verdict', text: `You predicted "${BANDS.find((b) => b[0] === p.band)?.[1]}". ${p.reason ? 'Your reason: ' + p.reason : ''}` }) : null,
    h('h2', { text: 'What happened' }), h('ol', { class: 'sentences' }, rep.lines.map((s) => h('li', { text: s }))),
    h('h2', { text: 'Reflect' }), qs,
    h('div', { class: 'end-actions' },
      h('button', { class: 'btn', text: 'Copy my report', onclick: async (e) => { try { await navigator.clipboard.writeText(text()); e.target.textContent = 'Copied'; } catch { e.target.textContent = 'Copy failed: use Print'; } } }),
      h('button', { class: 'btn', text: 'Print', onclick: () => window.print() }),
      h('button', { class: 'btn primary', text: 'Play again (same seed)', onclick: () => { root.classList.add('hidden'); app.start('lineages', sim.seedCode); } }),
      h('button', { class: 'btn', text: 'Look at the valley', onclick: () => root.classList.add('hidden') }),
      h('button', { class: 'btn', text: 'Menu', onclick: () => { root.classList.add('hidden'); app.home(); } }))));
  root.classList.remove('hidden'); root.scrollTop = 0;
}
