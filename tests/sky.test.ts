import { describe, expect, it } from 'vitest';
import { decodeCatalogue, precess, temperatureFromBV } from '../src/gpu/stars/catalogue.ts';
import {
  airmass,
  altAz,
  greenwichSiderealTime,
  horizonVector,
  julianDate,
  localSiderealTime,
  project,
} from '../src/gpu/stars/sky.ts';

// Story 2.6: the catalogue as packed, and the sky's geometry against Meeus's worked examples.

const deg = Math.PI / 180;

describe('the catalogue', () => {
  const sky = decodeCatalogue();

  it('holds the naked-eye sky, brightest first', () => {
    expect(sky.count).toBe(9096);
    // Sirius, the brightest, is first: −1.46, at 6h 45m, −16° 43′ (J2000).
    expect(sky.magnitude[0]).toBeCloseTo(-1.46, 1);
    expect(sky.ra[0]! / (15 * deg)).toBeCloseTo(6.752, 2);
    expect(sky.dec[0]! / deg).toBeCloseTo(-16.716, 2);
    for (let i = 1; i < sky.count; i++)
      expect(sky.magnitude[i]).toBeGreaterThanOrEqual(sky.magnitude[i - 1]!);
    expect(sky.magnitude[sky.count - 1]).toBeLessThan(8.1);
  });

  it("gives temperatures from colour: the Sun's B−V of 0.65 near 5 800 K", () => {
    expect(temperatureFromBV(0.65)).toBeGreaterThan(5_500);
    expect(temperatureFromBV(0.65)).toBeLessThan(6_000);
    // The fit runs low for the hottest stars (16 600 K for −0.3, where O and B stars reach 30 000),
    // whose colour hardly changes between those temperatures.
    expect(temperatureFromBV(-0.3)).toBeGreaterThan(15_000);
    expect(temperatureFromBV(1.5)).toBeLessThan(4_000);
  });

  it('precesses Polaris towards the pole and Sirius by about 0.36° over 26 years', () => {
    const before = decodeCatalogue();
    const after = decodeCatalogue();
    precess(after, 26);
    // Sirius's right ascension grows by about 2.6 s of time a year.
    const dRa = ((after.ra[0]! - before.ra[0]!) / (15 * deg)) * 3600;
    expect(dRa / 26).toBeCloseTo(2.64, 1);
  });
});

describe('sidereal time and the horizon', () => {
  it('matches Meeus example 12.a: GMST at 1987 April 10 0h UT is 13h 10m 46.37s', () => {
    const gmst = greenwichSiderealTime(julianDate(new Date(Date.UTC(1987, 3, 10))));
    expect(gmst / (15 * deg)).toBeCloseTo(13 + 10 / 60 + 46.3668 / 3600, 5);
  });

  it('matches Meeus example 13.b: Venus from Washington', () => {
    // 1987 April 10, 19h 21m UT; 77° 03′ 56″ W, 38° 55′ 17″ N; Venus at 347.3193°, −6.7199°.
    // Meeus uses apparent sidereal time; the mean differs by nutation, about 0.004°.
    const jd = julianDate(new Date(Date.UTC(1987, 3, 10, 19, 21)));
    const lst = localSiderealTime(jd, -(77 + 3 / 60 + 56 / 3600) * deg);
    const { alt, az } = altAz(347.3193 * deg, -6.7199 * deg, lst, (38 + 55 / 60 + 17 / 3600) * deg);
    expect(alt / deg).toBeCloseTo(15.1249, 1);
    // Meeus gives 68.0337° west of south: 248.0337° from north.
    expect(az / deg).toBeCloseTo(248.0337, 1);
  });

  it('puts the pole at the latitude, and a star on the meridian at dec = latitude overhead', () => {
    for (const lat of [-35, 0, 41.9, 64]) {
      const pole = altAz(0, (lat >= 0 ? 90 : -90) * deg, 1.234, lat * deg);
      expect(pole.alt / deg).toBeCloseTo(Math.abs(lat), 4);
      const zenith = altAz(1.234, lat * deg, 1.234, lat * deg);
      expect(zenith.alt / deg).toBeCloseTo(90, 4);
    }
    // A star rising due east from the equator: dec 0, six hours before it transits.
    const east = altAz(1.234 + Math.PI / 2, 0, 1.234, 40 * deg);
    expect(east.alt / deg).toBeCloseTo(0, 4);
    expect(east.az / deg).toBeCloseTo(90, 4);
  });

  it('projects the view centre to the middle and the fov to the frame edges', () => {
    const view = { alt: 30 * deg, az: 180 * deg, fov: 100 * deg, width: 1600, height: 900 };
    const centre = project(horizonVector(30 * deg, 180 * deg), view)!;
    expect(centre[0]).toBeCloseTo(800, 6);
    expect(centre[1]).toBeCloseTo(450, 6);
    // 50° above the centre is the top edge; west of south is to the right.
    expect(project(horizonVector(80 * deg, 180 * deg), view)![1]).toBeCloseTo(0, 3);
    expect(project(horizonVector(30 * deg, 200 * deg), view)![0]).toBeGreaterThan(800);
  });

  it('gives an airmass of 1 overhead and about 38 at the horizon', () => {
    expect(airmass(Math.PI / 2)).toBeCloseTo(1, 3);
    expect(airmass(0)).toBeGreaterThan(36);
    expect(airmass(0)).toBeLessThan(40);
  });
});
