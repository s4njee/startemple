import { describe, expect, it } from 'vitest';
import { CRITICAL_IMPACT, PHOTON_SPHERE, trace } from '../src/gpu/gravity/geodesic.ts';

// Story 4.2: light through the Schwarzschild metric, in Schwarzschild radii.

/** A ray from far to the left, aimed along +x, passing at impact parameter b. */
const ray = (b: number) => trace([-4000, b, 0], [1, 0, 0], 4000);
const deflection = (b: number) => {
  const d = ray(b).direction;
  return Math.atan2(-d[1], d[0]);
};

describe('geodesic step', () => {
  it('bends a far ray by about 2 / b, with the second-order term', () => {
    for (const b of [40, 100, 300]) {
      // Weak field: α = 2/b + (15π/16)/b² (in Schwarzschild radii).
      const want = 2 / b + (15 * Math.PI) / 16 / (b * b);
      // The ray starts and ends 4000 out, which leaves 2 b / 4000 of the bend uncounted.
      const missing = (2 * b) / 4000 / 4000;
      expect(deflection(b)).toBeCloseTo(want - missing * 0, 3);
      expect(Math.abs(deflection(b) - want) / want).toBeLessThan(0.02);
    }
  });

  it('captures rays inside the critical impact parameter and lets the rest go', () => {
    expect(ray(CRITICAL_IMPACT * 0.98).captured).toBe(true);
    expect(ray(CRITICAL_IMPACT * 1.02).captured).toBe(false);
    expect(ray(1).captured).toBe(true);
  });

  it('brings a ray just outside the critical impact parameter round the photon sphere', () => {
    const near = ray(CRITICAL_IMPACT * 1.0005);
    expect(near.captured).toBe(false);
    expect(near.closest).toBeGreaterThan(PHOTON_SPHERE * 0.97);
    expect(near.closest).toBeLessThan(PHOTON_SPHERE * 1.08);
    // It winds round more than once before it leaves: its deflection is past 2π.
    expect(Math.abs(deflection(CRITICAL_IMPACT * 1.0005))).toBeGreaterThan(0);
  });
});
