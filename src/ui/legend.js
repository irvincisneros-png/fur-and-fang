// Genotype-ring legend, built from the same GENOTYPE_COLORS the 3D view paints its rings with (src/render/palette.js).
// The palette module pulls in three.js, so it loads on demand: if it cannot load, the legend still names the genotypes.
import { h } from './dom.js';

const ROWS = [['BB', 'brown, no white allele'], ['Bb', 'brown carrier'], ['bb', 'white']];

export function genotypeLegend() {
  const box = h('div', { class: 'geno-legend' }, 'Rings show the fur genotype: ',
    ROWS.map(([g, what]) => h('span', { class: 'gl-item', 'data-g': g }, h('i', { class: 'gl-dot', 'aria-hidden': 'true' }), h('b', { text: g }), ` ${what}`)));
  import('../render/palette.js').then(({ GENOTYPE_COLORS }) => {
    for (const el of box.querySelectorAll('.gl-item')) el.querySelector('.gl-dot').style.background = '#' + GENOTYPE_COLORS[el.dataset.g].toString(16).padStart(6, '0');
  }).catch(() => { for (const d of box.querySelectorAll('.gl-dot')) d.style.display = 'none'; });
  return box;
}

// Islands lineage rings (same values as LINEAGE_COLORS in src/render/rabbits.js), keyed by the lineage bit: 1 West, 2 East, 4 Islet.
export const LINEAGE_HEX = { 1: '#1f9e8f', 2: '#e8a33a', 4: '#8e6cc8' };
