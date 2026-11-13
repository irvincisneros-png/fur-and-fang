// Tutorial mode: a guided card that walks through the steps in src/content/tutorial.js on a scripted valley (src/sim/tutorial.js).
// Each step pauses or runs the valley, points at the thing it is about, and only unlocks "Next" once the student has done it.
import { h } from './dom.js';
import { TUTORIAL_STEPS as STEPS, TUTORIAL_NOTES as NOTES } from '../content/tutorial.js';
import { genotypeLabel } from '../sim/genetics.js';
import { Coach } from './coach.js';
import { TUTORIAL_SCENES } from '../sim/tutorial.js';

const KEY = 'ff-tutorial-v1';
const isMobile = () => window.matchMedia('(max-width: 760px)').matches;
const isTouch = () => window.matchMedia('(hover: none), (pointer: coarse)').matches;
// When the cold front lands (the forecast counts down to this moment). Preparing after it is too late.
const st_front = (st, sim, s) => { st.frontT = sim.t + (TUTORIAL_SCENES[s.scene]?.delay || 0); st.late = false; };
const shown = (el) => !!el && el.getClientRects().length > 0;

export class Tutorial {
  constructor(ui) {
    this.ui = ui; this.active = false; this.i = 0; this.st = null; this.target = null; this.lastCheck = 0;
    this.el = h('section', { id: 'tutor', class: 'hidden', 'aria-label': 'Tutorial' });
    document.querySelector('#app').append(this.el);
    window.addEventListener('resize', () => this.place());
  }
  static seen() { try { return localStorage.getItem(KEY) === 'done'; } catch { return false; } }
  get step() { return STEPS[this.i]; }

  start() { this.active = true; this.i = 0; document.body.classList.add('tutorial'); this.enter(); }
  stop() {
    if (!this.active && this.el.classList.contains('hidden')) return;
    this.active = false; this.setTarget(null); this.el.classList.add('hidden'); document.body.classList.remove('tutorial');
  }
  go(d) { const n = this.i + d; if (n < 0 || n >= STEPS.length) return; this.i = n; this.enter(); }
  skip() { this.stop(); this.ui.app.home(); }
  finish() {
    try { localStorage.setItem(KEY, 'done'); } catch { /* storage blocked */ }
    Coach.markSeen();          // the Survive tips repeat what was just practised
    this.stop(); this.ui.app.start('survive', null);
  }

  // ---------- step set-up ----------
  enter() {
    const s = this.step, ui = this.ui, { challenge: ch, world: w, sim } = ui.app;
    this.st = { travel: w?.travel, log: ch.log.length, nextId: sim.nextId, done: !s.done, note: '', t0: performance.now(), markAt: 0 };
    if (s.scene) ch.setScene(s.scene);
    if (s.done === 'prepare') st_front(this.st, sim, s);
    ui.endPlace();
    ui.toggleDrawer(false);
    if (s.done === 'causes') { ui.graph.setTab('population'); ui.syncTabs(); }
    ui.closeCard();
    if (s.done === 'carrier') { ui.setGenotypeView(false); ch.sustain(); }
    if (isMobile()) { if (document.body.classList.contains('panel-open')) ui.togglePanel(); }
    else if (s.panel && document.body.classList.contains('no-side')) ui.togglePanel();
    if (s.trust) ch.grantTrust(s.trust);
    ui.setPaused(!s.run);
    this.render();
    this.update(true);
  }

  render() {
    const s = this.step, touch = isTouch(), last = !!s.final;
    this.setTarget(null);
    this.goalEl = s.goal ? h('div', { class: 'tut-goal' }, h('span', { class: 'tick', 'aria-hidden': 'true' }), h('span', { text: (touch && s.goalTouch) || s.goal })) : null;
    this.noteEl = h('div', { class: 'tut-note', role: 'status' });
    this.retryBtn = h('button', { class: 'btn small hidden', text: NOTES.retry, onclick: () => this.retry() });
    this.nextBtn = last ? h('button', { class: 'btn small primary', text: 'Start Survive 15:00', onclick: () => this.finish() })
      : h('button', { class: 'btn small primary', text: 'Next', onclick: () => this.go(1) });
    this.el.innerHTML = '';
    this.el.append(
      h('div', { class: 'tut-arrow' }),
      h('div', { class: 'tut-step' }, `Tutorial: step ${this.i + 1} of ${STEPS.length}`, h('span', { class: 'tut-dots', 'aria-hidden': 'true' }, STEPS.map((_, k) => h('i', { class: k < this.i ? 'past' : k === this.i ? 'now' : '' })))),
      h('b', { text: s.title }), h('p', { text: (touch && s.textTouch) || s.text }),
      this.goalEl || '', this.noteEl,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn small', text: 'Back', disabled: this.i === 0, onclick: () => this.go(-1) }),
        h('button', { class: 'btn small', text: last ? 'Menu' : 'Skip tutorial', onclick: () => this.skip() }),
        this.retryBtn, this.nextBtn));
    this.el.classList.remove('hidden');
    this.el.scrollTop = 0;
  }

  // Missed the warning: put the valley back to a calm spell and send a fresh cold front with a fresh 20 second forecast.
  retry() {
    const s = this.step, { challenge: ch, sim } = this.ui.app;
    sim.setEnv(TUTORIAL_SCENES.calm.env);                 // public sim method: snow, temperature and foxes back to calm at once
    ch.setScene(s.scene);
    this.st.log = ch.log.length; this.st.t0 = performance.now(); st_front(this.st, sim, s);
    if (s.trust) ch.grantTrust(s.trust);
    this.ui.setPaused(false); this.update(true);
  }

  // ---------- has the student done it? ----------
  check(s) {
    const ui = this.ui, { challenge: ch, world: w, sim, paused } = ui.app, st = this.st;
    const acts = () => ch.log.slice(st.log);
    switch (s.done) {
      case 'camera': return { done: w?.travel === undefined || w.travel - st.travel > 14 };
      case 'card': return { done: ui.cardId != null };
      case 'caught': {
        const c = ch.caughtSince(), done = c.brown + c.white >= (s.need || 6);
        return { done, note: done ? NOTES.tallyDone(c.brown, c.white) : paused ? NOTES.paused : NOTES.tally(c.brown, c.white) };
      }
      case 'causes': {
        const open = !ui.el.drawer.classList.contains('hidden');
        const c = ch.caughtSince(), rec = sim.history.records.filter((r) => r.gen >= ch.sceneGen);
        const sum = (k) => rec.reduce((n, r) => n + (r.traits[k]?.n || 0), 0);
        const rate = NOTES.catchRate(c.brown, sum('brown'), c.white, sum('white'));
        return { done: open && ui.graph.tab === 'causes', note: rate + (open ? ' ' + NOTES.graphOpen : '') };
      }
      case 'carrier': {
        if (!ui.genoView) return { done: false, note: NOTES.genoOff };
        const r = ui.cardId != null ? sim.getRabbit(ui.cardId) : null;
        if (!r) return { done: false, note: '' };
        return r.genotype.fur === 'Bb' ? { done: true, note: NOTES.carrier(r.id) } : { done: false, note: NOTES.notCarrier(r.genotype.fur) };
      }
      case 'translocate': {
        if (!acts().some((a) => a.action === 'translocate')) return { done: false, note: paused ? NOTES.paused : '' };
        const news = sim.rabbits.filter((r) => r.id >= st.nextId && r.parents[0] === 0).slice(0, 2).map((r) => genotypeLabel(r.genotype));
        return { done: true, note: news.length ? NOTES.arrived(news.join(' and ')) : '' };
      }
      case 'prepare': {
        const a = acts(), good = (x) => x.action === 'shelter' || (x.action === 'translocate' && x.source === 'alpine');
        if (a.some((x) => good(x) && x.t < st.frontT)) return { done: true, note: NOTES.prepared };
        st.late = sim.t >= st.frontT;                       // the front has landed and nothing useful was done in time
        if (st.late) return { done: false, note: a.some(good) ? NOTES.lateAct : NOTES.late };
        return { done: false, note: a.some((x) => x.action === 'translocate') ? NOTES.wrongSource : paused ? NOTES.paused : '' };
      }
      default: return { done: true };
    }
  }

  // which element to point at right now (it moves on once the first half of a two-part job is done)
  anchorFor(s) {
    const ui = this.ui, st = this.st;
    if (st.done || !s.anchor) return null;
    let sel = s.anchor;
    if (s.done === 'causes' && !ui.el.drawer.classList.contains('hidden')) sel = s.anchorThen;
    else if (s.done === 'carrier' && ui.genoView) return null;
    else if (s.done === 'prepare' && performance.now() - st.t0 > 6000) sel = s.anchorThen;
    let a = document.querySelector(sel);
    if (a && a.closest('#side')) {
      const tucked = isMobile() ? !document.body.classList.contains('panel-open') : document.body.classList.contains('no-side');
      if (tucked) a = document.querySelector('#btn-panel');
    }
    if (a && a.matches('input[type=checkbox]')) a = a.parentElement;        // outline the whole row, not the tiny box
    return shown(a) ? a : null;
  }

  // called every frame by the UI; does its work about five times a second
  update(force = false) {
    if (!this.active) return;
    const now = performance.now(); if (!force && now - this.lastCheck < 180) return; this.lastCheck = now;
    const s = this.step, st = this.st, { challenge: ch, world: w, sim } = this.ui.app;
    if (!st.done) {
      const r = this.check(s);
      st.note = r.note || '';
      if (r.done) st.done = true;
      else if (s.trust) ch.grantTrust(s.trust);                     // a wrong pick never leaves the student stuck without Trust
    }
    if (this.goalEl) this.goalEl.classList.toggle('done', st.done);
    if (this.noteEl.textContent !== st.note) this.noteEl.textContent = st.note;
    if (this.retryBtn) this.retryBtn.classList.toggle('hidden', !(st.late && !st.done));
    this.nextBtn.disabled = !st.done; this.nextBtn.classList.toggle('ready', st.done && !s.final);
    // ring a few rabbits near the middle of the view so there is something obvious to click
    if (s.spot === 'rabbits' && !st.done && now - st.markAt > 3500 && w?.mark) {
      st.markAt = now;
      const c = w.controls?.target || { x: 0, z: 0 };
      const near = sim.rabbits.filter((r) => r.alive).sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z)).slice(0, 4);
      w.mark(near.map((r) => r.id), 0xffb300, 4);
    }
    // phones: while the Controls sheet or the graphs are up, fold the card down to its goal so both fit
    this.el.classList.toggle('compact', isMobile() && (document.body.classList.contains('panel-open') || !this.ui.el.drawer.classList.contains('hidden')));
    const a = this.anchorFor(s);
    if (a !== this.target) { this.setTarget(a); if (a && a.closest('#side')) a.scrollIntoView({ block: 'center' }); force = true; }
    if (force) requestAnimationFrame(() => this.place());
  }

  setTarget(a) {
    if (this.target) this.target.classList.remove('coach-target');
    this.target = a || null;
    if (a) a.classList.add('coach-target');
  }

  // ---------- where the card sits ----------
  place() {
    if (!this.active) return;
    const el = this.el, a = this.target && shown(this.target) ? this.target : null, vw = window.innerWidth, vh = window.innerHeight;
    const ar = el.querySelector('.tut-arrow');
    el.dataset.side = 'none'; el.style.left = el.style.top = ''; ar.style.left = ar.style.top = '';
    if (vw <= 760) { el.classList.add('docked'); return; }          // phones: fixed under the top bar; the pulsing outline does the pointing
    el.classList.remove('docked');
    const w = el.offsetWidth, hh = el.offsetHeight, gap = 16;
    const free = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--free-left')) || 0;
    const top = document.querySelector('#topbar').getBoundingClientRect().bottom;
    let x = free + 14, y = top + 58;                               // default: top-left corner of the valley view
    if (a) {
      const r = a.getBoundingClientRect();
      if (a.closest('#side')) { x = Math.max(r.right, free) + gap; y = r.top + Math.min(r.height / 2, 60) - 30; el.dataset.side = 'left'; }
      else if (a.closest('#drawer')) { x = r.left + r.width / 2 - w / 2; y = r.top - hh - gap; el.dataset.side = 'down'; }
      else { x = r.left + r.width / 2 - w / 2; y = r.bottom + gap; el.dataset.side = 'up'; }
      x = Math.max(8, Math.min(vw - w - 8, x)); y = Math.max(top + 8, Math.min(vh - hh - 8, y));
      if (el.dataset.side === 'left') ar.style.top = Math.max(12, Math.min(hh - 30, r.top + Math.min(r.height / 2, 60) - y - 8)) + 'px';
      else ar.style.left = Math.max(12, Math.min(w - 30, r.left + r.width / 2 - x - 8)) + 'px';
    }
    el.style.left = x + 'px'; el.style.top = y + 'px';
  }
}
