import { describe, expect, it } from 'vitest';
import {
  henyeyGreenstein,
  planetShadowsRing,
  ringPhase,
  ringProfile,
  ringShadowOnPlanet,
  ringTable,
  RING_TEXELS,
  slabLight,
} from '../src/gpu/world/rings.ts';

// Story 5.5: the rings' profile, their light as a slab, and the two shadows.

describe('rings', () => {
  it('has the B ring dense, the Cassini Division and the Encke gap thin', () => {
    expect(ringProfile(1.75).tau).toBeGreaterThan(1);
    expect(ringProfile(1.99).tau).toBeLessThan(0.3);
    expect(ringProfile(2.214).tau).toBeLessThan(0.05);
    expect(ringProfile(2.15).tau).toBeGreaterThan(0.2);
    expect(ringProfile(3).tau).toBe(0);
    expect(ringTable()).toHaveLength(RING_TEXELS * 2);
  });

  it('scatters through phase functions that each hold one unit of light', () => {
    for (const phase of [
      (c: number) => henyeyGreenstein(c, 0.7),
      (c: number) => ringPhase(c, 0.4),
    ]) {
      let sum = 0;
      const n = 20000;
      for (let i = 0; i < n; i++) sum += phase(-1 + (2 * (i + 0.5)) / n) * (2 / n) * 2 * Math.PI;
      expect(sum).toBeCloseTo(1, 2);
    }
  });

  it('never returns more light than it was given, lit side and far side together', () => {
    // Isotropic, white particles: reflected plus diffusely transmitted light, over the hemisphere
    // each, is at most the light that fell (single scattering under-counts, never over).
    for (const tau of [0.05, 0.5, 2]) {
      for (const muSun of [0.2, 0.6, 1]) {
        let total = 0;
        const n = 400;
        for (let i = 0; i < n; i++) {
          const mu = (i + 0.5) / n;
          const ring = (m: number) => slabLight(tau, muSun, m, 1, 1 / (4 * Math.PI));
          total += (ring(mu) + ring(-mu)) * mu * (1 / n) * 2 * Math.PI;
        }
        expect(total / muSun).toBeLessThanOrEqual(1.0001);
      }
    }
  });

  it('goes dark where dense and lit from behind, bright where thin and dusty', () => {
    const behind = (tau: number, dust: number) =>
      slabLight(tau, 0.3, -0.3 + 1e-3, 0.5, ringPhase(0.95, dust));
    expect(behind(2.5, 0.01)).toBeLessThan(behind(0.1, 0.25));
    expect(behind(0.3, 0.95)).toBeGreaterThan(behind(0.3, 0.05));
  });

  it("lays the planet's shadow on the rings and the rings' on the planet", () => {
    const sun = [1, 0, 0] as const;
    expect(planetShadowsRing([-1.8, 0, 0.1], sun)).toBe(true);
    expect(planetShadowsRing([1.8, 0, 0.1], sun)).toBe(false);
    expect(planetShadowsRing([0, 1.8, 0], sun)).toBe(false);
    // The sun 25° above the ring plane, over the B ring from a point on the southern hemisphere.
    const tilt = (25 * Math.PI) / 180;
    const up = [0, 1, 0] as const;
    const s = [Math.cos(tilt), Math.sin(tilt), 0] as const;
    const point: [number, number, number] = [0, -1, 0];
    // The ray from just below the south pole climbs to the plane at x = 1 / tan(25°) = 2.14.
    const hit = 1 / Math.tan(tilt);
    expect(hit).toBeGreaterThan(2.02);
    expect(ringShadowOnPlanet(point, s, up)).toBeLessThan(0.7);
    expect(ringShadowOnPlanet([0, 1, 0], s, up)).toBe(1);
  });
});
