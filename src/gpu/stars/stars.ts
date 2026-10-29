import { blackbodyFromXyz, blackbodyXyz, type Rgb } from '../emission/blackbody-lut.ts';
import { createRandom } from '../random.ts';

/*
 * What a star is to this family (story 2.1): a point with a temperature and a magnitude. This file
 * holds the statistics and the colour; src/gpu/stars/spot.ts draws them.
 *
 *   const stars = makeStars({ count: 2000, seed: 7 });     // positions, temperature, magnitude
 *   const light = starLight(stars.magnitude[i], stars.colour(i));
 *
 * Brightness. A magnitude m is a light 10^(-0.4 m): five magnitudes fainter is a hundred times
 * less light. The night sky holds about three times as many stars in each magnitude as in the one
 * brighter (`MAGNITUDE_SLOPE`, the log10 of that ratio), so a field drawn from the distribution
 * is a great many faint stars and very few bright ones, as it is overhead.
 *
 * Colour. A star's colour is its temperature, through Planck's law and the eye's colour matching
 * (Fire Temple's reference, src/gpu/emission/blackbody-lut.ts), worked out here on the CPU once
 * per star, not through the shader's polynomial fit, which stops at 12 000 K: hot stars reach
 * 40 000 K, and the colour still moves towards blue all the way. The eye sees starlight at night
 * with little colour, so the colour is mixed towards white by `saturation` at the same luminance.
 */

/** log10 of how many more stars each magnitude holds than the one brighter (about 3 times). */
export const MAGNITUDE_SLOPE = 0.48;
/** The faintest star the naked eye sees on a dark night. */
export const NAKED_EYE_LIMIT = 6.5;

/** The share of naked-eye stars in each temperature band, kelvin: hot B stars to cool M giants. */
const TEMPERATURE_BANDS: readonly { from: number; to: number; share: number }[] = [
  { from: 10_000, to: 30_000, share: 0.1 },
  { from: 7_500, to: 10_000, share: 0.22 },
  { from: 6_000, to: 7_500, share: 0.19 },
  { from: 5_200, to: 6_000, share: 0.14 },
  { from: 3_700, to: 5_200, share: 0.31 },
  { from: 2_400, to: 3_700, share: 0.04 },
];

/** Light of magnitude `m`, relative to a star of magnitude `reference`. */
export function magnitudeLight(m: number, reference = 0): number {
  return 10 ** (-0.4 * (m - reference));
}

/**
 * A magnitude drawn from the sky's distribution, dN/dm ∝ 10^(slope m), between `brightest` and
 * `faintest`, from a uniform number `u` in [0, 1): the inverse of its cumulative distribution.
 */
export function sampleMagnitude(
  u: number,
  brightest: number,
  faintest: number,
  slope = MAGNITUDE_SLOPE,
): number {
  const k = slope * Math.LN10;
  const lo = Math.exp(k * brightest);
  const hi = Math.exp(k * faintest);
  return Math.log(lo + u * (hi - lo)) / k;
}

/** A temperature drawn from the naked-eye mix of star types, from a uniform number `u`. */
export function sampleTemperature(u: number, v: number): number {
  let left = u;
  for (const band of TEMPERATURE_BANDS) {
    if (left < band.share) {
      // Even steps in 1/t inside a band, which is how colour changes with temperature.
      const a = 1 / band.from;
      const b = 1 / band.to;
      return 1 / (a + v * (b - a));
    }
    left -= band.share;
  }
  return 5_800;
}

/** A star's colour at luminance 1: Planck's law at `t` kelvin, mixed towards white by `saturation`. */
export function starColour(t: number, saturation = 1): Rgb {
  const c = blackbodyFromXyz(blackbodyXyz(t));
  // Mixing towards (1, 1, 1), whose luminance is 1 too, keeps the luminance at 1.
  return [1 + saturation * (c[0] - 1), 1 + saturation * (c[1] - 1), 1 + saturation * (c[2] - 1)];
}

export interface StarOptions {
  count: number;
  seed: number;
  /** The brightest and faintest magnitudes drawn. Default -1 to the naked-eye limit. */
  brightest?: number;
  faintest?: number;
  slope?: number;
}

export interface Stars {
  count: number;
  /** Position in [0, 1)², a third coordinate in [0, 1) for depth or layer, per star. */
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  magnitude: Float32Array;
  temperature: Float32Array;
}

/**
 * A field of stars from the sky's statistics. Positions are uniform in the unit square, never at
 * grid-cell centres (Snow Temple found stars on a lattice read as a pattern).
 */
export function makeStars(options: StarOptions): Stars {
  const { count, seed } = options;
  const brightest = options.brightest ?? -1;
  const faintest = options.faintest ?? NAKED_EYE_LIMIT;
  const random = createRandom(seed);
  const stars: Stars = {
    count,
    x: new Float32Array(count),
    y: new Float32Array(count),
    z: new Float32Array(count),
    magnitude: new Float32Array(count),
    temperature: new Float32Array(count),
  };
  for (let i = 0; i < count; i++) {
    stars.x[i] = random();
    stars.y[i] = random();
    stars.z[i] = random();
    stars.magnitude[i] = sampleMagnitude(random(), brightest, faintest, options.slope);
    stars.temperature[i] = sampleTemperature(random(), random());
  }
  return stars;
}

/** Each star's colour at luminance 1 (`starColour`), three floats a star. */
export function starColours(stars: Stars, saturation = 1): Float32Array {
  const out = new Float32Array(stars.count * 3);
  // Planck's integral is 80 samples: memoise by temperature rounded to 10 K, which is invisible.
  const cache = new Map<number, Rgb>();
  for (let i = 0; i < stars.count; i++) {
    const t = Math.round(stars.temperature[i]! / 10) * 10;
    let c = cache.get(t);
    if (!c) {
      c = starColour(t, saturation);
      cache.set(t, c);
    }
    out.set(c, i * 3);
  }
  return out;
}
