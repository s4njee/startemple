import { wavelengthColour } from '../nebula/lines.ts';

/*
 * The Sun (stories 6.1 and 6.2): the CPU twin of sun.wgsl and corona.wgsl, for the tests, and the
 * colour of a prominence.
 */

export const SUN_TEFF = 5772;
const C2_555 = 25924;

/** The Eddington-Barbier temperature at cosine `mu` from the disc's centre: `sun_temperature`. */
export function sunTemperature(mu: number): number {
  return SUN_TEFF * (0.75 * (Math.max(mu, 0) + 2 / 3)) ** 0.25;
}

/** The light at 555 nm at cosine `mu`, over the centre's: the limb-darkening profile. */
export function limbDarkening(mu: number, c2 = C2_555): number {
  const planck = (t: number) => 1 / (Math.exp(c2 / t) - 1);
  return planck(sunTemperature(mu)) / planck(sunTemperature(1));
}

/** The K corona's brightness at `r` solar radii, in millionths of the disc's centre (Baumbach). */
export function baumbach(r: number): number {
  return 0.0532 * r ** -2.5 + 1.425 * r ** -7 + 2.565 * r ** -17;
}

/**
 * A prominence's colour at luminance 1: the hydrogen Balmer lines it glows in, Hα with Hβ at about
 * a fifth of its light and helium's D3 a little, which together are the pink of eclipse photographs.
 */
export function prominenceColour(): [number, number, number] {
  const alpha = wavelengthColour(656.3);
  const beta = wavelengthColour(486.1);
  const d3 = wavelengthColour(587.6);
  const mix = alpha.map((a, i) => a + 0.2 * beta[i]! + 0.08 * d3[i]!) as [number, number, number];
  const l = 0.2126 * mix[0] + 0.7152 * mix[1] + 0.0722 * mix[2];
  return mix.map((c) => c / l) as [number, number, number];
}

/**
 * The share of the Sun's disc a Moon covers: two circles of radii `sun` and `moon`, centres `d`
 * apart, the standard lens area. (The Moon's uneven limb changes it by a few parts in a thousand,
 * which is the whole of Baily's beads, but not the light the eye adapts to.)
 */
export function coveredFraction(sun: number, moon: number, d: number): number {
  if (d >= sun + moon) return 0;
  if (d <= moon - sun) return 1;
  if (d <= sun - moon) return (moon * moon) / (sun * sun);
  const a = Math.acos((d * d + sun * sun - moon * moon) / (2 * d * sun));
  const b = Math.acos((d * d + moon * moon - sun * sun) / (2 * d * moon));
  const lens =
    sun * sun * a +
    moon * moon * b -
    0.5 * Math.sqrt((-d + sun + moon) * (d + sun - moon) * (d - sun + moon) * (d + sun + moon));
  return lens / (Math.PI * sun * sun);
}
