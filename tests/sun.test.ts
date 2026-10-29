import { describe, expect, it } from 'vitest';
import { phaseAt } from '../src/effects/eclipse/index.ts';
import {
  baumbach,
  coveredFraction,
  limbDarkening,
  prominenceColour,
  sunTemperature,
} from '../src/gpu/sun/sun.ts';

// Stories 6.1 to 6.3: the photosphere's limb darkening, the corona's profile, the Moon's cover.

describe('the photosphere', () => {
  it('runs from 6 100 K at the centre to 4 850 K at the limb', () => {
    expect(sunTemperature(1)).toBeCloseTo(6101, -1);
    expect(sunTemperature(0)).toBeCloseTo(4854, -1);
  });

  it('darkens to about a third at the limb at 555 nm, and more in the blue than the red', () => {
    expect(limbDarkening(0)).toBeGreaterThan(0.28);
    expect(limbDarkening(0)).toBeLessThan(0.4);
    expect(limbDarkening(0.5)).toBeGreaterThan(0.6);
    // hc/k over 450 nm and over 650 nm: the blue limb is darker than the red.
    expect(limbDarkening(0.1, 31972)).toBeLessThan(limbDarkening(0.1, 22135));
  });
});

describe('the corona and prominences', () => {
  it("follows Baumbach's profile: a millionth of the disc near the limb, falling steeply", () => {
    expect(baumbach(1.1)).toBeGreaterThan(1);
    expect(baumbach(1.1)).toBeLessThan(1.5);
    expect(baumbach(2) / baumbach(1.1)).toBeLessThan(0.03);
  });

  it('glows prominence pink: red over green and blue', () => {
    const [r, g, b] = prominenceColour();
    expect(r).toBeGreaterThan(2 * g);
    expect(b).toBeGreaterThan(0);
  });
});

describe('the eclipse', () => {
  it('covers the Sun by the circles lens area', () => {
    expect(coveredFraction(1, 1.04, 0)).toBe(1);
    expect(coveredFraction(1, 1.04, 2.1)).toBe(0);
    expect(coveredFraction(1, 1, 1)).toBeCloseTo(0.391, 3);
  });

  it('passes from partial phase to the beads to totality and back', () => {
    expect(phaseAt(0.25)).toBe('partial');
    expect(phaseAt(0.5)).toBe('totality');
    expect(phaseAt(0.447)).toBe("Baily's beads");
    expect(phaseAt(0.553)).toBe("Baily's beads");
  });
});

// The diamond ring is a flash (story 6.3): the registered-effects sweep watches 4 seconds of the
// eclipse, which ends before second contact, so this one watches both contacts, at the default
// run and at the fastest.
describe.skipIf(process.env.FLASH_SWEEP === '0')('the diamond ring against WCAG 2.3.1', () => {
  it('stays under three flashes a second through second and third contact', async () => {
    const { measureFlashes } = await import('./flash.ts');
    for (const [cycle, settle, seconds] of [
      [40, 7, 6],
      [10, 1.5, 2.5],
    ] as const) {
      const report = await measureFlashes('eclipse', { params: { cycle }, settle, seconds });
      expect(report.verdict, `cycle ${cycle}: ${JSON.stringify(report)}`).not.toBe('high');
      expect(report.peakCellFlashes, `cycle ${cycle}`).toBeLessThanOrEqual(2);
    }
  });
});
