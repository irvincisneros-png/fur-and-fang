# Fur & Fang

A natural-selection simulator for NSW Stage 5 science. Rabbits, three genes (fur, ears, teeth), snow, heat, foxes and tough food. Three ways in: **Explore** (teacher sandbox), **Survive 15:00** (student ranger challenge) and a 3 to 4 minute **Tutorial** (also offered once, the first time Survive is opened). Spec: `docs/SPEC.md`.

```bash
python3 devserver.py 8500   # then open http://localhost:8500
npm test                    # node --test, includes the 90-generation balance runs
```

Camera (free view): WASD / arrow keys move, Q and E turn, scroll zooms, left-drag orbits, right-drag pans. Touch: one finger moves, two fingers turn and zoom. Keys are ignored while typing in a field, and any move key lets go of a followed rabbit.

Query flags: `?mode=explore|survive|tutorial&seed=ABC123` skips the title; `?view=2d` forces the simple 2D view (also the automatic fallback if `src/render/world.js` fails to load); `?quality=auto|low|high|ultra` (default `auto`: starts on high and steps down if the frame rate stays under 40).

- `src/sim/` pure logic (no DOM): params, rng, genetics, sim, challenge, history, valley (stream, burrows and fords, shared with the renderer), tutorial (the scripted practice valley: scenes, forecast, top-ups; separate from `createSurvive`, so Survive balance is untouched).
- `src/ui/` DOM and canvas graphs, 2D fallback view. `src/content/prompts.json` holds the six predict-observe-explain prompts; `src/content/tutorial.js` holds the tutorial steps (words and targets), run by `src/ui/tutorial.js`.
- `src/render/` the 3D world (separate owner).

## Islands update (speciation)

Spec: `docs/specs/2026-11-13-islands.md`. Two new title-screen modes:

- **Islands** (`?mode=islands`): a lab with six predict-observe-explain investigations. Flood the river or the side channel to split the valley into West, East and an islet, give each land its own climate, test-cross the populations, reopen the crossing and watch hybrid kits (born alive? able to breed?), storm castaways onto the islet (founder effect) and run 20 quick islands to see drift. CSV by land.
- **Two Lineages 10:00** (`?mode=lineages`): a flood splits the warren, one bank freezes while the other bakes, the student keeps both lineages alive, predicts at 7:30 whether they are still one species, then the reunion gives the answer.

Code: `src/sim/islands.js` (`IslandSim` subclasses `Simulation`; classic modes are untouched, enforced by `tests/golden.test.mjs`), `src/sim/lineages.js`, `src/ui/islands.js`, `src/ui/lineages.js`, `src/content/islands.js`. Land membership changes only at generation boundaries, so runs replay identically at any frame rate.

Two Lineages balance (spec 11.3, tuned 2026-11-14): over 40 seeds a student who does nothing keeps both lineages alive in 15 % of runs, a forecast-reading player in 88 %, the single-tool spammers in 13-38 % and a panicky spender in 33 %; 40 fresh seeds give 20 % / 98 % / 15-48 % / 35 %. Starvation boom-and-bust was damped (litter size follows food per head) and each bank's hard spell now kills the mismatched phenotype, so timing fences, brush and clover from the forecast is what saves a bank. Only `IslandSim` runs with `islands.lin` (Two Lineages) use these rules; classic modes and the Islands lab are unchanged. `npm test` checks the targets on 12 seeds with wide slack; `npm run balance` runs 40 + 40 fresh seeds.
