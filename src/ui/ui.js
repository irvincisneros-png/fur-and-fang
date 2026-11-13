// HUD: clock, forecast, toasts, rabbit pedigree card, graph drawer, place mode, end screen.
import { $, h } from './dom.js';
import { GraphPanel, TABS, POP_MODES, setGraphScale } from './graphs.js';
import { buildExplore } from './explore.js';
import { buildSurvive, updateForecast, showEnd } from './survive.js';
import { buildIslands } from './islands.js';
import { buildLineages, showPrediction, showLineagesEnd } from './lineages.js';
import { P } from '../sim/params.js';
import { alleleFreq } from '../sim/history.js';
import { GENE_INFO, genotypeLabel, ALLELE_TRAIT } from '../sim/genetics.js';
import { Coach } from './coach.js';
import { Tutorial } from './tutorial.js';

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const mobile = () => window.matchMedia('(max-width: 760px)').matches;

export class UI {
  constructor(app) {
    this.app = app; this.panel = null; this.placing = null; this.cardId = null; this.cardGen = -1; this.endShown = false; this.endTimer = 0;
    this.genoView = false; this.lastGraphDraw = 0; this.lastGen = -1; this.extinctNotified = false;
    this.mutByGen = new Map(); this.routine = []; this.wasMobile = mobile(); this.endSim = null;
    this.el = {
      app: $('#app'), title: $('#title'), clock: $('#clock'), clockLbl: $('#clock-lbl'), gen: $('#gen'), pop: $('#pop'), trust: $('#trust'), trustBox: $('#trust-box'),
      forecast: $('#forecast'), now: $('#fc-now'), next: $('#fc-next'), side: $('#side-body'), toasts: $('#toasts'), card: $('#rabbit-card'), drawer: $('#drawer'),
      pause: $('#btn-pause'), speed: $('#speed'), paused: $('#paused-badge'), banner: $('#place-banner'), bannerText: $('#place-text'), seed: $('#seed-badge'), end: $('#end'),
      event: $('#event-banner'), flash: $('#flash'), followBtn: $('#btn-follow'), followInfo: $('#follow-info'), followText: $('#follow-text'), followHint: $('#follow-hint'),
    };
    this.coach = new Coach(this); this.tutorial = new Tutorial(this); this.pendingPhase = null; this.lastPanel = 0; this.followShown = undefined;
    this.el.extinct = $('#extinct-banner');
    $('#extinct-restart').addEventListener('click', () => this.app.start(this.app.mode === 'islands' ? 'islands' : 'explore', this.app.sim.seedCode));
    $('#extinct-new').addEventListener('click', () => this.app.start('explore', null));
    this.el.followBtn.addEventListener('click', () => this.followRandom());
    $('#follow-next').addEventListener('click', () => this.followRandom());
    $('#follow-release').addEventListener('click', () => this.closeCard());
    this.graph = new GraphPanel($('#graph-canvas'), $('#graph-readout'), $('#graph-legend'), () => ({ history: this.app.sim.history, sim: this.app.sim, challenge: this.app.challenge?.tutorial ? null : this.app.challenge }));
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
        else if (!e.ctrlKey && !e.metaKey && !e.altKey && this.app.world?.moveKey?.(e.code, true)) e.preventDefault();   // free view: WASD / arrows / Q E
      }
    });
    window.addEventListener('keyup', (e) => this.app.world?.moveKey?.(e.code, false));
    window.addEventListener('blur', () => this.app.world?.clearKeys?.());
    this.initCamHint();
    window.addEventListener('resize', () => {
      const m = mobile();
      if (m !== this.wasMobile) { this.wasMobile = m; document.body.classList.remove('panel-open', 'no-side'); this.coach.place(); }   // a different layout: Controls start in that layout's normal state
      this.app.world?.resize?.(); if (this.app.sim) this.graph.draw(); this.syncInsets();
    });
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.syncInsets()).observe($('#forecast'));
    this.initBigText();
    // click vs drag on whichever canvas is showing
    for (const c of [$('#gl'), $('#dbg')]) {
      // a tap is exactly one pointer going down and up in place: a second finger (pinch) or a cancelled touch is never a placement
      let down = null; const active = new Set(); let multi = false;
      const lift = (e) => { active.delete(e.pointerId); if (!active.size) multi = false; };
      c.addEventListener('pointerdown', (e) => {
        active.add(e.pointerId);
        if (active.size > 1) { multi = true; down = null; return; }
        down = multi ? null : { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
      });
      c.addEventListener('pointercancel', (e) => { down = null; lift(e); });
      c.addEventListener('pointermove', (e) => { if (this.placing) this.movePreview(e.clientX, e.clientY); });
      c.addEventListener('pointerleave', () => { if (this.placing) this.app.world?.setPreview?.(null); });
      c.addEventListener('pointerup', (e) => {
        lift(e);
        if (!down || down.id !== e.pointerId) { down = null; return; } const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dur = performance.now() - down.t; down = null;
        if (moved < 6 && dur < 600 && !multi && this.app.sim) this.onCanvasClick(e.clientX, e.clientY);
      });
    }
  }

  // Small "how to move" chip above the dock. Dismissed once, it stays away on this device.
  initCamHint() {
    const el = $('#cam-hint'), KEY = 'ff-camhint-v1';
    let seen = false; try { seen = localStorage.getItem(KEY) === 'done'; } catch { /* storage blocked */ }
    if (seen) return;
    const touch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
    $('#cam-hint-text').textContent = touch ? 'Move: drag · Rotate and zoom: two fingers' : 'Move: WASD / arrows · Rotate: Q E · Zoom: scroll';
    $('#cam-hint-x').addEventListener('click', () => { el.classList.add('hidden'); try { localStorage.setItem(KEY, 'done'); } catch { /* storage blocked */ } });
    el.classList.remove('hidden');
  }

  // "Big text": for a projector. Larger page text plus larger graph labels, remembered on this device.
  initBigText() {
    const KEY = 'ff-bigtext-v1', btn = $('#btn-big');
    const apply = (on, save) => {
      document.body.classList.toggle('big-text', on); btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', String(on));
      setGraphScale(on ? 1.4 : 1);
      if (save) { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* storage blocked: applies for this visit only */ } }
      if (this.app.sim) this.graph.draw();
      requestAnimationFrame(() => { this.syncInsets(); this.tutorial.place(); this.coach.place(); if (this.app.sim) this.graph.draw(); });
    };
    let on = false; try { on = localStorage.getItem(KEY) === '1'; } catch { /* storage blocked */ }
    btn.addEventListener('click', () => apply(!document.body.classList.contains('big-text'), true));
    if (on) apply(true, false);
  }

  // ---------- modes ----------
  startMode(mode) {
    const tut = mode === 'tutorial', lin = mode === 'lineages', sv = mode === 'survive' || tut || lin;      // the tutorial uses the Survive HUD on a scripted valley
    this.el.title.classList.remove('show'); this.el.app.classList.remove('hidden'); this.el.end.classList.add('hidden');
    $('#forecast').classList.toggle('hidden', !sv); this.el.trustBox.classList.toggle('hidden', !sv);
    this.el.speed.classList.toggle('hidden', sv);
    this.el.clockLbl.textContent = sv && !tut ? 'Time left' : 'Time';
    document.getElementById('predict')?.classList.add('hidden');
    this.endShown = false; this.cancelEnd(); clearTimeout(this.eventTimer); this.mutByGen.clear(); this.routine = []; this.extinctNotified = false; this.lastGen = -1; this.pendingPhase = null;
    this.el.event.classList.add('hidden'); this.el.flash.classList.remove('go'); this.el.extinct.classList.add('hidden');
    this.el.speed.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.s === '1'));
    this.endPlace(); this.closeCard(); this.setPaused(false);
    this.panel = lin ? buildLineages(this.el.side, { app: this.app, ui: this }) : sv ? buildSurvive(this.el.side, { app: this.app, ui: this, tutorial: tut }) : mode === 'islands' ? buildIslands(this.el.side, { app: this.app, ui: this }) : buildExplore(this.el.side, { app: this.app, ui: this });
    this.app.world?.setLineageView?.(false); this.islFirst = {};
    this.el.toasts.innerHTML = '';
    document.body.classList.remove('panel-open', 'no-side');            // Controls start in the normal state of this layout and mode
    if (mobile()) this.toggleDrawer(false);
    this.setGenotypeView(false);
    $('#pop-chips').classList.remove('hidden');
    this.refresh(true);
    this.graph.setTab('population');
    this.syncTabs();
    this.syncInsets(true);
    const w = this.app.world;
    const b0 = this.app.sim.burrows[0];
    if (w.intro) w.intro(sv ? null : { x: b0.x - 6, z: b0.z, zoom: 0.62 }); else w.home?.();
    if (tut) { this.coach.stop(false); this.tutorial.start(); return; }
    this.tutorial.stop();
    const coaching = mode === 'survive' && this.coach.start();
    if (lin) { this.coach.stop(false); this.toast('A flood is coming at about 1:30. It will split the warren in two. Keep both lineages alive until the water drops at 8:00.', 'info', 9000); }
    else if (mode === 'islands') { this.coach.stop(false); this.toast(this.app.sim.isl.pops.length > 1 ? `The valley starts split: ${this.app.sim.isl.pops.map((p) => p.name).join(' and ')}. Follow the investigation on the left.` : 'One valley, one population. Use the Water controls to split it.', 'info', 7000); }
    else if (!sv) { this.coach.stop(false); this.toast('Two rabbits, one valley. Open the Controls to change the world, or plant a mutation. Click a rabbit to follow it.', 'info', 7000); }
    else if (!coaching) this.toast('Foxes arrive at about 2:00. Watch the forecast strip: it shows each change 20 seconds ahead.', 'info');
  }

  // Tell the 3D view which part of the screen the HUD covers, so the valley is centred in what is left (and so are the banners).
  syncInsets(snap = false) {
    const side = $('#side'), wide = !mobile();
    const sr = side.getBoundingClientRect(), sideOn = wide && !document.body.classList.contains('no-side') && sr.width > 0;
    const left = sideOn ? Math.round(sr.right) : 0, top = Math.round($('#topbar').getBoundingClientRect().bottom);
    let bottom = 0;
    if (!this.el.drawer.classList.contains('hidden')) bottom = Math.round(window.innerHeight - this.el.drawer.getBoundingClientRect().top);
    else if (!wide && document.body.classList.contains('panel-open')) bottom = Math.round(window.innerHeight * 0.58);
    const fc = $('#forecast'), fr = fc.getBoundingClientRect();           // banners sit below the forecast strip, never over it
    document.documentElement.style.setProperty('--below-fc', Math.round(fc.classList.contains('hidden') || !fr.height ? top : fr.bottom) + 'px');
    document.documentElement.style.setProperty('--free-left', left + 'px');
    document.documentElement.style.setProperty('--free-bottom', bottom + 'px');
    document.body.classList.toggle('drawer-open', bottom > 0 && wide);
    this.app.world?.setInsets?.({ left, top, bottom: Math.min(bottom, window.innerHeight * 0.5) }, snap);
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
    this.syncInsets();
  }
  togglePanel() {
    if (mobile()) { document.body.classList.toggle('panel-open'); if (document.body.classList.contains('panel-open')) this.toggleDrawer(false); }
    else document.body.classList.toggle('no-side');          // visibility lives in CSS (body.no-side), never in an inline style
    this.syncInsets(); this.coach.place();
  }
  cancelEnd() { clearTimeout(this.endTimer); this.endSim = null; }           // Menu or a new run: a report that is still waiting to open must not appear
  setPaused(p) { this.app.paused = p; this.el.pause.textContent = p ? 'Play' : 'Pause'; this.el.paused.classList.toggle('hidden', !p); }
  setGenotypeView(v) { this.genoView = v; this.app.world?.setGenotypeView?.(v); const a = $('#gv'), b = $('#gv2'); if (a) a.checked = v; if (b) b.checked = v; }

  // ---------- toasts ----------
  toast(text, kind = 'info', ms = 5000) {
    // phones: routine notes (info, mutations, good news) fold into one summary line so they never pile up over the valley
    if (mobile() && /^(info|mut|good)/.test(kind)) { this.routineToast(text, ms); return; }
    const t = h('div', { class: 'toast ' + kind, text, role: 'status' });
    this.el.toasts.append(t);
    const cap = mobile() ? 2 : 4, plain = () => [...this.el.toasts.children].filter((c) => !c.classList.contains('summary'));
    while (plain().length > cap) plain()[0].remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
  }
  routineToast(text, ms) {
    this.routine.push(text); if (this.routine.length > 8) this.routine.shift();
    let box = this.el.toasts.querySelector('.summary');
    if (!box) {
      box = h('div', { class: 'toast info summary', role: 'status', tabindex: 0, title: 'Tap to show or hide the recent notes' });
      box.addEventListener('click', () => box.classList.toggle('open'));
      this.el.toasts.prepend(box);
    }
    const n = this.routine.length;
    box.innerHTML = '';
    box.append(h('span', { class: 'sum-line', text: this.routine[n - 1] }), n > 1 ? h('span', { class: 'sum-more', text: ` +${n - 1} earlier` }) : '',
      h('ol', { class: 'sum-list' }, this.routine.slice(0, -1).reverse().map((t) => h('li', { text: t }))));
    clearTimeout(this.routineTimer);
    this.routineTimer = setTimeout(() => { box.classList.add('out'); setTimeout(() => { box.remove(); this.routine = []; }, 400); }, Math.max(ms, 4500));
  }

  onEvents(events) {
    let muts = 0, shown = 0, comp = null;
    for (const e of events) {
      if (e.type === 'mutation') {
        if (e.planted) { this.toast(`Teacher mutation: kit #${e.id} carries allele ${e.allele} (${ALLELE_TRAIT[e.allele]})`, 'mut'); continue; }
        muts++; this.mutByGen.set(this.app.sim.gen, (this.mutByGen.get(this.app.sim.gen) || 0) + 1);
        // only toast a mutation that creates a mutant allele that is absent or rare (<5 %); back-mutations are not toasted
        if (shown || !['b', 'e', 'T'].includes(e.allele)) continue;
        comp = comp || this.app.sim.composition();
        if (alleleFreq(comp, e.allele) < 0.05) { shown++; this.toast(`Random mutation: kit #${e.id} carries a new allele ${e.allele} (${ALLELE_TRAIT[e.allele]})`, 'mut'); }
      } else if (e.type === 'extinct') {
        this.toast('The last rabbit is gone. The warren is extinct.', 'bad', 12000);
        if (this.app.mode === 'explore' || this.app.mode === 'islands') this.el.extinct.classList.remove('hidden');     // Explore has no end screen: offer a way on
      }
      else if (e.type === 'bottleneck') this.toast(`Bottleneck: ${e.removed} rabbits removed at random. Chance, not fitness, decided who stayed.`, 'bad');
      else if (e.type === 'fence') this.toast('Fox fence is up.', 'info');
      else if (e.type === 'phase') { if (e.id === 'foxes' && !this.app.sim.predators.length) this.pendingPhase = e; else this.announce(e); }
      else if (e.type === 'foxin') this.onFoxes(e);
      else if (e.type === 'arrive') this.onArrive(e);
      else if (e.type === 'predict') showPrediction(this.app, this);
      else if (e.type === 'lineagelost') this.toast(`The ${e.name} lineage has died out. With one lineage left there is nothing to compare.`, 'bad', 10000);
      else if (this.app.mode === 'islands' || this.app.mode === 'lineages') this.onIslands(e);
    }
    const others = muts - shown;
    if (others > 0) this.toast(`+${others} other random mutation${others > 1 ? 's' : ''}`, 'mut small', 3000);
  }

  // ---------- Islands events (spec 7.7) ----------
  onIslands(e) {
    const once = (k) => { if (this.islFirst[k]) return false; this.islFirst[k] = true; return true; };
    const W = { river: 'The river is rising. From the next generation no rabbit can cross.', channel: 'The side channel is filling. From the next generation the islet is cut off from the East.', midFord: 'The middle ford stones are washing out. From the next generation no rabbit can cross to the islet from the West.' };
    if (e.type === 'islwarn') { if (e.to === 1) this.toast(W[e.what], 'info'); else this.toast('The water is dropping: the crossing reopens at the start of the next generation.', 'info'); }
    else if (e.type === 'split') this.announce({ id: 'split', icon: '🌊', color: '#bfe3f5', label: `The valley is split: ${e.pops.map((p) => p.name).join(' and ')}`, tip: 'Separate populations, still one species. Nothing about the rabbits has changed.' });
    else if (e.type === 'rejoin') this.announce({ id: 'rejoin', icon: e.kind === 'ice' ? '🧊' : e.kind === 'sandbar' ? '🏖️' : '☀️', color: '#f3e3b0', label: e.kind === 'ice' ? 'The water has frozen over: an ice bridge' : e.kind === 'sandbar' ? 'A sandbar has formed: a land bridge to the islet' : 'Drought: the water is low and the crossing is back', tip: `${e.joined.join(' and ')} can meet again. Watch the kits.` });
    else if (e.type === 'storm') this.announce({ id: 'storm', icon: '⛈️', color: '#c9d3e0', label: `Storm! ${e.ids.length} rabbits were swept to the islet`, tip: 'Chance picked them, not fitness.' });
    else if (e.type === 'carry') this.toast(`${e.ids.length} rabbits carried from ${e.from} to ${e.to}. They bring their alleles with them.`, 'info');
    else if (e.type === 'stillborn' && once('stillborn')) this.toast('A kit from parents on different sides did not develop. Their hidden DNA no longer fits together well.', 'bad', 8000);
    else if (e.type === 'hybrid' && e.sterile && once('sterile')) this.toast('This hybrid kit is healthy but will never breed, like a mule.', 'info', 8000);
    else if (e.type === 'popextinct') this.toast(`The ${e.name} population has died out. Small populations are fragile: that is a real result too.`, 'bad', 9000);
  }

  // ---------- valley events: banner + screen-edge wash + a camera cue ----------
  announce(e) {
    const el = this.el.event;
    el.innerHTML = '';
    el.append(h('span', { class: 'ev-icon', text: e.icon || '' }), h('div', {}, h('b', { text: e.label }), e.tip ? h('p', { text: e.tip }) : null));
    el.style.setProperty('--ev', e.color || '#ffe9a8');
    el.classList.remove('hidden', 'out'); void el.offsetWidth; el.classList.add('in');
    clearTimeout(this.eventTimer);
    this.eventTimer = setTimeout(() => { el.classList.add('out'); this.eventTimer = setTimeout(() => el.classList.add('hidden'), 500); }, 6500);
    const f = this.el.flash; f.style.setProperty('--ev', e.color || '#ffe9a8'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
    if (e.id !== 'foxes') this.app.world?.pulse?.(0.16, 2.2);       // pull back a little so the whole valley change is in view
  }
  onFoxes(e) {
    const w = this.app.world, sv = this.app.mode === 'survive' || this.app.mode === 'tutorial';
    for (const a of e.added) w?.ping?.(a.x * 0.86, a.z * 0.86, 0xff8a3c, 9, 3);
    if (this.pendingPhase) { this.announce(this.pendingPhase); this.pendingPhase = null; w?.look?.(e.added[0].x * 0.8, e.added[0].z * 0.8, { amount: 0.55, hold: 3.4 }); }
    else if (sv && !e.first) this.toast(`Another fox has moved in: ${e.count} foxes now hunt the valley.`, 'bad');
    else if (!sv && e.first) w?.look?.(e.added[0].x * 0.8, e.added[0].z * 0.8, { amount: 0.4, hold: 2.2 });
  }
  onArrive(e) {
    const w = this.app.world, sim = this.app.sim;
    const hex = { alpine: 0x9fe3ff, desert: 0xffc24d, river: 0x8df0b0 }[e.source] || 0xffd447;
    w?.mark?.(e.ids, hex, 11); w?.ping?.(e.x, e.z, hex, 8, 3);
    w?.look?.(e.x * 0.7 + e.toX * 0.3, e.z * 0.7 + e.toZ * 0.3, { amount: 0.5, hold: 3.6 });
    const gs = e.ids.map((id) => sim.getRabbit(id)).filter(Boolean).map((r) => genotypeLabel(r.genotype));
    const name = P.SOURCES[e.source]?.name || 'next door';
    this.toast(`Gene flow: ${gs.length} rabbits are walking in from ${name} (${e.edge} edge, ringed). They carry ${gs.join(' and ')}.`, 'good', 9000);
  }

  // ---------- world clicks ----------
  beginPlace(type) {
    this.placing = type;
    const touch = window.matchMedia('(hover: none)').matches;
    this.el.bannerText.textContent = type === 'clover' ? `${touch ? 'Tap' : 'Click'} the ground to plant clover. The ring shows which rabbits it will feed.` : `${touch ? 'Tap' : 'Click'} the ground to build a brush shelter. Rabbits inside the ring are harder to catch${this.app.sim.lin ? ', and feel less heat and cold' : ''}.`;
    this.el.banner.classList.remove('hidden');
    if (mobile()) { document.body.classList.remove('panel-open'); this.syncInsets(); }
    document.body.classList.add('placing');
  }
  endPlace() { this.placing = null; this.el.banner.classList.add('hidden'); document.body.classList.remove('placing'); this.app.world?.setPreview?.(null); }
  movePreview(cx, cy) {
    const w = this.app.world, gp = w?.groundPoint?.(cx, cy);
    if (!gp) { w?.setPreview?.(null); return; }
    w.setPreview?.(this.placing, gp.x, gp.z, this.placing === 'clover' ? (this.app.sim.lin?.cloverR ?? P.CLOVER_RADIUS) : (this.app.sim.lin?.shelterR ?? P.SHELTER_RADIUS));
  }
  followRandom() {
    const live = this.app.sim.rabbits.filter((r) => r.alive && r.id !== this.cardId);
    if (!live.length) { this.toast('There is no rabbit to follow.', 'bad'); return; }
    this.showRabbit(live[Math.floor(Math.random() * live.length)].id);
  }

  onCanvasClick(cx, cy) {
    const { world, challenge } = this.app;
    if (this.placing && challenge) {
      const gp = world.groundPoint(cx, cy);
      if (!gp) { this.toast('Click on the valley floor.', 'bad'); return; }
      const res = this.placing === 'clover' ? challenge.clover(gp.x, gp.z) : challenge.shelter(gp.x, gp.z);
      if (res.ok) { this.toast(this.placing === 'clover' ? 'Clover planted. It feeds the warren from the next generation.' : 'Brush shelter built. Rabbits inside its ring are harder to catch from the next generation.', 'good'); this.endPlace(); this.refresh(true); }
      else { this.toast(res.reason, 'bad'); this.endPlace(); }
      return;
    }
    const id = world.pick(cx, cy);
    if (id != null) this.showRabbit(id);
  }

  // ---------- pedigree card ----------
  showRabbit(id) {
    this.cardId = id; this.cardGen = -1; this.app.world?.follow?.(id); this.freeCam = false; this.followShown = undefined;
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

  // "Follow a rabbit" chip: what the camera is locked to and how to let go
  syncFollow() {
    const sim = this.app.sim, fb = this.app.world?.followBreaks;
    if (fb !== this.seenBreaks) { if (this.seenBreaks !== undefined && fb !== undefined) this.freeCam = true; this.seenBreaks = fb; }   // the player moved the camera away: the card stays, the follow chip goes
    const r = this.cardId != null && !this.freeCam ? sim.getRabbit(this.cardId) : null;
    const key = r ? `${r.id}:${r.alive}` : '';
    if (key === this.followShown) return; this.followShown = key;
    this.el.followBtn.classList.toggle('hidden', !!r); this.el.followInfo.classList.toggle('hidden', !r);
    this.el.followHint.classList.toggle('hidden', !!r);
    if (r) this.el.followText.textContent = r.alive ? `Following rabbit #${r.id}` : `Rabbit #${r.id} has died`;
  }

  // ---------- per-frame ----------
  refresh(force = false) {
    const { sim, challenge, mode } = this.app; if (!sim) return;
    const sv = mode === 'survive' || mode === 'tutorial' || mode === 'lineages', run = mode === 'survive' || mode === 'lineages';
    this.el.clock.textContent = run ? mmss(challenge.timeLeft) : mmss(sim.t);
    this.el.gen.textContent = sim.gen;
    this.el.pop.textContent = sim.pop;
    if (sv) {
      this.el.trust.textContent = Math.floor(challenge.trust);
      this.el.trust.classList.toggle('low', challenge.trust < (challenge.costOf?.('clover') ?? P.COST.clover));
      updateForecast(this.app, { now: this.el.now, next: this.el.next });
    }
    this.el.seed.textContent = 'Seed ' + sim.seedCode;
    const now = performance.now();
    if (force || now - this.lastPanel > 200) { this.lastPanel = now; this.panel?.update?.(); this.syncFollow(); }
    if (mode === 'survive') this.coach.update(sim.t, this.app.paused);
    this.tutorial.update();
    if (!this.el.drawer.classList.contains('hidden') && (force || sim.gen !== this.lastGen || now - this.lastGraphDraw > 500)) {
      if (this.graph.hoverGen == null) this.graph.draw();
      this.lastGraphDraw = now;
    }
    if (this.cardId != null && sim.gen !== this.cardGen) this.renderCard();
    this.lastGen = sim.gen;
    if (sim.ended && !this.endShown) {
      this.endShown = true;
      if (run) {
        const simAtEnd = sim; this.endSim = sim;
        this.endTimer = setTimeout(() => { if (this.endSim === simAtEnd && this.app.sim === simAtEnd && !this.el.title.classList.contains('show')) { if (mode === 'lineages') showLineagesEnd(this.el.end, this.app); else showEnd(this.el.end, { app: this.app }); } }, sim.extinct ? 1800 : 600);
      }
    }
  }
}
