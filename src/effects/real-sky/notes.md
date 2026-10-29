## How it works

The sky above the visitor, now, from the Yale Bright Star Catalogue (5th revised edition, Hoffleit and Warren 1991): all 9 096 stars to about magnitude 6.5, the naked-eye sky.

- **The catalogue** is packed by `scripts/pack-bsc5.mjs` at 6 bytes a star (right ascension, declination, V magnitude, B−V), brightest first, and travels in the effect's lazy chunk (`src/gpu/stars/bsc5.generated.ts`). At start it is decoded and precessed from J2000 to today by Meeus's annual precession (0.36° by 2026, four pixels at 1080p, so not left out); colours come from B−V through Ballesteros's temperature fit and Planck's law.
- **Where the visitor is** comes from their time zone: the zone names a city, whose latitude and longitude are close enough for the sky (`src/gpu/stars/place.ts`). Nothing is asked of the visitor; a page can pass a place it got from geolocation with `place: fixed`.
- **Where each star is** is worked out on the GPU every frame, in the vertex shader (`src/gpu/stars/sky.wgsl`): local sidereal time from the date (Meeus 12.4), the hour angle, altitude and azimuth, then a stereographic view, which keeps constellations their shape across a wide field. Positions from the GPU is what story 2.4 found a field this size needs: filling 9 000 positions from script each frame costs about a millisecond.
- **The sky and the ground**: a fullscreen pass looks along each pixel's direction (the inverse projection): below a skyline of low hills it is dark ground, above it the sky's glow, brightest along the horizon where the line of sight runs through the most air. Stars behind the hills are culled in the vertex shader by the same skyline.
- **The air** (story 2.8): a star near the horizon shines through up to 38 times as much air as one overhead. It is dimmed by that airmass (0.25 magnitudes per airmass, a clear site), and it twinkles harder and faster: each star's light follows its own band-limited flicker (Fire Temple's construction), whose depth grows with airmass (about 0.07 overhead, 0.4 at 10° up, capped at 0.85) and whose rate grows too, under the flicker's safe cap of four knots a second. A bright star low down flashes colours, each channel its own signal, as the air bends each colour differently.

The sky turns at `time-lapse` times real time (60× by default: a quarter of a degree a second). `dose` ("intensity") speeds the time-lapse and the twinkling together.

## Cost

One fullscreen pass, one instanced draw of up to 9 096 quads and the tail. The catalogue is 57.8 kB gzipped of the effect's own 92.9 kB with the shared chunks, nearly all of it the star data: more than every other effect's own code here put together. See [docs/studies/epic-2.md](../../../docs/studies/epic-2.md) and the Scorecard tab.

## Pitfalls

- **Precession is not negligible at page scale.** 26 years of it is 0.36°: four pixels in a 100° view at 1080 px, more than a star spot. It is applied once at load.
- **Ballesteros's temperature fit runs low for the hottest stars** (16 600 K at B−V = −0.3, where they reach 30 000 K). Their colour hardly changes up there.
- **The time zone is a guess.** A visitor in Denver on Chicago time gets Chicago's sky: the same stars, a few minutes early.
- **Atan2(0, 0) is NaN on Metal.** A star exactly at the zenith has no azimuth, so the shader gives it zero.

## Safety

Twinkling is flicker, so it is built from the capped flicker signal: no star can pass three flashes a second however low it sits, and the colour flashes are mixed in, not added. The time-lapse turns the sky at a quarter of a degree a second, far under the motion check's caps. Flash, pattern, motion and held-frame checks pass at the default and the strong dose (`npm test`).

## When to use it

"The sky above you tonight" on an astronomy, travel or outdoor page; a night hero that is true to the visitor's place. Where 58 kB is too much, a procedural sky (`deep-field`) turns just as well and is not anyone's real sky.

## References

- Dorrit Hoffleit and Wayne H. Warren Jr., _The Bright Star Catalogue_, 5th revised edition (Yale University Observatory, 1991), as distributed by the Harvard–Smithsonian Center for Astrophysics.
- Jean Meeus, _Astronomical Algorithms_ (1991): sidereal time (12.4), altitude and azimuth (13.5, 13.6), annual precession (21.1).
- F. J. Ballesteros, "New insights into black bodies", _EPL_ (2012), for temperature from B−V.
- Fritz Kasten and Andrew T. Young, "Revised optical air mass tables and approximation formula", _Applied Optics_ (1989).
- Star Temple [plan.md](../../../plan.md), stories 2.6 and 2.8.
