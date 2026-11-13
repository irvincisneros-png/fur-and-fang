// Islands lab: six predict-observe-explain investigations (spec section 7.5). Plain Year 9-10 English.
// setup: how "Set up" restarts the valley (same seed). steps: what to do, each with a check the panel can tick.
export const INVESTIGATIONS = [
  {
    id: 'two-valleys', title: '1. One warren, two valleys',
    setup: { scenario: 'flood', lands: ['alpine', 'desert'] },
    predict: 'The river has flooded. West is now cold and snowy, East is hot and dry. Both banks start with the same mix of alleles. What will happen to white fur (b) on each bank in 10 generations?',
    steps: [
      { text: 'Open the Islands graphs below and run the valley for 10 generations (try 4x speed or "Jump 10 generations").', done: 'gens10' },
      { text: 'Compare the West and East charts for b (white fur), e (long ears) and T (long teeth).', done: null },
    ],
    explain: 'Both banks started with the same alleles. Why did they end up different? Did the flood itself change any rabbit?',
  },
  {
    id: 'looks', title: '2. Different looks, one species?',
    setup: { scenario: 'flood', lands: ['alpine', 'desert'], reopenAt: 8 },
    predict: 'After about 8 generations apart, West rabbits look different from East rabbits. If the crossing opens, will kits of a West parent and an East parent be healthy?',
    steps: [
      { text: 'Run until the water drops (the crossing reopens by itself at 8 generations apart).', done: 'rejoined' },
      { text: 'Watch the reunion readout under "Still one species?" for a few generations.', done: 'reunionKits' },
    ],
    explain: 'Did looking different stop them breeding? What is the real test of whether two groups are one species?',
  },
  {
    id: 'how-long', title: '3. How long until two species?',
    setup: { scenario: 'flood', lands: ['meadow', 'meadow'] },
    predict: 'Both banks keep the same mild meadow climate, so they will look alike. Sketch what you think happens to "fertile hybrid kits (%)" as the time apart goes from 0 to 60 generations.',
    steps: [
      { text: 'Every 10 generations, press "Test cross" and read the result. Keep going to at least 40 generations apart.', done: 'crosses4' },
    ],
    explain: 'Was there one moment when they became two species? These banks look alike: can populations that look the same be different species?',
  },
  {
    id: 'castaways', title: '4. Four castaways',
    setup: { scenario: 'storm', lands: ['meadow', 'meadow'] },
    predict: 'A storm will sweep 4 random rabbits onto the islet, which has the same climate as the mainland. In 15 generations, will white fur (b) on the islet be higher, lower or the same as on the mainland? How sure are you?',
    steps: [
      { text: 'Under "Castaways", choose 4 and press "Send the storm". Read the founders card.', done: 'storm' },
      { text: 'Run 15 generations, then compare the islet with the mainland.', done: 'stormGens15' },
      { text: 'Try another seed (New seed, then Set up again) and repeat. Did you get the same answer?', done: null },
    ],
    explain: 'Were the four castaways fitter, or chosen? Why can a small group end up different from the population it came from?',
  },
  {
    id: 'drift', title: '5. Does drift need a small population?',
    setup: { scenario: 'storm', lands: ['meadow', 'meadow'] },
    predict: 'Twenty islands start from 4 castaways each, then twenty more from 16 castaways each. Which set of results will be more spread out?',
    steps: [
      { text: 'Under "Castaways", press "Run 20 quick islands" with 4 founders.', done: 'trials4' },
      { text: 'Now choose 16 founders and run 20 more.', done: 'trials16' },
    ],
    explain: 'Drift happened in both sets, and on the mainland too. Why is it stronger when numbers are small?',
  },
  {
    id: 'gene-flow', title: '6. A trickle of gene flow',
    setup: { scenario: 'flood', lands: ['meadow', 'meadow'] },
    predict: 'If a few rabbits are carried across the flood every 3 generations, will the hidden-difference meter rise as fast as when nobody crosses?',
    steps: [
      { text: 'Every 3 generations, use "Carry 4 across" (alternate the direction). Do this for 30 generations and watch the meter.', done: 'carries5' },
      { text: 'Compare with investigation 3 (no carrying), or Set up again and run without carrying.', done: null },
    ],
    explain: 'How does gene flow keep populations as one species? What does isolation allow to happen?',
  },
];

export const MODEL_LIMITS = [
  'Hidden changes are squeezed into a few generations here. In real life they spread by chance over thousands of generations.',
  'Rabbits do not choose their mates.',
  'The hidden changes never help or harm a rabbit on their own; they only matter when two lineages breed.',
  'Carried groups count for more than their numbers would in real life.',
];
