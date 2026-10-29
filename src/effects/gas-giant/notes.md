## How it works

A giant planet, every pixel a ray to a sphere and, for Saturn, to the plane of its rings. Nothing is simulated: the clouds are a function of where and when.

- **Bands.** The zonal wind is a function of latitude: jets blowing east and west in turn, unevenly spaced, with Jupiter's prograde equatorial jet or Neptune's retrograde one. Between the jets lie the pale zones and the darker belts; their edges are three incommensurate waves of latitude, so no two belts are the same width (a regular grating would read as a pattern).
- **Flow.** The cloud texture is 3D noise on the sphere, stretched along the bands, read at the longitude it had `τ` seconds ago: each latitude slides at its own speed, so it shears into streaks, and the noise is warped more where neighbouring bands run past each other fastest. Sheared noise stretches without end, so it is read twice, half a period (36 s) apart, each reading restarting when its weight is zero, and cross-faded: Water Temple's flow advection, on a sphere.
- **Storms.** The Great Red Spot, white ovals, Neptune's Great Dark Spot and its bright companion: ovals that persist, each drifting with its band's wind. Inside one, the texture's coordinates are turned as a vortex turns, most at its centre, and the oval's own colour mixed in.
- **Light.** The sun on a sphere with Minnaert's limb darkening, I = A μ0ᵏ μᵏ⁻¹, and a terminator softened over a few degrees.
- **Rings** (story 5.5, `src/gpu/world/rings.ts`): Saturn's from their radial optical depth, after the Voyager and Cassini profiles (the dense B ring, the C ring and the Cassini Division thin, the A ring with the Encke and Keeler gaps, the narrow F ring), with irregular ringlets across them, in a 1024-texel table. Lit as a slab of single-scattering particles: from the lit side ϖ P μ0 / (μ0 + μ) (1 − e^(−τ(1/μ0 + 1/μ))), from the other ϖ P μ0 / (μ0 − μ) (e^(−τ/μ0) − e^(−τ/μ)). The ice scatters a little backwards (Henyey–Greenstein g = −0.3), the dust strongly forwards (g = 0.7). The planet's shadow falls across the rings and theirs across the planet, each from the sun's ray at a point. Each pixel averages four samples across its footprint on the rings, so the narrow gaps do not alias.

## Cost

2.2 ms a frame at 1920 × 1080 on Dawn for Jupiter, 1.3 for Saturn (a smaller disc; the rings cost little), 6.4 for the `jupiter, close` preset, where the disc fills the frame; 4.5 ms in Chrome. The noise is the cost: six octaves, warped, read twice a pixel. Tier B. See the Scorecard tab and [docs/studies/epic-5.md](../../../docs/studies/epic-5.md).

## Pitfalls

- **Advected noise stretches without end.** One reading carried by the wind smears into lines within a minute; two readings half a period apart, cross-faded, keep the texture fresh. The cross-fade lowers contrast at its midpoint, so the period is long enough that it reads as the weather changing.
- **A lat-long texture pinches at the poles.** The noise is sampled at the point on the sphere, so it has no pole; only the stretch along the bands is in latitude and longitude.
- **Ring gaps alias.** The Encke gap is a few hundred kilometres across, under a pixel at page scale; sampled once a pixel, it turns into a dotted line.
- **Lit from behind, the B ring goes dark.** That is right: a dense slab passes almost nothing. The thin rings and the dust glow instead, which is the look of the Cassini images taken with the sun behind Saturn.

## Safety

Flash `none`. Pattern `low`: belts and rings are stripes by nature, held irregular and soft enough to pass at the defaults and at the strong dose. Motion: the planet turns once in five minutes, the winds slide its bands slower still. Every preset passes (`npm test`).

## When to use it

A hero for a science or space page, a slow living backdrop behind a title. Where the GPU cannot afford it, a still of the planet.

## References

- Esposito et al., Voyager and Cassini profiles of Saturn's rings, as summarised in Cuzzi et al., "An Evolving View of Saturn's Dynamic Rings", _Science_ (2010).
- S. Chandrasekhar, _Radiative Transfer_ (1950), for single scattering in a slab.
- M. Minnaert, "The reciprocity principle in lunar photometry", _Astrophysical Journal_ (1941).
- Star Temple [plan.md](../../../plan.md), stories 5.4 and 5.5; Water Temple's flow advection.
