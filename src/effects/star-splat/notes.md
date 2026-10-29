## How it works

The scene lays out what a star is to this family, in three rows over a field:

- **Top row: temperature.** Ten stars of the same light from 2 400 K to 40 000 K, orange through white to blue. Each colour is Planck's law integrated against the eye's colour-matching functions (Fire Temple's reference, `src/gpu/emission/blackbody-lut.ts`), worked out on the CPU once per star at luminance 1. The shader's polynomial fit stops at 12 000 K, so it is not used here.
- **Middle row: magnitude.** Seven stars of the Sun's colour at magnitudes 0 to 6. A magnitude is a light 10^(−0.4 m), so the last is 250 times dimmer than the first, and hard to see: that is how dim a sixth-magnitude star is.
- **Bottom row: spikes.** One bright star (Vega's 9 600 K) with no spikes, with Hubble's four (its secondary mirror's four support vanes) and with JWST's six plus two (its hexagonal mirror segments, and the vertical strut that adds the short horizontal pair). The spikes are Moon Temple's analytic glare (`src/gpu/glare/`), each ray a Gaussian cross-section with an exponential fall that carries exactly its share of the star's light.
- **The field.** 2 400 stars from the sky's own statistics (`src/gpu/stars/stars.ts`): magnitudes drawn so each holds about three times as many stars as the one brighter, and temperatures in the mix of naked-eye stars, from hot B stars to cool M giants. It drifts slowly to the left.

Every star is a spot (`src/gpu/stars/spot.ts`): a Gaussian integrated over each pixel's square, from the error function, so the light a star adds is its own wherever it sits between pixels, and its brightest pixel changes smoothly as it moves. σ = 0.8 device pixels by default, from the shimmer study ([docs/studies/shimmer.md](../../../docs/studies/shimmer.md)): the narrowest spot whose shown light changes by under 2.5% with its position, at any brightness. A bright star gives `halo share` of its light to a second Gaussian six times wider, the soft glow round a bright star in a photograph, instead of a full-screen bloom.

`spot: disc` draws the same stars through Moon Temple's point layer instead, as an exact-area disc of radius 1.25 σ, which is as sharp. Both conserve the light; the disc shimmers more once a star is bright.

`colour` mixes each star's colour towards white at the same luminance. At night the eye sees little colour in starlight, so the default is 0.7; `full colour` is what a long-exposure photograph shows.

`dose` ("intensity") sets how many of the field's stars show and how fast they drift.

## Cost

About 2 500 instanced quads a frame, filled from the CPU, plus a thin quad per spike. See the Scorecard tab and [docs/studies/epic-2.md](../../../docs/studies/epic-2.md).

## Pitfalls

- **Conserving the light is not enough.** A spot narrower than σ = 0.5 keeps its linear light but its shown light still swings by tens of per cent when bright, because its peak clips or bends in the tonemap (docs/studies/shimmer.md).
- **A spot's offset must come from the pixel's own position.** An offset interpolated across the quad is off by about a thousandth of a pixel, which a narrow spot's steep tail turns into a 1% error. The shader takes `@builtin(position)` minus the star's centre.
- **Subtract in the tail with erfc.** A pixel's share is a difference of two error functions. Off the centre both are near 1 and the difference cancels away in f32; the complementary function keeps the faint tail.
- **One glare layer per set of spikes.** A layer's lights and settings, written between passes of one command buffer, all arrive with the last values (Moon Temple's finding), so the field's spikes and each row's have their own layer.
- **Hot stars need the reference, not the fit.** Fire Temple's fit was made for flames and clamps at 12 000 K.

## Safety

No flashes: stars in space do not twinkle, and the field drifts well under the motion check's drift cap. Flash, pattern, motion and held-frame checks pass at the default and the strong dose (`npm test`).

## When to use it

As the reference for how this family draws a star, and to choose a spot width or spike look. For a background, `deep-field`.

## References

- Mitchell Charity, "What color are the stars?", for blackbody colours as the eye sees them.
- Chris Wyman, Peter-Pike Sloan and Peter Shirley, "Simple analytic approximations to the CIE XYZ color matching functions", _JCGT_ (2013).
- Milton Abramowitz and Irene Stegun, _Handbook of Mathematical Functions_ (1964), 7.1.26, for the error function.
- Star Temple [plan.md](../../../plan.md), stories 2.1 and 2.3.
