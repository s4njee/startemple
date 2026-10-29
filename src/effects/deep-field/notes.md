## How it works

Two layers, drawn in three passes, then the shared tail:

- **The nebula**, baked once. A fragment pass (`nebula.wgsl`, `bake`) draws the gas into a texture a little larger than the view, at half its resolution: a large soft mask so the cloud fills part of the sky, hydrogen as domain-warped noise in hydrogen-alpha red, doubly ionised oxygen in teal where the gas is densest (replacing the red there, since the two summed make grey), and dust as another warped field that only absorbs. The nebula does not change, so it is drawn again only when the view's size or the nebula's settings change. `palette: hubble` maps sulphur, hydrogen and oxygen to red, green and blue, as the false-colour images do.
- **The composite**, every frame: the baked texture, moved by the nebula's small share of the parallax, as the scene's background.
- **The stars**: 6 000 from the sky's own statistics (`src/gpu/stars/stars.ts`), 3 600 shown at the default. Each is assigned to one of four depth layers, which move with the parallax by 0.2, 0.4, 0.65 and 1 times; the far layers draw their stars a magnitude or so dimmer, so the background is crowded and faint. Every star is a spot (`src/gpu/stars/spot.ts`), a Gaussian of σ = 0.8 device pixels integrated over each pixel, so it keeps its light and its look wherever it sits between pixels ([docs/studies/shimmer.md](../../../docs/studies/shimmer.md)). A bright star gives 5% of its light to a halo six times wider, in place of a full-screen bloom.

**Morph and colour.** With `morph` above 0 the gas's noise gains a third axis of time, so the cloud churns, and the bake runs every frame at a third of the view's size instead of half, which the gas's softness hides. `hue` turns the nebula's colours in OKLCH (lightness kept) and `colour cycle` turns them continuously; both happen in the composite pass, so cycling the colours costs nothing and never re-bakes. The `living hubble` preset uses all three, and the `deepfield.html` demo page drives the hue itself, so its accent can follow.

The parallax comes from three places: a slow drift to the left, the pointer's position over the canvas (eased over 0.6 s, so a jump glides), and the page's scroll. Each layer wraps through a margin round the view as it moves, so no star pops in at an edge.

`dose` ("intensity") sets how many stars show and how fast they drift.

**Twinkle.** Stars in space hold still; twinkling is what the atmosphere does to them, so it is off by default. With `twinkle` above 0 each star's light is multiplied by its own band-limited flicker signal (Fire Temple's construction, `src/gpu/flicker.ts`, seeded by the star), at `twinkle rate` knots a second, capped at 4, and divided by the signal's mean so the field's average light holds. Each signal is a quadratic B-spline through random values, so it can reverse at most once a knot and cannot pass three flashes a second, whatever its seed.

## Cost

Three passes and the tail, with the nebula's bake only on the first frame and after a resize. Positions are refilled from script each frame, which costs about 0.4 ms of main thread for the default 3 600 stars ([docs/studies/splat-cost.md](../../../docs/studies/splat-cost.md)); the GPU side is under half a millisecond on the M1 Max. See the Scorecard tab and [docs/studies/epic-2.md](../../../docs/studies/epic-2.md).

## Pitfalls

- **The tonemap's toe hides faint stars.** ACES crushes light below about 0.01 almost to black, so a field lit like `star-splat`'s showed only a scatter of its brightest stars. Here a magnitude-0 star is 40 units of light, not 6, and the brightest are rolled off by the same curve.
- **Two emission lines summed make grey.** Teal oxygen added to red hydrogen at the same brightness is white, so where oxygen is strong it takes over from the hydrogen.
- **A layer that moves as one is a drift.** Every star here moves the same way, but four layers at four speeds keep the field's drift far under the motion check's cap.
- **Script is the limit, not the GPU.** Refilling 3 600 positions a frame is cheap; past about 10 000 the positions must come from the GPU (docs/studies/splat-cost.md).

## Safety

The colour cycle is capped at 60° a second, a third of The Hero's Journey's whole-field limit of half a turn a second; the demo page turns it at 12.

No flashes: stars in space do not twinkle. The drift and the eased parallax stay under the motion check's caps at the default and the strong dose (`npm test`).

## When to use it

Behind a hero headline, or as a science or launch page's background. For a field that only drifts in a few rigid layers, box-shadow stars in CSS cost almost nothing and are the honest choice ([docs/studies/star-compare.md](../../../docs/studies/star-compare.md)); `deep-field` earns its place with the nebula, stars that keep their light, real colours and magnitudes, and parallax by depth.

## References

- Inigo Quilez, "Domain warping", for the gas.
- hologpu's `starfield`, the effect this one is compared with.
- Star Temple [plan.md](../../../plan.md), stories 2.2, 2.3, 2.4 and 2.7.
