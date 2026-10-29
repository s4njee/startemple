/*
 * Light near a black hole (story 4.2): rays through the Schwarzschild metric, in the compact
 * Cartesian form of Riccardo Antonelli's "Starless". In units where the Schwarzschild radius is 1,
 * a photon at x moving along the unit direction v bends as if pulled by
 *
 *   a = −1.5 h² x / |x|⁵,   h = |x × v|  (its angular momentum, which the orbit keeps)
 *
 * which reproduces the null geodesics' paths exactly (it is the orbit equation of a photon,
 * d²u/dφ² + u = 1.5 u² for u = 1/r, written in Cartesian coordinates). Integrated by fourth-order
 * Runge–Kutta with a step that shrinks near the hole.
 *
 * Landmarks, in Schwarzschild radii: the horizon at 1; the photon sphere at 1.5, where light can
 * circle the hole; the critical impact parameter (3√3/2 ≈ 2.598), below which a ray falls in; the
 * innermost stable circular orbit of matter at 3, where an accretion disc's inner edge sits. A far
 * ray passing at impact parameter b is deflected by about 2 / b radians.
 *
 * The TypeScript twin of src/gpu/gravity/geodesic.wgsl; tests/geodesic.test.ts holds both to the
 * deflection, the capture threshold and the photon sphere.
 */

export type Vec3 = [number, number, number];

export const PHOTON_SPHERE = 1.5;
export const CRITICAL_IMPACT = (3 * Math.sqrt(3)) / 2;
export const ISCO = 3;

const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const length = (a: Vec3) => Math.sqrt(dot(a, a));

/** The bending acceleration at x for a ray of squared angular momentum h2. */
export function bend(x: Vec3, h2: number): Vec3 {
  const r2 = dot(x, x);
  const r5 = r2 * r2 * Math.sqrt(r2);
  const k = (-1.5 * h2) / r5;
  return [k * x[0], k * x[1], k * x[2]];
}

/** One fourth-order Runge–Kutta update: y + ds (k1 + 2 k2 + 2 k3 + k4) / 6. */
function rk4(y: Vec3, k1: Vec3, k2: Vec3, k3: Vec3, k4: Vec3, ds: number): Vec3 {
  return [0, 1, 2].map(
    (i) => y[i]! + (ds / 6) * (k1[i]! + 2 * k2[i]! + 2 * k3[i]! + k4[i]!),
  ) as Vec3;
}

/** The step length at radius r: small near the hole, larger far out. */
export function stepLength(r: number, scale = 0.08, max = 2): number {
  return Math.min(max, Math.max(0.005, scale * (r - 0.9)));
}

export interface Trace {
  /** Fell through the horizon. */
  captured: boolean;
  /** The direction it left along, when it escaped. */
  direction: Vec3;
  /** The closest it came to the centre. */
  closest: number;
  steps: number;
}

/** Follows a ray from `origin` along unit `dir` until it falls in or passes `escape`. */
export function trace(origin: Vec3, dir: Vec3, escape = 2000, maxSteps = 20_000): Trace {
  let x = origin;
  let v = dir;
  const h2 = dot(cross(x, v), cross(x, v));
  let closest = length(x);
  let steps = 0;
  for (; steps < maxSteps; steps++) {
    const r = length(x);
    closest = Math.min(closest, r);
    if (r < 1) return { captured: true, direction: v, closest, steps };
    if (r > escape && dot(x, v) > 0) break;
    const ds = stepLength(r);
    // Fourth-order Runge–Kutta on (x, v).
    const k1x = v;
    const k1v = bend(x, h2);
    const k2x = add(v, k1v, ds / 2);
    const k2v = bend(add(x, k1x, ds / 2), h2);
    const k3x = add(v, k2v, ds / 2);
    const k3v = bend(add(x, k2x, ds / 2), h2);
    const k4x = add(v, k3v, ds);
    const k4v = bend(add(x, k3x, ds), h2);
    x = rk4(x, k1x, k2x, k3x, k4x, ds);
    v = rk4(v, k1v, k2v, k3v, k4v, ds);
  }
  const l = length(v);
  return { captured: false, direction: [v[0] / l, v[1] / l, v[2] / l], closest, steps };
}
