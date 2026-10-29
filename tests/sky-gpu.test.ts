import { describe, expect, it } from 'vitest';
import { createFullscreenPipeline, renderFullscreen } from '../src/gpu/fullscreen.ts';
import { altAz, horizonVector, project, type View } from '../src/gpu/stars/sky.ts';
import { scintillationSettings } from '../src/gpu/stars/scintillation.ts';
import fbm from '../src/wgsl/fbm.wgsl';
import flicker from '../src/wgsl/flicker.wgsl';
import fullscreen from '../src/wgsl/fullscreen.wgsl';
import sky from '../src/gpu/stars/sky.wgsl';
import { getTestDevice, readTexture } from './gpu.ts';

// Stories 2.6 and 2.8: src/gpu/stars/sky.wgsl against its TypeScript twin, one pixel per case.

const deg = Math.PI / 180;

async function run(device: GPUDevice, count: number, body: string): Promise<Float32Array> {
  const texture = device.createTexture({
    size: [count, 1],
    format: 'rgba32float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const pipeline = createFullscreenPipeline(device, {
    fragment: {
      label: 'sky test',
      code: `#include "fullscreen.wgsl"
#include "fbm.wgsl"
#include "flicker.wgsl"
#include "sky.wgsl"
@fragment fn fs(in: FullscreenVarying) -> @location(0) vec4f {
  let i = i32(in.position.x);
  ${body}
}`,
      chunks: {
        ...fullscreen.chunks,
        ...fbm.chunks,
        ...flicker.chunks,
        'fullscreen.wgsl': fullscreen.code,
        'fbm.wgsl': fbm.code,
        'flicker.wgsl': flicker.code,
        'sky.wgsl': sky.code,
      },
    },
    format: 'rgba32float',
  });
  const encoder = device.createCommandEncoder();
  renderFullscreen(encoder, texture.createView(), pipeline, []);
  device.queue.submit([encoder.finish()]);
  const values = new Float32Array((await readTexture(device, texture, 16)).buffer);
  texture.destroy();
  return values;
}

const STARS = [
  [1.2, 0.3],
  [4.1, -0.9],
  [5.9, 1.2],
  [0.3, 0.05],
  [3.0, -0.2],
] as const;
const LST = 2.2;
const LATITUDE = 41.9 * deg;

describe('sky.wgsl', () => {
  it('gives the same altitudes and azimuths as sky.ts', async () => {
    const device = await getTestDevice();
    const list = STARS.map(([ra, dec]) => `vec2f(${ra}, ${dec})`).join(', ');
    const values = await run(
      device,
      STARS.length,
      `let stars = array(${list});
  let s = stars[i];
  return vec4f(sky_alt_az(s.x, s.y, ${LST}, ${LATITUDE}), 0.0, 1.0);`,
    );
    STARS.forEach(([ra, dec], i) => {
      const want = altAz(ra, dec, LST, LATITUDE);
      expect(values[i * 4]!).toBeCloseTo(want.alt, 4);
      expect(values[i * 4 + 1]!).toBeCloseTo(want.az, 4);
    });
  });

  it('projects as sky.ts does, and unprojects back to the same direction', async () => {
    const device = await getTestDevice();
    const view: View = { alt: 32 * deg, az: 180 * deg, fov: 100 * deg, width: 1600, height: 900 };
    const scale = view.height / 2 / (2 * Math.tan(view.fov / 4));
    const dirs = [
      [20, 150],
      [50, 200],
      [5, 120],
      [70, 180],
    ].map(([alt, az]) => horizonVector(alt! * deg, az! * deg));
    const list = dirs.map((d) => `vec3f(${d.join(', ')})`).join(', ');
    const values = await run(
      device,
      dirs.length,
      `let dirs = array(${list});
  let v = sky_view(${view.alt}, ${view.az}, ${scale});
  let p = sky_project(dirs[i], v, vec2f(${view.width}.0, ${view.height}.0));
  let back = sky_unproject(p.xy, v, vec2f(${view.width}.0, ${view.height}.0));
  return vec4f(p.xy, dot(back, dirs[i]), 1.0);`,
    );
    dirs.forEach((dir, i) => {
      const want = project(dir, view)!;
      expect(values[i * 4]!).toBeCloseTo(want[0], 1);
      expect(values[i * 4 + 1]!).toBeCloseTo(want[1], 1);
      expect(values[i * 4 + 2]!).toBeCloseTo(1, 5);
    });
  });

  it('twinkles low stars harder and faster, as scintillation.ts does, within the flicker caps', async () => {
    const device = await getTestDevice();
    const alts = [90, 45, 20, 10, 5, 1];
    const values = await run(
      device,
      alts.length,
      `let alts = array(${alts.map((a) => `${a * deg}`).join(', ')});
  let s = scintillation_settings(alts[i], 1.0, 1.0);
  return vec4f(s.rate, s.depth, s.shimmer, 1.0);`,
    );
    let lastDepth = 0;
    alts.forEach((alt, i) => {
      const want = scintillationSettings(alt * deg, 1, 1);
      expect(values[i * 4]!).toBeCloseTo(want.rate, 3);
      expect(values[i * 4 + 1]!).toBeCloseTo(want.depth, 3);
      expect(values[i * 4 + 2]!).toBeCloseTo(want.shimmer, 3);
      expect(want.depth).toBeGreaterThanOrEqual(lastDepth);
      expect(want.rate).toBeLessThanOrEqual(4);
      expect(want.depth).toBeLessThanOrEqual(0.85);
      lastDepth = want.depth;
    });
    // Overhead a star barely flickers; a degree up it swings by most of its light.
    expect(scintillationSettings(90 * deg, 1, 1).depth).toBeLessThan(0.1);
    expect(scintillationSettings(1 * deg, 1, 1).depth).toBeGreaterThan(0.6);
  });
});
