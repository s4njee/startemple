import { toHalfArray } from '../emission/half-float.ts';
import { fbm1 } from '../random.ts';

/*
 * A planet's rings (story 5.5): Saturn's, from its radial profile of optical depth, lit as a slab.
 *
 * The rings are a sheet of ice particles a few tens of metres thick and two hundred thousand km
 * wide, so they are a plane with an optical depth τ that depends only on the distance from the
 * planet. τ is what makes them: the B ring is nearly opaque (τ of 1 to 5), the C ring and the
 * Cassini Division thin (about 0.1), the A ring between, with the Encke gap cut out of it. The
 * D, F and G rings are faint and mostly dust: grains the size of the light's wavelength, which
 * scatter forwards.
 *
 * Lit as a slab of single-scattering particles (Chandrasekhar), with the sun's and the viewer's
 * cosines to the ring plane μ0 and μ, albedo ϖ and phase function P of the scattering angle:
 *
 *   seen from the lit side    ϖ P μ0 / (μ0 + μ) · (1 − exp(−τ (1/μ0 + 1/μ)))
 *   seen from the other side  ϖ P μ0 / (μ0 − μ) · (exp(−τ/μ0) − exp(−τ/μ))
 *
 * per unit of sunlight. Lit from behind, the dense B ring passes almost nothing and goes dark,
 * while the thin rings and the dust glow, the more so the nearer the sun: forward scattering,
 * the look of the Cassini images taken with the sun behind Saturn. The particles scatter a little
 * backwards (Henyey–Greenstein g = −0.3) and the dust strongly forwards (g = 0.7).
 *
 * The planet's shadow falls across the rings, and the rings' shadow across the planet: each is the
 * sun's ray from a point, tested against the other body. `rings.wgsl` does the same on the GPU from
 * a 1024-texel table of this profile (`ringTable`).
 */

/** The table's span, in planet radii: just inside the D ring to past the F ring. */
export const RING_INNER = 1.1;
export const RING_OUTER = 2.4;
export const RING_TEXELS = 1024;

interface Band {
  from: number;
  to: number;
  tau: number;
  /** Optical depth at the band's outer edge, when it ramps across. */
  tauOuter?: number;
  /** Share of the band's light from dust. */
  dust: number;
}

/** Saturn's rings in Saturn radii (60 268 km), after the Voyager and Cassini profiles, rounded. */
const BANDS: readonly Band[] = [
  { from: 1.11, to: 1.236, tau: 0.002, dust: 0.9 },
  { from: 1.239, to: 1.527, tau: 0.05, tauOuter: 0.15, dust: 0.1 },
  { from: 1.527, to: 1.63, tau: 1.0, tauOuter: 1.8, dust: 0.02 },
  { from: 1.63, to: 1.951, tau: 2.5, tauOuter: 1.8, dust: 0.01 },
  { from: 1.951, to: 2.026, tau: 0.09, dust: 0.25 },
  { from: 2.026, to: 2.269, tau: 0.5, tauOuter: 0.75, dust: 0.05 },
  { from: 2.318, to: 2.33, tau: 0.3, dust: 0.95 },
];

/** Gaps cut out of the bands: centre and half-width, planet radii. */
const GAPS = [
  { at: 1.9505, half: 0.0035 }, // Huygens
  { at: 2.214, half: 0.0027 }, // Encke
  { at: 2.2645, half: 0.0006 }, // Keeler
] as const;

export interface RingSample {
  tau: number;
  dust: number;
}

/** τ and the dust share at radius `r` (planet radii), with the fine ringlets of the real profile. */
export function ringProfile(r: number): RingSample {
  let tau = 0;
  let dust = 0;
  for (const band of BANDS) {
    if (r >= band.from && r < band.to) {
      const k = (r - band.from) / (band.to - band.from);
      tau = band.tau + ((band.tauOuter ?? band.tau) - band.tau) * k;
      dust = band.dust;
    }
  }
  for (const gap of GAPS) if (Math.abs(r - gap.at) < gap.half) tau *= 0.02;
  // Ringlets: irregular, at several scales, never a regular grating (the pattern rule).
  tau *= Math.max(0.15, 1 + 0.55 * fbm1(r * 180, 7, 5) + 0.25 * fbm1(r * 900, 11, 3));
  return { tau, dust };
}

/** The table `rings.wgsl` reads: (τ, dust share) at each texel. */
export function ringTable(): Float32Array {
  const out = new Float32Array(RING_TEXELS * 2);
  for (let i = 0; i < RING_TEXELS; i++) {
    // Each texel the mean of 8 samples across it, so the fine ringlets are filtered, not aliased.
    let tau = 0;
    let dust = 0;
    for (let k = 0; k < 8; k++) {
      const r = RING_INNER + ((i + (k + 0.5) / 8) / RING_TEXELS) * (RING_OUTER - RING_INNER);
      const s = ringProfile(r);
      tau += s.tau / 8;
      dust += s.dust / 8;
    }
    out[i * 2] = tau;
    out[i * 2 + 1] = dust;
  }
  return out;
}

/** The table as a 1024 × 1 rgba16float texture, filterable without `float32-filterable`. */
export function createRingTexture(device: GPUDevice, label = 'rings'): GPUTexture {
  const table = ringTable();
  const texels = new Float32Array(RING_TEXELS * 4);
  for (let i = 0; i < RING_TEXELS; i++) {
    texels[i * 4] = table[i * 2]!;
    texels[i * 4 + 1] = table[i * 2 + 1]!;
  }
  const texture = device.createTexture({
    label: `${label} table`,
    size: [RING_TEXELS, 1],
    format: 'rgba16float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture({ texture }, toHalfArray(texels), { bytesPerRow: RING_TEXELS * 8 }, [
    RING_TEXELS,
    1,
  ]);
  return texture;
}

/** Henyey–Greenstein, normalised over the sphere, of the scattering angle's cosine. */
export function henyeyGreenstein(c: number, g: number): number {
  return (1 - g * g) / (4 * Math.PI * (1 + g * g - 2 * g * c) ** 1.5);
}

/** The particles' phase function: mostly backwards for the ice, forwards for the dust. */
export function ringPhase(c: number, dust: number): number {
  return (1 - dust) * henyeyGreenstein(c, -0.3) + dust * henyeyGreenstein(c, 0.7);
}

/**
 * The slab's light towards the viewer per unit of sunlight. `muSun` and `muView` are the sun's
 * and the viewer's cosines to the ring plane's normal, signed: the same sign is the lit side.
 */
export function slabLight(
  tau: number,
  muSun: number,
  muView: number,
  albedo: number,
  phase: number,
): number {
  const m0 = Math.max(Math.abs(muSun), 1e-3);
  const m = Math.max(Math.abs(muView), 1e-3);
  if (muSun * muView > 0)
    return ((albedo * phase * m0) / (m0 + m)) * (1 - Math.exp(-tau * (1 / m0 + 1 / m)));
  if (Math.abs(m0 - m) < 1e-4) return ((albedo * phase * tau) / m) * Math.exp(-tau / m);
  return ((albedo * phase * m0) / (m0 - m)) * (Math.exp(-tau / m0) - Math.exp(-tau / m));
}

type V3 = readonly [number, number, number];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Whether the planet (unit sphere at the origin) hides the sun from a point on the rings. */
export function planetShadowsRing(point: V3, sun: V3): boolean {
  const b = dot(point, sun);
  const c = dot(point, point) - 1;
  return b < 0 && b * b - c > 0;
}

/** The sunlight reaching a point on the planet through the rings (plane normal `normal`). */
export function ringShadowOnPlanet(point: V3, sun: V3, normal: V3): number {
  const along = dot(sun, normal);
  if (Math.abs(along) < 1e-6) return 1;
  const t = -dot(point, normal) / along;
  if (t <= 0) return 1;
  const hit: V3 = [point[0] + sun[0] * t, point[1] + sun[1] * t, point[2] + sun[2] * t];
  const r = Math.hypot(...hit);
  if (r < RING_INNER || r > RING_OUTER) return 1;
  return Math.exp(-ringProfile(r).tau / Math.abs(along));
}
