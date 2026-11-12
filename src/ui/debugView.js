// Fallback top-down 2D renderer. Same API as the 3D world, so the app is fully playable without it.
const HALF = 60;
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => c1.map((v, i) => Math.round(lerp(v, c2[i], t)));

export function createDebugView(canvas) {
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, scale = 1, ox = 0, oy = 0, followId = null, genoView = false, pulses = [], lastSim = null, t = 0;
  canvas.classList.remove('hidden');

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    w = canvas.clientWidth || window.innerWidth || 800; h = canvas.clientHeight || window.innerHeight || 600;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const left = w > 760 ? 350 : 0, topPad = Math.min(110, h * 0.25), avail = Math.min(w - left, h - topPad - (w > 760 ? 90 : 0));
    scale = Math.max(0.5, (avail * 0.96) / (HALF * 2));
    ox = left + (w - left) / 2; oy = topPad + (h - topPad) / 2;
  }
  const sx = (x) => ox + x * scale, sz = (z) => oy + z * scale;

  function draw(sim) {
    const e = sim.env;
    ctx.fillStyle = '#e9e1c8'; ctx.fillRect(0, 0, w, h);
    const grass = mix([122, 168, 92], [196, 176, 96], Math.max(0, e.temp) * (1 - Math.min(1, e.food / 120)) * 1.2);
    const g = mix(grass, [238, 244, 248], Math.min(1, e.snow));
    ctx.fillStyle = `rgb(${g})`;
    ctx.beginPath(); ctx.arc(sx(0), sz(0), HALF * scale, 0, 7); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#2b2a28'; ctx.stroke();
    if (e.temp < -0.2) { ctx.fillStyle = `rgba(120,160,220,${Math.min(0.25, -e.temp * 0.25)})`; ctx.fill(); }
    if (e.temp > 0.4) { ctx.fillStyle = `rgba(255,170,60,${(e.temp - 0.4) * 0.35})`; ctx.fill(); }
    // stream
    ctx.strokeStyle = 'rgba(90,140,190,0.6)'; ctx.lineWidth = 7 * scale / 3; ctx.beginPath(); ctx.moveTo(sx(-55), sz(8)); ctx.bezierCurveTo(sx(-20), sz(-6), sx(10), sz(24), sx(55), sz(6)); ctx.stroke();
    for (const b of sim.burrows) { ctx.fillStyle = '#6a4a2e'; ctx.beginPath(); ctx.ellipse(sx(b.x), sz(b.z), 2.6 * scale, 1.9 * scale, 0, 0, 7); ctx.fill(); }
    for (const p of sim.patches) {
      ctx.beginPath(); ctx.arc(sx(p.x), sz(p.z), p.radius * scale, 0, 7);
      if (p.type === 'clover') { ctx.fillStyle = 'rgba(80,170,90,0.35)'; ctx.fill(); ctx.setLineDash([5, 4]); ctx.strokeStyle = '#2f7a3c'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#2f7a3c'; ctx.font = `${Math.max(12, 3 * scale)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('clover', sx(p.x), sz(p.z) + 4); }
      else { ctx.fillStyle = 'rgba(120,85,50,0.3)'; ctx.fill(); ctx.setLineDash([5, 4]); ctx.strokeStyle = '#6a4a2e'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#6a4a2e'; ctx.font = `${Math.max(12, 3 * scale)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('shelter', sx(p.x), sz(p.z) + 4); }
    }
    const r0 = Math.max(3.2, 0.9 * scale);
    for (const r of sim.rabbits) {
      const x = sx(r.x), y = sz(r.z), rad = r.age === 0 ? r0 * 0.7 : r0;
      ctx.globalAlpha = r.alive ? 1 : Math.max(0, r.dyingT / 2.2);
      ctx.fillStyle = r.pheno.white ? '#fffdf4' : '#8a5a33';
      ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill();
      ctx.lineWidth = 1.4; ctx.strokeStyle = '#2b2a28'; ctx.stroke();
      if (r.pheno.longEars) { ctx.beginPath(); ctx.moveTo(x - rad * 0.5, y - rad); ctx.lineTo(x - rad * 0.5, y - rad * 2.2); ctx.moveTo(x + rad * 0.5, y - rad); ctx.lineTo(x + rad * 0.5, y - rad * 2.2); ctx.lineWidth = 1.6; ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(x - rad * 0.5, y - rad); ctx.lineTo(x - rad * 0.5, y - rad * 1.4); ctx.moveTo(x + rad * 0.5, y - rad); ctx.lineTo(x + rad * 0.5, y - rad * 1.4); ctx.stroke(); }
      if (r.pheno.longTeeth) { ctx.fillStyle = '#fff'; ctx.fillRect(x - 1, y + rad * 0.5, 2, 3); ctx.strokeRect(x - 1, y + rad * 0.5, 2, 3); }
      if (genoView && r.alive) {
        const f = r.genotype.fur; ctx.lineWidth = 2.4;
        ctx.strokeStyle = f === 'Bb' ? '#e07a1f' : f === 'bb' ? '#4a62a8' : '#5b3f22';
        ctx.beginPath(); ctx.arc(x, y, rad + 2.5, 0, 7); ctx.stroke();
        ctx.fillStyle = '#2b2a28'; ctx.font = '9px Mulish, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(f, x, y + rad + 12);
      }
      if (!r.alive) { ctx.strokeStyle = '#c0452f'; ctx.beginPath(); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4); ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4); ctx.stroke(); }
      if (r.id === followId) { ctx.globalAlpha = 1; ctx.strokeStyle = '#e07a1f'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, rad + 6 + Math.sin(t * 6) * 1.5, 0, 7); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    for (const p of sim.predators) {
      const x = sx(p.x), z = sz(p.z), s = Math.max(6, 1.6 * scale);
      ctx.fillStyle = '#c0452f'; ctx.strokeStyle = '#2b2a28'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x, z - s); ctx.lineTo(x + s, z + s * 0.8); ctx.lineTo(x - s, z + s * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    pulses = pulses.filter((q) => (q.age += 0.016) < 1.2);
    for (const q of pulses) { ctx.globalAlpha = 1 - q.age / 1.2; ctx.strokeStyle = q.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx(q.x), sz(q.z), 6 + q.age * 26, 0, 7); ctx.stroke(); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(43,42,40,0.7)'; ctx.font = '11px Mulish, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('Simple 2D view (3D world not loaded)', 10, h - 10);
  }

  resize();
  return {
    kind: 'debug',
    update(sim, dt) {
      t += dt; lastSim = sim;
      if (canvas.clientWidth && (canvas.clientWidth !== w || canvas.clientHeight !== h)) resize();
      if (followId != null) { const r = sim.getRabbit(followId); if (!r || !r.alive) followId = null; }
      draw(sim);
    },
    onEvents(events) {
      for (const e of events) {
        if (pulses.length > 30) break;
        if (e.type === 'mutation') pulses.push({ x: e.x, z: e.z, age: 0, color: '#e8b923' });
        else if (e.type === 'catch') pulses.push({ x: e.x, z: e.z, age: 0, color: '#c0452f' });
      }
    },
    pick(cx, cy) {
      if (!lastSim) return null;
      const r = canvas.getBoundingClientRect(), x = cx - r.left, y = cy - r.top;
      let best = null, bd = Math.max(14, 2.2 * scale) ** 2;
      for (const q of lastSim.rabbits) { if (!q.alive) continue; const d = (sx(q.x) - x) ** 2 + (sz(q.z) - y) ** 2; if (d < bd) { bd = d; best = q.id; } }
      return best;
    },
    groundPoint(cx, cy) {
      const r = canvas.getBoundingClientRect(), x = (cx - r.left - ox) / scale, z = (cy - r.top - oy) / scale;
      return Math.hypot(x, z) <= HALF ? { x, z } : null;
    },
    follow(id) { followId = id; },
    setGenotypeView(v) { genoView = !!v; },
    resize,
    dispose() { canvas.classList.add('hidden'); },
  };
}
