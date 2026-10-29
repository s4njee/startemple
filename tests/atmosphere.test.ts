import { describe, expect, it } from 'vitest';
import { createFullscreenPipeline, renderFullscreen } from '../src/gpu/fullscreen.ts';
import {
  chapmanSchuler,
  column,
  columnNumeric,
  createAtmosphereTables,
  EARTH_AIR,
  lutRadiusCosine,
  lutUv,
  miePhase,
  rayleighPhase,
  singleScattering,
  thickerAir,
  type Atmosphere,
} from '../src/gpu/world/atmosphere.ts';
import atmosphere from '../src/gpu/world/atmosphere.wgsl';
import fullscreen from '../src/wgsl/fullscreen.wgsl';
import { getTestDevice, readTexture } from './gpu.ts';

// Story 5.2: the atmosphere. The closed-form column against brute force, the tables'
// parametrisation, the CPU reference's sky, and atmosphere.wgsl's three methods against it.

const air = EARTH_AIR;
const deg = Math.PI / 180;

describe('the closed-form column (Chapman)', () => {
  it('matches brute force from the ground to the horizon, and from above looking down past it', () => {
    let worst = 0;
    for (const height of [air.rayleighHeight, air.mieHeight]) {
      for (const h of [0, 2, 10, 40]) {
        for (const mu of [1, 0.7, 0.3, 0.1, 0.03, 0, -0.03, -0.08]) {
          const r = air.ground + h;
          // Downwards rays that would meet the ground are the planet's shadow, not a column.
          if (mu < 0 && r * Math.sqrt(1 - mu * mu) < air.ground + 0.5) continue;
          const want = columnNumeric(r, mu, air.ground, height, air.top + 20 * height);
          const got = column(r, mu, air.ground, height);
          worst = Math.max(worst, Math.abs(got / want - 1));
        }
      }
    }
    expect(worst).toBeLessThan(0.01);
  });

  it("does better than Schüler's simpler form, which is 14% low a few degrees up", () => {
    const r = air.ground;
    const want = columnNumeric(r, 0.1, air.ground, air.rayleighHeight, air.top + 160);
    const schuler = air.rayleighHeight * chapmanSchuler(r / air.rayleighHeight, 0.1);
    expect(schuler / want).toBeLessThan(0.9);
    expect(column(r, 0.1, air.ground, air.rayleighHeight) / want).toBeCloseTo(1, 2);
  });
});

describe('the transmittance table', () => {
  it('turns (radius, cosine) into texel coordinates and back', () => {
    for (const [r, mu] of [
      [air.ground + 1, 0.4],
      [air.ground + 30, -0.05],
      [air.top - 1, 0.9],
      [air.ground + 0.2, 0.01],
    ] as const) {
      const [u, v] = lutUv(air, r, mu);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
      const [r2, mu2] = lutRadiusCosine(air, u, v);
      expect(r2).toBeCloseTo(r, 6);
      expect(mu2).toBeCloseTo(mu, 6);
    }
  });
});

describe('phase functions', () => {
  it('each integrate to one over the sphere', () => {
    for (const phase of [
      rayleighPhase,
      (c: number) => miePhase(c, 0.8),
      (c: number) => miePhase(c, 0.3),
    ]) {
      let sum = 0;
      const n = 20000;
      for (let i = 0; i < n; i++) sum += phase(-1 + (2 * (i + 0.5)) / n) * (2 / n) * 2 * Math.PI;
      expect(sum).toBeCloseTo(1, 2);
    }
  });
});

describe('the CPU reference', () => {
  const eye = [0, air.ground + 0.002, 0];
  const up = (elevation: number, azimuth = 0) => [
    Math.cos(elevation) * Math.cos(azimuth),
    Math.sin(elevation),
    Math.cos(elevation) * Math.sin(azimuth),
  ];
  it('makes a blue sky overhead at noon', () => {
    const sky = singleScattering(air, eye, up(90 * deg), up(60 * deg), 64, 32).inscatter;
    expect(sky[2]).toBeGreaterThan(sky[1]);
    expect(sky[1]).toBeGreaterThan(sky[0]);
  });
  it('reddens the setting sun and the sky round it', () => {
    const sun = up(1 * deg);
    const through = singleScattering(air, eye, sun, sun, 64, 32);
    expect(through.transmittance[0]).toBeGreaterThan(3 * through.transmittance[2]);
    // Seen from the ground, the light through the low sun is red over blue, overhead still blue.
    const overhead = singleScattering(air, eye, up(90 * deg), sun, 64, 32).inscatter;
    expect(overhead[2]).toBeGreaterThan(overhead[0]);
  });
  it('keeps the vertical columns, and so the sky overhead, when the air is drawn thicker', () => {
    const thick = thickerAir(air, 3);
    const a = singleScattering(air, eye, up(90 * deg), up(40 * deg), 128, 32).inscatter;
    const b = singleScattering(thick, eye, up(90 * deg), up(40 * deg), 128, 32).inscatter;
    for (let c = 0; c < 3; c++) expect(b[c]! / a[c]!).toBeCloseTo(1, 1);
  });
});

/** Each ray: origin, direction, sun. From the ground (noon, low sun) and from orbit (limb, disc). */
const RAYS: [number[], number[], number[]][] = [
  [
    [0, 6360.5, 0],
    [0, 1, 0],
    [0.5, 0.866, 0],
  ],
  [
    [0, 6360.5, 0],
    [0.995, 0.1, 0],
    [0.999, 0.04, 0],
  ],
  [
    [0, 6360.5, 0],
    [-0.98, 0.2, 0],
    [0.999, 0.04, 0],
  ],
  [
    [0, 0, 25000],
    [0, 0.2545, -0.967],
    [0, 0.6, 0.8],
  ],
  [
    [0, 0, 25000],
    [0, 0.1, -0.995],
    [0.8, 0, 0.6],
  ],
].map(([o, d, s]) => {
  const n = (v: number[]) => v.map((x) => x / Math.hypot(...v));
  return [o!, n(d!), n(s!)];
});

async function gpuScattering(
  device: GPUDevice,
  method: number,
  ms: boolean,
  atmo: Atmosphere,
): Promise<Float32Array> {
  const tables = createAtmosphereTables(device, 'atmosphere test');
  tables.bake(atmo);
  const texture = device.createTexture({
    size: [RAYS.length, 2],
    format: 'rgba32float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const v = (x: readonly number[]) => `vec3f(${x.map((c) => c.toFixed(7)).join(', ')})`;
  const pipeline = createFullscreenPipeline(device, {
    fragment: {
      label: 'atmosphere test',
      code: `#include "fullscreen.wgsl"
#include "atmosphere.wgsl"
@group(0) @binding(0) var lut: texture_2d<f32>;
@group(0) @binding(1) var ms_lut: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;
@fragment fn fs(in: FullscreenVarying) -> @location(0) vec4f {
  let atmo = Atmo(${atmo.ground}, ${atmo.top}, ${v(atmo.rayleigh)}, ${atmo.rayleighHeight}, ${atmo.mie}, ${atmo.mieExtinction}, ${atmo.mieHeight}, ${atmo.mieG});
  let origins = array(${RAYS.map((r) => v(r[0])).join(', ')});
  let dirs = array(${RAYS.map((r) => v(r[1])).join(', ')});
  let suns = array(${RAYS.map((r) => v(r[2])).join(', ')});
  let i = u32(in.position.x);
  let ro = origins[i];
  let rd = dirs[i];
  let top = atmo_sphere(ro, rd, atmo.top);
  let ground = atmo_sphere(ro, rd, atmo.ground);
  var t1 = top.y;
  if (ground.x <= ground.y && ground.x > 0.0) { t1 = ground.x; }
  let result = atmo_integrate(atmo, ro, rd, max(top.x, 0.0), t1, suns[i], 64, ${method}u, ${ms}, lut, ms_lut, smp);
  if (in.position.y < 1.0) { return vec4f(result.inscatter, 1.0); }
  return vec4f(result.transmittance, 1.0);
}`,
      chunks: {
        ...fullscreen.chunks,
        'fullscreen.wgsl': fullscreen.code,
        'atmosphere.wgsl': atmosphere.code,
      },
    },
    format: 'rgba32float',
  });
  const group = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: tables.transmittance },
      { binding: 1, resource: tables.multiple },
      { binding: 2, resource: tables.sampler },
    ],
  });
  const encoder = device.createCommandEncoder();
  renderFullscreen(encoder, texture.createView(), pipeline, [group]);
  device.queue.submit([encoder.finish()]);
  const out = new Float32Array((await readTexture(device, texture, 16)).buffer);
  texture.destroy();
  tables.destroy();
  return out;
}

describe('atmosphere.wgsl', () => {
  const reference = RAYS.map(([o, d, s]) => singleScattering(air, o, d, s, 512, 128));
  const luminance = (c: readonly number[]) => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;

  for (const [name, method, tolerance] of [
    ['reference', 2, 0.03],
    ['closed form', 0, 0.06],
    ['tables', 1, 0.06],
  ] as const) {
    it(`gives the CPU reference's sky by the ${name}`, async () => {
      const device = await getTestDevice();
      const out = await gpuScattering(device, method, false, air);
      RAYS.forEach((_, i) => {
        const got = [out[i * 4]!, out[i * 4 + 1]!, out[i * 4 + 2]!];
        const want = reference[i]!.inscatter;
        expect(
          Math.abs(luminance(got) / luminance(want) - 1),
          `ray ${i}: ${got} vs ${want}`,
        ).toBeLessThan(tolerance);
        const transmittance = out[(RAYS.length + i) * 4 + 1]!;
        expect(transmittance).toBeCloseTo(reference[i]!.transmittance[1], 2);
      });
    });
  }

  it('brightens the sky with the light scattered more than once, never by double', async () => {
    const device = await getTestDevice();
    const single = await gpuScattering(device, 1, false, air);
    const multiple = await gpuScattering(device, 1, true, air);
    RAYS.forEach((_, i) => {
      const gain =
        luminance([multiple[i * 4]!, multiple[i * 4 + 1]!, multiple[i * 4 + 2]!]) /
        luminance([single[i * 4]!, single[i * 4 + 1]!, single[i * 4 + 2]!]);
      expect(gain, `ray ${i}`).toBeGreaterThan(1.01);
      expect(gain, `ray ${i}`).toBeLessThan(2);
    });
  });
});
