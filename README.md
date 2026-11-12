# Fur & Fang

A natural-selection simulator for NSW Stage 5 science. Rabbits, three genes (fur, ears, teeth), snow, heat, foxes and tough food. Two modes: **Explore** (teacher sandbox) and **Survive 15:00** (student ranger challenge). Spec: `docs/SPEC.md`.

```bash
python3 devserver.py 8500   # then open http://localhost:8500
npm test                    # node --test, includes the 90-generation balance runs
```

Query flags: `?mode=explore|survive&seed=ABC123` skips the title; `?view=2d` forces the simple 2D view (also the automatic fallback if `src/render/world.js` fails to load); `?quality=auto|low|high|ultra` (default `auto`: starts on high and steps down if the frame rate stays under 40).

- `src/sim/` pure logic (no DOM): params, rng, genetics, sim, challenge, history, valley (stream, burrows and fords, shared with the renderer).
- `src/ui/` DOM and canvas graphs, 2D fallback view. `src/content/prompts.json` holds the six predict-observe-explain prompts.
- `src/render/` the 3D world (separate owner).
