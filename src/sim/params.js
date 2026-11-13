// Every tunable constant lives here.
export const P = {
  GEN_LEN: 10,            // seconds per generation at 1x
  MAX_AGE: 5,             // age >= 5 dies of old age
  CAP: 600,               // hard population cap (performance)
  HALF: 60,               // valley is x,z in [-60,60]
  ROAM: 50,               // rabbits stay inside this radius
  MAX_SUBSTEP: 0.25,

  // Reproduction
  KITS_EXPLORE: 4,
  KITS_MIN: 2, KITS_MAX: 4,

  // Predation: p = pressure * camo * ears
  PRED_KILLS: 10,          // kills per predator per generation (low rabbit numbers)
  PRED_MAX: 0.9,
  EARS_PRED: 0.75,        // long ears hear foxes early
  CAMO: { brownGrass: 0.35, whiteGrass: 1.0, whiteSnow: 0.35, brownSnow: 1.0 },
  SHELTER_REDUCTION: 0.3,

  // Climate
  COLD_LONG: 0.5, COLD_SHORT: 0.08,
  HEAT_SHORT: 0.45, HEAT_LONG: 0.08,

  // Food
  TOUGH_PENALTY: 0.8,     // short teeth eat (1 - 0.8*tough) of a ration
  TEETH_COST: 0.15,       // long teeth demand +15 %
  STARVE_K: 1.0,
  CLOVER_FOOD: 14,
  CLOVER_GENS: 4, SHELTER_GENS: 5, CLOVER_RADIUS: 8, SHELTER_RADIUS: 12,

  // Mutation
  MUT_SURVIVE: 0.0005,
  MUT_EXPLORE: 0.003,

  // Movement (cosmetic; the sim owns positions)
  HOP_SPEED: 2.2, ARRIVE_SPEED: 4.2, FLEE_SPEED: 6, FLEE_R_SHORT: 11, FLEE_R_LONG: 16,
  PRED_SPEED: 7, PRED_MAX_SPEED: 30, CHASE_LEAD: 2.2,

  // Survive 15:00
  SURVIVE_SECONDS: 900,
  SURVIVE_START_POP: 12,
  EXPLORE_START_POP: 2,
  FOOD_BASE: 70,
  TRUST_START: 12,
  TRUST_PER_GEN: 1.5,
  TRUST_DIVERSITY: 0.5,
  COST: { translocate: 8, clover: 4, shelter: 5, fence: 8 },
  COOLDOWN_GENS: { translocate: 4, fence: 10 },
  FENCE_GENS: 3,
  TRANSLOCATE_COUNT: 8,         // adults per translocation (a group big enough to shift a 150-strong warren)
  FORECAST_LEAD: 20,
  TUTORIAL: { translocateCost: 6, translocateCount: 2 },   // the guided tutorial brings a pair, at once, for 6 trust
  // Allele cards: chance each allele is the mutant one in a source population
  SOURCES: {
    alpine: { name: 'Alpine ridge', blurb: 'Cold, snowy ridge. Mostly white fur and short ears.', freq: { b: 0.88, e: 0.08, T: 0.1 } },
    desert: { name: 'Desert flats', blurb: 'Hot, dry plains. Mostly brown fur, long ears, long teeth.', freq: { b: 0.06, e: 0.9, T: 0.9 } },
    river: { name: 'River forest', blurb: 'Mixed and varied. A bit of everything.', freq: { b: 0.1, e: 0.1, T: 0.1 } },
  },
};
