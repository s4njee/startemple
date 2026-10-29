import { writeFileSync } from 'node:fs';
import { it, vi } from 'vitest';
import { compareImages } from '../src/gpu/compare.ts';
import { mountHeadless } from '../tests/headless.ts';

vi.setConfig({ testTimeout: 1_200_000 });

// Story 5.2: the closed-form march and Hillaire's tables against brute force. Each view of
// `planet` is rendered at 960 x 540 by every method, single scattering only, and compared with
// the reference (64 steps along the view, a 32-step march to the sun at each) as the viewer sees
// it: RMSE in 8-bit levels and SSIM on luminance. Then what multiple scattering adds, as the
// tables draw it: the mean luminance with it over without. Writes docs/studies/atmosphere-quality.json.
//
//   npx vitest run --config experiments/vite.config.ts experiments/atmosphere-quality.test.ts

const W = 960;
const H = 540;
const decode = (v: number) => {
  const x = v / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};

const VIEWS = {
  'from orbit': {},
  dusk: { sun: 112 },
  'sunset from the ground': { view: 'ground', sunHeight: 3 },
  'noon from the ground': { view: 'ground', sunHeight: 55 },
} as const;

async function render(params: Record<string, unknown>): Promise<Float32Array> {
  const mounted = await mountHeadless('planet', {
    width: W,
    height: H,
    params: { bloom: 0, ...params },
  });
  mounted.step(2);
  const out = Float32Array.from(await mounted.read(), decode);
  mounted.destroy();
  return out;
}

const mean = (img: Float32Array) => {
  let sum = 0;
  for (let i = 0; i < img.length; i += 4)
    sum += 0.2126 * img[i]! + 0.7152 * img[i + 1]! + 0.0722 * img[i + 2]!;
  return sum / (img.length / 4);
};

it('atmosphere quality', async () => {
  const rows: Record<string, unknown>[] = [];
  for (const [view, base] of Object.entries(VIEWS)) {
    const reference = await render({ ...base, atmosphere: 'reference', multiple: false });
    for (const [method, steps] of [
      ['closed form', 4],
      ['closed form', 8],
      ['closed form', 12],
      ['closed form', 24],
      ['tables', 8],
      ['tables', 12],
    ] as const) {
      const image = await render({ ...base, atmosphere: method, steps, multiple: false });
      rows.push({ view, method, steps, ...compareImages(reference, image, W, H) });
    }
    const single = await render({ ...base, atmosphere: 'tables', multiple: false });
    const multiple = await render({ ...base, atmosphere: 'tables', multiple: true });
    rows.push({ view, method: 'tables', multipleScattering: mean(multiple) / mean(single) });
  }
  writeFileSync('docs/studies/atmosphere-quality.json', JSON.stringify(rows, null, 2) + '\n');
  for (const r of rows) console.log(JSON.stringify(r));
});
