import { describe, expect, it } from 'vitest';
import {
  eccentricAnomaly,
  geocentric,
  heliocentric,
  magnitude,
  sunPosition,
} from '../src/gpu/stars/planets.ts';
import { julianDate } from '../src/gpu/stars/sky.ts';

// Stories 4.5 and 7.6: Standish's elements, checked against things known about the sky.

const J2000 = 2_451_545;
const deg = Math.PI / 180;

describe('planet positions', () => {
  it("solves Kepler's equation", () => {
    for (const e of [0, 0.2, 0.6]) {
      for (const m of [0.1, 1, 3]) {
        const E = eccentricAnomaly(m, e);
        expect(E - e * Math.sin(E)).toBeCloseTo(m, 10);
      }
    }
  });

  it('puts Earth where it is at J2000, a little under 1 AU from the Sun', () => {
    // JPL: the Earth–Moon barycentre at 2000 Jan 1.5 TT is at about (−0.177, 0.967, 0) AU.
    const [x, y, z] = heliocentric('earth', J2000);
    expect(x).toBeCloseTo(-0.177, 2);
    expect(y).toBeCloseTo(0.967, 2);
    expect(Math.abs(z)).toBeLessThan(1e-4);
  });

  it('has the Sun at the equinox on 2000 March 20, 07:35 UT', () => {
    const sun = sunPosition(julianDate(new Date(Date.UTC(2000, 2, 20, 7, 35))));
    // Right ascension 0 h (or 24 h) and declination 0, to within a few tenths of a degree.
    const ra = sun.ra > Math.PI ? sun.ra - 2 * Math.PI : sun.ra;
    expect(Math.abs(ra) / deg).toBeLessThan(0.3);
    expect(Math.abs(sun.dec) / deg).toBeLessThan(0.3);
  });

  it('takes Jupiter about 11.86 years round the Sun', () => {
    const angle = (jd: number) => {
      const [x, y] = heliocentric('jupiter', jd);
      return Math.atan2(y, x);
    };
    const period = 11.862 * 365.25;
    const turned = angle(J2000 + period) - angle(J2000);
    expect(Math.abs(Math.atan2(Math.sin(turned), Math.cos(turned))) / deg).toBeLessThan(1);
  });

  it('makes Venus the brightest planet and Neptune too faint to see', () => {
    const jd = julianDate(new Date(Date.UTC(2026, 9, 29)));
    expect(magnitude('venus', jd)).toBeLessThan(-3.5);
    expect(magnitude('jupiter', jd)).toBeLessThan(-1.5);
    expect(magnitude('neptune', jd)).toBeGreaterThan(7);
    // Every planet is near the ecliptic: within 8° of declination ±23.4° bands.
    for (const p of ['mars', 'jupiter', 'saturn'] as const) {
      expect(Math.abs(geocentric(p, jd).dec) / deg).toBeLessThan(32);
    }
  });
});
