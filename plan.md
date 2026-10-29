# Star Temple — WebGPU space research site

A research site that implements, measures and documents space effects: starfields, the real night sky, nebulae, galaxies, black holes, planets and moons, the Sun up close, comets and meteors, and motion through space. It asks one question of each: **would you actually ship this on a website?** Every effect gets a live demo, readable source, a write-up and a practicality scorecard. A sibling of [Fire Temple](../firetemple/plan.md), [Water Temple](../watertemple/plan.md), [Storm Temple](../stormtemple/plan.md), [Moon Temple](../moontemple/plan.md), [The Hero's Journey](../herosjourney/plan.md) and [Snow Temple](../snowtemple/plan.md), on the same page structure and the shared temple core. It is §3 of the holofx [research list](../research.md), which named it.

Most space effects on the web are a few hundred white dots and a purple gradient. What separates this family from them is that almost everything in the sky is well understood, and much of it is cheap to compute:

- **Stars.** They are points, and drawing a point right is the hard part. A star smaller than a pixel must keep its light as it moves between pixels, or the field crawls and shimmers. Its colour is its temperature, and its brightness follows a magnitude distribution: a great many faint stars and very few bright ones.
- **The real sky.** It is a catalogue, the time and the observer's latitude. About 9,000 stars are bright enough to see by eye, small enough to ship.
- **Nebulae.** They glow in a few emission lines (hydrogen-alpha red, oxygen teal, sulphur deep red) and are crossed by dust that absorbs. That is an emission–absorption ray march, which Fire Temple already does for flames.
- **Galaxies.** Spiral arms are a density wave: stars on ellipses that turn a little more with each step outwards crowd into arms, and the arms hold while every star keeps moving.
- **Black holes.** Light follows the Schwarzschild metric. There is a short Cartesian form of the ray step, and an accretion disc's look is its temperature, Doppler beaming and redshift.
- **Planets.** An atmosphere is Rayleigh and Mie scattering. An ocean has a sun glint, a gas giant's bands are flow along latitude, and rings cast and receive shadows.
- **Motion.** At near-light speed, relativistic aberration bunches the stars ahead and Doppler shift colours them. The physics looks better than the usual tunnel.

Each effect starts from its mechanism, and the look follows.

## Goals

- Cover the main kinds of space visual, each from its mechanism:
  - **stars:** a starfield that never shimmers, real colours and brightness, diffraction spikes, star trails, and the visitor's own sky from a catalogue;
  - **nebulae and galaxies:** flat and ray-marched nebulae in their emission lines, a density-wave spiral galaxy, colliding galaxies, and data drawn as a galaxy;
  - **gravity:** a lens that bends the page around the pointer, and a black hole traced through its metric with a Doppler-beamed disc;
  - **worlds:** a planet with terrain, ocean glint, clouds, atmosphere and night lights; a gas giant with storms and shadowed rings; moon phases;
  - **the Sun:** granulation, sunspots, limb darkening, prominences, the corona and a total eclipse;
  - **small bodies and motion:** a comet with two tails, a meteor shower from its radiant, warp with aberration and Doppler colour, and a solar system from Keplerian elements.
- Make point sources a first-class subject. A starfield that shimmers as it pans is the most common failure in web space effects, and the family's base building block exists to fix it, measured.
- Ship effects shaped like website parts: a hero nebula with parallax stars, the pointer as a small black hole, "the sky above you tonight", moon phases as a progress bar or loader, a planet that turns from day to night as the page scrolls, a warp jump between routes, a galaxy of data points, an eclipse or comet as a launch countdown.
- Say plainly when CSS does the job. A few hundred `box-shadow` stars drifting together is the classic CSS starfield, and it is the baseline to beat.
- Keep motion safe. Flashing is rare in space; motion is the hazard. Forward flight, warp and zooming starfields are what WCAG 2.3.3 warns about, and Snow Temple measured that approaching snow at walking pace is already seven times the zoom cap. Every effect runs through The Hero's Journey's flash, pattern and motion checks, and none that flies starts without a user action.
- Build the reusable parts once, shaped to move into `@mk7s/hologpu-temple-core`: the star spot (blackbody colour, magnitude, spikes) on Moon Temple's point layer, the sky model (sidereal time, catalogue projection), the emission-line nebula march, the density-wave galaxy, the geodesic step and the planet atmosphere, which Light Temple's sky story should share.

## Non-goals

- **A planetarium.** `real-sky` puts the bright stars where they are for the visitor's time and place. It ignores precession, nutation, aberration of starlight and refraction, which move a star by less than its spot at page scale. No deep-sky catalogue; the planets are among the stars (7.6).
- **Physically exact simulation.** The galaxy is a density-wave picture, not a self-gravitating disc; the Sun's granulation is cells, not magnetohydrodynamics. The notes cite the physics and claim no accuracy beyond what the effect shows.
- **A spinning (Kerr) black hole.** It is a research spike (4.6), not a story. The Schwarzschild hole is what pages need.
- **Photographs of space.** Everything is procedural or from a public catalogue. NASA imagery is mostly public domain and ESA and ESO's is CC BY, but an effect built on an image is a picture, not an effect. Catalogues are checked for licence when used (2.6).
- **Effects over live page pixels.** A canvas cannot read the page (Fire Temple's [backdrop strategy](../firetemple/docs/backdrop-strategy.md)). The lens cursor bends content the effect draws, or an image the page hands over.
- **Sound.** In space, none.

## Decisions

These are defaults chosen so work can start. Each is cheap to revisit before Epic 1 is finished.

| Decision         | Default                                                                                                                                                                    | Why                                                                                                                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundation       | Snow Temple's shell (from The Hero's Journey, via Moon Temple, Storm Temple, The Bazaar and Fire Temple) on `@mk7s/hologpu-temple-core`, from its commit 52c321d           | It is the newest copy. It has the flash, pattern and motion checks, the start gate, held frames, OKLab colour, palettes, the wide-gamut path, the study harness, the browser check and posters.                        |
| Build tooling    | Vite + TypeScript (strict), with WGSL `#include` resolved per effect at build time                                                                                         | Same as every temple, so shader text never reaches the first load.                                                                                                                                                     |
| Rendering API    | Raw WebGPU + WGSL, thin helpers                                                                                                                                            | The research subject is WebGPU itself.                                                                                                                                                                                 |
| Colour pipeline  | Linear HDR `rgba16float` scene → bloom → tonemap → sRGB, OKLab for colour operations                                                                                       | Stars are points thousands of times brighter than the sky beside them. Only the HDR tail keeps a bright star a light and not a white dot.                                                                              |
| Point sources    | Moon Temple's energy-conserving point layer (`src/gpu/points.ts`, its story 2.3) with its analytic glare spikes (2.6), ported in 1.7                                       | It conserves each point's light within 2% at any size and sub-pixel position. That is exactly the starfield's problem.                                                                                                 |
| Star colour      | The blackbody fit in the temple core's source (`blackbody.wgsl`, from Fire Temple), copied in until a published core carries it                                            | A star's colour is its temperature. The published core 0.1.1 does not have it yet.                                                                                                                                     |
| Intensity        | Hero's Journey's shared `dose` control, labelled "intensity" in the controls: drift and flight speed, twinkle, flare and meteor rate together. Default 0.35                | One control a page can turn down, and the analysers' contract already holds up to its strong end. The key stays `dose` so the contract matches across families until it moves into the core.                           |
| Safety checks    | Flash, red-flash, pattern and motion checks over every effect and preset, at the default and at the strong dose, in `npm test`. Flight and warp gated behind a user action | Motion is this family's hazard. Snow Temple found the optical-flow check cannot see sparse, faint points, so flight is also held to the cap by the effect's own transform.                                             |
| Precision        | Camera-relative positions, a floating origin and reversed depth wherever a scene spans more than a planet                                                                  | 32-bit floats cannot hold a solar system at metre precision.                                                                                                                                                           |
| Accent           | Hydrogen-alpha red (`#ff6b81` dark, `#b3203f` light). Tier colours checked against it in story 1.1                                                                         | No colour was named. H-alpha is the colour of the emission nebulae, and red is the one hue no other family uses (Fire is orange, The Hero's Journey magenta, The Eightfold Path amber). Revisit if the user names one. |
| Neutrals         | Near-black with a little violet in the dark theme; a light theme kept, with space shown on it as a card                                                                    | Space is dark by nature. On a light page it works as a contained card or panel, not a full background.                                                                                                                 |
| CSS prefix, port | `sr-`, dev port 5500, launch config `startemple`                                                                                                                           | `st-` is Storm Temple's. 5373, 5390, 5410 to 5490, 5441 and 5471 are taken by the other holofx projects.                                                                                                               |
| Hosting          | Cloudflare Pages (classic) project `startemple`, direct upload                                                                                                             | No server needed. Create the project with `wrangler pages project create --force`, or wrangler converts the repo to Workers.                                                                                           |
| No-WebGPU        | A poster per effect, and a CSS version where one is honest (story 9.4)                                                                                                     | `box-shadow` stars are a real fallback for a starfield, and useless for the rest.                                                                                                                                      |

## Carried over from the other temples

These findings shape this plan, so they need not be rediscovered.

- **Energy-conserving points** (Moon Temple 2.3). Below about three pixels, each pixel's share of a point is the exact area of the pixel inside its disc, from a closed form; above that, the shape with a one-pixel edge, divided by its area plus Steiner's edge term. Total light stays within 2% from a sub-pixel point to a 64 px disc, at any offset. A multiplied clip squared the edge ramp once and lost 0.33/r of the light; intersections take the minimum of two coverages.
- **Analytic diffraction spikes** (Moon Temple 2.6). N rays for an even blade count and 2N for odd, each a Gaussian cross-section with an exponential fall, whose integral is known, so each spike carries its share. One thin quad per ray: one square per light cost 4.78 ms at 1080p, the quads 0.52.
- **Twinkle is flicker** (Fire Temple `flicker.wgsl`, Moon Temple 2.9). A band-limited signal with capped rate and depth cannot pass three flashes a second, however it is seeded. Stars twinkle only near a horizon, and then through this.
- **Regular things hide in generated scenes** (Snow Temple). Stars placed at grid-cell centres read as a pattern to the analyser. Stars are jittered across their cells, or placed by a low-discrepancy sequence that is not a lattice.
- **Sparse, faint points defeat the motion check** (Snow Temple 2.4). Block matching needs texture. A faint field leaves a dozen trackable blocks and invents zooms. The estimator now needs 20 blocks as evidence, and flight is checked from the effect's own transform: v / (z ln 2) zoom doublings a second, capped at 0.1.
- **Approach is vection** (Snow Temple 2.4). Flakes 3 m away approached at walking pace expand at 0.67 doublings a second, nearly seven times the cap. Warp and forward flight start far over it, so they are gated presets or user-triggered transitions, never ambient decoration.
- **Parallax breaks up whole-field drift** (Snow Temple 2.1). One layer moving one way is a whole-field drift; layers at many depths move at many speeds and read a fifth to a third of it.
- **A held frame is a calm moment** (Storm Temple 6.2). Never a meteor at its brightest or a flare at its peak.
- **A tonemap widens a luminance step** (The Hero's Journey M1). An effect that limits its step for the pattern rule draws without the tonemap.
- **A scene that does not change is drawn once** (Snow Temple 4.2). A still nebula or galaxy background is cached at its size and only what moves is drawn each frame.
- **The volume ray-march kernel** (Fire Temple `src/gpu/volume/`, `volume.wgsl`). Low-resolution emission–absorption marching with blue-noise jitter and temporal reprojection. It is most of a nebula renderer.
- **Half-float writes truncate on Apple GPUs** (Fire Temple 5.6). Long-exposure star trails accumulate small amounts per frame, so they accumulate in `r32float` or are computed in closed form.
- **Uniforms written between passes in one command buffer all arrive with the last value** (Moon Temple). Multi-step simulations encoded before one submit keep per-step values in a buffer.
- **Scratch work needs a home.** Long sweeps and probes go in `experiments/`, outside test, typecheck and lint.

## Findings so far

- **Bloom is most of a starfield's cost in Chrome.** `hello` read 2.20 ms a frame in Chrome with the tail's bloom at 0.3 and 0.36 ms without it, for 400 stars. Stars want a little glow, so 2.1 should give each spot its own halo through the point layer rather than pay for a full-screen bloom.
- **The blackbody fit stops at 12 000 K.** Fire Temple fitted it for flames. A, B and O stars run to 40 000 K, where the colour still moves towards blue, so star colours are worked out from the Planck reference on the CPU, once per star.
- **Conserving a star's light is not enough to stop shimmer.** The light the screen shows goes through a clip or a tonemap and 8-bit sRGB, none of them linear. A narrow spot that keeps its linear light exactly still changes its shown light by tens of per cent with its position once it is bright. A Gaussian integrated over each pixel, σ = 0.8 device pixels or wider, stays under 2.5% at every brightness (2.3).
- **A disc shimmers more than a Gaussian of the same sharpness.** Its hard edge crosses pixel boundaries all at once.
- **The ACES toe hides faint stars.** Light below about 0.01 is crushed almost to black, so a background field needs more light than a showcase of a few bright stars for its sixth-magnitude stars to show.
- **For star spots, quads beat a compute splat; script is the limit.** Blending is the hardware's job, and 49 atomic adds a star contend. Filling positions from script costs more than drawing them past a few thousand stars (2.4).
- **Box-shadow stars cost nothing, and are the right answer for a rigid drift.** 16 to 19 ms a second of main thread at any count up to 25 600 (2.7).
- **Two emission lines summed make grey.** Red hydrogen and teal oxygen at the same brightness add to white, so the teal replaces the red where oxygen is strong.
- **Long star trails are a regular pattern.** Concentric arcs round a pole are rings of light and dark, and past about 28° of arc the pattern analyser reads them as stripes, however few the stars (2.5). Under two hours of sky is the safe exposure; longer is gated.
- **A real sky costs about 55 kB.** The Bright Star Catalogue at 6 bytes a star is 57.8 kB gzipped in the effect, against about 2 kB of code for a procedural field (2.6).
- **Precession is visible at page scale.** 26 years of it moves the stars by 0.36°, more than a star spot in a 100° view at 1080p, so the catalogue is precessed at load.
- **False colour needs its lines weighted.** Hα outshines the other lines many times over, so a Hubble-palette nebula drawn from the gas's own strengths is green; the published images stretch each line to fill its channel, and so must an effect (3.1).
- **A spiral's arms are where the Jacobian is smallest.** Ellipses turned with their size crowd where A sin 2e + B cos 2e is least, not at their major axes' ends; populations born in the arms are placed there (3.5).
- **Absorbers crowd as well as stars.** Dust placed on the arms piles up as the stars do and goes opaque; each smudge must be faint, and its quad cut short, since dust was most of the galaxy's cost (3.5).
- **A volume nebula is Tier B at half resolution.** 6.4 ms full, 2.1 half, 0.9 quarter at 48 steps on the M1 Max (3.4).
- **Spinning discs count as whole-field rotation**, and set the collision's pace (3.6).
- **Twinkling is the air's, and grows with airmass.** Overhead a star barely flickers; a few degrees up it swings by most of its light, faster, and bright ones flash colours (2.8).
- **Behind a lens, a star must be a point in the image, not a spot in the sky.** Drawn a fixed angle wide in the sky, the lens shears each star into an arc, and round a black hole the arcs line up into rings that fail the pattern check. Taken back through the lens's local mapping (screen-space derivatives of the escaped direction) a star stays a point, brightened by its magnification (4.3).
- **A black hole is Tier C even at half resolution.** 2.2 ms on the M1 Max's GPU at half, 6.0 in Chrome. Accumulation buys a little sharpness at the photon ring and nothing past 8 frames (4.4).
- **A solar system needs no floating origin on a page.** Positions in doubles on the CPU, drawn in pixels about the Sun (4.5).

## Overlaps and who owns what

| Nearby work                                                  | Where                    | Star Temple's part                                                                                                                                           |
| ------------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `starfield`: layered parallax stars and nebula               | hologpu                  | The comparison for `deep-field` (2.2): same job, with energy-conserving spots, blackbody colour and a magnitude distribution. `starfield` stays hologpu's.   |
| `constellation`: a generative network                        | hologpu                  | Not rebuilt. Real constellations are 2.6's lines between catalogue stars.                                                                                    |
| `n-body`                                                     | hologpu                  | Reused for colliding galaxies (3.6), with the density-wave discs as initial conditions.                                                                      |
| `aurora-veil`, `aurora`                                      | hologpu, Water Temple    | Not rebuilt. An aurora is a planet's (5.3) seen from orbit, as a thin emissive shell, at most.                                                               |
| `eclipse-halos`                                              | Water Temple             | Stylised. 6.3's eclipse is the Sun's corona, the diamond ring and Baily's beads, from the Moon's limb.                                                       |
| `moon-through-cloud`, `lunar-corona`, `moonbow`, `moon.wgsl` | Moon Temple              | Moon Temple keeps the Moon as a light seen through air. 5.6's moon phase is the Moon as a body: terminator and earthshine. It reuses `moon.wgsl` if it fits. |
| Halos and sun dogs                                           | Snow Temple Epic 7       | Snow Temple's. Not here.                                                                                                                                     |
| Solar surface (11.4) and meteor trail (11.6), unbuilt        | Fire Temple              | Moved here, as research.md says: 6.1 and 7.2. Fire Temple's plan should mark them moved.                                                                     |
| Atmospheric sky (E5-S6), unbuilt                             | Light Temple             | Built once and shared: 5.2's atmosphere is that sky seen from orbit. Whichever family builds it first owns the module.                                       |
| `blackbody.wgsl`, volume kernel                              | Fire Temple, temple core | Used as they are.                                                                                                                                            |
| Point layer, glare, flicker                                  | Moon Temple              | Ported (1.7) and used as the star spot. Moving them into the core is Moon Temple's 7.6 and this family's 9.6.                                                |

## Practicality tiers

Every effect is tagged with a tier. Budgets are starting targets, to be validated in Epic 10.

| Tier            | Meaning                                             | Shape                                                                 | GPU budget @1080p                   |
| --------------- | --------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------- |
| **A** Drop-in   | Safe as ambient decoration, including mobile        | One or two passes, no compute, or a few thousand instances            | ≤ 2 ms on integrated GPU            |
| **B** Feature   | Hero sections and interactive set pieces            | Compute, a reduced-resolution march, or a small simulation            | ≤ 6 ms on integrated GPU            |
| **C** Showpiece | Dedicated page or landing experience, desktop-first | A geodesic trace, a full-resolution volume, a million-star simulation | ≤ 12 ms on discrete / Apple Silicon |

Budgets include the HDR tail. Simulations and accumulations keep state, so every study reports buffer and texture memory beside milliseconds.

## Architecture sketch

```
startemple/
  index.html
  vite.config.ts
  src/
    main.ts            bootstrap: one shared GPU session, mounts an effect
    gpu/               device, canvas, frame loop, shaders, uniforms, targets, passes, post/
                       (bloom, tonemap, colour stage), dom-rects, pointer, scroll, safety/
                       (dose, pattern, motion, colour caps, gate), plus
                       points.ts and points/ (Moon Temple's point layer), glare/ (spikes),
                       optics/ (aperture, flicker), stars/ (star spots: temperature, magnitude,
                       catalogue, sky projection), nebula/ (emission-line march), galaxy/
                       (density wave), gravity/ (thin lens, geodesic step), world/ (cube sphere,
                       atmosphere, rings) and sun/ (granulation, corona)
    wgsl/              shared chunks: hash, noise, sdf, oklab, aperture, flicker, plus blackbody,
                       sky, nebula, geodesic and atmosphere
    effects/<id>/      meta.ts (eager), index.ts + *.wgsl (lazy chunk), notes.md, poster.webp
    shell/             app frame, gallery, effect page, contexts, controls, notes, scorecard, HUD
    lib/               the library entry: mount an effect on a caller's canvas
  tests/               vitest on Dawn's Node bindings: real WebGPU, no browser
                       (flash.ts, pattern.ts and motion.ts run over every effect and preset)
  experiments/         scratch sweeps and probes; not part of the test run
  docs/                research output: support matrix delta, cost studies, findings
```

The effect contract is The Hero's Journey's, unchanged, `dose` included, so effects and shell code move between the families.

## Definition of done (per effect story)

1. **Budget.** It runs inside its tier budget on the reference devices, with the numbers recorded. Until the device matrix exists (10.2), the only reference device is the development machine, an M1 Max. It is measured per frame on Dawn and as one frame in Chrome, and gets the lowest tier whose budget neither number exceeds. An A or B label is provisional until 10.2, and the scorecard says so.
2. **Parameters.** They are exposed through the schema with `dose` honoured, and there are at least two presets.
3. **Lifecycle.** It handles resize, DPR changes, device loss, offscreen pause and `prefers-reduced-motion`. The held frame shows a calm moment, never a meteor or flare at its peak (`tests/still.test.ts`). A star field held still is the same frame at any DPR.
4. **Flash, red flash, pattern and motion.** It stays under all four at its defaults and at the strong dose. Every preset that goes over is declared and starts behind the gate. Anything that flies, warps or zooms is also checked from its own transform, not only by optical flow.
5. **Points.** Where it draws stars or other points, their light is conserved as they move: a test sums a point's light at several sub-pixel offsets and sizes, within 2%.
6. **Contexts.** It is shown in at least one realistic web context, over a dark page and as a card on a light one, and at phone size, and its screenshots have been looked at.
7. **Notes.** `notes.md` is written: how it works and what the physics is, cost, pitfalls, safety, when to use it, and references. Where a CSS version exists, the notes say how close it gets.
8. **Release.** The scorecard is filled in and the fallback poster captured.

## Milestones

| Milestone                   | Scope                                 | Proves                                                                                    |
| --------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------- |
| **M0** Vertical slice       | Epic 1, stories 2.1–2.4, 2.7          | Tooling → stars that never shimmer → a deep field → the spot-size question → CSS baseline |
| **M1** The sky              | Rest of Epic 2                        | Real colours, real brightness, the visitor's real sky, trails and spikes                  |
| **M2** Nebulae and galaxies | Epic 3                                | Emission lines and dust, flat and marched; the density wave; data as a galaxy             |
| **M3** Gravity and orbits   | Epic 4, story 7.6                     | The lens cursor at Tier A, the black hole at B or C, a solar system at any scale          |
| **M4** Worlds and the Sun   | Epics 5 and 6                         | Atmospheres from scattering, gas giants from flow, the Sun from convection                |
| **M5** Motion and the page  | Epic 7, Epic 8, stories 9.1–9.5, 10.2 | Comets, meteors and warp made safe; web-native usefulness on more than one device         |
| **M6** Release              | Rest of Epics 9 and 10                | Published findings, shared pieces moved into the core                                     |

M2 and M4 depend only on Epic 1 and story 2.1, so they can run alongside M1. M3's lens cursor (4.1) depends on nothing in the family.

Story format: `ID Title [tier] (size)`. Sizes: S ≈ a day or less, M ≈ a few days, L ≈ a week or more.

---

## Epic 1 — Foundation and tooling

- [x] **1.1 Scaffold** (S) — Snow Temple's committed tree copied (`git archive`). Its effects, demo pages and snow-only code removed: the snowfall instancing, the pile engine, the growth models, the text field and its font, the fold library and the CSS ridge. The `sn-` prefix renamed `sr-`; watch template literals such as `` `--sn-${string}` ``. Hydrogen-alpha accent, with the tier colours checked against it. Dev port 5500, launch config `startemple`. The `dose` control stays labelled "intensity", its key unchanged.

  _Done from Snow Temple's commit 52c321d. Removed: its nine snow effects, the snowfall demo page, `src/gpu/{snow,pile,growth,text,symmetry}`, the frost and fold chunks, the CSS ridge, the Anton font, its studies and snow experiments, and the tests for all of them. `sn-` is now `sr-`, port 5500, launch config `startemple` (in holofx's `.claude/launch.json`). Hydrogen-alpha accent with near-black, slightly violet neutrals; the tiers stay green, violet and amber, and `tests/contrast.test.ts` passes. The gallery, tagline and package description are about space. Kept: the HDR tail, safety checks and gate, palettes and wide gamut, the stroke renderer, DOM rects, the study harness, browser check and posters._

- [x] **1.2 `hello`** [A] (S) — the smallest effect: a few hundred stars drifting slowly across a dark field in one instanced pass into the HDR tail, with `dose` wired from the start. Deliberately naive: each star a small fixed disc, so 2.3 has a shimmering baseline to measure.

  _`hello`: 900 instanced quads, 400 shown at the default, a pure function of index and time over a near-black sky. Brightness is the cube of a uniform draw, colour a crude warm-to-blue mix (2.1 brings the blackbody fit and magnitudes). 0.20 ms a frame on Dawn ([docs/studies/epic-1.md](docs/studies/epic-1.md)), 0.36 ms in Chrome (`npm run browser-check`, all eight views): Tier A. With the tail's bloom on at 0.3 Chrome read 2.20 ms, over the Tier A budget, so `hello` draws without bloom. Flash, pattern, motion and held-frame checks pass._

- [x] **1.3 Repository and CI** (S) — its own git repository and public GitHub remote, and the CI workflow on software Vulkan (lint, format, typecheck, tests, build), green once.

  _Public repository [`s4njee/startemple`](https://github.com/s4njee/startemple); CI green on its first run, on 3a95c60._

- [x] **1.4 Deploy** (S) — Cloudflare Pages project `startemple` (classic, created with `--force`), and an `npm run deploy` that builds, checks the bundle and uploads `dist`.

  _Live at <https://startemple.pages.dev>, deployed from 3a95c60._

- [ ] **1.5 Posters, catalogue and the holofx site** (S) — posters from held frames, `catalogue.json`, and Star Temple in the holofx site's dropdown, lab and effect pages.

  _Posters (`hello`'s is 8.3 kB) and `catalogue.json` done. Still to do: the holofx site._

- [x] **1.6 Support matrix delta** (S) — what this family leans on beyond Fire Temple's [support matrix](../firetemple/docs/support-matrix.md):
  - instance counts past 100 000 quads, and where a compute splat into a buffer overtakes them (2.4);
  - `float32-filterable` and `r32float` storage, for accumulated trails;
  - storage atomics, for splatting many stars into one pixel;
  - f32 precision limits in a solar-system scene, and what the floating origin buys.

  _[docs/support-matrix.md](docs/support-matrix.md), headless Chrome 156 on this Mac (`experiments/support-probe.mjs`): `float32-filterable`, `float32-blendable`, `shader-f16` and `subgroups` are all offered; 1 024 invocations into four atomic counters count exactly; a 4 GiB storage binding is offered, and a million stars (32 MB) fit in the default 128 MiB. f32 neighbours are 16 km apart at 1 AU and 524 km at Neptune, so `orbits` must draw relative to the camera. Nothing in M0 or M1 needs an optional feature. Safari and Firefox are 10.2's._

- [x] **1.7 Point layer and star colour** (S) — Moon Temple's point layer (`points.ts`, `points.wgsl`), aperture (`aperture.ts`, `aperture.wgsl`), analytic glare and flicker, with their tests, copied from its committed tree; the temple core's `blackbody.wgsl` copied in with a TypeScript twin. Its tests pass here unchanged.

  _From Moon Temple's commit cf2b7a5: `src/gpu/points.ts`, `src/gpu/points/points.wgsl`, `src/gpu/optics/{aperture,shapes}.ts`, `src/wgsl/aperture.wgsl` and `src/gpu/glare/glare.{ts,wgsl}`, with `tests/points.test.ts`, `tests/glare.test.ts` and `tests/shapes.test.ts`, all passing unchanged. Flicker was already here, from Snow Temple. `blackbody.wgsl` is the temple core's source (the published 0.1.1 does not carry it), with Fire Temple's TypeScript twin in `src/gpu/emission/blackbody-lut.ts`; `tests/blackbody.test.ts` checks the fit against the Planck reference and the shader against the twin. The fit stops at 12 000 K: hot stars reach 40 000 K, so 2.1 extends it._

## Epic 2 — Stars

Stars are points, and getting points right is the whole problem. Everything later draws its stars through 2.1.

- [x] **2.1 `star-splat`** [—] (M) — `src/gpu/stars/`, research.md's building block. A star is a point with a temperature and a magnitude:
  - its colour from the blackbody fit, through the colour stage, so a 3 000 K star is orange and a 30 000 K star blue-white, never green;
  - its light from its magnitude, 10^(−0.4 m), with a magnitude distribution that gives about three times as many stars per magnitude fainter, as the real sky does;
  - drawn by 1.7's point layer, at a spot size chosen by 2.3, so its light is conserved at any position;
  - optional spikes from the glare layer, four for a Hubble look and six plus two for JWST's;
  - a scene, `star-splat`, that shows the parts side by side.

  Tested: total light of a moving star within 2%; colours monotonic with temperature; the counts per magnitude bin follow the distribution.

  _`src/gpu/stars/stars.ts` (statistics and colour) and `src/gpu/stars/spot.{ts,wgsl}` (the spot layer). Three changes from the story as written. The colour is Planck's law worked out on the CPU per star, not the shader's fit, which clamps at 12 000 K; mixed towards white at the same luminance by `saturation` (0.7 by default, as the eye sees starlight). The spot is a new layer, not the point layer: a Gaussian integrated over each pixel's square from erfc, because 2.3 found the point layer's disc, though it conserves the light, still swings in shown brightness once a star is bright. And spikes take 20% of a bright star's light, one glare layer per set of spikes, since a layer's lights written between passes of one command buffer all arrive with the last values. Two shader pitfalls: the offset must come from `@builtin(position)`, since an offset interpolated across the quad is off by about 1e-3 px, which a narrow spot's tail turns into a 1% error; and the tails must be differences of erfc, not of erf near 1, which cancel in f32. `tests/stars.test.ts`: about three times as many stars per magnitude, colours from red to blue past 12 000 K at luminance 1, spot light within 2e-3 of its own at six widths and five sub-pixel offsets, the shader within 0.5% of the twin per pixel (Metal's fast `exp`), and halos only on bright stars. The `star-splat` scene shows the temperature, magnitude and spike rows over a drifting field. 0.58 ms in Chrome: Tier A._

- [ ] **2.2 `deep-field`** [A] (M) — the family's base effect: a parallax starfield with a flat nebula behind it. Several depth layers of 2.1's stars drifting with the pointer and scroll, slowly enough that the motion check reads no whole-field drift; a domain-warped emission nebula with a separate dust field, cached once (it does not change) and moved by parallax. Compared with hologpu's `starfield` and with 2.7's CSS stars.

  _`deep-field`: 6 000 stars from the sky's statistics, 3 600 shown at the default, in four layers at 0.2, 0.4, 0.65 and 1 times the parallax, the far ones dimmer; parallax from a slow drift, the pointer (eased) and the page's scroll; each layer wraps through a margin round the view. The nebula is baked once per size into a half-resolution texture with a margin: a soft mask, hydrogen-alpha red, oxygen teal that replaces the red where it is strong (summed, the two make grey), and dust that only absorbs; a `hubble` palette. The ACES toe crushed the faint stars at `star-splat`'s light, so a magnitude-0 star here is 40 units, not 6. Positions are refilled from script each frame, fine at this count (2.4). 1.71 ms a frame in Chrome (all eight views): Tier A. Flash, pattern, motion and held-frame checks pass. Not yet compared with hologpu's `starfield` side by side._

- [x] **2.3 Shimmer study** [—] (S) — research.md's open question: what is the smallest star spot that stays stable when panning at DPR 1? Stars rendered at sub-pixel offsets and pan speeds from 0.05 to 2 px a frame, at spot sizes from a single pixel to three, with and without energy conservation. Measured as the frame-to-frame variance of each star's summed light and of its peak pixel, and by the flash check on the result. The answer sets 2.1's default.

  _[docs/studies/shimmer.md](docs/studies/shimmer.md): every sub-pixel position drawn at once on the GPU, three methods and fifteen sizes, measured as the spread of the light the screen shows (clipped or through ACES, through 8-bit sRGB) for faint, bright and very bright stars. `hello`'s naive disc swings by 8 to 46% at its default size. Conserving the light is not enough: the point layer's disc keeps its linear total within 0.1% but its shown light swings by up to 56% once bright, since the peak clips or bends in the tonemap. A Gaussian of σ = 0.8 device pixels is the narrowest spot under 2.5% at every brightness, and is the default; never narrower than 0.5. The shimmer has a frequency, 60 v a second for v pixels a frame, inside the flash rule's range at 0.1 px a frame. The pan speeds became phases (every phase a pan passes through, drawn at once), and the flash check on a panning naive field was not run._

- [x] **2.4 Quads against a compute splat** [—] (S) — the other open question: at what star count does an instanced quad per star stop being cheap, and does a compute pass splatting stars into a buffer with atomics beat it? 1 000 to 1 000 000 stars, both ways, cost and memory. Sets the method for `real-sky`, galaxies and data.

  _[docs/studies/splat-cost.md](docs/studies/splat-cost.md), on Dawn at 1080p: quads win at every count for stars that keep their light (0.44 ms for 100 000, 9.8 ms for a million), and the compute splat of the same Gaussian costs two to six times as much (49 atomic adds a star contend). A one-pixel splat is flat (0.85 ms at a million) but is the naive star that shimmers: kept only for a haze of points. Quads cross the Tier A budget near 200 000 stars here. The real limit is the CPU: refilling positions from script costs 1.1 ms at 10 000 stars and 5.2 ms at 100 000, so past about 10 000 stars positions must come from the GPU._

- [x] **2.5 `star-trails`** [A] (S) — a long exposure: stars wheeling around a celestial pole, drawn in closed form as arcs whose length grows with the exposure, coloured by temperature, with a horizon silhouette. No accumulation buffer, so nothing to truncate and nothing left after a resize. A slow, calm hero.

  _`star-trails`: 4 000 stars from the sky's statistics (2 200 at the default) plus the pole star, each arc 24 instanced quads drawn as the star spot along the arc: a pixel-integrated Gaussian across it, the Gaussian's cumulative distribution along it, so the pieces join without seams; light along a trail falls as one over the distance from the pole, as in a photograph. The exposure grows over 40 s, holds, fades over 4 s and restarts. The finding that shaped it: concentric arcs are stripes, and past about 28° of arc (under two hours of sky) the pattern analyser reads them as a regular pattern however few the stars (`experiments/trails-pattern.test.ts`). So the default is 1.75 h (26°), `all night` (6 h) is a declared pattern preset behind the gate, and a held frame freezes the exposure where it is, never past 26°. 0.17 to 0.24 ms on Dawn; 1.9 ms in Chrome on one run and 3.9 on another with the machine under load: Tier A provisionally._

- [x] **2.6 `real-sky`** [A] (M) — "the sky above you tonight": the Yale Bright Star Catalogue (about 9 000 stars to magnitude 6.5, licence checked) projected for the visitor's time and place, from the time zone by default and from geolocation only if they grant it. Local sidereal time and latitude decide what is up. Constellation lines between catalogue stars as an option, the horizon and a slow twinkle near it through the flicker construction. Measures the catalogue's bundle cost against a procedural sky (research.md's third open question).

  _`real-sky`: the Bright Star Catalogue (Hoffleit and Warren 1991, from the Harvard–Smithsonian CfA's copy, as CDS's would not answer from here), 9 096 stars packed by `scripts/pack-bsc5.mjs` at 6 bytes a star into `src/gpu/stars/bsc5.generated.ts`, brightest first, and precessed to today at load (0.36° by 2026: four pixels at 1080p, so not left out). The place comes from the time zone's city (`src/gpu/stars/place.ts`), or is passed in with `place: fixed`. Every star's altitude and azimuth come from the local sidereal time in the vertex shader, as 2.4 said a field this size must, into a stereographic view; a fullscreen pass draws the sky's glow and a skyline that culls the stars behind it. `src/gpu/stars/sky.ts` is the CPU twin: `tests/sky.test.ts` checks it against Meeus's examples 12.a and 13.b, `tests/sky-gpu.test.ts` the shader against it. Checked by eye: Orion, Sirius and the Pleiades where they are from Chicago on 29 October at 4 am. The catalogue is 57.8 kB gzipped of the effect's own code, against about 2 kB for a procedural field: the answer to research.md's third question is that a real sky costs about 55 kB, worth it where being true to the visitor's sky is the point. 0.28 to 0.79 ms on Dawn, 1.2 to 1.6 ms in Chrome: Tier A, where the story guessed B. Not done: constellation lines (they need a second data file, and its licence checked) and geolocation on the gallery page._

- [x] **2.7 CSS against WebGPU** [—] (S) — starfields four ways on the same page:
  - the classic `box-shadow` field, a few hundred stars on one element, translated together;
  - CSS-animated star elements, one per star;
  - a 2D canvas drawing each star with `arc`;
  - `deep-field`.

  Measured as main-thread time, GPU time and frame drops by star count, and for shimmer by 2.3's measure. Where does each stop being the right choice?

  _[docs/studies/star-compare.md](docs/studies/star-compare.md), headless Chrome at 1280 × 720, five ways (elements moved from script added): box-shadow stars cost 16 to 19 ms a second of main thread from 400 to 25 600 stars, flat, since each layer moves as one picture; an element a star costs per star and drops to 16 and 4 fps at 6 400; a 2D canvas is cheap for a few thousand (119 ms a second at 6 400); `deep-field` costs 35 to 74 ms a second of main thread for 1 000 to 6 000 stars, its script. For a field that only drifts in rigid layers, box-shadow is the honest choice. WebGPU earns its place with what CSS cannot do: stars that keep their light, real colours and magnitudes, HDR halos and spikes, a nebula, and per-star motion. The shimmer of box-shadow and canvas stars was not measured: it needs frames captured from the compositor._

- [x] **2.8 Twinkle near the horizon** [—] (S) — scintillation as the atmosphere does it: stronger at low altitude, faster in wind, with colour flicker for bright stars, through the flicker construction so no field can pass three flashes a second. Stars in space hold still.

  _`src/gpu/stars/scintillation.ts` and its WGSL twin in `sky.wgsl`: the flicker's depth grows with airmass (Kasten and Young), 0.07 a unit, so about 0.07 overhead, 0.4 at 10° up, capped at 0.85; its rate grows too (wind times 1.2 + 0.12 a unit of airmass), capped at the flicker's safe four knots a second. Each star's light is divided by its signal's mean, so it keeps its average. A bright star low down mixes in a signal per colour channel, up to 60%, for the colour flashes. Used by `real-sky`, along with extinction of 0.25 magnitudes per airmass; `deep-field` has a plain twinkle of its own, off by default, for pages that want it anyway._

## Epic 3 — Nebulae and galaxies

- [x] **3.1 Emission-line colour** [—] (S) — nebula colour by emission line: hydrogen-alpha 656 nm, oxygen III 501 nm and sulphur II 672 nm, mapped to RGB as the eye sees them, or to the false-colour "Hubble palette" (S II red, H-alpha green, O III blue). A palette type in the shell's palette editor.

  _`src/gpu/nebula/lines.ts`: S II 672, Hα 656, O III 501 and Hβ 486 nm as the eye sees them, each wavelength's colour from the CIE colour-matching functions taken into sRGB in OKLCH at its own hue (clipping the negative channel first had turned 620 nm into the same pure red as 680); the Hubble palette (S II, Hα, O III to red, green, blue) and the two-line HOO palette. The false-colour palettes weight the faint lines up and hydrogen down, as the published images stretch each line to its own channel; without that a Hubble-palette nebula is green. `tests/lines.test.ts` checks the hues. Not done: a line palette in the shell's palette editor; effects take it as a `palette` parameter._

- [x] **3.2 `nebula`** [A] (M) — a flat nebula: layers of domain-warped noise as emission in 3.1's lines, multiplied by a separate dust field that absorbs, with parallax between the layers and 2.1's stars between them. Cached where still. A hero background.

  _`nebula`: three layers baked once each (a buffer per layer, as uniforms written between passes arrive with their last value), composited far to near as behind × transmittance + light, with a share of 5 000 stars before each layer so nearer dust dims them; the near layer mostly dust lanes and ridged pillars. 0.3 ms on Dawn, 1.2 ms in Chrome: Tier A._

- [x] **3.3 Volume kernel** [—] (S) — Fire Temple's emission–absorption march (`src/gpu/volume/`, `volume.wgsl`) ported: reduced resolution, blue-noise jitter, temporal reprojection. A test checks that a uniform slab's transmittance matches Beer–Lambert.

  _Fire Temple's `volume.wgsl` and `src/gpu/volume/` (reduced-resolution march, depth-aware upsample, blue noise) copied in. Its own test needs helpers this family lacks, so `tests/volume.test.ts` is new: a uniform slab marched in 1 to 200 steps keeps the Beer–Lambert transmittance and the closed-form glow, and the ray-box test finds the faces._

- [x] **3.4 `nebula-volume`** [B] (M) — a ray-marched nebula through 3D noise in 3.1's lines with dust, turned slowly or by the pointer, with embedded stars that light the gas near them. Tier B at reduced resolution or C at full; both measured.

  _`nebula-volume`: 3D noise baked once into a 96³ texture by compute; a march through a soft ball in a box, gas in 3.1's lines brightest near five hot stars inside it (light falling with the square of distance), dust absorbing; jitter moved every frame and averaged over about four frames. Measured on Dawn at 48 steps: 6.4 ms a frame at full resolution, 2.1 at half and 0.9 at a quarter, so Tier B at half (the default) and C at full, as the story guessed. The gas is soft at 96³; finer would need a bigger texture or detail noise._

- [x] **3.5 `spiral-galaxy`** [B] (M) — the density wave: stars on ellipses whose orientation turns with radius, so arms appear where the ellipses crowd and hold while every star moves. A bulge, dust lanes as absorption along the inner edge of the arms, and pink H II regions along them. Stars drawn by 2.4's chosen method; the arms' pattern speed and the stars' orbital speeds both shown. After Lin and Shu, and Ingo Berg's write-up.

  _`spiral-galaxy`: 72 000 stars (120 000 at full dose) on ellipses turned by `twist` × size, positions closed-form in the vertex shader; the crowding phase worked out from the Jacobian of (size, phase) to position, A sin 2e + B cos 2e + C, smallest where 2e = atan2(−A, −B), which is where young stars, H II regions and dust are held (at the ellipses' major-axis ends they had sat on a ring at the rim). Dust is soft absorbing smudges drawn with a multiplying blend; it crowds as the stars do, so each is faint. A bulge, a smooth bulge and disc glow, and tracer stars that show stars moving through arms that hold. The dust was most of the cost (4.6 ms); cut at 2.2 of its widths and smaller, about 2 ms on Dawn, 3.7 in Chrome under load: Tier B._

- [x] **3.6 `galaxy-collision`** [A] (M) — two of 3.5's discs as initial conditions for hologpu's `n-body`: tidal tails and bridges as they pass. A showpiece; measured for how few bodies still read.

  _`galaxy-collision`: the restricted three-body problem (Toomre and Toomre): two cores on a parabolic orbit integrated by leapfrog on the CPU, each with 12 000 test stars on circular orbits in the softened gravity, integrated in one compute dispatch a frame with every sub-step's core positions in a buffer. Prograde discs throw long tidal tails and a bridge; a retrograde one hardly changes. 0.8 ms on Dawn, 1.8 ms in Chrome: Tier A by budget, where the story guessed C; it needs compute. The discs' spin read as whole-field rotation over the 5° a second cap until the clock slowed. Not done: reusing hologpu's `n-body`, which a restricted problem does not need._

- [x] **3.7 `data-galaxy`** [A] (M) — thousands of a page's own data points (an embedding, a user base) drawn as a galaxy: each point a star, its cluster an arm, its value its brightness, with hover picking a point. The family's most practical effect for product pages.

  _`data-galaxy`: points as stars, clusters as arms in OKLCH hues at one lightness, values as brightness, turning slowly; positions on the CPU so the pointer can pick the nearest within 14 CSS pixels, which lights it and its cluster and fires a bubbling `sr-pick` event with the point (checked in the browser: 29 picks over a sweep). A made-up data set in the gallery; a page's own comes through the library entry (9.1). 0.7 ms on Dawn, 2.9 in Chrome under load: Tier A provisionally._

## Epic 4 — Gravity and orbits

- [x] **4.1 `lens-cursor`** [A] (S) — the pointer as a small black hole: thin-lens gravitational distortion of content the effect draws (or an image the page hands over), bending it towards the pointer by 1/r with an Einstein ring at the right radius and a black shadow inside it. Works on any image, so it is the one gravity effect a page can drop in.

  _`lens-cursor`: the thin-lens equation β = θ(1 − θ_E²/|θ|²) at the eased pointer, sampling a nebula and stars baked once per size, or a page's own image through `image` (fetched, decoded with `createImageBitmap`, copied into an sRGB texture); a black shadow, a share of θ_E so it reads at cursor size, edged by a faint photon ring; it wanders on a slow Lissajous figure when the pointer is away. One pass and the tail: 0.09 ms on Dawn, 0.46 in Chrome. Tier A. 8.5 puts it over a page's hero_

- [x] **4.2 Geodesic step** [—] (M) — `src/gpu/gravity/`: light rays integrated through the Schwarzschild metric in the compact Cartesian form, where each step adds an acceleration proportional to h²/r⁵ (Antonelli's "Starless"), with an adaptive step near the hole. Tested against the analytic deflection angle for a far ray and against the photon sphere at 1.5 Schwarzschild radii.

  _`src/gpu/gravity/geodesic.wgsl` and its CPU twin `geodesic.ts`: −1.5 h² x / r⁵, fourth-order Runge–Kutta, a step of 0.08 (r − 0.9) clamped to 0.005 to 2. `tests/geodesic.test.ts`: the deflection of rays at b = 40 to 300 matches 2/b + (15π/16)/b² within 2%; rays inside 0.98 of the critical impact parameter 3√3/2 are captured and outside 1.02 escape; a ray at 1.0005 of it comes in to 1.5, the photon sphere_

- [x] **4.3 `black-hole`** [C] (L) — 4.2 per pixel: rays that fall in are black, rays that cross the disc plane pick up the disc, and the rest sample 2.2's sky. The disc's temperature falls with radius; Doppler beaming brightens the side coming towards the viewer and gravitational redshift dims its inner edge. After James et al.'s _Interstellar_ paper. Tier C at full resolution.

  _`black-hole`: 4.2 per pixel at half resolution, a disc between the innermost stable orbit and 14 with a Shakura–Sunyaev profile, Doppler beaming (g³) and gravitational redshift, passed through at 12% so the far side's bent image shows; the sky's stars drawn as points through the lens's local mapping (`dpdx` and `dpdy` of the escaped direction) and brightened by its magnification. 2.2 ms on Dawn at half resolution, 7.0 at full, 6.0 in Chrome at half: Tier C, as planned. The step budget does not matter past 200: every ray has escaped or fallen in by then. Drawing the stars a fixed angle wide in the sky had sheared them into arcs that lined up into rings round the hole, which failed the pattern check_

- [x] **4.4 Half resolution and temporal accumulation** [—] (S) — research.md's second open question: can 4.3 reach Tier B at half resolution with temporal accumulation while it turns, and what does it lose at the photon ring?

  _Against a full-resolution frame accumulated still for 64 frames, at 960 × 540 (`experiments/black-hole-quality.test.ts`): one full-resolution frame scores SSIM 0.97 over the frame and 0.91 round the photon ring; half resolution 0.91 and 0.86 in one frame, 0.92 and 0.89 after 8, no better after 32; quarter 0.81 and 0.78. Turning, against full resolution at the same moment, half resolution holds 0.93 and 0.92. So accumulation buys a little at the ring and nothing past 8 frames: what half resolution loses is sharpness, not noise. And it does not reach Tier B: 2.2 ms on the M1 Max's GPU is already 6 in Chrome, the B budget for an integrated GPU. Half resolution is the default, `full resolution` a preset_

- [x] **4.5 `orbits`** [B] (M) — the solar system from Standish's published Keplerian elements, accurate enough for any website, at today's date: orbit lines, planets as 2.1 points or 5.x bodies, and a logarithmic distance scale that the page scrolls through, so it is legible from the Sun to Neptune. Camera-relative positions and a floating origin from the start.

  _`orbits`: Standish's elements (`src/gpu/stars/planets.ts`, tested against Earth at J2000, the March equinox of 2000 and Jupiter's period), today's planets on a logarithmic scale from 0.2 to 35 AU, orbit lines as spots every 0.8 pixel rebuilt only when the view changes, scrolling the page zooming in to the inner planets. 0.5 ms on Dawn, 1.4 in Chrome: Tier A, where the story guessed B. Precision does not arise: positions are doubles on the CPU, drawn in pixels about the Sun, so no floating origin is needed. Planets are 2.1 spots; 5.x bodies would come with M4_

- [ ] **4.6 Kerr spike** [—] (S, stretch) — the spinning hole's asymmetric shadow, once, to see what it costs. Not a story to ship.

## Epic 5 — Worlds

- [ ] **5.1 Cube sphere** [—] (S) — `src/gpu/world/`: a planet's surface as a cube projected onto a sphere, so noise has no pole pinch, with height, ocean below a threshold and ice caps by latitude. Tested: no seam at the cube's edges.
- [ ] **5.2 Atmosphere** [—] (M) — Rayleigh and Mie single scattering by a short analytic march, against Hillaire's lookup-table method, from orbit and from the ground. Built to be Light Temple's E5-S6 sky too, so the two families share one module.
- [ ] **5.3 `planet`** [B] (M) — 5.1 and 5.2: terrain, an ocean with a sun glint, a cloud shell with its own shadows on the ground, and city lights fading in past the terminator. A planet that turns from day to night as the page scrolls.
- [ ] **5.4 `gas-giant`** [B] (M) — noise advected along latitude bands at alternating speeds (Water Temple's flow advection), vortex storms that persist, and limb darkening.
- [ ] **5.5 Rings** [—] (S) — a radial density profile with gaps, the planet's shadow on the rings and the rings' on the planet, and forward scattering when lit from behind. Used by 5.4.
- [ ] **5.6 `moon-phase`** [A] (S) — the terminator with a soft edge and earthshine on the dark side, as a progress indicator or loader: the phase is the value. Compared with Moon Temple's `moon.wgsl` and a CSS two-circle version.

## Epic 6 — The Sun

- [ ] **6.1 `solar-surface`** [B] (M) — moved from Fire Temple's 11.4: granulation as convection cells that rise and fade, sunspots with umbra and penumbra, and limb darkening to the edge of the disc, at the Sun's colour through the HDR tail.
- [ ] **6.2 Corona and prominences** [—] (M) — emissive arcs along magnetic loops above the limb, and the corona as a radial, streaked glow. Used by 6.1 and 6.3.
- [ ] **6.3 `eclipse`** [A] (M) — a total solar eclipse: the Moon's disc over 6.2's corona, the diamond ring and Baily's beads at second and third contact from the Moon's uneven limb. A launch countdown. The diamond ring is a flash: it is checked as one.

## Epic 7 — Small bodies and motion

- [ ] **7.1 `comet`** [A] (S) — a bright coma, a straight blue ion tail pointing directly away from the Sun and a curved, yellowish dust tail behind the orbit. Driven by the page's scroll or a date.
- [ ] **7.2 `meteor-shower`** [A] (S) — absorbs Fire Temple's 11.6: streaks that all trace back to one radiant, which is what makes it read as a shower, each a short-lived stroke with a lingering train. Meteors are flashes: the rate and brightness are held under the flash rule at the strong dose.
- [ ] **7.3 `warp`** [A] (M) — streaks along the direction of motion with relativistic aberration bunching the stars ahead and Doppler shift turning them blue ahead and red behind. Always gated, and only on a user action; under reduced motion a still frame or a slow cross-fade.
- [ ] **7.4 Flight study** [—] (S) — research.md's fifth question: is warp acceptable at all as page decoration, or only behind a click? The zoom doublings a second of forward flight at each speed, from the effect's transform (Snow Temple 2.4), and the shortest warp transition that reads as one.
- [ ] **7.5 Warp transition** [A] (S) — 7.3 as a route transition lasting under a second, after a click, with a cross-fade under reduced motion.
- [x] **7.6 Planets among the stars** [—] (S) — 4.5's planet positions in `real-sky`, so the bright "stars" that are planets are where they are tonight.

  _`real-sky`: Mercury to Neptune from 4.5's elements, geocentric right ascension and declination precessed to the date, magnitudes from distance and phase angle (Meeus 41, clamped at each planet's brightest), in the star buffer after the catalogue and drawn by the same pass in their own colours, without twinkling_

## Epic 8 — On the page

- [ ] **8.1 Space hero** [B] (M) — a landing-page hero built from the family: `deep-field` or `nebula` behind the headline with parallax on the pointer and scroll, a slow comet, `dose` low enough to sit behind text.
- [ ] **8.2 Sky tonight** [B] (S) — 2.6 as a page section: "the sky above you tonight", with the stars named on hover.
- [ ] **8.3 Loader and progress** [A] (S) — 5.6's moon phase as a progress bar and loader, and a planet turning as an indeterminate spinner.
- [ ] **8.4 Launch countdown** [A] (S) — 6.3's eclipse or 7.1's comet approaching as a countdown to a date.
- [ ] **8.5 Black-hole cursor** [A] (S) — 4.1 over a page's own hero image as a drop-in.

## Epic 9 — Production readiness

- [ ] **9.1 Library entry** (S) — mount any effect on a caller's canvas, as the other families do.
- [ ] **9.2 Light pages** (S) — space as a card or panel on a light page: rounded, inset, with its own dark, shown and screenshotted over the light context for every effect.
- [ ] **9.3 Accessibility** (M) — `docs/accessibility.md`: flash, pattern and motion over every preset, 7.4's flight limits, held frames, the start gate, and user-triggered warp only.
- [ ] **9.4 CSS fallbacks** (S) — for each Tier A effect, the best CSS version beside it (2.7's `box-shadow` stars, a two-circle moon phase), with its cost and what it cannot do.
- [ ] **9.5 Adaptive quality** (S) — star count, march resolution and geodesic step count scale with the measured frame time, from the shared rungs.
- [ ] **9.6 Into the temple core** (M) — move the star spot (2.1), the sky model (2.6), the emission-line march (3.4), the density wave (3.5), the geodesic step (4.2) and the atmosphere (5.2) into `@mk7s/hologpu-temple-core`.

## Epic 10 — Measurement and findings

- [ ] **10.1 Cost studies** (S) — every epic's effects on Dawn and in Chrome, with buffer and texture memory, filed in `docs/studies/`.
- [ ] **10.2 Device matrix** (M) — an integrated GPU, a phone and Safari and Firefox, to settle the provisional tiers, and 2.3's shimmer answer at DPR 1 on a real low-DPI screen.
- [ ] **10.3 Star count crossover** (S) — 2.4 and 2.7's answers on more devices: at what star count CSS, quads and a compute splat each stop being the right choice.
- [ ] **10.4 Decision guide** (S) — "which effect for which job", "how much motion behind text", and the cases where the answer is "don't".

## Risks and open questions

- **Shimmer at DPR 1.** Most of the development machine's screens are DPR 2. A star spot that is steady at DPR 2 may crawl at DPR 1, where a pixel is twice the size. 2.3 tests at DPR 1 by rendering at it, and 10.2 checks a real screen.
- **The motion check and sparse stars.** A starfield is sparse, faint points: exactly what Snow Temple found block matching cannot see. Parallax and flight must be held to the caps from the effect's transform as well, and 2.2 needs both readings.
- **Warp at all.** It may be that no ambient warp is acceptable, and the honest finding is "only after a click, and short". 7.4 is the experiment, and "don't" is an acceptable answer.
- **Black-hole cost.** A geodesic trace per pixel is expensive. Is Tier C its honest place, and is 4.1's thin lens the version pages should use? _Answered: Tier C, even at half resolution (4.4); the thin lens is Tier A at 0.1 ms and is the drop-in._
- **Catalogue weight.** The Bright Star Catalogue is about 9 000 records. Packed, it may be 50 to 100 kB gzipped. Does a real sky earn that over a procedural one? 2.6 measures it.
- **Precision in `orbits`.** A solar system spans 4.5 × 10¹² m. Camera-relative rendering and a floating origin are planned, but the logarithmic scroll may still show jitter near a planet when the camera is far from the origin. _Answered: it does not arise for a 2D view worked out in doubles on the CPU (4.5); it would for a camera flying among the planets._
- **Colours that are not real.** Space imagery is mostly false colour. The effects say which they show: what the eye would see, or a published palette.
- **Accent.** Hydrogen-alpha red sits near Fire Temple's orange and The Hero's Journey's magenta. Check it in the holofx site's dropdown beside the other families before committing to it.

## Starting references

From memory, as the other families' plans began; each is to be confirmed against the source when its story is built.

- C. C. Lin and Frank H. Shu, "On the spiral structure of disk galaxies", _Astrophysical Journal_ (1964). Ingo Berg's write-up on rendering a galaxy with the density wave.
- Oliver James, Eugénie von Tunzelmann, Paul Franklin and Kip S. Thorne, "Gravitational lensing by spinning black holes in astrophysics, and in the movie _Interstellar_", _Classical and Quantum Gravity_ (2015).
- Riccardo Antonelli, "Starless" and its notes on real-time black-hole rendering: the Cartesian form of the Schwarzschild ray step.
- Sean O'Neil, "Accurate atmospheric scattering", _GPU Gems 2_, chapter 16 (2005); Eric Bruneton and Fabrice Neyret, "Precomputed atmospheric scattering" (2008); Sébastien Hillaire, "A scalable and production ready sky and atmosphere rendering technique" (2020).
- Dorrit Hoffleit and Wayne H. Warren Jr., the Yale Bright Star Catalogue, 5th revised edition.
- E. M. Standish, "Keplerian elements for approximate positions of the major planets", JPL.
- Jean Meeus, _Astronomical Algorithms_ (1991): sidereal time, the Sun's and Moon's positions, moon phase.
- Mitchell Charity, "What color are the stars?", for blackbody colours as the eye sees them.
- Tobias Ritschel et al., "Temporal glare: real-time dynamic simulation of the scattering in the human eye" (2009), for diffraction spikes.
- The Moon Temple, Fire Temple and Snow Temple plans, for the point layer, the volume kernel and the motion findings.
