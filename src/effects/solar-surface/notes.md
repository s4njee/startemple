## How it works

The Sun in white light. Every pixel of the disc is a point on a sphere with a temperature, and its colour and brightness are a blackbody's at that temperature (`src/gpu/sun/sun.wgsl`), so every contrast on the disc comes through the Planck curve.

- **Limb darkening from the physics.** Looking at the disc's centre we see deeper, hotter gas than at its edge, where the line of sight runs slantwise through the top of the photosphere. In a grey atmosphere T⁴ = ¾ T_eff⁴ (τ + ⅔) (Eddington), and the light from a point is about the Planck light at τ = μ (Eddington–Barbier). So the temperature runs from 6 100 K at the centre to 4 850 K at the limb, which at 555 nm is a third of the light, as the measured profile is, darker still in the blue: the limb is redder, by the same law, with no fitted coefficients.
- **Granulation**: convection cells, hot gas rising in their centres and cool gas sinking in the lanes. Each is a weighted Worley cell in 3D on the sphere: a seed lives for a while, its weight rising from zero, holding and falling back, so the cell grows from a point, pushes its neighbours aside and shrinks away, and the next seed in that cell takes its place at weight zero, with no pop. Centres are a few per cent hotter, which the Planck curve turns into about fifteen per cent brighter. Their contrast fades towards the limb.
- **Sunspots**: an umbra at 0.7 of the local temperature (about 4 100 K), a penumbra between with radial filaments and a ragged edge, granulation suppressed inside, and faculae round them, brighter near the limb, where they show.
- **Differential rotation**: the Sun turns faster at its equator (Snodgrass's law), so the spot groups near the equator pull ahead.
- **Beyond the limb** (story 6.2, `corona.wgsl`): prominences, the chromosphere and the corona, at `corona and prominences` ten-thousands of their real brightness, as a coronagraph or a filter would show them. In white light the disc outshines them a million times.

`solar filter tint` mixes in the orange of a solar filter, as most photographs of the Sun are taken; at 0 the disc is the 6 000 K white of the Sun itself.

## Cost

1.6 to 1.8 ms a frame at 1920 × 1080 on Dawn, 2.0 for the close-up, 4.1 in Chrome: the 27-cell Worley search is most of it, and the cell size makes no difference. Tier B. See the Scorecard tab and [docs/studies/epic-6.md](../../../docs/studies/epic-6.md).

## Pitfalls

- **`filter` is a reserved word in WGSL.** A uniform named `filter` fails to compile.
- **The tonemap flattens the limb.** Through the ACES shoulder a bright disc loses most of its limb darkening; the disc is drawn at 0.42 of the tail's white so its edge still shows.
- **Prominence arches as lines read as rings.** Thin bright arcs on the limb looked drawn; each is now a thicker arch of strands over a fainter sheet.

## Safety

Flash `none`, pattern `none`: the cells are irregular and change a few per cent at a time, slowly. Every preset passes (`npm test`).

## When to use it

A hero for a solar, energy or science page; a warm, slowly churning backdrop. Where the GPU cannot afford it, a still of the disc.

## References

- A. S. Eddington, _The Internal Constitution of the Stars_ (1926), and the Eddington–Barbier relation.
- H. Neckel and D. Labs, "Solar limb darkening 1986–1990", _Solar Physics_ (1994), for the measured profile it is checked against.
- R. F. Howard and P. A. Gilman, and Snodgrass (1983), for the Sun's differential rotation.
- Star Temple [plan.md](../../../plan.md), stories 6.1 and 6.2; moved from Fire Temple's 11.4.
