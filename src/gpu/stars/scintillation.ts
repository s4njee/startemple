import { FLICKER_SAFE_MAX_RATE, type FlickerSettings } from '../flicker.ts';
import { airmass } from './sky.ts';

/*
 * Twinkling as the atmosphere does it (story 2.8). A star twinkles because pockets of air of
 * slightly different temperature bend its light one way and another as the wind carries them across
 * the line of sight; the longer that line runs through the air, the more pockets it crosses. So
 * scintillation grows with airmass: overhead a star barely flickers, near the horizon it swings
 * hard and, if it is bright, flashes colours, since the air bends each colour differently.
 * Planets, which are discs and not points, hardly twinkle at all (7.6).
 *
 * The signal is Fire Temple's band-limited flicker (src/gpu/flicker.ts), so no star can pass
 * three flashes a second however low it sits, and the rate is held under the flicker's safe cap.
 * The TypeScript twin of `scintillation_settings` in src/gpu/stars/sky.wgsl.
 */

/** The deepest swing, near the horizon at full strength: the flicker's depth, short of clipping. */
export const SCINTILLATION_MAX_DEPTH = 0.85;
/** Depth per airmass, before the cap: about 0.07 overhead, 0.4 at 10° up. */
export const SCINTILLATION_DEPTH_PER_AIRMASS = 0.07;

/**
 * The flicker settings for a star at altitude `alt` (radians): `strength` scales the depth (0 none,
 * 1 a clear night with some wind), `wind` the rate (1 a breeze).
 */
export function scintillationSettings(
  alt: number,
  strength: number,
  wind: number,
): FlickerSettings {
  const x = airmass(alt);
  const depth = Math.min(SCINTILLATION_MAX_DEPTH, strength * SCINTILLATION_DEPTH_PER_AIRMASS * x);
  // Low stars twinkle faster as well as harder: more pockets cross the longer line of sight.
  const rate = Math.min(FLICKER_SAFE_MAX_RATE, wind * (1.2 + 0.12 * x));
  return { rate, depth, shimmer: depth > 0 ? Math.min(0.03, depth * 0.1) : 0, shimmerRate: 14 };
}

/** The mean of a flicker signal with these settings, to divide by so a star's average light holds. */
export function flickerMean(settings: Readonly<FlickerSettings>): number {
  return 1 - (settings.depth + settings.shimmer) / 2;
}
