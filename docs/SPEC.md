# Fur & Fang — spec v1 (2026-11-13)

A 3D natural-selection simulator for NSW Stage 5 science (evolution by natural selection), inspired by the
*mechanics* of the PhET "Natural Selection" sim (bunnies, 3 genes, selection agents, generations, graphs).
It must NOT copy PhET's name, art, UI layout or look. Original name, original authored 3D art, original UI.

Two modes from the title screen:
1. **Explore** — teacher-led sandbox (PhET-like control, plus our improvements).
2. **Survive 15:00** — student challenge: keep the warren alive for 15 real minutes while the valley changes.

## Science model

### Organism
Rabbits ("kits" when young). Diploid, sexual. Three unlinked genes, two alleles each:

| Gene | Alleles | Phenotype effect | Pressure it answers | Trade-off (cost) |
|---|---|---|---|---|
| Fur colour | **B** brown / **b** white | Camouflage vs ground (grass/dirt vs snow) | Predators | White is conspicuous on grass; brown on snow |
| Ear length | **E** short / **e** long | Long ears radiate heat + hear predators earlier (Allen's rule) | Heat, predators | Long ears lose heat in cold → cold stress |
| Teeth | **T** long / **t** short | Long teeth chew tough, woody food | Tough food | Long teeth cost energy: small starvation penalty when food is limited and soft |

Dominance: in Explore the teacher picks which allele is dominant per gene (default: original allele dominant,
mutant recessive — like PhET). In Survive, fixed: **B** > b, **E** > e, **T** > t. The starting warren is
BB EE tt, so mutant white fur (b) and long ears (e) are **recessive**, while mutant long teeth (T) is **dominant**.
This contrast (dominant mutation spreads visibly fast; recessive hides in carriers) is a core teaching point.

Starting population: 2 rabbits (Explore, like PhET) or 12 (Survive), all BB EE tt unless gene flow brings variety.

### Mutation (key improvement over PhET)
PhET lets you click "add mutation" which reads as *organisms/players choose what they need* — a classic
misconception. We do:
- **Random mutation ON by default**: each new gamete has a small chance per gene to flip allele
  (Explore: slider 0–5 % ; Survive: fixed 0.6 %). Mutations arise regardless of need. A toast + a sparkle on
  the kit announces "Random mutation: kit #214 carries a new allele *b* (white fur)".
- Explore also has the PhET-style "Add mutation next generation" button per gene, labelled
  **"Teacher: plant a mutation"** with a one-line note that real mutations are random.

### Environment (continuous, not binary)
- `snow` 0–1 (ground cover; drives camouflage). Shader blends grass→snow.
- `temp` −1 (cold) … +1 (hot). Drives cold/heat stress with ear length.
- `food` amount (carrying capacity, rabbits supported) and `tough` 0–1 (share of woody food).
- `predators`: count of foxes/wolves (Explore toggle + count; Survive scheduled).
Explore has sliders for all of these plus quick presets ("Snowy alpine", "Hot dry plain", "Lush meadow").

### Generation loop
One generation = 10 s real time at 1× (Explore speed 0.5×/1×/2×/4×; Survive fixed 1×; pause freezes
everything, and the 15:00 is sim time, so pausing never costs the player). Within a generation, deaths are spread over time so the 3D world shows
them (a fox chases and catches a rabbit; a rabbit shivers and lies down; one thins and fades).

At each generation boundary:
1. Age everyone +1. Age ≥ 5 → dies of old age.
2. Pair adults (age ≥ 1) randomly; each pair has 4 kits (Survive: 2–4 depending on food per head).
   Genotype by Mendelian inheritance, each gamete subject to mutation.
3. Population hard cap 600 (performance). If food is limiting, starvation handles it before the cap.

During a generation, each rabbit has per-generation death probabilities (apply as hazards over the 10 s):
- **Predation** p = predatorPressure × camo(fur, snow) × ears(long → ×0.75).
  camo: brown on grass 0.35, white on grass 1.0, white on snow 0.35, brown on snow 1.0 (interpolate by snow).
  predatorPressure scales with predators per rabbit (saturates; few rabbits + many foxes = brutal).
- **Cold stress** if temp < 0: long ears p = 0.5×|temp|, short 0.08×|temp|.
- **Heat stress** if temp > 0: short ears p = 0.45×temp, long 0.08×temp.
- **Starvation**: demand vs `food`. Tough food: short-teeth rabbits get (1 − 0.8×tough) of a ration.
  Long teeth cost +15 % demand. Shortfall distributed as death probability, lowest intake first.
Tune numbers so Explore feels like PhET (selection visible within ~5–10 generations) and Survive is winnable
but loses ~half of naive players. Put all constants in one `src/sim/params.js`.

Every death records a **cause** (`predator | cold | heat | starved | old`) and generation. This drives the
**cause-of-death panel** — a big improvement: students see *why* selection happened.

Seeded RNG (mulberry32) everywhere; a seed code shown in the corner so a teacher can replay the same run.

## Survive 15:00 (challenge)

You are the valley's **ranger**. You cannot choose mutations. You manage habitat and **gene flow**.
The warren must still have ≥ 2 rabbits at 15:00 sim time (90 generations). Lose if it hits 0
("extinct at 9:42, generation 58") — show the run report either way.

### Scheduled valley events (same every run per seed, with jitter)
Forecast strip at the top shows the next event **2 generations (20 s) ahead** with an icon and plain words
("Cold front: snow arriving in 20 s").
1. 0:00–2:00 Lush spring meadow, warm, no predators (grow!).
2. ~2:00 Foxes arrive (introduced predator) — 2 foxes, rising to 4.
3. ~4:00 Long winter: snow → 0.9, temp → −0.8 over 1 min, holds 2 min. Needs white fur + short ears.
4. ~7:00 Thaw (snow drops fast) — white rabbits suddenly exposed: reversal lesson.
5. ~8:30 Drought + heatwave: temp → +0.8, food halves, food turns woody (tough 0.8). Needs long ears + long teeth.
6. ~11:00 Second winter, harsher, with predators peaking.
7. ~13:30 Mixed finale: patchy snow 0.5, mild cold, high predators.

### Ranger actions (budget: "trust" points, +1 per generation survived, +bonus for high diversity)
- **Translocate** (cost 6): bring 2 adult rabbits from a neighbouring population. Three sources, each with a
  shown allele card: *Alpine ridge* (mostly b, E, t), *Desert flats* (mostly B, e, T), *River forest*
  (mixed, high diversity). This is gene flow — new alleles enter. Max once per 3 generations.
- **Plant clover patch** (cost 4): +food for 4 generations, at a spot you click on the terrain.
- **Brush shelter** (cost 5): a hedge pile you place; rabbits near it get −30 % predation for 5 generations.
- **Fox fence** (cost 8): halves predators for 3 generations. Cooldown 10 generations.
The actions must never make survival trivial; core lesson is "variation must already exist before the
pressure arrives" — the forecast + translocation is how a smart player gets variation in time.

### Scoring (stars at end)
⭐ survived · ⭐ population ≥ 40 at the end · ⭐ all six alleles still present at the end (diversity).
Run report: allele-frequency line chart over the whole run with event bands shaded, cause-of-death stacked
bars per event, 3 auto-generated "what happened" sentences (e.g. "During the long winter, white fur rose from
4 % to 71 %: brown rabbits were 2.8× more likely to be caught on snow."), and 3 reflection questions
(typed answers, kept locally, printable/copy button).

## Tutorial (added 2026-11-13)
Third title card, about 3 to 4 minutes, also offered once on the first Survive launch. A scripted practice valley
(`src/sim/tutorial.js`: 24 mixed BB / Bb / bb founders, scenes `meadow | hunt | calm | front`, no time limit, topped up so it cannot die out,
no cooldowns, trust granted by the script). Steps live in `src/content/tutorial.js`; each has a goal the student must do before Next unlocks:
move the camera, open a rabbit card, watch foxes catch 10 rabbits on snow, open the Cause of death graph, find a Bb carrier in genotype
view, translocate, prepare for a forecast cold front, then start Survive. Back and Skip on every step.

## Explore mode extras (improvements over PhET)
- **Genotype view toggle**: labels/colour rings show BB / Bb / bb; carriers highlighted (PhET mostly hides
  heterozygotes in the main view).
- **Graphs panel** (tabs): Population (total + per phenotype lines), Allele frequency (%), Proportions
  (start-of-generation vs now bars), Cause of death (stacked per generation). Canvas 2D, smooth, labelled
  axes, hover readouts.
- **Pedigree**: click a rabbit → card with id, age, genotype, phenotype, parents and grandparents tree.
- **Predict–Observe–Explain prompts**: optional side card ("Predict: what happens to white fur if the snow
  melts? Run 5 generations, then explain.") — 6 prompts in a JSON file.
- **CSV export** of per-generation data. Seed code.
- **Bottleneck button** (randomly removes 90 %) to show genetic drift.

## Visual direction (must look polished — owner rejects primitive/toy looks and AI-image sprites)
Follow TideLine's pipeline and look (see `../tideline/docs/ART-BIBLE.md` style, `../tideline/tools/blender/`):
Blender-scripted chunky rounded models exported as GLB to `assets/models/`, painted matte materials
(lighter tops, darker undersides, gentle mottling), thin dark outlines on high tier, warm sun, cool tinted
shadows, soft sky gradient with puffy clouds, fog to a colour.
- **Valley**: a bowl-shaped meadow diorama (~120×120 m) with a stream, rocks, a few trees/shrubs, grass
  tufts (instanced), burrow mounds. Ground shader blends lush grass → dry gold → snow from `snow`,
  `temp`, `food`. Falling snow particles in winter, heat shimmer/dry tint in drought.
- **Rabbit**: Blender model with separate ear/teeth variants (or morphs) and fur colour via instance colour;
  kits smaller. Hop animation (procedural arc + squash/stretch + ear flop), idle nibble, flee sprint.
  Instanced so 600 rabbits hold 60 fps on a mid laptop.
- **Fox** (Survive) / **wolf** (Explore toggle may use fox too — keep one predator model: a red fox):
  trot/chase cycle, catches with a pounce; the rabbit is removed with a small dust puff (no gore).
- Death cues: cold = curl up + frost then fade; starved = thin + fade; old age = lie down, fade.
- Camera: free view (WASD / arrows pan relative to facing with eased speed scaled by zoom, Q E rotate, scroll zoom, drag orbit;
  touch: one finger pans, two fingers rotate and zoom; target clamped inside the valley), click-to-follow a rabbit (any move key lets go). Quality tiers low/high/ultra (auto by
  fps; low drops shadows + outlines). Must work at 375 px wide.

## UI
Original UI (not PhET's): warm paper-and-ink field-journal theme. Fonts: Bubblegum Sans (titles) + Mulish
(body), from Google Fonts. Top: clock (Survive countdown/elapsed, generation), forecast strip. Left: mode
controls. Right/bottom drawer: graphs. Big readable numbers for projector use. Keyboard: Space pause.

## Tech
- Vanilla ES modules, vendored three r170 at `vendor/three` (import map like TideLine). No build step.
- `devserver.py 8500`. GitHub Pages ready (relative paths, `.nojekyll`).
- `src/sim/` is pure logic with **no DOM / three imports**, unit-tested with `node --test` (`npm test`).
- `src/render/` three.js world reads sim state each frame. `src/ui/` DOM + canvas graphs.

### Sim ↔ render contract
`sim.rabbits` array of `{id, genotype:{fur:'Bb',ears:'EE',teeth:'tt'}, pheno:{white,longEars,longTeeth},
age, alive, x, z, state:'idle'|'hop'|'flee'|'dying', dyingCause, parents:[id,id], born}` ;
`sim.predators` `{id,x,z,targetId,state}` ; `sim.env {snow,temp,food,tough,predators}` ;
`sim.events` queue `{type:'birth'|'death'|'mutation'|'catch'|'gen', ...}` drained by render/UI each frame.
Sim owns positions (simple steering: wander near burrows, flee from predators, gather at clover).
