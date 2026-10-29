import { describe, expect, it } from 'vitest';
import { linearToOklch } from '../src/gpu/colour/oklab.ts';
import { lineColours, LINES, wavelengthColour } from '../src/gpu/nebula/lines.ts';

// Story 3.1: emission lines as the eye sees them, and the false-colour palettes.

const hueDegrees = (c: readonly number[]) => {
  const h = (linearToOklch(c as [number, number, number])[2] * 180) / Math.PI;
  return (h + 360) % 360;
};

describe('emission-line colour', () => {
  it('shows Hα and S II as red and O III as teal, inside the gamut, at luminance 1', () => {
    const natural = lineColours('natural');
    for (const c of Object.values(natural)) {
      for (const v of c) expect(v).toBeGreaterThanOrEqual(0);
      expect(0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]).toBeCloseTo(1, 2);
    }
    // Red: red far above green and blue.
    expect(natural.hydrogenAlpha[0]).toBeGreaterThan(3 * natural.hydrogenAlpha[1]);
    expect(natural.sulphur[0]).toBeGreaterThan(3 * natural.sulphur[1]);
    // Teal: green and blue above red, green leading.
    expect(natural.oxygen[1]).toBeGreaterThan(natural.oxygen[0]);
    expect(natural.oxygen[2]).toBeGreaterThan(natural.oxygen[0]);
    // To the eye S II and Hα are nearly the same red: their hues within 10°.
    expect(Math.abs(hueDegrees(natural.sulphur) - hueDegrees(natural.hydrogenAlpha))).toBeLessThan(
      10,
    );
  });

  it("runs through the spectrum's hues in order from red to blue", () => {
    let last = hueDegrees(wavelengthColour(680));
    for (const nm of [620, 580, 540, 500, 470]) {
      const h = hueDegrees(wavelengthColour(nm));
      // OKLCH hue rises from red (about 30°) through yellow and green to cyan and blue.
      expect(h).toBeGreaterThan(last);
      last = h;
    }
    expect(LINES.oxygen).toBeLessThan(LINES.hydrogenAlpha);
  });

  it('gives the Hubble palette a primary per line', () => {
    const hubble = lineColours('hubble');
    expect(hubble.sulphur.indexOf(Math.max(...hubble.sulphur))).toBe(0);
    expect(hubble.hydrogenAlpha.indexOf(Math.max(...hubble.hydrogenAlpha))).toBe(1);
    expect(hubble.oxygen.indexOf(Math.max(...hubble.oxygen))).toBe(2);
  });
});
