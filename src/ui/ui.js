// HUD: clock, forecast, toasts, rabbit pedigree card, graph drawer, place mode, end screen.
import { $, h } from './dom.js';
import { GraphPanel, TABS, POP_MODES } from './graphs.js';
import { buildExplore } from './explore.js';
import { buildSurvive, updateForecast, showEnd } from './survive.js';
import { P } from '../sim/params.js';
import { alleleFreq } from '../sim/history.js';
import { GENE_INFO, genotypeLabel, ALLELE_TRAIT } from '../sim/genetics.js';

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const mobile = () => window.matchMedia('(max-width: 760px)').matches;

export class UI {
  constructor(app) {
    this.app = app; this.panel = null; this.placing = null; this.cardId = null; this.cardGen = -1; this.endShown = false; this.endTimer = 0;
    this.genoView = false; this.lastGraphDraw = 0; this.lastGen = -1; this.extinctNotified = false;
    this.el = {
      app: $('#app'), title: $('#title'), clock: $('#clock'), clockLbl: $('#clock-lbl'), gen: $('#gen'), pop: $('#pop'), trust: $('#trust'), trustBox: $('#trust-box'),
      forecast: $('#forecast'), now: $('#fc-now'), next: $('#fc-next'), side: $('#side-body'), toasts: $('#toasts'), card: $('#rabbit-card'), drawer: $('#drawer'),
      pause: $('#btn-pause'), speed: $('#speed'), paused: $('#paused-badge'), banner: $('#place-banner'), bannerText: $('#place-text'), seed: $('#seed-badge'), end: $('#end'),
    };
    this.graph = new GraphPanel($('#graph-canvas'), $('#graph-readout'), $('#graph-legend'), () => ({ history: this.app.sim.history, sim: this.app.sim, challenge: this.app.challenge }));
    this.buildTabs();
    $('#btn-pause').addEventListener('click', () => this.setPaused(!this.app.paused));
    $('#btn-home').addEventListener('click', () => this.app.home());
    $('#btn-graphs').addEventListener('click', () => this.toggleDrawer());
    $('#drawer-close').addEventListener('click', () => this.toggleDrawer(false));
    $('#btn-panel').addEventListener('click', () => this.togglePanel());
    $('#place-cancel').addEventListener('click', () => this.endPlace());
    this.el.seed.addEventListener('click', async () => { try { await navigator.clipboard.writeText(this.app.sim.seedCode); this.toast('Seed code copied', 'info'); } catch { this.toast('Seed code: ' + this.app.sim.seedCode, 'info'); } });
    this.el.speed.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; this.app.speed = +b.dataset.s; this.el.speed.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); });
    window.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (!this.el.title.classList.contains('show') && this.el.end.classList.contains('hidden')) {
        if (e.code === 'Space') { e.preventDefault(); this.setPaused(!this.app.paused); }
        else if (e.key === 'Escape') { this.endPlace(); this.closeCard(); }
      }
    });
    window.addEventListener('resize', () => { this.app.world?.resize?.(); this.graph.draw(); });
    // click vs drag on whichever canvas is showing
    for (const c of [$('#gl'), $('#dbg')]) {
      let down = null;
      c.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
      c.addEventListener('pointerup', (e) => {
        if (!down) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dur = performance.now() - down.t; down = null;
        if (moved < 6 && dur < 600 && this.app.sim) this.onCanvasClick(e.clientX, e.clientY);
      });
    }
  }

  // ---------- modes ----------
  startMode(mode) {
    const sv = mode === 'survive';
    this.el.title.classList.remove('show'); this.el.app.classList.remove('hidden'); this.el.end.classList.add('hidden');
    $('#forecast').classList.toggle('hidden', !sv); this.el.trustBox.classList.toggle('hidden', !sv);
    this.el.speed.classList.toggle('hidden', sv);
    this.el.clockLbl.textContent = sv ? 'Time left' : 'Time';
    this.endShown = false; clearTimeout(this.endTimer); this.extinctNotified = false; this.lastGen = -1;
    this.el.speed.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.s === '1'));
    this.endPlace(); this.closeCard(); this.setPaused(false);
    this.panel = sv ? buildSurvive(this.el.side, { app: this.app, ui: this }) : buildExplore(this.el.side, { app: this.app, ui: this });
    this.el.toasts.innerHTML = '';
    document.body.classList.remove('panel-open', 'no-side');
    if (!mobile()) { /* desktop: side panel open */ } else this.toggleDrawer(false);
    this.setGenotypeView(false);
    $('#pop-chips').classList.remove('hidden');
    this.refresh(true);
    this.graph.setTab('population');
    this.syncTabs();
    if (sv) this.toast('Foxes arrive at about 2:00. Watch the forecast strip: it shows each change 20 seconds ahead.', 'info');
    else this.toast('Two rabbits, one valley. Open the Controls to change the world, or plant a mutation.', 'info');
  }

  buildTabs() {
    const tabs = $('#graph-tabs'); tabs.innerHTML = '';
    for (const [k, label] of Object.entries(TABS)) tabs.append(h('button', { text: label, role: 'tab', 'data-tab': k, onclick: () => { this.graph.setTab(k); this.syncTabs(); } }));
    const chips = $('#pop-chips'); chips.innerHTML = '';
    for (const [k, m] of Object.entries(POP_MODES)) chips.append(h('button', { text: m.label, 'data-mode': k, onclick: () => { this.graph.setPopMode(k); this.syncTabs(); } }));
  }
  syncTabs() {
    $('#graph-tabs').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.graph.tab));
    $('#pop-chips').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.mode === this.graph.popMode));
    $('#pop-chips').classList.toggle('hidden', this.graph.tab !== 'population');
  }
  toggleDrawer(force) {
    const open = force ?? this.el.drawer.classList.contains('hidden');
    this.el.drawer.classList.toggle('hidden', !open);
    if (open) { if (mobile()) document.body.classList.remove('panel-open'); this.syncTabs(); requestAnimationFrame(() => this.graph.draw()); }
  }
  togglePanel() {
    if (mobile()) { document.body.classList.toggle('panel-open'); if (document.body.classList.contains('panel-open')) this.toggleDrawer(false); }
    else { document.body.classList.toggle('no-side'); $('#side').style.display = document.body.classList.contains('no-side') ? 'none' : ''; }
  }
  setPaused(p) { this.app.paused = p; this.el.pause.textContent = p ? 'Play' : 'Pause'; this.el.paused.classList.toggle('hidden', !p); }
  setGenotypeView(v) { this.genoView = v; this.app.world?.setGenotypeView?.(v); const a = $('#gv'), b = $('#gv2'); if (a) a.checked = v; if (b) b.checked = v; }

  // ---------- toasts ----------
  toast(text, kind = 'info', ms = 5000) {
    const t = h('div', { class: 'toast ' + kind, text, role: 'status' });
    this.el.toasts.append(t);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
  }

  onEvents(events) {
    let muts = 0, shown = 0, comp = null;
    for (const e of events) {
      if (e.type === 'mutation') {
        if (e.planted) { this.toast(`Teacher mutation: kit #${e.id} carries allele ${e.allele} (${ALLELE_TRAIT[e.allele]})`, 'mut'); continue; }
        muts++;
        // only toast a mutation that creates a mutant allele that is absent or rare (<5 %); back-mutations are not toasted
        if (shown || !['b', 'e', 'T'].includes(e.allele)) continue;
        comp = comp || this.app.sim.composition();
        if (alleleFreq(comp, e.allele) < 0.05) { shown++; this.toast(`Random mutation: kit #${e.id} carries a new allele ${e.allele} (${ALLELE_TRAIT[e.allele]})`, 'mut'); }
      } else if (e.type === 'extinct') this.toast('The last rabbit is gone. The warren is extinct.', 'bad', 12000);
      else if (e.type === 'bottleneck') this.toast(`Bottleneck: ${e.removed} rabbits removed at random. Chance, not fitness, decided who stayed.`, 'bad');
      else if (e.type === 'fence') this.toast('Fox fence is up.', 'info');
    }
    const others = muts - shown;
    if (others > 0) this.toast(`+${others} other random mutation${others > 1 ? 's' : ''}`, 'mut small', 3000);
  }

  // ---------- world clicks ----------
  beginPlace(type) {
    this.placing = type;
    this.el.bannerText.textContent = type === 'clover' ? 'Click the ground to plant clover.' : 'Click the ground to build a brush shelter.';
    this.el.banner.classList.remove('hidden');
    if (mobile()) document.body.classList.remove('panel-open');
  }
  endPlace() { this.placing = null; this.el.banner.classList.add('hidden'); }

  onCanvasClick(cx, cy) {
    const { world, challenge } = this.app;
    if (this.placing && challenge) {
      const gp = world.groundPoint(cx, cy);
      if (!gp) { this.toast('Click on the valley floor.', 'bad'); return; }
      const res = this.placing === 'clover' ? challenge.clover(gp.x, gp.z) : challenge.shelter(gp.x, gp.z);
      if (res.ok) { this.toast(this.placing === 'clover' ? 'Clover planted. It feeds the warren from the next generation.' : 'Brush shelter built. It helps from the next generation.', 'good'); this.endPlace(); this.refresh(true); }
      else { this.toast(res.reason, 'bad'); this.endPlace(); }
      return;
    }
    const id = world.pick(cx, cy);
    if (id != null) this.showRabbit(id);
  }

  // ---------- pedigree card ----------
  showRabbit(id) {
    this.cardId = id; this.cardGen = -1; this.app.world?.follow?.(id);
    this.el.card.classList.remove('hidden'); this.renderCard();
  }
  closeCard() { this.cardId = null; this.el.card.classList.add('hidden'); this.app.world?.follow?.(null); }
  renderCard() {
    const sim = this.app.sim, r = sim.getRabbit(this.cardId);
    if (!r) { this.closeCard(); return; }
    this.cardGen = sim.gen;
    const ph = r.pheno, tree = sim.lineage(r.id, 2);
    const node = (t, self) => {
      if (!t) return h('div', { class: 'node unknown', text: 'founder / unknown' });
      const q = t.rabbit;
      return h('div', { class: 'node' + (self ? ' self' : '') + (q.alive ? '' : ' dead'), role: 'button', tabindex: 0, title: 'Show this rabbit', onclick: () => this.showRabbit(q.id) },
        h('span', { class: 'dot', style: { background: q.pheno.white ? '#fffdf4' : '#8a5a33' } }), '#' + q.id, h('code', { text: genotypeLabel(q.genotype) }));
    };
    const status = r.alive ? `Alive, age ${r.age} (${r.age === 0 ? 'kit' : 'adult'})` : `Died in generation ${r.diedGen}: ${({ predator: 'caught by a fox', cold: 'cold stress', heat: 'heat stress', starved: 'starved', old: 'old age', bottleneck: 'bottleneck' })[r.dyingCause]}`;
    this.el.card.innerHTML = '';
    this.el.card.append(
      h('button', { class: 'x', 'aria-label': 'Close', onclick: () => this.closeCard() }, '×'),
      h('h3', { text: `Rabbit #${r.id}` }),
      h('div', { class: 'pheno-line', text: `${genotypeLabel(r.genotype)}: ${ph.white ? 'white' : 'brown'} fur, ${ph.longEars ? 'long' : 'short'} ears, ${ph.longTeeth ? 'long' : 'short'} teeth` }),
      h('div', { class: 'note', text: `${status}. Born in generation ${r.born}.` }),
      h('div', { class: 'tree' },
        h('div', { class: 'tree-row' }, node(tree, true)),
        h('div', { class: 'tree-row' }, tree.parents.map((p) => node(p))),
        h('div', { class: 'tree-row' }, tree.parents.flatMap((p) => (p ? p.parents : [null, null])).map((g) => node(g)))),
      h('div', { class: 'note', text: 'Top: this rabbit. Middle: parents. Bottom: grandparents. Click a box to follow that rabbit.' }));
  }

  // ---------- per-frame ----------
  refresh(force = false) {
    const { sim, challenge, mode } = this.app; if (!sim) return;
    const sv = mode === 'survive';
    this.el.clock.textContent = sv ? mmss(challenge.timeLeft) : mmss(sim.t);
    this.el.gen.textContent = sim.gen;
    this.el.pop.textContent = sim.pop;
    if (sv) {
      this.el.trust.textContent = Math.floor(challenge.trust);
      this.el.trust.classList.toggle('low', challenge.trust < P.COST.clover);
      updateForecast(this.app, { now: this.el.now, next: this.el.next });
    }
    this.el.seed.textContent = 'Seed ' + sim.seedCode;
    this.panel?.update?.();
    const now = performance.now();
    if (!this.el.drawer.classList.contains('hidden') && (force || sim.gen !== this.lastGen || now - this.lastGraphDraw > 500)) {
      if (this.graph.hoverGen == null) this.graph.draw();
      this.lastGraphDraw = now;
    }
    if (this.cardId != null && sim.gen !== this.cardGen) this.renderCard();
    this.lastGen = sim.gen;
    if (sim.ended && !this.endShown) {
      this.endShown = true;
      if (sv) this.endTimer = setTimeout(() => { showEnd(this.el.end, { app: this.app }); }, sim.extinct ? 1800 : 600);
    }
  }
}
