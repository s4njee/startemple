import type { PointList } from '../points.ts';
import type { PassProfiler } from '../profiler.ts';
import { createShader, withChunks } from '../shader.ts';
import { createUniformBuffer, defineUniformStruct } from '../uniforms.ts';
import shader from './spot.wgsl';

/*
 * Star spots (story 2.1): each star drawn as a Gaussian integrated over every pixel's square, added
 * to the scene. Moon Temple's point layer (src/gpu/points.ts) conserves a point's light too, as the
 * exact area of a disc in each pixel. Both keep the sum. The Gaussian also keeps the look: a disc
 * the size of a pixel lights one pixel when centred and four when on a corner, so its peak swings
 * by a factor of four as it drifts; a Gaussian half a pixel wide or more barely changes shape
 * (story 2.3 measures both).
 *
 *   const spots = createSpotLayer(device, { label, format: tail.scene.format });
 *   list.push(x, y, sigma, r, g, b);        // a PointList: same layout as the point layer
 *   list.upload(spots);
 *   spots.encode(encoder, tail.scene.view, { width, height, halo: 0.04 }, profiler);
 *
 * The layer adds onto the target as it is (`clear` to start from a colour).
 */

/** Floats per star: (x, y, sigma, unused) in device pixels, then (r, g, b, unused). */
export const SPOT_FLOATS = 8;
const INITIAL_STARS = 1024;

/** How far a quad reaches, in standard deviations (the shader's SPOT_REACH). */
export const SPOT_REACH = 3.5;

const SpotParams = defineUniformStruct('SpotParams', {
  out_size: 'vec2f',
  gain: 'f32',
  min_sigma: 'f32',
  halo_share: 'f32',
  halo_scale: 'f32',
  halo_min: 'f32',
});

export interface SpotFrame {
  /** Target size, device pixels. */
  width: number;
  height: number;
  /** Multiplies every star's light. Default 1. */
  gain?: number;
  /** No spot narrower than this, device pixels. Default 0.3. */
  minSigma?: number;
  /** Share of a bright star's light in its halo, 0..1. Default 0. */
  halo?: number;
  /** The halo's width as a multiple of the core's. Default 6. */
  haloScale?: number;
  /** Stars with less luminance than this get no halo (and a small quad). Default 0.05. */
  haloMin?: number;
  clear?: GPUColor;
}

export interface SpotLayer {
  setStars(data: Float32Array, count: number): void;
  encode(
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    frame: SpotFrame,
    profiler?: PassProfiler,
  ): void;
  destroy(): void;
}

export function createSpotLayer(
  device: GPUDevice,
  options: { label: string; format?: GPUTextureFormat },
): SpotLayer {
  const { label } = options;
  const format = options.format ?? 'rgba16float';
  const uniforms = createUniformBuffer(device, SpotParams, `${label} spots`);
  const module = createShader(device, withChunks(shader, { 'spot-params.wgsl': SpotParams.wgsl }));
  const add: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one', operation: 'add' };
  const pipeline = device.createRenderPipeline({
    label: `${label} spots`,
    layout: 'auto',
    vertex: { module, entryPoint: 'spot_vs' },
    fragment: {
      module,
      entryPoint: 'spot_fs',
      targets: [{ format, blend: { color: add, alpha: add } }],
    },
  });

  let capacity = 0;
  let buffer: GPUBuffer | undefined;
  let group: GPUBindGroup | undefined;
  let count = 0;

  function ensureCapacity(stars: number) {
    if (stars <= capacity && buffer) return;
    capacity = Math.max(INITIAL_STARS, 2 ** Math.ceil(Math.log2(Math.max(1, stars))));
    buffer?.destroy();
    buffer = device.createBuffer({
      label: `${label} spots`,
      size: capacity * SPOT_FLOATS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    group = device.createBindGroup({
      label: `${label} spots`,
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer } },
        { binding: 1, resource: { buffer: uniforms.buffer } },
      ],
    });
  }
  ensureCapacity(INITIAL_STARS);

  return {
    setStars(data, stars) {
      ensureCapacity(stars);
      count = stars;
      if (stars > 0) device.queue.writeBuffer(buffer!, 0, data, 0, stars * SPOT_FLOATS);
    },
    encode(encoder, target, frame, profiler) {
      uniforms.set({
        out_size: [frame.width, frame.height],
        gain: frame.gain ?? 1,
        min_sigma: frame.minSigma ?? 0.3,
        halo_share: frame.halo ?? 0,
        halo_scale: frame.haloScale ?? 6,
        halo_min: frame.haloMin ?? 0.05,
      });
      uniforms.upload();
      const pass = encoder.beginRenderPass({
        label: `${label} spots`,
        colorAttachments: [
          frame.clear
            ? { view: target, loadOp: 'clear', clearValue: frame.clear, storeOp: 'store' }
            : { view: target, loadOp: 'load', storeOp: 'store' },
        ],
        timestampWrites: profiler?.pass('stars'),
      });
      if (count > 0) {
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, group!);
        pass.draw(6, count);
      }
      pass.end();
    },
    destroy() {
      buffer?.destroy();
      uniforms.destroy();
    },
  };
}

/** Upload a PointList's stars (the same layout) to a spot layer. */
export function uploadSpots(list: PointList, layer: SpotLayer): void {
  layer.setStars(list.data, list.count);
}

// --- The CPU twin, for tests and the shimmer study ----------------------------------------------

/** The complementary error function for x ≥ 0, Abramowitz and Stegun 7.1.26 (`spot_erfc`). */
export function erfc(x: number): number {
  const t = 1 / (1 + 0.3275911 * x);
  const poly =
    t *
    (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return poly * Math.exp(-x * x);
}

/** The share of a unit Gaussian of standard deviation `sigma` inside [x − 0.5, x + 0.5] (`spot_span`). */
export function spotSpan(x: number, sigma: number): number {
  const k = 1 / (sigma * Math.SQRT2);
  const a = Math.abs(x);
  if (a >= 0.5) return 0.5 * (erfc((a - 0.5) * k) - erfc((a + 0.5) * k));
  return 1 - 0.5 * (erfc((0.5 - a) * k) + erfc((a + 0.5) * k));
}

/** The share of a star's light in the pixel whose centre is `dx`, `dy` from the star. */
export function spotShare(dx: number, dy: number, sigma: number): number {
  return spotSpan(dx, sigma) * spotSpan(dy, sigma);
}
