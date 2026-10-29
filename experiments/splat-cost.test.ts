import { writeFileSync } from 'node:fs';
import { it, vi } from 'vitest';
import { createFullscreenPipeline, renderFullscreen } from '../src/gpu/fullscreen.ts';
import { PointList } from '../src/gpu/points.ts';
import { createShader } from '../src/gpu/shader.ts';
import { createSpotLayer, SPOT_FLOATS } from '../src/gpu/stars/spot.ts';
import fullscreen from '../src/wgsl/fullscreen.wgsl';
import { createBenchDevice } from '../tests/bench.ts';

vi.setConfig({ testTimeout: 1_200_000 });

// Story 2.4: at what star count does an instanced quad per star stop being cheap, and does a compute
// pass that splats each star into a buffer with atomics beat it? At 1920 x 1080, on Dawn:
//
//   quads        the star spot (src/gpu/stars/spot.ts), sigma 0.8 px: one instanced quad a star,
//                its integrated Gaussian added by blending
//   splat 7x7    one compute invocation a star adding the same integrated Gaussian over its 7 x 7
//                pixels into a fixed-point u32 buffer with atomicAdd, then a fullscreen pass that
//                turns the buffer into the scene. The buffer is cleared every frame, and that is
//                part of the cost
//   splat 1px    the same, but each star's whole light into its nearest pixel: the cheapest splat,
//                and the one that shimmers (docs/studies/shimmer.md)
//
// Plus the CPU time to refill a PointList each frame, which is how deep-field feeds its stars.
// Writes docs/studies/splat-cost.json. Run with
//   npx vitest run --config experiments/vite.config.ts experiments/splat-cost.test.ts

const WIDTH = 1920;
const HEIGHT = 1080;
const COUNTS = [1_000, 10_000, 100_000, 300_000, 1_000_000];
const SIGMA = 0.8;
/** Fixed-point scale of the splat buffer: 1 unit of light is 2^16. */
const FIXED = 65536;

const SPLAT_WGSL = `
struct Star { at: vec4f, light: vec4f }
struct Splat { size: vec2f, count: f32, reach: f32 }
@group(0) @binding(0) var<storage, read> stars: array<Star>;
@group(0) @binding(1) var<storage, read_write> accum: array<atomic<u32>>;
@group(0) @binding(2) var<uniform> splat: Splat;

fn erfc_(x: f32) -> f32 {
  let t = 1.0 / (1.0 + 0.3275911 * x);
  let poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return poly * exp(-x * x);
}
fn span(x: f32, sigma: f32) -> f32 {
  let k = 1.0 / (sigma * 1.41421356);
  let a = abs(x);
  if (a >= 0.5) { return 0.5 * (erfc_((a - 0.5) * k) - erfc_((a + 0.5) * k)); }
  return 1.0 - 0.5 * (erfc_((0.5 - a) * k) + erfc_((a + 0.5) * k));
}
fn add(px: vec2i, light: vec3f) {
  if (px.x < 0 || px.y < 0 || px.x >= i32(splat.size.x) || px.y >= i32(splat.size.y)) { return; }
  let i = u32(px.y * i32(splat.size.x) + px.x) * 3u;
  let v = vec3u(light * ${FIXED}.0 + 0.5);
  if (v.r > 0u) { atomicAdd(&accum[i], v.r); }
  if (v.g > 0u) { atomicAdd(&accum[i + 1u], v.g); }
  if (v.b > 0u) { atomicAdd(&accum[i + 2u], v.b); }
}

@compute @workgroup_size(64) fn gaussian(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u32(splat.count)) { return; }
  let star = stars[id.x];
  let base = vec2i(floor(star.at.xy));
  let r = i32(splat.reach);
  for (var dy = -r; dy <= r; dy++) {
    for (var dx = -r; dx <= r; dx++) {
      let px = base + vec2i(dx, dy);
      let offset = vec2f(px) + 0.5 - star.at.xy;
      add(px, star.light.rgb * span(offset.x, star.at.z) * span(offset.y, star.at.z));
    }
  }
}

@compute @workgroup_size(64) fn nearest(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u32(splat.count)) { return; }
  let star = stars[id.x];
  add(vec2i(floor(star.at.xy)), star.light.rgb);
}`;

const RESOLVE_WGSL = `#include "fullscreen.wgsl"
@group(0) @binding(0) var<storage, read> accum: array<u32>;
@group(0) @binding(1) var<uniform> size: vec4f;
@fragment fn fs(in: FullscreenVarying) -> @location(0) vec4f {
  let px = vec2u(in.position.xy);
  let i = (px.y * u32(size.x) + px.x) * 3u;
  return vec4f(vec3f(f32(accum[i]), f32(accum[i + 1u]), f32(accum[i + 2u])) / ${FIXED}.0, 1.0);
}`;

function starData(count: number): Float32Array {
  const data = new Float32Array(count * SPOT_FLOATS);
  let seed = 1;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < count; i++) {
    const light = 0.05 + 2 * random() ** 4;
    data.set(
      [random() * WIDTH, random() * HEIGHT, SIGMA, 0, light, light, light, 0],
      i * SPOT_FLOATS,
    );
  }
  return data;
}

it('splat cost', async () => {
  const bench = await createBenchDevice();
  const { device, profiler } = bench;
  const scene = device.createTexture({
    size: [WIDTH, HEIGHT],
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const view = scene.createView();
  const spots = createSpotLayer(device, { label: 'bench' });

  const module = createShader(device, { label: 'splat', code: SPLAT_WGSL });
  const gaussian = device.createComputePipeline({
    layout: 'auto',
    compute: { module, entryPoint: 'gaussian' },
  });
  const nearest = device.createComputePipeline({
    layout: 'auto',
    compute: { module, entryPoint: 'nearest' },
  });
  const resolve = createFullscreenPipeline(device, {
    fragment: {
      label: 'resolve',
      code: RESOLVE_WGSL,
      chunks: { 'fullscreen.wgsl': fullscreen.code },
    },
    format: 'rgba16float',
  });
  const accum = device.createBuffer({
    size: WIDTH * HEIGHT * 3 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const sizeUniform = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(sizeUniform, 0, new Float32Array([WIDTH, HEIGHT, 0, 0]));
  const resolveGroup = device.createBindGroup({
    layout: resolve.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: accum } },
      { binding: 1, resource: { buffer: sizeUniform } },
    ],
  });

  const rows: Record<string, number | string>[] = [];
  for (const count of COUNTS) {
    const data = starData(count);
    spots.setStars(data, count);
    const starBuffer = device.createBuffer({
      size: data.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(starBuffer, 0, data);
    const splatUniform = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const groups = new Map<GPUComputePipeline, GPUBindGroup>();
    for (const pipeline of [gaussian, nearest]) {
      groups.set(
        pipeline,
        device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: starBuffer } },
            { binding: 1, resource: { buffer: accum } },
            { binding: 2, resource: { buffer: splatUniform } },
          ],
        }),
      );
    }
    const splatWith = (pipeline: GPUComputePipeline, reach: number) => {
      return (encoder: GPUCommandEncoder) => {
        device.queue.writeBuffer(splatUniform, 0, new Float32Array([WIDTH, HEIGHT, count, reach]));
        encoder.clearBuffer(accum);
        const pass = encoder.beginComputePass({ timestampWrites: profiler.pass('splat') });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, groups.get(pipeline)!);
        pass.dispatchWorkgroups(Math.ceil(count / 64));
        pass.end();
        renderFullscreen(encoder, view, resolve, [resolveGroup], {
          timestampWrites: profiler.pass('resolve'),
        });
      };
    };
    const quads = await bench.measure((encoder) =>
      spots.encode(
        encoder,
        view,
        { width: WIDTH, height: HEIGHT, minSigma: 0.5, clear: [0, 0, 0, 1] },
        profiler,
      ),
    );
    const gauss = await bench.measure(splatWith(gaussian, 3));
    const single = await bench.measure(splatWith(nearest, 0));

    // The CPU side of a field fed from script: refilling a PointList with every star's position.
    const list = new PointList();
    const t0 = performance.now();
    const fills = 5;
    for (let f = 0; f < fills; f++) {
      list.clear();
      for (let i = 0; i < count; i++) {
        const k = i * SPOT_FLOATS;
        list.push(
          (data[k]! + f) % WIDTH,
          data[k + 1]!,
          SIGMA,
          data[k + 4]!,
          data[k + 5]!,
          data[k + 6]!,
        );
      }
    }
    const fillMs = (performance.now() - t0) / fills;
    rows.push({
      count,
      quadsMs: quads.slopeMs,
      splatGaussianMs: gauss.slopeMs,
      splatPixelMs: single.slopeMs,
      cpuFillMs: fillMs,
      starBufferMb: data.byteLength / 1e6,
    });
    starBuffer.destroy();
    splatUniform.destroy();
  }
  const accumMb = (WIDTH * HEIGHT * 3 * 4) / 1e6;
  writeFileSync(
    'docs/studies/splat-cost.json',
    JSON.stringify(
      { width: WIDTH, height: HEIGHT, sigma: SIGMA, accumMb, metric: 'slope', rows },
      null,
      2,
    ) + '\n',
  );
  console.log(
    '| Stars | Quads (ms) | Splat 7×7 (ms) | Splat 1 px (ms) | CPU fill (ms) | Star buffer (MB) |',
  );
  for (const r of rows) {
    const f = (v: number | string) => (typeof v === 'number' ? v.toFixed(2) : v);
    console.log(
      `| ${r.count} | ${f(r.quadsMs!)} | ${f(r.splatGaussianMs!)} | ${f(r.splatPixelMs!)} | ${f(r.cpuFillMs!)} | ${f(r.starBufferMb!)} |`,
    );
  }
  spots.destroy();
  accum.destroy();
  sizeUniform.destroy();
  scene.destroy();
  bench.destroy();
});
