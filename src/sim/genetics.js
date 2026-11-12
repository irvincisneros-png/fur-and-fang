// Genotype / phenotype, gametes, mutation, dominance configuration.
export const GENES = ['fur', 'ears', 'teeth'];

// normal = the allele the founding warren carries (BB EE tt); mutant = the new allele.
export const GENE_INFO = {
  fur:   { label: 'Fur colour', normal: 'B', mutant: 'b', normalTrait: 'brown fur', mutantTrait: 'white fur' },
  ears:  { label: 'Ear length', normal: 'E', mutant: 'e', normalTrait: 'short ears', mutantTrait: 'long ears' },
  teeth: { label: 'Teeth',      normal: 't', mutant: 'T', normalTrait: 'short teeth', mutantTrait: 'long teeth' },
};
export const ALLELE_TRAIT = {};
for (const g of GENES) { const i = GENE_INFO[g]; ALLELE_TRAIT[i.normal] = i.normalTrait; ALLELE_TRAIT[i.mutant] = i.mutantTrait; }
export const ALLELE_GENE = {};
for (const g of GENES) { const i = GENE_INFO[g]; ALLELE_GENE[i.normal] = g; ALLELE_GENE[i.mutant] = g; }

// Survive: fixed B>b, E>e, T>t (mutant white/long ears recessive, long teeth dominant).
export const DOM_SURVIVE = { fur: 'B', ears: 'E', teeth: 'T' };
// Explore default: original allele dominant, mutant recessive (like PhET).
export const DOM_EXPLORE = { fur: 'B', ears: 'E', teeth: 't' };

export const FOUNDER = { fur: 'BB', ears: 'EE', teeth: 'tt' };

export function normalize(a, b) { return a <= b ? a + b : b + a; } // uppercase sorts first

export function showsMutant(gt, gene, dom) {
  const m = GENE_INFO[gene].mutant;
  return dom[gene] === m ? gt.includes(m) : gt === m + m;
}

export function phenotype(genotype, dom) {
  return {
    white: showsMutant(genotype.fur, 'fur', dom),
    longEars: showsMutant(genotype.ears, 'ears', dom),
    longTeeth: showsMutant(genotype.teeth, 'teeth', dom),
  };
}

// One gamete for one gene. Returns {allele, mutated, from}.
export function gamete(gt, gene, rng, rate) {
  let a = gt[rng.next() < 0.5 ? 0 : 1];
  let mutated = false, from = a;
  if (rng.next() < rate) { const i = GENE_INFO[gene]; a = a === i.normal ? i.mutant : i.normal; mutated = true; }
  return { allele: a, mutated, from };
}

// Cross two parents' genotypes. Returns {genotype, mutations:[{gene, allele, from}]}.
export function cross(gA, gB, rng, rate) {
  const genotype = {}; const mutations = [];
  for (const gene of GENES) {
    const x = gamete(gA[gene], gene, rng, rate), y = gamete(gB[gene], gene, rng, rate);
    genotype[gene] = normalize(x.allele, y.allele);
    if (x.mutated) mutations.push({ gene, allele: x.allele, from: x.from });
    if (y.mutated) mutations.push({ gene, allele: y.allele, from: y.from });
  }
  return { genotype, mutations };
}

// Genotype drawn from a source population by mutant-allele frequency {b,e,T}.
export function drawGenotype(freq, rng) {
  const g = {};
  for (const gene of GENES) {
    const i = GENE_INFO[gene]; const q = freq[i.mutant] ?? 0;
    const a = rng.next() < q ? i.mutant : i.normal, b = rng.next() < q ? i.mutant : i.normal;
    g[gene] = normalize(a, b);
  }
  return g;
}

export const genotypeLabel = (g) => `${g.fur} ${g.ears} ${g.teeth}`;
export function describePheno(p) {
  return `${p.white ? 'white' : 'brown'} fur, ${p.longEars ? 'long' : 'short'} ears, ${p.longTeeth ? 'long' : 'short'} teeth`;
}
