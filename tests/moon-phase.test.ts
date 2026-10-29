import { describe, expect, it } from 'vitest';
import {
  isLit,
  litFraction,
  phaseForProgress,
  twoCircleError,
} from '../src/effects/moon-phase/phase.ts';
import { mountHeadless } from './headless.ts';

// Story 5.6: the phase as a value. Progress maps to the lit area, the true shape of the light is
// a half disc and half an ellipse, and two offset circles get a quarter moon badly wrong.

describe('moon phase', () => {
  it('maps progress to a phase that lights that share of the disc', () => {
    for (const p of [0, 0.1, 0.25, 0.5, 0.8, 1]) {
      expect(litFraction(phaseForProgress(p))).toBeCloseTo(p, 9);
    }
    // By phase angle, a quarter of the way lights only 15%.
    expect(litFraction(phaseForProgress(0.25, false))).toBeCloseTo(0.146, 3);
  });

  it('lights the area it says, waxing on the right and waning on the left', () => {
    for (const phase of [0.1, 0.3, 0.7]) {
      let lit = 0;
      let disc = 0;
      let right = 0;
      const n = 300;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const x = -1 + (2 * (i + 0.5)) / n;
          const y = -1 + (2 * (j + 0.5)) / n;
          if (x * x + y * y > 1) continue;
          disc++;
          if (isLit(x, y, phase)) {
            lit++;
            if (x > 0) right++;
          }
        }
      }
      expect(lit / disc).toBeCloseTo(litFraction(phase), 2);
      expect(right / lit > 0.5).toBe(phase < 0.5);
    }
  });

  it('shows how wrong two offset circles are at a quarter, and how close at a thin crescent', () => {
    expect(twoCircleError(0.25, 200)).toBeGreaterThan(0.08);
    expect(twoCircleError(0.03, 200)).toBeLessThan(0.03);
  });

  it('draws as much of the disc lit as the progress says', async () => {
    const W = 320;
    const H = 320;
    for (const progress of [0.15, 0.5, 0.85]) {
      const mounted = await mountHeadless('moon-phase', {
        width: W,
        height: H,
        params: {
          animate: false,
          progress,
          earthshine: 0,
          relief: 0,
          softness: 0.005,
          tilt: 0,
          bloom: 0,
        },
      });
      mounted.step(2);
      const rgba = await mounted.read();
      mounted.destroy();
      let lit = 0;
      let disc = 0;
      const radius = 0.38 * W;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const dx = (x + 0.5 - W / 2) / radius;
          const dy = (y + 0.5 - H / 2) / radius;
          if (dx * dx + dy * dy > 0.97) continue;
          disc++;
          if (rgba[(y * W + x) * 4]! > 2) lit++;
        }
      }
      expect(lit / disc, `progress ${progress}`).toBeCloseTo(progress, 1);
    }
  });
});
