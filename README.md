# Star Temple

A research gallery of WebGPU space effects: starfields that never shimmer, the visitor's real night sky, nebulae, galaxies, black holes, planets and moons, the Sun up close, comets, meteors and warp. Each effect is built from its physics, and comes with a live demo, readable source, a write-up and a practicality scorecard. It is judged the way the temples judge theirs: **would you actually ship this on a website?**

Stars are points, and drawing a point right is this family's first problem: a star smaller than a pixel must keep its light as it moves, or the field crawls. Star spots are drawn by Moon Temple's energy-conserving point layer, with colour from the blackbody fit.

Safety comes from The Hero's Journey's checks. Every effect has an intensity control from 0 to 1, calm by default. Every effect and preset runs in `npm test` through the WCAG 2.3.1 flash and red-flash analyser, a regular-pattern analyser after the broadcast guidance, and caps on whole-field rotation, zoom and drift, at the default and at the strong end (0.7). In space the hazard is motion: anything that flies, warps or zooms is gated, and starts only on a click. See [docs/safety.md](docs/safety.md).

It is built on Fire Temple's page structure and the shared temple core (`@mk7s/hologpu-temple-core`), from Snow Temple's copy of the shell. The accent is hydrogen-alpha red. See [plan.md](./plan.md) for the roadmap.

## Getting started

```sh
npm install
npm run dev        # http://localhost:5500
npm test           # unit tests, plus the flash, pattern and motion checks and the held-frame audit over every effect
npm run build      # registry, typecheck, static build to dist/ and the bundle check
npm run study -- --epic 1   # cost study on Dawn: docs/studies/epic-1.md and the Scorecard numbers
npm run shot -- hello --times 2 --bg dark   # render an effect headlessly to PNG (output/shots)
npm run browser-check -- --report docs/studies/browser-check.md   # every effect in headless Chrome (dev server running)
npm run posters -- --force   # fallback posters from held frames, as WebP
npm run deploy     # build and upload dist/ to Cloudflare Pages (project startemple)
```

`?effect=<id>` opens an effect, `&hud=1` the performance HUD, and `&p.<param>=<value>` sets a parameter, `&p.dose=0.6` (intensity) included.

## Effects

| Id           | What                                                                                                             | Tier |
| ------------ | ---------------------------------------------------------------------------------------------------------------- | ---- |
| `hello`      | The smallest effect: a few hundred stars drifting slowly, each a naive fixed disc, one instanced draw            | A    |
| `star-splat` | The star spot laid out: colour by temperature, light by magnitude, Hubble and JWST spikes, over a drifting field | A    |
| `deep-field` | A starfield that never shimmers: four parallax layers from the sky's statistics over a baked emission nebula     | A    |

## Layout

```
src/gpu/stars/              star statistics and colour (magnitudes, temperatures, Planck), and the star spot: a Gaussian
                            integrated over each pixel, which keeps its light and its look wherever it sits
src/gpu/points.ts, points/  Moon Temple's energy-conserving point layer: a point keeps its light at any size and position
src/gpu/optics/             aperture shapes and their areas, for the point layer
src/gpu/glare/              analytic diffraction spikes, each carrying its share of the light
src/gpu/emission/           the blackbody fit and its lookup table (Fire Temple's), for star colours
src/gpu/safety/             dose, the pattern analyser, motion estimate, colour caps and the start gate's rules
src/gpu/colour/             OKLab and OKLCH, palettes, Display P3
src/effects/<id>/           meta.ts, index.ts, shaders, notes.md, poster.webp
docs/studies/               cost studies, the shimmer study, quads against a compute splat, a starfield five ways
experiments/                the studies' drivers (shimmer, splat-cost, star-compare, support-probe)
```

## License

MIT.
