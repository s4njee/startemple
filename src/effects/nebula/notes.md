## How it works

An emission nebula in three layers, far to near, each baked once into a texture a little larger than the view (it does not change) and moved by its own share of the parallax: 0.06, 0.16 and 0.4 of it.

- **The colour is the gas's emission lines** (story 3.1, `src/gpu/nebula/lines.ts`). Hydrogen fills the gas: Hα, and a third as much Hβ. Oxygen III glows where the gas is densest and hottest, close to the stars that ionise it, and takes over from the hydrogen there; sulphur II glows at the edges, where ionised gas meets neutral. `palette` shows the lines as the eye sees them (each wavelength's colour from the CIE colour-matching functions, brought into sRGB at its own hue), in the Hubble palette (S II red, Hα green, O III blue) or in the two-line HOO palette. The false-colour palettes weight the faint lines up and hydrogen down, as the published images stretch each line to fill its channel; without that, a Hubble-palette nebula is green.
- **Dust** is a separate warped field with a ridged one for sharp-edged pillars. It absorbs: each layer is drawn over what is behind it as behind × transmittance + light. The near layer is mostly dust, dark lanes against the glow.
- **Stars sit between the layers**: 5 000 from the sky's statistics (3 000 at the default), a share in front of each layer, so the dust of every layer nearer than a star dims it.

The parallax is deep-field's: a slow drift, the pointer (eased) and the page's scroll. `dose` ("intensity") sets the stars and the drift.

## Cost

A sky pass, three composites and three star layers (the three bakes only after a resize or a change of settings). 0.3 ms a frame on Dawn; 1.2 ms in Chrome with the machine under load. Tier A. See [docs/studies/epic-3.md](../../../docs/studies/epic-3.md).

## Pitfalls

- **fbm_2d spreads only about ±0.2.** Its standard deviation is 0.18, so thresholds must sit inside that range; the first version's mask (−0.2 to 0.4) put gas over the whole sky.
- **One uniform buffer per layer.** A buffer written between passes of one command buffer reaches every pass with its last value.
- **Natural colour is mostly red.** S II and Hα are both deep red to the eye; only oxygen's teal varies it.

## Safety

Nothing flashes; the drift is far under the motion caps. Checks pass at the default and the strong dose.

## When to use it

A hero background with depth, for science, astronomy or launch pages. `deep-field` is the lighter one-layer version; `nebula-volume` the real volume.

## References

- Hubble Heritage, "The Hubble palette", for the false-colour mapping.
- Star Temple [plan.md](../../../plan.md), stories 3.1 and 3.2.
