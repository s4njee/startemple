## How it works

A total solar eclipse, on the sky in solar radii. The Moon's disc, 4% larger than the Sun's, slides across it, slowing near mid-eclipse so totality lasts about a fifth of the run.

- **Everything at its real brightness.** The photosphere is 1 at the disc's centre, limb-darkened (6.1); the K corona is Baumbach's profile, 0.0532 r^−2.5 + 1.425 r^−7 + 2.565 r^−17 millionths of it, shaped into helmet streamers along the equator at solar minimum and all round at maximum, with fine rays and polar plumes; the chromosphere and the prominences are pink, Hα with a fifth as much Hβ and a little helium D3 (6.2, `corona.wgsl`).
- **An eye's exposure.** All of it is multiplied by an exposure that the CPU eases towards the inverse of the uncovered photosphere (the circles' lens area), in log steps: the eye opens slowly in the dark (1.2 s) and closes fast in the light (0.3 s). So the corona comes out as totality begins, as it does.
- **Baily's beads and the diamond ring.** The Moon's limb is not a circle: mountains and valleys along it, three times their real depth so they read at page scale, let the last of the photosphere through in beads at second and third contact. A bead at an exposure still set for totality is a hundred thousand times brighter than the corona; clamped to what half-float holds and spread by the bloom, it is the diamond ring.
- **A countdown.** Stats give the phase and the seconds to second contact. `run the eclipse` off holds the eclipse at `progress`, for a page that drives it from its own clock.

## Cost

0.5 ms a frame at 1920 × 1080 on Dawn in the partial phases, 1.4 in totality, when the corona and prominences are drawn; 1.2 in Chrome. Tier A. Before early-outs it was 2.3 everywhere: the prominences' noise was evaluated over the whole frame, and the corona while the exposure made it black. See the Scorecard tab and [docs/studies/epic-6.md](../../../docs/studies/epic-6.md).

## Pitfalls

- **The corona does not fit in half-float beside the photosphere.** A millionth of 1 is below its normal range; the exposure is applied in the shader, before the value is stored.
- **A held frame must not be the diamond ring.** Held while running, the eclipse shows mid-totality; held at a set progress, what that progress shows, at its own settled exposure, which is never the ring.
- **The analytic cover hides the beads.** The exposure follows the circles' lens area, which is 0 through the beads; that is exactly why they flare.

## Safety

Flash `low`. The diamond ring is a flash, and is checked as one: one bright swing as third contact passes, then the exposure closes over a third of a second; at most one in any second, and one a run. Red flash: the prominences are small and come up with the exposure, slowly. Every preset passes (`npm test`).

## When to use it

A launch countdown to a date; a hero for an eclipse or astronomy page. Where WebGPU is missing, a still of totality.

## References

- C. Baumbach, "Strahlung, Ergiebigkeit und Elektronendichte der Sonnenkorona", _Astronomische Nachrichten_ (1937).
- Francis Baily, "On a remarkable phenomenon that occurs in total and annular eclipses of the sun", _Memoirs of the Royal Astronomical Society_ (1836).
- Star Temple [plan.md](../../../plan.md), stories 6.2 and 6.3.
