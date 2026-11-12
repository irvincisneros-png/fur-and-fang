// Canvas 2D graphs: population, allele frequency, proportions, cause of death. Paper-and-ink styling.
import { alleleFreq, CAUSES } from '../sim/history.js';

export const COLORS = {
  ink: '#2b2a28', grid: 'rgba(43,42,40,0.14)', paper: '#fbf6e6',
  white: '#7a8fb8', brown: '#8a5a33', longEars: '#d0653f', shortEars: '#2f7f8f', longTeeth: '#3f9a58', shortTeeth: '#b79a2e', total: '#2b2a28',
  b: '#6b82b3', e: '#d0653f', T: '#3f9a58',
  predator: '#c0452f', cold: '#5b8fc4', heat: '#e3a02f', starved: '#8c9a3a', old: '#a393b8', bottleneck: '#6a6a6a',
};
export const CAUSE_LABEL = { predator: 'Predators', cold: 'Cold', heat: 'Heat', starved: 'Starved', old: 'Old age', bottleneck: 'Bottleneck' };
const FONT = '12px Mulish, system-ui, sans-serif';

function prep(canvas) {
  const dpr = window.devicePixelRatio || 1, r = canvas.getBoundingClientRect();
  const w = Math.max(40, Math.round(r.width)), h = Math.max(40, Math.round(r.height));
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function frame(ctx, w, h, { xMax, yMax, yFmt = (v) => v, xLabel = 'Generation', yLabel = '', bands = null, xPos = null }) {
  const m = { l: 60, r: 12, t: 12, b: 34 };
  const pw = w - m.l - m.r, ph = h - m.t - m.b;
  const X = xPos || ((x) => m.l + (xMax ? x / xMax : 0) * pw), Y = (y) => m.t + ph - (y / yMax) * ph;
  ctx.font = FONT; ctx.textBaseline = 'middle';
  if (bands) for (const b of bands) {
    const x0 = X(b.start / 10), x1 = X(Math.min(b.end / 10, xMax));
    if (x1 <= m.l || x0 >= m.l + pw) continue;
    ctx.fillStyle = b.color + '66'; ctx.fillRect(Math.max(m.l, x0), m.t, Math.min(m.l + pw, x1) - Math.max(m.l, x0), ph);
  }
  ctx.strokeStyle = COLORS.grid; ctx.fillStyle = COLORS.ink; ctx.lineWidth = 1; ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const v = (yMax * i) / 4, y = Y(v);
    ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); ctx.stroke();
    ctx.fillText(yFmt(v), m.l - 6, y);
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const xticks = Math.min(8, Math.max(1, Math.floor(pw / 60)));
  for (let i = 0; i <= xticks; i++) {
    const v = (xMax * i) / xticks, x = X(v);
    ctx.fillText(String(Math.round(v)), x, m.t + ph + 4);
  }
  ctx.fillStyle = COLORS.ink; ctx.fillText(xLabel, m.l + pw / 2, h - 15);
  if (yLabel) { ctx.save(); ctx.translate(12, m.t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(yLabel, 0, 0); ctx.restore(); }
  ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(m.l, m.t); ctx.lineTo(m.l, m.t + ph); ctx.lineTo(m.l + pw, m.t + ph); ctx.stroke();
  if (bands) {                                              // band labels along the top
    ctx.font = '10.5px Mulish, system-ui, sans-serif'; ctx.fillStyle = COLORS.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    for (const b of bands) {
      const x0 = Math.max(m.l, X(b.start / 10)), x1 = Math.min(m.l + pw, X(Math.min(b.end / 10, xMax)));
      if (x1 - x0 > 46) ctx.fillText(b.icon + ' ' + b.label, x0 + 3, m.t + 2, x1 - x0 - 4);
    }
  }
  return { m, pw, ph, X, Y };
}

function line(ctx, pts, X, Y, color, width = 2.4, dash = null) {
  if (pts.length < 1) return;
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash(dash || []);
  ctx.beginPath();
  pts.forEach(([x, y], i) => { const px = X(x), py = Y(y); if (i === 0) ctx.moveTo(px, py); else { const [qx, qy] = pts[i - 1]; const mx = (X(qx) + px) / 2, my = (Y(qy) + py) / 2; ctx.quadraticCurveTo(X(qx), Y(qy), mx, my); } });
  const last = pts[pts.length - 1]; ctx.lineTo(X(last[0]), Y(last[1]));
  ctx.stroke(); ctx.setLineDash([]);
}

function stride(records, max = 300) { const s = Math.max(1, Math.ceil(records.length / max)); return records.filter((_, i) => i % s === 0 || i === records.length - 1); }

export const POP_MODES = {
  total: { label: 'Total', series: [['Rabbits', 'total', (c) => c.n]] },
  fur: { label: 'Fur', series: [['Rabbits', 'total', (c) => c.n], ['White fur', 'white', (c) => c.white], ['Brown fur', 'brown', (c) => c.brown]] },
  ears: { label: 'Ears', series: [['Rabbits', 'total', (c) => c.n], ['Long ears', 'longEars', (c) => c.longEars], ['Short ears', 'shortEars', (c) => c.shortEars]] },
  teeth: { label: 'Teeth', series: [['Rabbits', 'total', (c) => c.n], ['Long teeth', 'longTeeth', (c) => c.longTeeth], ['Short teeth', 'shortTeeth', (c) => c.shortTeeth]] },
};
export const TABS = { population: 'Population', allele: 'Allele frequency', proportions: 'Proportions', causes: 'Cause of death' };

const pct = (v) => Math.round(v * 100) + '%';

// Allele-frequency chart with optional event bands (used in the drawer and on the end screen).
export function drawAlleleChart(canvas, history, { bands = null, hoverGen = null } = {}) {
  const { ctx, w, h } = prep(canvas);
  const recs = stride(history.records);
  const last = history.records.length ? history.records[history.records.length - 1].gen : 0;
  const xMax = Math.max(10, bands ? 90 : last);
  const f = frame(ctx, w, h, { xMax, yMax: 1, yFmt: pct, yLabel: 'Allele frequency', bands });
  for (const [al, col] of [['b', COLORS.b], ['e', COLORS.e], ['T', COLORS.T]]) line(ctx, recs.map((r) => [r.gen, alleleFreq(r.comp, al)]), f.X, f.Y, col);
  hoverMark(ctx, f, history, hoverGen, (r) => [['b', alleleFreq(r.comp, 'b'), COLORS.b], ['e', alleleFreq(r.comp, 'e'), COLORS.e], ['T', alleleFreq(r.comp, 'T'), COLORS.T]]);
  return f;
}

function hoverMark(ctx, f, history, gen, dots) {
  if (gen == null) return;
  const r = history.records.find((x) => x.gen === gen); if (!r) return;
  const x = f.X(gen);
  ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(x, f.m.t); ctx.lineTo(x, f.m.t + f.ph); ctx.stroke(); ctx.setLineDash([]);
  for (const [, v, col] of dots(r)) { ctx.fillStyle = col; ctx.strokeStyle = COLORS.paper; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, f.Y(v), 4, 0, 7); ctx.fill(); ctx.stroke(); }
}

// Stacked horizontal bars: deaths by cause per window (end screen).
export function drawDeathBars(canvas, rows) {
  const { ctx, w, h } = prep(canvas);
  const labelW = Math.min(150, w * 0.32), padR = 40, top = 6, rowH = Math.max(18, Math.min(30, (h - top - 26) / Math.max(1, rows.length)));
  const max = Math.max(1, ...rows.map((r) => CAUSES.reduce((s, c) => s + (r.deaths[c] || 0), 0)));
  ctx.font = FONT; ctx.textBaseline = 'middle';
  rows.forEach((r, i) => {
    const y = top + i * rowH; let x = labelW; const tot = CAUSES.reduce((s, c) => s + (r.deaths[c] || 0), 0);
    ctx.fillStyle = COLORS.ink; ctx.textAlign = 'right'; ctx.fillText(r.label, labelW - 8, y + rowH / 2, labelW - 10);
    for (const c of CAUSES) { const v = r.deaths[c] || 0; if (!v) continue; const bw = (v / max) * (w - labelW - padR); ctx.fillStyle = COLORS[c]; ctx.fillRect(x, y + 3, bw, rowH - 6); x += bw; }
    ctx.fillStyle = COLORS.ink; ctx.textAlign = 'left'; ctx.fillText(String(tot), x + 5, y + rowH / 2);
  });
  let lx = labelW, ly = top + rows.length * rowH + 10;
  ctx.textAlign = 'left';
  for (const c of CAUSES) {
    const tw = ctx.measureText(CAUSE_LABEL[c]).width + 26;
    if (lx + tw > w) { lx = labelW; ly += 16; }
    ctx.fillStyle = COLORS[c]; ctx.fillRect(lx, ly - 5, 11, 11); ctx.fillStyle = COLORS.ink; ctx.fillText(CAUSE_LABEL[c], lx + 16, ly + 1); lx += tw;
  }
}

export class GraphPanel {
  constructor(canvas, readout, legend, getState) {
    this.canvas = canvas; this.readout = readout; this.legend = legend; this.getState = getState;
    this.tab = 'population'; this.popMode = 'fur'; this.hoverGen = null; this.dirty = true; this.geom = null;
    canvas.addEventListener('pointermove', (e) => this.hover(e));
    canvas.addEventListener('pointerleave', () => { this.hoverGen = null; this.readout.textContent = this.defaultReadout(); this.draw(); });
  }
  setTab(t) { this.tab = t; this.hoverGen = null; this.draw(); }
  setPopMode(m) { this.popMode = m; this.draw(); }

  hover(e) {
    if (!this.geom || !this.geom.X) return;
    const r = this.canvas.getBoundingClientRect(), x = e.clientX - r.left;
    const { history } = this.getState(); const recs = history.records;
    if (!recs.length) return;
    let best = null, bd = 1e9;
    for (const rec of recs) { const d = Math.abs(this.geom.X(rec.gen) - x); if (d < bd) { bd = d; best = rec; } }
    this.hoverGen = best ? best.gen : null;
    this.readout.textContent = best ? this.describe(best) : '';
    this.draw();
  }

  defaultReadout() {
    const { history } = this.getState(); const r = history.records[history.records.length - 1];
    return r ? 'Hover the graph for exact numbers.' : '';
  }

  describe(r) {
    const c = r.comp;
    if (this.tab === 'population') {
      const mode = POP_MODES[this.popMode];
      return `Generation ${r.gen}: ` + mode.series.map(([n, , f]) => `${n} ${f(c)}`).join(' · ');
    }
    if (this.tab === 'allele') return `Generation ${r.gen}: b (white fur) ${pct(alleleFreq(c, 'b'))} · e (long ears) ${pct(alleleFreq(c, 'e'))} · T (long teeth) ${pct(alleleFreq(c, 'T'))}`;
    if (this.tab === 'causes') return `Generation ${r.gen}: ` + CAUSES.map((k) => `${CAUSE_LABEL[k]} ${r.deaths[k] || 0}`).join(' · ');
    return '';
  }

  setLegend(items) {
    this.legend.innerHTML = '';
    for (const [name, col] of items) { const s = document.createElement('span'); s.innerHTML = `<i style="background:${col}"></i>${name}`; this.legend.appendChild(s); }
  }

  draw() {
    const { history, sim, challenge } = this.getState();
    const recs = history.records;
    const last = recs.length ? recs[recs.length - 1].gen : 0;
    if (this.tab === 'allele') {
      this.setLegend([['b: white fur', COLORS.b], ['e: long ears', COLORS.e], ['T: long teeth', COLORS.T]]);
      this.geom = drawAlleleChart(this.canvas, history, { bands: challenge ? challenge.windows : null, hoverGen: this.hoverGen });
      return;
    }
    const { ctx, w, h } = prep(this.canvas);
    if (this.tab === 'population') {
      const mode = POP_MODES[this.popMode];
      this.setLegend(mode.series.map(([n, k]) => [n, COLORS[k]]));
      const rs = stride(recs);
      const yMax = niceMax(Math.max(10, ...rs.map((r) => r.comp.n)));
      const xMax = Math.max(10, challenge ? 90 : last);
      const f = frame(ctx, w, h, { xMax, yMax, yLabel: 'Rabbits', bands: challenge ? challenge.windows : null });
      mode.series.forEach(([, k, fn], i) => line(ctx, rs.map((r) => [r.gen, fn(r.comp)]), f.X, f.Y, COLORS[k], i === 0 ? 2.8 : 2.2, i === 0 ? null : null));
      hoverMark(ctx, f, history, this.hoverGen, (r) => mode.series.map(([, k, fn]) => [k, fn(r.comp), COLORS[k]]));
      this.geom = f;
    } else if (this.tab === 'causes') {
      this.setLegend(CAUSES.map((c) => [CAUSE_LABEL[c], COLORS[c]]));
      const rs = stride(recs, 120);
      const tot = (r) => CAUSES.reduce((s, c) => s + (r.deaths[c] || 0), 0);
      const yMax = niceMax(Math.max(5, ...rs.map(tot)));
      const xMax = Math.max(10, challenge ? 90 : last + 1);
      const f = frame(ctx, w, h, { xMax, yMax, yLabel: 'Deaths per generation', bands: challenge ? challenge.windows : null });
      const bw = Math.max(2, (f.pw / xMax) * (recs.length > 120 ? Math.ceil(recs.length / 120) : 1) * 0.8);
      for (const r of rs) {
        let y0 = 0; const x = f.X(r.gen) - bw / 2;
        for (const c of CAUSES) { const v = r.deaths[c] || 0; if (!v) continue; ctx.fillStyle = COLORS[c]; ctx.fillRect(x, f.Y(y0 + v), bw, f.Y(y0) - f.Y(y0 + v)); y0 += v; }
      }
      hoverMark(ctx, f, history, this.hoverGen, () => []);
      this.geom = f;
    } else {
      this.drawProportions(ctx, w, h);
    }
  }

  drawProportions(ctx, w, h) {
    const { history, sim } = this.getState();
    const rec = history.records[history.records.length - 1];
    this.geom = null;
    this.setLegend([['Start of generation', 'rgba(43,42,40,0.28)'], ['Now', COLORS.ink]]);
    if (!rec) return;
    const now = sim.composition();
    const cats = [['Brown fur', 'brown'], ['White fur', 'white'], ['Short ears', 'shortEars'], ['Long ears', 'longEars'], ['Short teeth', 'shortTeeth'], ['Long teeth', 'longTeeth']];
    const m = { l: 56, r: 12, t: 14, b: 40 }, pw = w - m.l - m.r, ph = h - m.t - m.b, Y = (v) => m.t + ph - v * ph;
    ctx.font = FONT; ctx.textBaseline = 'middle'; ctx.textAlign = 'right'; ctx.strokeStyle = COLORS.grid;
    for (let i = 0; i <= 4; i++) { const y = Y(i / 4); ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); ctx.stroke(); ctx.fillStyle = COLORS.ink; ctx.fillText(pct(i / 4), m.l - 6, y); }
    const gw = pw / cats.length, bw = Math.min(26, gw * 0.3);
    cats.forEach(([label, key], i) => {
      const cx = m.l + gw * (i + 0.5);
      const a = rec.comp.n ? rec.comp[key] / rec.comp.n : 0, b = now.n ? now[key] / now.n : 0;
      ctx.fillStyle = 'rgba(43,42,40,0.28)'; ctx.fillRect(cx - bw - 2, Y(a), bw, Y(0) - Y(a));
      ctx.fillStyle = COLORS[key]; ctx.fillRect(cx + 2, Y(b), bw, Y(0) - Y(b));
      ctx.fillStyle = COLORS.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(pct(a), cx - bw / 2 - 2, Y(a) - 2); ctx.fillText(pct(b), cx + bw / 2 + 2, Y(b) - 2);
      ctx.textBaseline = 'top'; ctx.fillText(label, cx, m.t + ph + 6, gw - 4);
    });
    ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(m.l, m.t); ctx.lineTo(m.l, m.t + ph); ctx.lineTo(m.l + pw, m.t + ph); ctx.stroke();
    this.readout.textContent = `Generation ${rec.gen}: pale bars = the start of this generation, solid bars = right now.`;
  }
}
