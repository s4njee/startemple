## How it works

A long exposure facing the celestial pole, in closed form. The sky turns 15° an hour round the pole, so over an exposure of E hours every star sweeps an arc of 15 E degrees. Each frame draws every star's arc at the exposure's current length, so nothing accumulates: there is no buffer to truncate small amounts into (Fire Temple 5.6), and nothing to lose on a resize.

- **The stars** are 4 000 from the sky's statistics (`src/gpu/stars/stars.ts`), 2 200 at the default, spread evenly over the area round the pole, coloured by temperature, with the pole star placed under a degree from the pole as the short bright arc in every photograph of it.
- **Each arc** is 24 instanced quads, each a piece of the arc's annular sector. Each pixel gets the trail as the star spot drawn along it: across the arc, a Gaussian of σ = 0.8 device pixels integrated over the pixel (as `star-splat`'s spots are); along it, the same Gaussian's cumulative distribution softening the piece's ends, so the pieces' coverages add up to the whole arc's exactly and join without seams.
- **The light along a trail** is spread as a photograph spreads it: a star far from the pole moves across more pixels in the same time, so its trail is fainter, by one over its distance.
- **The loop**: the exposure grows over 40 seconds (`seconds to expose`), holds for a fifth of that, fades over four seconds and starts again, a third of the way in, so the first frame already shows trails.

`dose` ("intensity") sets how many stars and how bright.

## Cost

24 quads a star: about 53 000 at the default, each a thin strip of the arc. 1.9 ms in Chrome at 1080p on one run and 3.9 ms on another, with the machine under load (`npm run browser-check`): Tier A on the first reading, provisionally. See [docs/studies/epic-2.md](../../../docs/studies/epic-2.md).

## Pitfalls

- **Concentric arcs are stripes.** Long trails round a pole are a regular pattern of light and dark rings, and past about 28° of arc (under two hours of sky) the pattern analyser reads them as one, however few the stars (`experiments/trails-pattern.test.ts`). So the default exposure is an hour and three quarters (26°), and the six-hour `all night` preset is declared and starts behind the gate. Widening the trails (σ 1.4) crosses the line sooner.
- **The held frame freezes the exposure where it is.** A frame paused at the full exposure was brighter than the effect ever looks early in its loop, which a held frame must not be; and it is never shown longer than 26° of arc.

## Safety

Pattern `low` at the default all the way through the exposure; `all night` is declared (`patternPresets`) and gated. No flashes: the fade between loops takes four seconds. The leading ends of the arcs move at about 0.7° a second, under the motion check's turn cap. Checks pass at the default and the strong dose (`npm test`).

## When to use it

A slow, calm night hero for an astronomy, photography or outdoor page. It is not the visitor's own sky: `real-sky` is, and could draw its trails the same way.

## References

- Star Temple [plan.md](../../../plan.md), story 2.5.
