import { writeFileSync } from 'node:fs';
import { it, vi } from 'vitest';
import { createPointLayer, POINT_FLOATS } from '../src/gpu/points.ts';
import { createShader } from '../src/gpu/shader.ts';
import { createSpotLayer, SPOT_FLOATS } from '../src/gpu/stars/spot.ts';
import { getTestDevice, readTexture } from '../tests/gpu.ts';

vi.setConfig({ testTimeout: 1_200_000 });

// Story 2.3: how much a star's look changes with where it sits between pixels, which is what a
// panning field shows as shimmer. Every sub-pixel position a panning star passes through is drawn
// at once: one star per 32 px cell on a 16 x 16 grid, at phases evenly over the pixel. Three ways
// of drawing a star, each at several sizes:
//
//   naive    hello's disc: fixed radius, soft rim, light not normalised (stars.wgsl)
//   disc     Moon Temple's point layer: the exact area of a disc in each pixel, light conserved
//   gauss    the star spot: a Gaussian integrated over each pixel, light conserved
//
// Per star, over all phases, as the spread (max - min) / mean:
//
//   total    the linear light summed over the star's pixels
//   peak     its brightest pixel
//   shown    the light the screen emits: each pixel clipped or tonemapped, put through 8-bit sRGB
//            and back to linear, summed. For a faint star (total light 0.3), a bright one (3) and
//            a very bright one (30), clipped and through the tail's ACES tonemap.
//
// Writes docs/studies/shimmer.md and shimmer.json. Run with
//   npx vitest run --config experiments/vite.config.ts experiments/shimmer.test.ts

const GRID = 16;
const CELL = 32;
const SIZE = GRID * CELL;

const NAIVE_WGSL = `
struct Star { at: vec4f, light: vec4f }
@group(0) @binding(0) var<storage, read> stars: array<Star>;
@group(0) @binding(1) var<uniform> size: vec4f;
struct V { @builtin(position) position: vec4f, @location(0) local: vec2f, @location(1) light: f32 }
@vertex fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> V {
  let corners = array(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  let s = stars[i];
  let p = s.at.xy + corners[v] * s.at.z * 1.6;
  var out: V;
  out.position = vec4f(p / size.xy * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
  out.local = corners[v] * 1.6;
  out.light = s.light.r;
  return out;
}
@fragment fn fs(in: V) -> @location(0) vec4f {
  return vec4f(in.light * (1.0 - smoothstep(0.7, 1.15, length(in.local))), 0.0, 0.0, 0.0);
}`;

/** IEEE half float to number. */
function half(bits: number): number {
  const exponent = (bits >> 10) & 0x1f;
  const fraction = bits & 0x3ff;
  const sign = bits & 0x8000 ? -1 : 1;
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
  if (exponent === 31) return fraction ? NaN : sign * Infinity;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

const encode = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const decode = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
/** What the screen emits for a linear value, after 8-bit sRGB. */
const shown = (v: number) => decode(Math.round(encode(Math.min(Math.max(v, 0), 1)) * 255) / 255);
/** The tail's default tonemap (color.wgsl `tonemap_aces`). */
const aces = (v: number) => Math.min(1, (v * (2.51 * v + 0.03)) / (v * (2.43 * v + 0.59) + 0.14));

/** The stars' data: one per cell, at evenly spread sub-pixel phases. */
function layout(size: number, floats: number): Float32Array {
  const data = new Float32Array(GRID * GRID * floats);
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const k = j * GRID + i;
      // Phases (i + 0.5) / GRID across, a different interleave down, so both axes are covered.
      const fx = (i + 0.5) / GRID;
      const fy = (((i * 7 + j) % GRID) + 0.5) / GRID;
      data.set(
        [i * CELL + CELL / 2 + fx, j * CELL + CELL / 2 + fy, size, 0, 1, 1, 1, 0],
        k * floats,
      );
    }
  }
  return data;
}

async function draw(
  device: GPUDevice,
  method: 'naive' | 'disc' | 'gauss',
  size: number,
): Promise<Float32Array> {
  const texture = device.createTexture({
    size: [SIZE, SIZE],
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const view = texture.createView();
  const encoder = device.createCommandEncoder();
  const cleanup: (() => void)[] = [];
  if (method === 'gauss') {
    const layer = createSpotLayer(device, { label: 'shimmer' });
    layer.setStars(layout(size, SPOT_FLOATS), GRID * GRID);
    layer.encode(encoder, view, { width: SIZE, height: SIZE, minSigma: 0.05, clear: [0, 0, 0, 0] });
    cleanup.push(() => layer.destroy());
  } else if (method === 'disc') {
    const layer = createPointLayer(device, { label: 'shimmer' });
    layer.setPoints(layout(size, POINT_FLOATS), GRID * GRID);
    layer.encode(encoder, view, {
      width: SIZE,
      height: SIZE,
      clear: [0, 0, 0, 0],
      aperture: {
        blades: 0,
        rotation: 0,
        curvature: 0,
        rim: 0,
        rings: 0,
        ringCount: 1,
        vignette: 0,
      },
    });
    cleanup.push(() => layer.destroy());
  } else {
    const module = createShader(device, { label: 'naive stars', code: NAIVE_WGSL });
    const add: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one' };
    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [{ format: 'rgba16float', blend: { color: add, alpha: add } }],
      },
    });
    const data = layout(size, 8);
    const stars = device.createBuffer({
      size: data.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(stars, 0, data);
    const uniform = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(uniform, 0, new Float32Array([SIZE, SIZE, 0, 0]));
    const group = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: stars } },
        { binding: 1, resource: { buffer: uniform } },
      ],
    });
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view, loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, group);
    pass.draw(6, GRID * GRID);
    pass.end();
    cleanup.push(() => {
      stars.destroy();
      uniform.destroy();
    });
  }
  device.queue.submit([encoder.finish()]);
  const bits = new Uint16Array((await readTexture(device, texture, 8)).buffer);
  texture.destroy();
  for (const c of cleanup) c();
  const red = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < red.length; i++) red[i] = half(bits[i * 4]!);
  return red;
}

interface Row {
  method: string;
  size: number;
  /** Mean linear light of a star, for normalising the brightness tiers. */
  mean: number;
  total: number;
  peak: number;
  /** Mean brightest pixel, as a share of the star's light. */
  peakShare: number;
  faintClip: number;
  brightClip: number;
  brightTonemap: number;
  veryBrightTonemap: number;
}

const spread = (values: readonly number[]) => {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return (Math.max(...values) - Math.min(...values)) / mean;
};

function measure(method: string, size: number, red: Float32Array): Row {
  const totals: number[] = [];
  const peaks: number[] = [];
  const cells: Float32Array[] = [];
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const cell = new Float32Array(CELL * CELL);
      for (let y = 0; y < CELL; y++) {
        for (let x = 0; x < CELL; x++)
          cell[y * CELL + x] = red[(j * CELL + y) * SIZE + i * CELL + x]!;
      }
      cells.push(cell);
      totals.push(cell.reduce((a, b) => a + b, 0));
      peaks.push(Math.max(...cell));
    }
  }
  const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
  // Each star scaled so its mean light is the tier's: the naive disc's light varies by method.
  const shownSpread = (light: number, map: (v: number) => number) =>
    spread(cells.map((cell) => cell.reduce((sum, v) => sum + shown(map((v / mean) * light)), 0)));
  return {
    method,
    size,
    mean,
    total: spread(totals),
    peak: spread(peaks),
    peakShare: peaks.reduce((a, b) => a + b, 0) / peaks.length / mean,
    faintClip: shownSpread(0.3, (v) => v),
    brightClip: shownSpread(3, (v) => v),
    brightTonemap: shownSpread(3, aces),
    veryBrightTonemap: shownSpread(30, aces),
  };
}

it('shimmer', async () => {
  const device = await getTestDevice();
  const configs: [method: 'naive' | 'disc' | 'gauss', sizes: number[]][] = [
    ['naive', [0.6, 1.2, 2]],
    ['disc', [0.5, 0.75, 1, 1.5, 2]],
    ['gauss', [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1]],
  ];
  const rows: Row[] = [];
  for (const [method, sizes] of configs) {
    for (const size of sizes) rows.push(measure(method, size, await draw(device, method, size)));
  }
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const table = [
    '| Method | Size (px) | Total light | Peak pixel | Peak share | Shown, faint | Shown, bright, clipped | Shown, bright, ACES | Shown, very bright, ACES |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...rows.map(
      (r) =>
        `| ${r.method} | ${r.size} | ${pct(r.total)} | ${pct(r.peak)} | ${r.peakShare.toFixed(2)} | ${pct(r.faintClip)} | ${pct(r.brightClip)} | ${pct(r.brightTonemap)} | ${pct(r.veryBrightTonemap)} |`,
    ),
  ].join('\n');
  writeFileSync('docs/studies/shimmer.json', JSON.stringify(rows, null, 2) + '\n');
  console.log(table);
});
