// Islands lab side panel (spec section 7): investigations, water, lands, "Still one species?", castaways, side-by-side charts.
import { h, slider, download } from './dom.js';
import { P } from '../sim/params.js';
import { alleleFreq, composition } from '../sim/history.js';
import { SCENARIOS, LAND_PRESETS, founderTrial, speciesLabel, populationsOf } from '../sim/islands.js';
import { INVESTIGATIONS, MODEL_LIMITS } from '../content/islands.js';
import { COLORS } from './graphs.js';
import { LINEAGE_HEX } from './legend.js';

const I = P.ISLANDS;
const pct = (v) => (v == null ? '–' : Math.round(v * 100) + '%');
const STORE = 'ff-islands-v1';
function loadStore() { try { const v = JSON.parse(localStorage.getItem(STORE) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; } }
function saveStore(v) { try { localStorage.setItem(STORE, JSON.stringify(v)); return true; } catch { return false; } }
const POP_HEX = (regions) => (regions.length === 1 ? LINEAGE_HEX[1 << regions[0]] : regions.includes(0) && regions.includes(1) ? '#5a7f6a' : regions.includes(1) && regions.includes(2) ? '#c98f4a' : '#7d8a66');

export function buildIslands(root, ctx) {
  const { app, ui } = ctx;
  const sim = () => app.sim;
  root.innerHTML = '';
  const store = loadStore(); store.answers ||= {}; store.trials ||= { 4: [], 16: [] };
  let inv = app.islandsInv ?? 0;
  const done = new Set(app.islandsDone || []);
  const mark = (k) => { if (!done.has(k)) { done.add(k); app.islandsDone = [...done]; renderInv(); } };

  // ---------- Investigation ----------
  const invBody = h('div', { class: 'poe' });
  const ta = (key, label) => {
    const t = h('textarea', { rows: 3, 'aria-label': label, placeholder: label });
    t.value = store.answers[key] || '';
    t.addEventListener('input', () => { store.answers[key] = t.value; status.textContent = saveStore(store) ? 'Saved on this device.' : 'Could not save on this device: copy your answers before you leave.'; });
    return t;
  };
  const status = h('p', { class: 'note', role: 'status' });
  function renderInv() {
    const it = INVESTIGATIONS[inv];
    invBody.innerHTML = '';
    invBody.append(
      h('b', { text: it.title }),
      h('p', { class: 'poe-q' }, h('b', { text: 'Predict: ' }), it.predict), ta(it.id + ':p', 'Your prediction'),
      h('ol', { class: 'steps' }, it.steps.map((s) => h('li', { class: s.done && done.has(s.done) ? 'done' : '' }, (s.done && done.has(s.done) ? '✓ ' : '') + s.text))),
      h('p', { class: 'poe-q' }, h('b', { text: 'Explain: ' }), it.explain), ta(it.id + ':e', 'Your explanation'), status,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn small', text: 'Back', disabled: inv === 0 ? true : null, onclick: () => { inv--; app.islandsInv = inv; renderInv(); } }),
        h('button', { class: 'btn small primary', text: 'Set up', onclick: () => setUp(it) }),
        h('button', { class: 'btn small', text: 'Next', disabled: inv === INVESTIGATIONS.length - 1 ? true : null, onclick: () => { inv++; app.islandsInv = inv; renderInv(); } })));
  }
  function setUp(it) {
    app.islandsInv = inv; app.islandsDone = [];
    const envs = it.setup.lands.map((k) => ({ ...LAND_PRESETS[k].env }));
    app.start('islands', sim().seedCode, { scenario: it.setup.scenario, envs: [envs[0], envs[1], envs[1]], reopenAt: it.setup.reopenAt ?? null });
  }
  renderInv();
  const investigation = h('details', { open: true }, h('summary', { text: 'Investigation' }), invBody);

  // ---------- Water ----------
  const mapCv = h('canvas', { class: 'isl-map', width: 220, height: 160, 'aria-label': 'Map of the valley with the three lands and the water' });
  const crossBtns = {
    river: h('button', { class: 'btn small', onclick: () => toggle('river') }),
    midFord: h('button', { class: 'btn small', onclick: () => toggle('midFord') }),
    channel: h('button', { class: 'btn small', onclick: () => toggle('channel') }),
  };
  const CROSS_NAME = { river: 'River (north and south fords)', midFord: 'Middle ford stones', channel: 'Side channel' };
  const waterOf = () => sim().isl.pending || sim().isl.water;
  function toggle(what) { const w = waterOf(); sim().setWater({ [what]: w[what] ? 0 : 1 }); updateWater(); }
  const pendingLine = h('p', { class: 'note', role: 'status' });
  const scenBtns = Object.entries(SCENARIOS).map(([id, sc]) => h('button', { class: 'btn small preset', 'data-id': id, text: sc.label, onclick: () => { sim().setScenario(id); updateWater(); } }));
  const carryFrom = h('select', { 'aria-label': 'Carry from' }), carryTo = h('select', { 'aria-label': 'Carry to' });
  const carryBtn = h('button', { class: 'btn small', text: 'Carry 4 across', onclick: () => {
    const r = sim().carry(+carryFrom.value, +carryTo.value, I.CARRY_COUNT);
    if (r.ok) { ui.toast('Four adults will be carried across at the start of the next generation. They take their alleles with them.', 'info'); app.islandsCarries = (app.islandsCarries || 0) + 1; if (app.islandsCarries >= 5) mark('carries5'); }
    else ui.toast(r.reason, 'bad');
  } });
  function drawMap() {
    const c = mapCv.getContext('2d'), W = mapCv.width, H = mapCv.height, S = sim().isl;
    const X = (x) => ((x + 55) / 110) * W, Z = (z) => ((z + 50) / 100) * H;
    c.clearRect(0, 0, W, H);
    for (let px = 0; px < W; px += 4) for (let pz = 0; pz < H; pz += 4) {
      const x = (px / W) * 110 - 55, z = (pz / H) * 100 - 50;
      if (Math.hypot(x, z) > 52) continue;
      const reg = x < streamXL(z) ? 0 : (z > -10 && z < 22 && x < channelXL(z)) ? 2 : 1;
      c.fillStyle = LINEAGE_HEX[1 << reg] + '55'; c.fillRect(px, pz, 4, 4);
    }
    c.lineCap = 'round';
    c.strokeStyle = S.water.river ? '#7a6a3a' : '#3d9fb5'; c.lineWidth = S.water.river ? 7 : 3.5; c.beginPath();
    for (let z = -50; z <= 50; z += 2) { const x = X(streamXL(z)), y = Z(z); z === -50 ? c.moveTo(x, y) : c.lineTo(x, y); } c.stroke();
    if (S.channelLevel > 0.05) { c.strokeStyle = '#3d9fb5'; c.lineWidth = 3; c.beginPath(); for (let z = -10; z <= 22; z += 1) { const x = X(channelXL(z)), y = Z(z); z === -10 ? c.moveTo(x, y) : c.lineTo(x, y); } c.stroke(); }
    const L = { WE: S.water.river === 0, WI: S.water.river === 0 && S.water.midFord === 0 };
    for (const [z, open] of [[-24, L.WE], [4.2, L.WI], [31, L.WE]]) { c.fillStyle = open ? '#2b2a28' : '#b5483a'; c.beginPath(); c.arc(X(streamXL(z)), Z(z), 4, 0, 7); c.fill(); }
    c.font = '700 11px Mulish, sans-serif'; c.fillStyle = '#2b2a28';
    c.fillText('West', X(-40), Z(0)); c.fillText('East', X(18), Z(-34)); c.fillText('Islet', X(16), Z(8));
  }
  const streamXL = (z) => -9 + 15 * Math.sin(z * 0.043 + 0.9) + 5 * Math.sin(z * 0.11 + 2.0);
  const channelXL = (z) => streamXL(z) + 26 * Math.sin(Math.PI * (z + 10) / 32);
  function updateWater() {
    const S = sim().isl, w = waterOf();
    for (const [k, b] of Object.entries(crossBtns)) {
      const blocked = w[k] === 1;
      b.textContent = `${CROSS_NAME[k]}: ${k === 'channel' ? (blocked ? 'full' : 'dry') : blocked ? (k === 'river' ? 'flooded' : 'washed out') : 'open'}`;
      b.classList.toggle('on', blocked);
    }
    const sc = Object.entries(SCENARIOS).find(([, v]) => ['river', 'midFord', 'channel'].every((k) => v.water[k] === w[k]));
    scenBtns.forEach((b) => b.classList.toggle('on', sc && b.dataset.id === sc[0]));
    const nowP = S.pops.map((p) => p.name).join(' / '), nextP = populationsOf(w).length;
    pendingLine.textContent = S.pending ? `Changes at the start of the next generation (${nextP} population${nextP > 1 ? 's' : ''}).` : `Now: ${nowP}.`;
    const opts = S.pops.map((p, i) => `<option value="${i}">${p.name}</option>`).join('');
    if (carryFrom.dataset.k !== opts) { carryFrom.innerHTML = opts; carryTo.innerHTML = opts; carryTo.value = String(Math.min(1, S.pops.length - 1)); carryFrom.dataset.k = opts; }
    carryBtn.disabled = S.pops.length < 2;
    drawMap();
  }
  const water = h('details', { open: true }, h('summary', { text: 'Water' }), mapCv,
    h('div', { class: 'btn-row' }, scenBtns),
    h('div', { class: 'cross-col' }, Object.values(crossBtns)), pendingLine,
    h('div', { class: 'row carry-row' }, carryFrom, h('span', { text: 'to' }), carryTo, carryBtn),
    h('p', { class: 'note', text: 'Flooding the river splits the valley. Nothing about the rabbits changes when the water rises: isolation only stops gene flow.' }));

  // ---------- Lands ----------
  const landsBody = h('div', {});
  let landKey = '';
  function renderLands() {
    const S = sim().isl, key = S.pops.map((p) => p.regions.join('')).join('|');
    if (key === landsBody.dataset.k) return; landsBody.dataset.k = key; landsBody.innerHTML = '';
    S.pops.forEach((p, pi) => {
      const e = S.regions[p.regions[0]].env;
      const food = slider({ label: 'Land size (rabbits fed)', min: 10, max: 400, step: 5, value: p.regions.reduce((s, i) => s + S.regions[i].env.food, 0), fmt: Math.round, onInput: (v) => {
        const tot = p.regions.reduce((s, i) => s + I.CAP_SHARE[i], 0);
        p.regions.forEach((i) => sim().setRegionEnv(i, { food: v * I.CAP_SHARE[i] / tot }));
      } });
      const fox = slider({ label: 'Foxes', min: 0, max: 6, step: 1, value: e.predators, fmt: (v) => v, onInput: (v) => sim().setPopulationEnv(pi, { predators: v }) });
      landsBody.append(h('div', { class: 'land', style: { borderColor: POP_HEX(p.regions) } }, h('b', { text: p.name }),
        h('div', { class: 'btn-row' }, Object.entries(LAND_PRESETS).map(([k, lp]) => h('button', { class: 'btn small', text: lp.label, onclick: () => { sim().setPopulationEnv(pi, lp.env); fox.set(lp.env.predators); ui.toast(`${p.name}: ${lp.label.toLowerCase()} from the next generation.`, 'info'); } }))),
        food, fox));
    });
  }
  const lands = h('details', {}, h('summary', { text: 'Lands and climate' }), landsBody, h('p', { class: 'note', text: 'Each land has its own weather and foxes. Food is shared within a population.' }));

  // ---------- Still one species? ----------
  const meter = h('div', { class: 'meter-box' });
  const crossTable = h('div', { class: 'cross-table' });
  const reunionBox = h('div', { class: 'funnel' });
  const tcBtn = h('button', { class: 'btn small primary', text: 'Test cross (in a pen)', onclick: () => {
    const r = sim().testCross(0, 1);
    if (!r.ok) { ui.toast(r.reason, 'bad'); return; }
    if (sim().isl.crosses.length >= 4) mark('crosses4');
    renderCrosses();
  } });
  function renderMeter() {
    const S = sim().isl; meter.innerHTML = '';
    const pairs = S.pops.length > 1 ? [[0, 1]].concat(S.pops.length > 2 ? [[0, 2], [1, 2]] : []) : [];
    if (!pairs.length) { meter.append(h('p', { class: 'note', text: 'One population: every rabbit can reach every other, so no hidden differences build up.' })); return; }
    for (const [a, b] of pairs) {
      const d = sim().distance(a, b);
      meter.append(h('div', { class: 'meter' }, h('span', { class: 'm-lbl', text: `Hidden DNA differences: ${S.pops[a].name} and ${S.pops[b].name}` }),
        h('div', { class: 'm-bar' }, h('i', { style: { width: (d / I.K * 100).toFixed(1) + '%' } })), h('span', { class: 'm-val', text: `${d.toFixed(1)} of ${I.K}` })));
    }
    meter.append(h('p', { class: 'note', text: `Apart for ${S.apartGens} generation${S.apartGens === 1 ? '' : 's'}. These differences do not change fur, ears or teeth. You cannot see them on a rabbit.` }));
  }
  function renderCrosses() {
    const X = sim().isl.crosses; crossTable.innerHTML = '';
    if (!X.length) return;
    crossTable.append(h('table', {}, h('tr', {}, ['Gen', 'Apart', 'Born alive', 'Can breed', 'Result'].map((t) => h('th', { text: t }))),
      X.slice(-6).map((c) => h('tr', {}, h('td', { text: c.gen }), h('td', { text: c.apart }), h('td', { text: pct(c.born / c.conceived) }), h('td', { text: pct(c.phi) }), h('td', { text: c.label.band === 'one' ? 'One species' : c.label.band === 'two' ? 'Two species' : 'In between' })))));
    const lastC = X[X.length - 1];
    crossTable.append(funnel('Test cross (pen, kits not released)', lastC.conceived, lastC.born, lastC.fertile), h('p', { class: 'verdict', text: lastC.label.text }));
  }
  function funnel(title, c, b, f) {
    const row = (lbl, n) => h('div', { class: 'f-row' }, h('span', { text: lbl }), h('i', { style: { width: (c ? n / c * 100 : 0) + '%' } }), h('b', { text: n }));
    return h('div', { class: 'f-box' }, h('b', { class: 'f-title', text: title }), row('Cross kits conceived', c), row('Born alive', b), row('Able to breed', f));
  }
  function renderReunion() {
    const R = sim().reunionResult(); reunionBox.innerHTML = '';
    if (!R) return;
    if (R.conceived > 0) mark('reunionKits');
    reunionBox.append(funnel(`Since the crossing reopened (generation ${R.gen} to now)`, R.conceived, R.born, R.fertile),
      R.label ? h('p', { class: 'verdict', text: `${pct(R.phi)} of cross kits can breed. ${R.label.text}` }) : h('p', { class: 'note', text: 'Waiting for the first kits with one parent from each side.' }),
      h('p', { class: 'note', text: `Control: kits from same-side pairs: ${R.sameConceived} conceived, ${R.sameBorn} born alive, ${R.sameFertile} able to breed.` }));
  }
  const species = h('details', { open: true }, h('summary', { text: 'Still one species?' }), meter, h('div', { class: 'btn-row' }, tcBtn),
    h('p', { class: 'note', text: 'A test cross pairs 12 adults from each side in a pen. It does not change the valley. The real test of one species: can they have kits that grow up and breed?' }),
    crossTable, reunionBox);

  // ---------- Castaways ----------
  let nFound = 4;
  const sizeBtns = I.STORM_CHOICES.map((n) => h('button', { class: 'btn small', text: n, onclick: () => { nFound = n; sizeBtns.forEach((b) => b.classList.toggle('on', +b.textContent === n)); } }));
  sizeBtns.forEach((b) => b.classList.toggle('on', +b.textContent === nFound));
  const foundCard = h('div', { class: 'found-card' });
  const plot = h('canvas', { class: 'dotplot', width: 300, height: 130, 'aria-label': 'Dot plot of islet white-fur allele after 15 generations, one dot per run' });
  const plotNote = h('p', { class: 'note', role: 'status' });
  const stormBtn = h('button', { class: 'btn small primary', text: 'Send the storm', onclick: () => {
    const r = sim().storm(nFound);
    if (!r.ok) ui.toast(r.reason, 'bad'); else ui.toast(`A storm is coming: ${nFound} rabbits will be swept to the islet at the start of the next generation.`, 'info');
  } });
  const trialBtn = h('button', { class: 'btn small', text: 'Run 20 quick islands', onclick: () => runTrials() });
  function renderFounders() {
    const st = sim().isl.lastStorm; foundCard.innerHTML = '';
    if (!st) return;
    mark('storm');
    if (sim().gen - st.gen >= 15) mark('stormGens15');
    const isl = composition(sim().rabbits.filter((r) => r.alive && r.region === 2)), main = composition(sim().rabbits.filter((r) => r.alive && r.region !== 2));
    foundCard.append(h('table', {}, h('tr', {}, ['', 'b white', 'e long ears', 'T long teeth'].map((t) => h('th', { text: t }))),
      h('tr', {}, h('td', { text: `Mainland at the storm` }), ['b', 'e', 'T'].map((a) => h('td', { text: pct(st.source[a]) }))),
      h('tr', {}, h('td', { text: `The ${st.n} castaways` }), ['b', 'e', 'T'].map((a) => h('td', { text: pct(st.founders[a]) }))),
      h('tr', {}, h('td', { text: `Islet now (${isl.n})` }), ['b', 'e', 'T'].map((a) => h('td', { text: isl.n ? pct(alleleFreq(isl, a)) : '–' }))),
      h('tr', {}, h('td', { text: `Mainland now (${main.n})` }), ['b', 'e', 'T'].map((a) => h('td', { text: pct(alleleFreq(main, a)) })))),
    h('p', { class: 'note', text: `Chance picked these ${st.n}, not fitness. ${sim().gen - st.gen} generation${sim().gen - st.gen === 1 ? '' : 's'} since the storm.` }));
  }
  function runTrials() {
    const base = sim().seedCode, n = nFound, out = [];
    trialBtn.disabled = true; plotNote.textContent = 'Running 20 islands…';
    let i = 0;
    const tick = () => {
      for (let k = 0; k < 2 && i < I.TRIAL_RUNS; k++, i++) { const r = founderTrial({ seedCode: base + '-' + (i + 1), founders: n }); if (r) out.push(r); }
      plotNote.textContent = `Running islands… ${i} of ${I.TRIAL_RUNS}`;
      if (i < I.TRIAL_RUNS) { setTimeout(tick, 0); return; }
      store.trials[n] = out.map((r) => ({ islet: r.islet.b, main: r.mainland.b, n: r.islet.n })); saveStore(store);
      app.islandsTrials = app.islandsTrials || {}; app.islandsTrials[n] = store.trials[n];
      if (n === 4) mark('trials4'); if (n === 16) mark('trials16');
      trialBtn.disabled = false; drawPlot();
    };
    tick();
  }
  function drawPlot() {
    const c = plot.getContext('2d'), W = plot.width, H = plot.height; c.clearRect(0, 0, W, H);
    const rows = Object.entries(store.trials).filter(([, v]) => v && v.length);
    const L = 64, R = W - 10, X = (v) => L + v * (R - L);
    c.font = '700 11px Mulish, sans-serif'; c.fillStyle = '#5a554b'; c.textBaseline = 'middle';
    c.strokeStyle = 'rgba(43,42,40,0.25)'; for (const v of [0, 0.5, 1]) { c.beginPath(); c.moveTo(X(v), 6); c.lineTo(X(v), H - 18); c.stroke(); c.fillText(pct(v), X(v) - 10, H - 8); }
    const notes = [];
    rows.forEach(([n, data], ri) => {
      const y = 22 + ri * 44;
      c.fillStyle = '#2b2a28'; c.fillText(`${n} founders`, 2, y);
      data.forEach((d, j) => {
        const yy = y + ((j % 5) - 2) * 3.2;
        c.fillStyle = '#2b2a28'; c.beginPath(); c.moveTo(X(d.main), yy + 12); c.lineTo(X(d.main) + 3, yy + 15); c.lineTo(X(d.main), yy + 18); c.lineTo(X(d.main) - 3, yy + 15); c.fill();
        const hollow = d.islet <= 0 || d.islet >= 1;
        c.beginPath(); c.arc(X(d.islet), yy, 3.6, 0, 7); if (hollow) { c.strokeStyle = COLORS.b; c.lineWidth = 1.6; c.stroke(); } else { c.fillStyle = COLORS.b; c.fill(); }
      });
      const xs = data.map((d) => d.islet), m = xs.reduce((s, x) => s + x, 0) / xs.length, sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
      const ms = data.map((d) => d.main), mm = ms.reduce((s, x) => s + x, 0) / ms.length, msd = Math.sqrt(ms.reduce((s, x) => s + (x - mm) ** 2, 0) / ms.length);
      notes.push(`${n} founders: islet spread ${sd.toFixed(2)} (mainland ${msd.toFixed(2)}); white fur lost in ${xs.filter((x) => x <= 0).length} and fixed in ${xs.filter((x) => x >= 1).length} of ${xs.length} islands.`);
    });
    plotNote.textContent = rows.length ? notes.join(' ') + ' Dots: islet b after 15 generations. Diamonds: the mainland in the same run.' : 'No runs yet.';
  }
  const castaways = h('details', {}, h('summary', { text: 'Castaways (founder effect)' }),
    h('p', { class: 'note', text: 'Needs the islet cut off (Storm island). The islet has the same climate as the mainland, so any difference is chance.' }),
    h('div', { class: 'btn-row' }, h('span', { class: 'note', text: 'Castaways:' }), sizeBtns), h('div', { class: 'btn-row' }, stormBtn, trialBtn), foundCard, plot, plotNote);

  // ---------- Side by side charts ----------
  const charts = h('div', { class: 'isl-charts' });
  function drawCharts() {
    const recs = sim().history.records, S = sim().isl;
    const groups = S.pops.map((p) => ({ name: p.name, regions: p.regions }));
    if (charts.dataset.k !== groups.map((g) => g.name).join()) { charts.dataset.k = groups.map((g) => g.name).join(); charts.innerHTML = ''; groups.forEach(() => charts.append(h('canvas', { width: 300, height: 110 }))); }
    const xMax = Math.max(10, recs.length - 1);
    [...charts.children].forEach((cv, gi) => {
      const g = groups[gi], c = cv.getContext('2d'), W = cv.width, H = cv.height, L = 30, T = 16, B = H - 16, Rr = W - 6;
      c.clearRect(0, 0, W, H);
      c.fillStyle = POP_HEX(g.regions); c.font = '800 12px Mulish, sans-serif'; c.textBaseline = 'middle';
      const nNow = recs.length ? recs[recs.length - 1].reg?.reduce((s, r, i) => s + (g.regions.includes(i) ? r.n : 0), 0) ?? 0 : 0;
      c.fillText(`${g.name} (${nNow})`, L, 7);
      c.strokeStyle = 'rgba(43,42,40,0.2)'; c.fillStyle = '#5a554b'; c.font = '600 10px Mulish, sans-serif';
      for (const v of [0, 0.5, 1]) { const y = B - v * (B - T); c.beginPath(); c.moveTo(L, y); c.lineTo(Rr, y); c.stroke(); c.fillText(pct(v), 2, y); }
      if (S.splitGen != null) { const x = L + (S.splitGen / xMax) * (Rr - L); c.setLineDash([4, 3]); c.strokeStyle = '#2b2a28'; c.beginPath(); c.moveTo(x, T); c.lineTo(x, B); c.stroke(); c.setLineDash([]); }
      for (const a of ['b', 'e', 'T']) {
        c.strokeStyle = COLORS[a]; c.lineWidth = 2; c.beginPath(); let first = true;
        recs.forEach((rec, i) => {
          if (!rec.reg) return;
          const comp = mergeComp(rec.reg.filter((_, k) => g.regions.includes(k)).map((r) => r.comp));
          if (!comp.n) { first = true; return; }
          const x = L + (i / xMax) * (Rr - L), y = B - alleleFreq(comp, a) * (B - T);
          first ? c.moveTo(x, y) : c.lineTo(x, y); first = false;
        });
        c.stroke();
      }
    });
  }
  const chartsBox = h('details', { open: true }, h('summary', { text: 'Side by side: alleles in each population' }), charts,
    h('p', { class: 'legend-line' }, ['b white fur', 'e long ears', 'T long teeth'].map((t, i) => h('span', { style: { color: COLORS[['b', 'e', 'T'][i]] }, text: '■ ' + t + '  ' }))),
    h('p', { class: 'note', text: 'Same scale on every chart. The dashed line marks the split. Lines continue from the same starting alleles.' }));

  // ---------- View and run ----------
  const lv = h('input', { type: 'checkbox', id: 'lv' });
  lv.addEventListener('change', () => { ui.setGenotypeView(false); app.world?.setLineageView?.(lv.checked); });
  const jumpBtn = h('button', { class: 'btn small', text: 'Jump 10 generations', onclick: () => jump() });
  function jump() {
    jumpBtn.disabled = true; let n = 0;
    const tick = () => {
      if (sim().ended || n >= 10) { jumpBtn.disabled = false; ui.refresh(true); return; }
      sim().advance(P.GEN_LEN); n++; jumpBtn.textContent = `Fast-forwarding, generation ${sim().gen}`;
      if (n >= 10) jumpBtn.textContent = 'Jump 10 generations';
      requestAnimationFrame(tick);
    };
    tick();
  }
  const view = h('details', {}, h('summary', { text: 'View and run' }),
    h('div', { class: 'row' }, lv, h('label', { for: 'lv', text: 'Lineage view (rings by where a rabbit\'s family comes from)' })),
    h('p', { class: 'legend-line' }, [['West', LINEAGE_HEX[1]], ['East', LINEAGE_HEX[2]], ['Islet', LINEAGE_HEX[4]], ['Mixed', '#ffffff'], ['Cannot breed', '#8a8a8a']].map(([t, c]) => h('span', {}, h('i', { class: 'sw', style: { background: c } }), t + '  '))),
    h('div', { class: 'btn-row' }, jumpBtn,
      h('button', { class: 'btn small', text: 'Download CSV (by land)', onclick: () => download(`fur-and-fang-${sim().seedCode}-populations.csv`, islandsCSV(sim())) }),
      h('button', { class: 'btn small', text: 'New seed', onclick: () => app.start('islands', null) })),
    h('details', { class: 'limits' }, h('summary', { text: 'What this model leaves out' }), h('ul', {}, MODEL_LIMITS.map((t) => h('li', { text: t })))));

  root.append(investigation, water, lands, species, castaways, chartsBox, view);
  drawPlot();

  return {
    update() {
      const s = sim(); if (!s?.isl) return;
      updateWater(); renderLands(); renderMeter(); renderReunion(); renderFounders();
      if (s.isl.crosses.length !== +crossTable.dataset.n) { crossTable.dataset.n = s.isl.crosses.length; renderCrosses(); }
      if (chartsBox.open) drawCharts();
      if (s.gen >= 10) mark('gens10');
      if (s.isl.reunion) mark('rejoined');
      const ro = app.islandsReopenAt;
      if (ro != null && s.isl.pops.length > 1 && s.isl.apartGens >= ro && !s.isl.pending) { app.islandsReopenAt = null; s.setScenario('open'); }
    },
  };
}

function mergeComp(list) {
  const out = { n: 0, alleles: { B: 0, b: 0, E: 0, e: 0, T: 0, t: 0 } };
  for (const c of list) { out.n += c.n; for (const k in out.alleles) out.alleles[k] += c.alleles[k]; }
  return out;
}

export function islandsCSV(sim) {
  const head = ['seed', 'generation', 'time_s', 'region', 'population', 'rabbits', 'freq_b', 'freq_e', 'freq_T', 'births', 'deaths_predator', 'deaths_cold', 'deaths_heat', 'deaths_starved', 'deaths_old',
    'snow', 'temp', 'food', 'tough', 'predators', 'river', 'mid_ford', 'channel', 'apart_gens', 'diff_west_east', 'diff_west_islet', 'diff_east_islet', 'cross_kits_conceived', 'cross_kits_born', 'cross_kits_fertile'];
  const rows = [head.join(',')];
  const NAMES = ['West', 'East', 'Islet'];
  for (const rec of sim.history.records) {
    if (!rec.reg) continue;
    rec.reg.forEach((r, i) => {
      const pop = (rec.isl.pops.find((p) => p.includes(i)) || [i]).map((k) => NAMES[k]).join('+');
      const d = rec.isl.dist;
      rows.push([sim.seedCode, rec.gen, rec.t.toFixed(1), NAMES[i], pop, r.n, alleleFreq(r.comp, 'b').toFixed(4), alleleFreq(r.comp, 'e').toFixed(4), alleleFreq(r.comp, 'T').toFixed(4), r.births,
        r.deaths.predator, r.deaths.cold, r.deaths.heat, r.deaths.starved, r.deaths.old, r.env.snow.toFixed(2), r.env.temp.toFixed(2), r.env.food.toFixed(1), r.env.tough.toFixed(2), r.env.predators,
        rec.isl.water.river, rec.isl.water.midFord, rec.isl.water.channel, rec.isl.apart, (d['0-1'] ?? 0).toFixed(2), (d['0-2'] ?? 0).toFixed(2), (d['1-2'] ?? 0).toFixed(2),
        rec.isl.cross.conceived, rec.isl.cross.born, rec.isl.cross.fertile].join(','));
    });
  }
  return rows.join('\n');
}

export { speciesLabel };
