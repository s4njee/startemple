import { writeFileSync } from 'node:fs';
import { it, vi } from 'vitest';
import { compareImages } from '../src/gpu/compare.ts';
import { mountHeadless } from '../tests/headless.ts';

vi.setConfig({ testTimeout: 1_200_000 });

// Story 4.4: can black-hole reach Tier B at half resolution with temporal accumulation, and what
// does it lose at the photon ring? Each configuration is rendered at 960 x 540 and compared with a
// full-resolution reference that has been accumulated still for 64 frames: as the viewer sees it
// (RMSE in 8-bit levels, SSIM on luminance), over the whole frame and over a band round the photon
// ring, where the image is finest. Turning, the history lags the view; that is measured too, against
// a full-resolution frame at the same moment. Writes docs/studies/black-hole-quality.json.
//
//   npx vitest run --config experiments/vite.config.ts experiments/black-hole-quality.test.ts

const W = 960;
const H = 540;

const decode = (v: number) => {
  const x = v / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};
const linear = (rgba: Uint8Array) => Float32Array.from(rgba, decode);

/** A band round the photon ring: the shadow's edge, about 2.6 Schwarzschild radii, seen from 26. */
function ringMask(): Uint8Array {
  const mask = new Uint8Array(W * H);
  // The shadow's angular radius over the half-height's angle (17°), in pixels.
  const ring = ((Math.atan(2.6 / 26) * 180) / Math.PI / 17) * (H / 2);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const r = Math.hypot(x - W / 2, y - H / 2);
      if (r > ring * 0.8 && r < ring * 1.35) mask[y * W + x] = 1;
    }
  }
  return mask;
}

async function render(resolution: string, frames: number, turn: number): Promise<Float32Array> {
  const mounted = await mountHeadless('black-hole', {
    width: W,
    height: H,
    params: { resolution, turn },
  });
  mounted.step(frames);
  const out = linear(await mounted.read());
  mounted.destroy();
  return out;
}

it('black-hole quality', async () => {
  const mask = ringMask();
  const reference = await render('full', 64, 0);
  const rows: Record<string, unknown>[] = [];
  for (const [resolution, frames] of [
    ['full', 1],
    ['half', 1],
    ['half', 8],
    ['half', 32],
    ['quarter', 1],
    ['quarter', 32],
  ] as const) {
    const image = await render(resolution, frames, 0);
    rows.push({
      resolution,
      frames,
      turning: false,
      whole: compareImages(reference, image, W, H),
      ring: compareImages(reference, image, W, H, mask),
    });
  }
  // Turning at the default speed: after 4 seconds, against full resolution at the same moment.
  const moving = await render('full', 240, 1);
  for (const resolution of ['half', 'quarter']) {
    const image = await render(resolution, 240, 1);
    rows.push({
      resolution,
      frames: 240,
      turning: true,
      whole: compareImages(moving, image, W, H),
      ring: compareImages(moving, image, W, H, mask),
    });
  }
  writeFileSync('docs/studies/black-hole-quality.json', JSON.stringify(rows, null, 2) + '\n');
  for (const r of rows) console.log(JSON.stringify(r));
});
