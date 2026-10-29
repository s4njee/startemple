import { gamutMapOklch, linearToOklch, oklchToLinear, type Vec3 } from '../colour/oklab.ts';
import { blackbodyCmf, type Rgb } from '../emission/blackbody-lut.ts';

/*
 * Nebula colour by emission line (story 3.1). An emission nebula does not glow in every colour: its
 * gas is ionised by hot stars and shines in a few sharp lines, chief among them
 *
 *   sulphur II      672 nm   deep red
 *   hydrogen-alpha  656 nm   deep red (Hα, by far the brightest)
 *   oxygen III      501 nm   teal
 *   hydrogen-beta   486 nm   blue-green (Hβ, about a third of Hα)
 *
 * so the colour of a nebula is the mix of those lines. Two ways to show them:
 *
 *   natural   each line in the colour the eye sees it, from the CIE 1931 colour-matching functions
 *             at its wavelength (Fire Temple's fit, src/gpu/emission/blackbody-lut.ts). A single
 *             wavelength is purer than any screen can show, so each is mapped into the sRGB gamut
 *             in OKLCH, keeping its hue. S II and Hα come out nearly the same red: to the eye, a
 *             nebula is red and teal.
 *   hubble    the false-colour palette of the Hubble images: S II to red, Hα to green, O III to
 *             blue, so lines the eye cannot tell apart get a primary each and the gas's chemistry
 *             shows.
 *   hoo       the common two-colour palette: Hα to red, O III to teal, as many observatories use
 *             when they image those two lines alone.
 *
 * Every palette gives each line a linear colour at luminance about 1, for a shader to weight by
 * the line's strength. `tests/lines.test.ts` checks the natural colours against their hues.
 */

export const LINES = {
  sulphur: 672.4,
  hydrogenAlpha: 656.3,
  oxygen: 500.7,
  hydrogenBeta: 486.1,
} as const;

export type Line = keyof typeof LINES;
export type LinePalette = 'natural' | 'hubble' | 'hoo';
export const LINE_PALETTES: readonly LinePalette[] = ['natural', 'hubble', 'hoo'];

/** The colour of light at one wavelength as the eye sees it, at luminance 1, inside sRGB. */
export function wavelengthColour(nm: number): Rgb {
  const [x, y, z] = blackbodyCmf(nm);
  // XYZ to linear Rec.709, unclipped: a single wavelength lies outside the gamut, with a channel
  // below zero. Clipping that channel would move the hue (620 nm would come out the same pure red
  // as 680 nm); instead the colour is set to a mid lightness and brought into the gamut in OKLCH
  // by reducing its chroma at its own hue.
  const raw: Vec3 = [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ];
  const lch = linearToOklch(raw);
  const mapped = oklchToLinear(gamutMapOklch([0.62, lch[1], lch[2]]));
  const lum = 0.2126 * mapped[0] + 0.7152 * mapped[1] + 0.0722 * mapped[2];
  return mapped.map((v) => Math.max(0, v) / lum) as Rgb;
}

/** Each line's colour in a palette, linear, luminance about 1. */
export function lineColours(palette: LinePalette): Record<Line, Rgb> {
  if (palette === 'hubble') {
    return {
      sulphur: [1, 0.12, 0.04],
      hydrogenAlpha: [0.15, 1, 0.2],
      oxygen: [0.1, 0.35, 1],
      // Hβ is hydrogen too: it goes where Hα goes.
      hydrogenBeta: [0.15, 1, 0.2],
    };
  }
  if (palette === 'hoo') {
    return {
      sulphur: [1, 0.08, 0.06],
      hydrogenAlpha: [1, 0.08, 0.06],
      oxygen: [0.05, 0.75, 0.85],
      hydrogenBeta: [0.05, 0.75, 0.85],
    };
  }
  return {
    sulphur: wavelengthColour(LINES.sulphur),
    hydrogenAlpha: wavelengthColour(LINES.hydrogenAlpha),
    oxygen: wavelengthColour(LINES.oxygen),
    hydrogenBeta: wavelengthColour(LINES.hydrogenBeta),
  };
}

/**
 * The lines' strengths a palette shows. Natural colour is the gas's own (LINE_STRENGTH). The
 * false-colour images stretch each line's image to fill its own channel, which is what makes them
 * colourful at all: Hα, many times brighter than the rest, would otherwise turn a Hubble-palette
 * picture green. So they weight the faint lines up and hydrogen down.
 */
export function paletteStrength(palette: LinePalette): Record<Line, number> {
  if (palette === 'hubble')
    return { sulphur: 1.4, hydrogenAlpha: 0.4, oxygen: 1.5, hydrogenBeta: 0 };
  if (palette === 'hoo') return { sulphur: 0.5, hydrogenAlpha: 0.8, oxygen: 1.4, hydrogenBeta: 0 };
  return LINE_STRENGTH;
}

/**
 * Relative strengths of the lines in a typical H II region: Hα the brightest, Hβ a third of it
 * (the Balmer decrement), O III and S II depending on how hot and how dense the gas is.
 */
export const LINE_STRENGTH: Record<Line, number> = {
  sulphur: 0.25,
  hydrogenAlpha: 1,
  oxygen: 0.6,
  hydrogenBeta: 0.35,
};
