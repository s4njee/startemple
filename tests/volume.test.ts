import { describe, expect, it } from 'vitest';
import { createFullscreenPipeline, renderFullscreen } from '../src/gpu/fullscreen.ts';
import fullscreen from '../src/wgsl/fullscreen.wgsl';
import volume from '../src/wgsl/volume.wgsl';
import { getTestDevice, readTexture } from './gpu.ts';

// Story 3.3: Fire Temple's volume kernel as ported. A uniform slab marched in many steps keeps the
// transmittance Beer–Lambert gives in closed form, and the light it sends (emission over
// extinction, times one minus the transmittance); the ray-box test finds the slab's faces.

async function run(device: GPUDevice, count: number, body: string): Promise<Float32Array> {
  const texture = device.createTexture({
    size: [count, 1],
    format: 'rgba32float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const pipeline = createFullscreenPipeline(device, {
    fragment: {
      label: 'volume test',
      code: `#include "fullscreen.wgsl"
#include "volume.wgsl"
@fragment fn fs(in: FullscreenVarying) -> @location(0) vec4f {
  let i = i32(in.position.x);
  ${body}
}`,
      chunks: {
        ...fullscreen.chunks,
        'fullscreen.wgsl': fullscreen.code,
        'volume.wgsl': volume.code,
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

const CASES = [
  { sigma: 0.2, thickness: 3, steps: 1 },
  { sigma: 0.2, thickness: 3, steps: 64 },
  { sigma: 1.5, thickness: 2, steps: 17 },
  { sigma: 4, thickness: 1, steps: 200 },
  { sigma: 0.001, thickness: 5, steps: 9 },
] as const;

describe('volume kernel', () => {
  it('keeps a uniform slab to Beer–Lambert, however many steps it is marched in', async () => {
    const device = await getTestDevice();
    const list = CASES.map((c) => `vec3f(${c.sigma}, ${c.thickness}, ${c.steps})`).join(', ');
    const values = await run(
      device,
      CASES.length,
      `let cases = array(${list});
  let c = cases[i];
  let ds = c.y / c.z;
  var acc = volume_start();
  for (var k = 0; k < i32(c.z); k++) {
    acc = volume_accumulate_medium(acc, volume_emitter(vec3f(0.5), vec3f(c.x)), ds);
  }
  return vec4f(acc.transmittance.x, acc.radiance.x, volume_slab_transmittance(vec3f(c.x), c.y).x, 1.0);`,
    );
    CASES.forEach((c, i) => {
      const transmittance = Math.exp(-c.sigma * c.thickness);
      // Light from a slab that emits e per unit length and absorbs σ: e / σ · (1 − T).
      const light = (0.5 / c.sigma) * (1 - transmittance);
      expect(values[i * 4]!, `T, ${JSON.stringify(c)}`).toBeCloseTo(transmittance, 4);
      expect(values[i * 4 + 1]!, `light, ${JSON.stringify(c)}`).toBeCloseTo(light, 3);
      expect(values[i * 4 + 2]!).toBeCloseTo(transmittance, 5);
    });
  });

  it("finds a box's faces along a ray, and misses it beside", async () => {
    const device = await getTestDevice();
    const values = await run(
      device,
      2,
      `let o = vec3f(0.0, 0.0, -5.0);
  let dir = select(vec3f(0.0, 0.0, 1.0), normalize(vec3f(1.0, 0.0, 1.0)), i == 1);
  let span = volume_ray_box(o, dir, vec3f(-1.0), vec3f(1.0));
  return vec4f(span, select(0.0, 1.0, volume_hit(span)), 1.0);`,
    );
    expect(values[0]).toBeCloseTo(4, 5);
    expect(values[1]).toBeCloseTo(6, 5);
    expect(values[2]).toBe(1);
    expect(values[6]).toBe(0);
  });
});
