// Coach marks for the first two minutes of Survive 15:00: short tips that point at the thing they explain.
// They never pause the run (the opening spring is calm on purpose) and can be skipped; once seen they stay off on this device.
import { h } from './dom.js';

const KEY = 'ff-coach-v1';
const STEPS = [
  { at: 2.5, anchor: '#pop-box', title: 'Your warren',
    text: 'Twelve brown, short-eared, short-toothed rabbits live on both banks of the stream. Drag to look around, scroll or pinch to zoom, and click a rabbit to follow it.' },
  { at: 14, anchor: '#trust-box', title: 'Trust is your budget',
    text: 'You earn 1 trust each generation (every 10 seconds), plus a bonus while the warren carries a mix of alleles. Every ranger action costs trust.' },
  { at: 28, anchor: '.action[data-act="translocate"]', panel: true, title: 'Translocation = gene flow',
    text: 'This walks in 2 rabbits from another valley, with whatever alleles they carry. It is the only way to add an allele on purpose: you cannot order a mutation. The bars show the odds.' },
  { at: 44, anchor: '#forecast', title: 'Read the forecast',
    text: 'This strip warns you 20 seconds before each change. Foxes come first at about 2:00, then a long winter at about 4:00.' },
  { at: 60, anchor: '.source[data-src="alpine"]', panel: true, title: 'Think ahead',
    text: 'On snow, white fur hides from foxes. White (b) is recessive, so it stays hidden in carriers for a few generations. Alpine rabbits need to arrive well before the snow does.' },
  { at: 80, anchor: '.action[data-act="clover"]', panel: true, title: 'Habitat tools',
    text: 'Clover and brush shelters go where you click; a ring shows how far each one reaches. Keep some trust back for when the foxes arrive.' },
];

export class Coach {
  constructor(ui) {
    this.ui = ui; this.i = 0; this.active = false; this.shown = null; this.shownAt = 0; this.target = null;
    this.el = h('div', { id: 'coach', class: 'hidden', role: 'status', 'aria-live': 'polite' });
    document.querySelector('#app').append(this.el);
    window.addEventListener('resize', () => this.place());
  }
  static seen() { try { return localStorage.getItem(KEY) === 'done'; } catch { return false; } }
  start(force = false) {
    this.hide(); this.i = 0; this.active = force || !Coach.seen(); this.forced = force;
    return this.active;
  }
  stop(remember = true) {
    this.hide(); this.active = false;
    if (remember) { try { localStorage.setItem(KEY, 'done'); } catch { /* storage blocked */ } }
  }
  hide() {
    this.el.classList.add('hidden'); this.shown = null;
    if (this.target) { this.target.classList.remove('coach-target'); this.target = null; }
  }
  next() { this.hide(); this.i++; if (this.i >= STEPS.length) this.stop(); else this.skipWait = true; }

  // called every UI refresh with the sim clock (pausing the run pauses the tips too)
  update(simT, paused) {
    if (!this.active) return;
    if (this.shown) {
      if (!paused && performance.now() - this.shownAt > 16000) this.next();
      else if (this.target && !this.target.isConnected) this.hide();
      return;
    }
    const s = STEPS[this.i]; if (!s) { this.stop(); return; }
    const t = this.forced ? simT - (this.t0 ??= simT) : simT;
    if (t >= s.at || (this.skipWait && t >= 0)) { this.skipWait = false; this.show(s); }
  }

  show(s) {
    this.shown = s; this.shownAt = performance.now();
    const last = this.i === STEPS.length - 1;
    this.el.innerHTML = '';
    this.el.append(
      h('div', { class: 'coach-arrow' }),
      h('div', { class: 'coach-step', text: `Tip ${this.i + 1} of ${STEPS.length}` }),
      h('b', { text: s.title }), h('p', { text: s.text }),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn small primary', text: last ? 'Got it' : 'Next tip', onclick: () => this.next() }),
        !last && h('button', { class: 'btn small', text: 'Skip tips', onclick: () => this.stop() })));
    this.el.classList.remove('hidden');
    let a = document.querySelector(s.anchor);
    const mobile = window.matchMedia('(max-width: 760px)').matches;
    if (a && s.panel && (mobile || document.body.classList.contains('no-side'))) a = document.querySelector('#btn-panel');   // the panel is tucked away: point at its button
    if (a && a.offsetParent === null) a = null;
    if (a) { if (s.panel && a.id !== 'btn-panel') a.scrollIntoView({ block: 'nearest' }); a.classList.add('coach-target'); }
    this.target = a;
    requestAnimationFrame(() => this.place());
  }

  place() {
    if (!this.shown) return;
    const el = this.el, a = this.target, vw = window.innerWidth, vh = window.innerHeight;
    el.dataset.side = 'none'; el.style.left = el.style.top = '';
    if (!a || vw <= 760) { el.dataset.side = a ? 'up' : 'none'; el.classList.add('docked'); this.arrow(a); return; }
    el.classList.remove('docked');
    const r = a.getBoundingClientRect(), w = el.offsetWidth, hh = el.offsetHeight, gap = 16;
    const inPanel = !!a.closest('#side');
    let x, y;
    if (inPanel) { x = r.right + gap; y = r.top + Math.min(r.height / 2, 60) - 30; el.dataset.side = 'left'; }
    else { x = r.left + r.width / 2 - w / 2; y = r.bottom + gap; el.dataset.side = 'up'; }
    x = Math.max(8, Math.min(vw - w - 8, x)); y = Math.max(8, Math.min(vh - hh - 8, y));
    el.style.left = x + 'px'; el.style.top = y + 'px';
    this.arrow(a, x, y);
  }
  arrow(a, x = this.el.getBoundingClientRect().left, y = 0) {
    const ar = this.el.querySelector('.coach-arrow'); if (!ar) return;
    if (!a) { ar.style.display = 'none'; return; }
    ar.style.display = '';
    const r = a.getBoundingClientRect();
    if (this.el.dataset.side === 'left') { ar.style.left = ''; ar.style.top = Math.max(12, Math.min(this.el.offsetHeight - 28, r.top + Math.min(r.height / 2, 60) - y - 8)) + 'px'; }
    else { ar.style.top = ''; ar.style.left = Math.max(12, Math.min(this.el.offsetWidth - 28, r.left + r.width / 2 - x - 8)) + 'px'; }
  }
}
