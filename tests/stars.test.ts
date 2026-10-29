import { describe, expect, it } from 'vitest';
import { createSpotLayer, SPOT_FLOATS, SPOT_REACH, spotShare } from '../src/gpu/stars/spot.ts';
import {
  magnitudeLight,
  makeStars,
  MAGNITUDE_SLOPE,
  sampleMagnitude,
  starColour,
} from '../src/gpu/stars/stars.ts';
import { luminance } from '../src/gpu/emission/blackbody-lut.ts';
import { getTestDevice, readTexture } from './gpu.ts';

// Story 2.1: the star's statistics and colour, and the spot's light conservation, on the CPU twin
// and as drawn on the GPU into rgba16float, as the effects' scenes are (rgba32float cannot be
// blended without an optional feature).

const SIZE = 64;

/** IEEE half float to number. */
function half(bits: number): number {
  const exponent = (bits >> 10) & 0x1f;
  const fraction = bits & 0x3ff;
  const sign = bits & 0x8000 ? -1 : 1;
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
  if (exponent === 31) return fraction ? NaN : sign * Infinity;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

/** Sum of a spot's shares over every pixel it can touch, on the CPU twin. */
function twinTotal(x: number, y: number, sigma: number): number {
  const reach = Math.ceil(SPOT_REACH * sigma + 2);
  let sum = 0;
  for (let py = Math.floor(y) - reach; py <= Math.floor(y) + reach; py++) {
    for (let px = Math.floor(x) - reach; px <= Math.floor(x) + reach; px++) {
      sum += spotShare(px + 0.5 - x, py + 0.5 - y, sigma);
    }
  }
  return sum;
}

async function render(
  device: GPUDevice,
  stars: readonly { x: number; y: number; sigma: number }[],
  frame: { halo?: number; haloScale?: number; haloMin?: number } = {},
): Promise<Float32Array> {
  const layer = createSpotLayer(device, { label: 'test', format: 'rgba16float' });
  const texture = device.createTexture({
    size: [SIZE, SIZE],
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const data = new Float32Array(stars.length * SPOT_FLOATS);
  stars.forEach((s, i) => data.set([s.x, s.y, s.sigma, 0, 1, 1, 1, 0], i * SPOT_FLOATS));
  layer.setStars(data, stars.length);
  const encoder = device.createCommandEncoder();
  layer.encode(encoder, texture.createView(), {
    width: SIZE,
    height: SIZE,
    minSigma: 0.05,
    clear: [0, 0, 0, 0],
    ...frame,
  });
  device.queue.submit([encoder.finish()]);
  const bits = new Uint16Array((await readTexture(device, texture, 8)).buffer);
  texture.destroy();
  layer.destroy();
  return Float32Array.from(bits, half);
}

const OFFSETS = [0, 0.13, 0.5, 0.71, 0.92];
const SIGMAS = [0.3, 0.5, 0.7, 1, 1.5, 3];

describe('star statistics', () => {
  it('draws about three times as many stars in each magnitude as the one brighter', () => {
    const counts = new Array(6).fill(0);
    const n = 200_000;
    for (let i = 0; i < n; i++) {
      const m = sampleMagnitude((i + 0.5) / n, 0, 6);
      counts[Math.min(5, Math.floor(m))]++;
    }
    for (let k = 1; k < 6; k++) {
      expect(Math.log10(counts[k] / counts[k - 1])).toBeCloseTo(MAGNITUDE_SLOPE, 2);
    }
  });

  it('keeps magnitudes inside their range, and five magnitudes is a hundred times the light', () => {
    expect(sampleMagnitude(0, -1, 6.5)).toBeCloseTo(-1, 6);
    expect(sampleMagnitude(0.999999, -1, 6.5)).toBeCloseTo(6.5, 3);
    expect(magnitudeLight(0) / magnitudeLight(5)).toBeCloseTo(100, 6);
    const stars = makeStars({ count: 500, seed: 3 });
    for (let i = 0; i < stars.count; i++) {
      expect(stars.magnitude[i]).toBeGreaterThanOrEqual(-1);
      expect(stars.magnitude[i]).toBeLessThanOrEqual(6.5);
      expect(stars.temperature[i]).toBeGreaterThanOrEqual(2_400);
      expect(stars.temperature[i]).toBeLessThanOrEqual(30_000);
    }
  });

  it('colours stars from red to blue as they get hotter, past the fit, at luminance 1', () => {
    let last = 0;
    for (const t of [2_400, 3_000, 4_000, 5_800, 8_000, 12_000, 20_000, 40_000]) {
      const c = starColour(t);
      expect(luminance(c)).toBeCloseTo(1, 4);
      expect(c[2] / c[0]).toBeGreaterThan(last);
      last = c[2] / c[0];
    }
    // The Sun is close to white; with no saturation every star is white.
    const sun = starColour(5_800);
    expect(Math.max(...sun) / Math.min(...sun)).toBeLessThan(1.25);
    expect(starColour(3_000, 0)).toEqual([1, 1, 1]);
  });
});

describe('star spots', () => {
  it('keep their light at any width and sub-pixel position (CPU twin)', () => {
    for (const sigma of SIGMAS) {
      for (const dx of OFFSETS) {
        expect(twinTotal(10 + dx, 10 + OFFSETS[(OFFSETS.indexOf(dx) + 2) % 5]!, sigma)).toBeCloseTo(
          1,
          4,
        );
      }
    }
  });

  it('keep their light as drawn, and match the twin pixel for pixel', async () => {
    const device = await getTestDevice();
    for (const sigma of SIGMAS) {
      for (const dx of OFFSETS) {
        const x = SIZE / 2 + dx;
        const y = SIZE / 2 + OFFSETS[(OFFSETS.indexOf(dx) + 2) % 5]!;
        const pixels = await render(device, [{ x, y, sigma }]);
        let sum = 0;
        let worst = 0;
        for (let py = 0; py < SIZE; py++) {
          for (let px = 0; px < SIZE; px++) {
            const value = pixels[(py * SIZE + px) * 4]!;
            sum += value;
            const want = spotShare(px + 0.5 - x, py + 0.5 - y, sigma);
            // Half floats keep about three significant figures, and Metal's exp is a fast one: the
            // steepest pixels of the narrowest spot differ from the twin by 0.3%. Pixels past the
            // quad's reach get nothing where the twin gives them 1e-5, hence the floor of 0.01.
            const err = Math.abs(value - want) / (want + 0.01);
            worst = Math.max(worst, err);
          }
        }
        // Beyond the quad's reach lies 1e-3 of the light.
        expect(Math.abs(sum - 1), `sigma ${sigma} at ${dx}`).toBeLessThan(2e-3);
        expect(worst, `sigma ${sigma} at ${dx}`).toBeLessThan(5e-3);
      }
    }
  });

  it('keep their light with a halo, which only bright stars get', async () => {
    const device = await getTestDevice();
    const total = (pixels: Float32Array) => {
      let sum = 0;
      for (let i = 0; i < SIZE * SIZE; i++) sum += pixels[i * 4]!;
      return sum;
    };
    const star = [{ x: SIZE / 2 + 0.3, y: SIZE / 2 + 0.6, sigma: 0.6 }];
    const haloed = await render(device, star, { halo: 0.1, haloScale: 6, haloMin: 0.5 });
    expect(total(haloed)).toBeCloseTo(1, 2);
    // A pixel well outside the core is lit only through the halo.
    const far = (SIZE / 2 + 6) * SIZE + SIZE / 2;
    expect(haloed[far * 4]!).toBeGreaterThan(1e-4);
    const dim = await render(device, star, { halo: 0.1, haloScale: 6, haloMin: 2 });
    expect(dim[far * 4]!).toBe(0);
  });
});
