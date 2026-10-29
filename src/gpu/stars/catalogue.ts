import { BSC5, BSC5_COUNT } from './bsc5.generated.ts';

/*
 * The Yale Bright Star Catalogue, 5th revised edition (Hoffleit and Warren 1991): every star to
 * about magnitude 6.5, the naked-eye sky, packed by scripts/pack-bsc5.mjs (6 bytes a star) and
 * decoded here for `real-sky` (story 2.6).
 *
 *   const sky = decodeCatalogue();                 // J2000 positions, magnitudes, temperatures
 *   precess(sky, yearsSince2000(new Date()));      // to the date's equator and equinox
 *
 * Positions are moved from J2000 to the date by the low-accuracy annual precession of Meeus,
 * _Astronomical Algorithms_, 21.1: about 50" a year along the ecliptic, which is 0.36° by 2026,
 * four pixels in a 110° view at 1080 px, so it is not left out. Nutation, aberration and proper
 * motion are, being under a pixel.
 */

export interface Catalogue {
  count: number;
  /** Right ascension and declination, radians. */
  ra: Float64Array;
  dec: Float64Array;
  /** V magnitude. */
  magnitude: Float32Array;
  /** Effective temperature from B−V, kelvin (5 800 where the catalogue has no colour). */
  temperature: Float32Array;
}

/**
 * A star's temperature from its B−V colour index: Ballesteros (2012), a blackbody fit, good to a
 * few per cent for stars from about 3 000 to 10 000 K. It runs low for the hottest (16 600 K at
 * B−V = −0.3, where O and B stars reach 30 000 K); their colour hardly changes up there.
 */
export function temperatureFromBV(bv: number): number {
  return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
}

function decodeBase64(text: string): Uint8Array {
  if (typeof atob === 'function') return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
  return new Uint8Array(Buffer.from(text, 'base64'));
}

/** The packed catalogue, brightest first. */
export function decodeCatalogue(): Catalogue {
  const bytes = decodeBase64(BSC5);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = BSC5_COUNT;
  const sky: Catalogue = {
    count,
    ra: new Float64Array(count),
    dec: new Float64Array(count),
    magnitude: new Float32Array(count),
    temperature: new Float32Array(count),
  };
  for (let i = 0; i < count; i++) {
    sky.ra[i] = (view.getUint16(i * 6, true) / 65536) * 2 * Math.PI;
    sky.dec[i] = ((view.getInt16(i * 6 + 2, true) / 364) * Math.PI) / 180;
    sky.magnitude[i] = view.getUint8(i * 6 + 4) / 25 - 2;
    const bv = view.getInt8(i * 6 + 5);
    sky.temperature[i] = bv === 127 ? 5_800 : temperatureFromBV(bv / 50);
  }
  return sky;
}

/** Julian years since J2000.0 (2000 January 1, 12h TT; UT is close enough here). */
export function yearsSince2000(date: Date): number {
  return (date.getTime() - Date.UTC(2000, 0, 1, 12)) / (365.25 * 86_400_000);
}

/** Moves the catalogue's positions from J2000 to `years` later, in place (Meeus 21.1). */
export function precess(sky: Catalogue, years: number): void {
  for (let i = 0; i < sky.count; i++) {
    const [ra, dec] = precessPoint(sky.ra[i]!, sky.dec[i]!, years);
    sky.ra[i] = ra;
    sky.dec[i] = dec;
  }
}

/** One position moved from J2000 to `years` later (Meeus 21.1). */
export function precessPoint(ra: number, dec: number, years: number): [number, number] {
  // Annual precession in right ascension (m, n) and declination (n), arcseconds.
  const m = (3.07496 + 0.00186 * (years / 100)) * 15;
  const n = (1.33621 - 0.00057 * (years / 100)) * 15;
  const arcsec = Math.PI / (180 * 3600);
  // Near the poles tan(dec) runs away; the catalogue's closest star (Polaris, 89.3°) is fine.
  const dRa = (m + n * Math.sin(ra) * Math.tan(dec)) * years * arcsec;
  const dDec = n * Math.cos(ra) * years * arcsec;
  return [(ra + dRa + 2 * Math.PI) % (2 * Math.PI), dec + dDec];
}
