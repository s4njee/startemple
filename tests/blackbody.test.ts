import { describe, expect, it } from 'vitest';
import {
  BLACKBODY_T_MAX,
  BLACKBODY_T_MIN,
  blackbodyFit,
  blackbodyPlanck,
  luminance,
  type Rgb,
} from '../src/gpu/emission/blackbody-lut.ts';
import { createFullscreenPipeline, renderFullscreen } from '../src/gpu/fullscreen.ts';
import blackbody from '../src/wgsl/blackbody.wgsl';
import color from '../src/wgsl/color.wgsl';
import fullscreen from '../src/wgsl/fullscreen.wgsl';
import { getTestDevice, readTexture } from './gpu.ts';

// Story 1.7: Fire Temple's blackbody colour, copied in from the temple core's source for star
// colours. Its full tests stay in Fire Temple; these check that the copy here still holds to its
// reference and that the shader and its TypeScript twin agree.

/** Temperatures across the fit's range, spaced evenly in 1000/t as the fit is. */
const TEMPERATURES = Array.from({ length: 24 }, (_, i) => {
  const m = 1000 / BLACKBODY_T_MIN + (i / 23) * (1000 / BLACKBODY_T_MAX - 1000 / BLACKBODY_T_MIN);
  return 1000 / m;
});

const maxOne = (c: Readonly<Rgb>): Rgb => {
  const top = Math.max(...c);
  return [c[0] / top, c[1] / top, c[2] / top];
};

describe('blackbody colour', () => {
  it('fits the Planck reference within 2/255 on the max-channel-1 form', () => {
    for (const t of TEMPERATURES) {
      const fit = maxOne(blackbodyFit(t));
      const ref = maxOne(blackbodyPlanck(t));
      for (let k = 0; k < 3; k++)
        expect(Math.abs(fit[k]! - ref[k]!), `${t} K`).toBeLessThan(2 / 255);
    }
  });

  it('runs from red to blue as the star gets hotter, at luminance 1', () => {
    let lastBlueOverRed = 0;
    for (const t of TEMPERATURES) {
      const [r, , b] = blackbodyFit(t);
      expect(luminance(blackbodyFit(t))).toBeCloseTo(1, 4);
      expect(b / r).toBeGreaterThanOrEqual(lastBlueOverRed);
      lastBlueOverRed = b / r;
    }
  });

  it('gives the same colours in the shader as in TypeScript', async () => {
    const device = await getTestDevice();
    const texture = device.createTexture({
      size: [TEMPERATURES.length, 1],
      format: 'rgba32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const list = TEMPERATURES.map((t) => t.toFixed(3)).join(', ');
    const pipeline = createFullscreenPipeline(device, {
      fragment: {
        label: 'blackbody test',
        code: `#include "fullscreen.wgsl"
#include "blackbody.wgsl"
@fragment fn fs(in: FullscreenVarying) -> @location(0) vec4f {
  let temperatures = array(${list});
  return vec4f(blackbody_fit(temperatures[i32(in.position.x)]), 1.0);
}`,
        chunks: {
          ...fullscreen.chunks,
          ...blackbody.chunks,
          'fullscreen.wgsl': fullscreen.code,
          'color.wgsl': color.code,
          'blackbody.wgsl': blackbody.code,
        },
      },
      format: 'rgba32float',
    });
    const encoder = device.createCommandEncoder();
    renderFullscreen(encoder, texture.createView(), pipeline, []);
    device.queue.submit([encoder.finish()]);
    const values = new Float32Array((await readTexture(device, texture, 16)).buffer);
    texture.destroy();
    TEMPERATURES.forEach((t, i) => {
      const want = blackbodyFit(t);
      for (let k = 0; k < 3; k++) expect(values[i * 4 + k]!, `${t} K`).toBeCloseTo(want[k]!, 3);
    });
  });
});
