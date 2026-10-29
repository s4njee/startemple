/*
 * Where a star is in the visitor's sky (story 2.6): sidereal time, the hour angle, altitude and
 * azimuth, and the stereographic view the shaders draw it in. The TypeScript twin of
 * src/gpu/stars/sky.wgsl, which does the same per star in the vertex shader; tests/sky.test.ts
 * holds the two together and checks both against Meeus's worked examples.
 *
 * Conventions: angles in radians; azimuth measured from north through east; the observer's
 * longitude positive east. Refraction (about half a degree at the horizon) is left out.
 */

/** Julian date of a moment. */
export function julianDate(date: Date): number {
  return date.getTime() / 86_400_000 + 2_440_587.5;
}

/**
 * Greenwich mean sidereal time, radians: Meeus, _Astronomical Algorithms_, 12.4. Good to well
 * under a second of time for centuries round 2000.
 */
export function greenwichSiderealTime(jd: number): number {
  const d = jd - 2_451_545;
  const t = d / 36_525;
  const degrees =
    280.46061837 + 360.98564736629 * d + 0.000387933 * t * t - (t * t * t) / 38_710_000;
  return ((((degrees % 360) + 360) % 360) * Math.PI) / 180;
}

/** Local sidereal time at `longitude` (radians, east positive). */
export function localSiderealTime(jd: number, longitude: number): number {
  const lst = greenwichSiderealTime(jd) + longitude;
  return ((lst % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}

/** Altitude and azimuth (from north, through east) of a star at `ra`, `dec`. */
export function altAz(
  ra: number,
  dec: number,
  lst: number,
  latitude: number,
): { alt: number; az: number } {
  const h = lst - ra;
  const sinAlt =
    Math.sin(latitude) * Math.sin(dec) + Math.cos(latitude) * Math.cos(dec) * Math.cos(h);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  // Azimuth from north, through east: Meeus 13.5 measures from south, so turn by π.
  const y = Math.sin(h);
  const x = Math.cos(h) * Math.sin(latitude) - Math.tan(dec) * Math.cos(latitude);
  const az = (Math.atan2(y, x) + Math.PI + 2 * Math.PI) % (2 * Math.PI);
  return { alt, az };
}

/** A unit vector for an altitude and azimuth: x east, y north, z up. */
export function horizonVector(alt: number, az: number): [number, number, number] {
  return [Math.cos(alt) * Math.sin(az), Math.cos(alt) * Math.cos(az), Math.sin(alt)];
}

export interface View {
  /** Where the view looks: altitude and azimuth of its centre. */
  alt: number;
  az: number;
  /** Field of view across the frame's height, radians. */
  fov: number;
  /** Frame size, pixels. */
  width: number;
  height: number;
}

/**
 * A direction's place in a stereographic view, pixels from the top left, or undefined behind the
 * viewer. Stereographic keeps shapes (constellations look right) out to wide fields, where a
 * pinhole view would stretch them.
 */
export function project(dir: readonly number[], view: View): [number, number] | undefined {
  const forward = horizonVector(view.alt, view.az);
  // Right is the horizon direction 90° clockwise from the view's azimuth; up completes the frame.
  const right = [Math.cos(view.az), -Math.sin(view.az), 0];
  const up = [
    right[1]! * forward[2] - right[2]! * forward[1],
    right[2]! * forward[0] - right[0]! * forward[2],
    right[0]! * forward[1] - right[1]! * forward[0],
  ];
  const dot = (a: readonly number[], b: readonly number[]) =>
    a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  const z = dot(dir, forward);
  if (z <= -0.999) return undefined;
  // Stereographic: a point at angle θ from the centre lands at 2 tan(θ / 2), scaled so the frame's
  // half-height is fov / 2.
  const k = 2 / (1 + z);
  const scale = view.height / 2 / (2 * Math.tan(view.fov / 4));
  return [view.width / 2 + dot(dir, right) * k * scale, view.height / 2 - dot(dir, up) * k * scale];
}

/** Airmass at altitude `alt` (Kasten and Young 1989): 1 overhead, about 38 at the horizon. */
export function airmass(alt: number): number {
  const degrees = (Math.max(alt, 0) * 180) / Math.PI;
  return 1 / (Math.sin(Math.max(alt, 0)) + 0.50572 * (degrees + 6.07995) ** -1.6364);
}
