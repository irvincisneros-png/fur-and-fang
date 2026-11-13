// Tutorial steps (about 3 to 4 minutes). Words only: the logic for each `done` check lives in src/ui/tutorial.js.
//   scene   valley scene to switch to (src/sim/tutorial.js)        run    true = the valley runs, false = it is paused while you read
//   anchor  UI element to point at; `anchorThen` replaces it once the first half of the job is done
//   panel   the anchor is inside the Controls panel               trust  top the Trust budget up to this much
//   done    which check finishes the step                          goal   what the student must do (shown beside a tick box)
export const TUTORIAL_STEPS = [
  {
    id: 'camera', scene: 'meadow', run: true, done: 'camera',
    title: 'Look around the valley',
    text: 'This valley is home to a warren of rabbits. Press W, A, S and D (or the arrow keys) to move. Press Q and E to turn. Scroll to zoom.',
    textTouch: 'This valley is home to a warren of rabbits. Drag with one finger to move. Use two fingers to turn and to zoom.',
    goal: 'Move the camera around the valley.',
  },
  {
    id: 'rabbit', run: false, done: 'card', spot: 'rabbits',
    title: 'Meet a rabbit',
    text: 'Click a rabbit to open its card. The letters, such as Bb EE tt, are its genotype: two alleles for each gene, one from each parent. The boxes below are its pedigree: parents, then grandparents.',
    textTouch: 'Tap a rabbit to open its card. The letters, such as Bb EE tt, are its genotype: two alleles for each gene, one from each parent. The boxes below are its pedigree: parents, then grandparents.',
    goal: 'Open a rabbit\'s card and read its genotype.',
  },
  {
    id: 'hunt', scene: 'hunt', run: true, done: 'caught', tally: true, need: 10,
    title: 'Snow and foxes',
    text: 'Snow now covers the grass, and three foxes are moving in. Foxes catch the rabbits they can see. Watch which fur colour gets caught more.',
    goal: 'Watch until the foxes have caught 10 rabbits.',
  },
  {
    id: 'graph', run: false, done: 'causes', anchor: '#btn-graphs', anchorThen: '#graph-tabs [data-tab="causes"]',
    title: 'Why did they die?',
    text: 'The Cause of death graph shows how many rabbits died of each cause in each generation. One bar is one generation, and each colour is a cause. It does not show fur colour, so the count below compares brown and white rabbits for you.',
    goal: 'Open Graphs, then choose the Cause of death tab.',
  },
  {
    id: 'carrier', run: false, done: 'carrier', anchor: '#gv2', panel: true,
    title: 'A hidden allele',
    text: 'Genotype view puts a ring on every rabbit: orange is BB, violet is Bb, blue is bb. A Bb rabbit looks brown but carries one hidden white allele (b). It is called a carrier. Two carriers can have a white kit.',
    goal: 'Turn on Genotype view, then click a rabbit with a violet ring.',
    goalTouch: 'Turn on Genotype view, then tap a rabbit with a violet ring.',
  },
  {
    id: 'translocate', scene: 'calm', run: true, done: 'translocate', anchor: '.action[data-act="translocate"]', panel: true, trust: 6,
    title: 'Bring in new alleles',
    text: 'You cannot order a mutation. You can spend Trust to bring in 2 rabbits from another valley. Each card shows how common each allele is there. On Alpine ridge, 88% of fur alleles are white (b).',
    goal: 'Read the three cards, then click one to bring its rabbits in.',
    goalTouch: 'Read the three cards, then tap one to bring its rabbits in.',
  },
  {
    id: 'forecast', scene: 'front', run: true, done: 'prepare', anchor: '#forecast', anchorThen: '.source[data-src="alpine"]', panel: true, trust: 6,
    title: 'Read the forecast',
    text: 'The forecast strip warns you 20 seconds before the valley changes. A cold front is coming, so snow is on the way. White fur hides on snow. Get ready before it arrives.',
    goal: 'Bring in Alpine ridge rabbits, or place a brush shelter.',
  },
  {
    id: 'ready', run: false, final: true,
    title: 'You\'re ready',
    text: 'That is the whole job. Watch the forecast. Get the alleles the warren will need into the valley before each change arrives. In Survive 15:00 you must keep the warren alive for fifteen minutes.',
  },
];

// Short replies shown under the goal while a step is in progress.
export const TUTORIAL_NOTES = {
  paused: 'The valley is paused. Press Play to carry on.',
  tally: (brown, white) => `Caught so far: ${brown} brown, ${white} white.`,
  // caught = predator deaths; atRisk = rabbits of that colour alive at the start of each generation, added up
  catchRate: (b, bn, w, wn) => {
    const pc = (a, n) => (n ? ` (${Math.round((a / n) * 100)}%)` : '');
    return `Caught: brown ${b} of ${bn}${pc(b, bn)}, white ${w} of ${wn}${pc(w, wn)}. Each total adds up the rabbits alive at the start of every generation on snow.`;
  },
  tallyDone: (brown, white) => `Caught: ${brown} brown and ${white} white. ${brown > white ? 'Brown fur is easy to see on snow.' : 'Keep watching: over time, more brown rabbits are caught on snow.'}`,
  graphOpen: 'Now choose the Cause of death tab.',
  genoOff: 'First tick Genotype view in the Controls panel.',
  notCarrier: (fur) => (fur === 'BB' ? 'That rabbit is BB: two brown alleles and nothing hidden. Look for a violet ring.' : 'That rabbit is bb: it is white, so its alleles are not hidden. Look for a violet ring.'),
  carrier: (id) => `Rabbit #${id} is Bb: brown fur, with a white allele hidden inside.`,
  arrived: (genos) => `The newcomers carry ${genos}. You get whatever alleles they happen to have.`,
  wrongSource: 'Those rabbits are mostly brown, so they will not help on snow. Try Alpine ridge or a brush shelter.',
  prepared: 'Good. The warren now has some help before the snow arrives.',
  late: 'The cold front has already arrived, so that was too late to prepare for it. Press Try again for a new warning.',
  lateAct: 'That came after the cold front had arrived, so it was too late to help in time. Press Try again for a new warning.',
  retry: 'Try again',
  openPanel: 'Open Controls to find it.',
};
