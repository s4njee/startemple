import { describe, expect, it } from 'vitest';
import { createFullscreenPipeline, renderFullscreen } from '../src/gpu/fullscreen.ts';
import {
  cubeDirection,
  cubeFace,
  surfaceAt,
  texelArea,
  texelDirection,
} from '../src/gpu/world/cube-sphere.ts';
import { createWorldCube } from '../src/gpu/world/world.ts';
import world from '../src/gpu/world/world.wgsl';
import fbm from '../src/wgsl/fbm.wgsl';
import fullscreen from '../src/wgsl/fullscreen.wgsl';
import { getTestDevice, readTexture } from './gpu.ts';

// Story 5.1: the cube sphere. Its faces in WebGPU's order and orientation, its edges joined, and
// the baked cube read back along the edges as smoothly as across a face.

const angle = (a: readonly number[], b: readonly number[]) =>
  Math.acos(Math.min(1, a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!));

describe('cube sphere (CPU)', () => {
  it('finds the face and place of a direction it made', () => {
    for (let face = 0; face < 6; face++) {
      for (const [s, t] of [
        [0, 0],
        [0.5, -0.3],
        [-0.9, 0.8],
        [0.99, 0.99],
      ] as const) {
        const back = cubeFace(cubeDirection(face, s, t));
        expect(back.face).toBe(face);
        expect(back.s).toBeCloseTo(s, 9);
        expect(back.t).toBeCloseTo(t, 9);
      }
    }
  });

  it("joins every edge: one texel past an edge is the next face's edge texel", () => {
    const size = 64;
    // The angle between neighbouring texels at a face's centre; smaller towards its edges.
    const spacing = 2 / size;
    let worst = 0;
    for (let face = 0; face < 6; face++) {
      for (let i = 0; i < size; i++) {
        // The four edges of this face, each texel stepped one texel outwards past the edge.
        const c = (2 * (i + 0.5)) / size - 1;
        const out = 1 + 1 / size;
        for (const [s, t, x0, y0] of [
          [out, c, size - 1, i],
          [-out, c, 0, i],
          [c, out, i, size - 1],
          [c, -out, i, 0],
        ] as const) {
          const inside = texelDirection(face, x0, y0, size);
          const beyond = cubeDirection(face, s, t);
          const there = cubeFace(beyond);
          expect(there.face).not.toBe(face);
          // The neighbour face's texel that holds that point.
          const x = Math.min(size - 1, Math.max(0, Math.floor(((there.s + 1) * size) / 2)));
          const y = Math.min(size - 1, Math.max(0, Math.floor(((there.t + 1) * size) / 2)));
          const neighbour = texelDirection(there.face, x, y, size);
          const local = spacing * Math.sqrt(texelArea(1, c));
          worst = Math.max(worst, angle(inside, neighbour) / local);
        }
      }
    }
    // A flipped or turned face would put the neighbour across the face, tens of texels away.
    expect(worst).toBeLessThan(1.6);
  });

  it('keeps texels within a factor of 5.2 in area, against a pole row of a lat-long map', () => {
    expect(texelArea(0, 0) / texelArea(1, 1)).toBeCloseTo(3 ** 1.5, 6);
  });

  it('puts ice at the poles and on high ground, ocean below the sea', () => {
    expect(surfaceAt(0.2, 1.4)).toBe('ice');
    expect(surfaceAt(-0.3, 0.1)).toBe('ocean');
    expect(surfaceAt(0.2, 0.1)).toBe('land');
    expect(surfaceAt(0.05, 0.95)).toBe('land');
    expect(surfaceAt(0.6, 0.95)).toBe('ice');
  });
});

describe('cube sphere (GPU)', () => {
  it('reads the baked cube across edges and corners as well as inside a face', async () => {
    const device = await getTestDevice();
    const size = 128;
    const cube = createWorldCube(device, size, 'world test');
    cube.bake(3, 0);
    // Directions along three great circles, each crossing four edges, and round one corner.
    const count = 1024;
    const texture = device.createTexture({
      size: [count, 1],
      format: 'rgba32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const pipeline = createFullscreenPipeline(device, {
      fragment: {
        label: 'world test',
        code: `#include "fullscreen.wgsl"
#include "fbm.wgsl"
#include "world.wgsl"
@group(0) @binding(0) var cube: texture_cube<f32>;
@group(0) @binding(1) var smp: sampler;
@fragment fn fs(in: FullscreenVarying) -> @location(0) vec4f {
  let i = u32(in.position.x);
  let k = f32(i % 256u) / 256.0 * 6.2831853;
  var d: vec3f;
  switch (i / 256u) {
    case 0u: { d = vec3f(cos(k), 0.31, sin(k)); }
    case 1u: { d = vec3f(0.27, cos(k), sin(k)); }
    case 2u: { d = vec3f(cos(k), sin(k), -0.23); }
    default: { d = vec3f(1.0, 1.0, 1.0) + 0.25 * vec3f(cos(k), sin(k), -cos(k) - sin(k)); }
  }
  d = normalize(d);
  let baked = textureSampleLevel(cube, smp, d, 0.0).r;
  let a = abs(d);
  let edge = max(max(a.x, a.y), a.z);
  // How far from the nearest edge, in face units: 0 on an edge.
  let second = a.x + a.y + a.z - edge - min(min(a.x, a.y), a.z);
  return vec4f(baked, world_height(d, vec3f(${seedOf(3).join(', ')})), 1.0 - second / edge, 1.0);
}`,
        chunks: {
          ...fullscreen.chunks,
          ...fbm.chunks,
          'fullscreen.wgsl': fullscreen.code,
          'fbm.wgsl': fbm.code,
          'world.wgsl': world.code,
        },
      },
      format: 'rgba32float',
    });
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    const group = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: cube.view },
        { binding: 1, resource: sampler },
      ],
    });
    const encoder = device.createCommandEncoder();
    renderFullscreen(encoder, texture.createView(), pipeline, [group]);
    device.queue.submit([encoder.finish()]);
    const values = new Float32Array((await readTexture(device, texture, 16)).buffer);
    texture.destroy();
    cube.destroy();
    let nearEdge = 0;
    let inside = 0;
    for (let i = 0; i < count; i++) {
      const error = Math.abs(values[i * 4]! - values[i * 4 + 1]!);
      if (values[i * 4 + 2]! < 2 / size) nearEdge = Math.max(nearEdge, error);
      else if (values[i * 4 + 2]! > 0.2) inside = Math.max(inside, error);
    }
    // The cube holds the field it was baked from, to its texels' resolution (bilinear error),
    // and no worse within a texel of an edge than in the middle of a face: no seam.
    expect(inside).toBeGreaterThan(0);
    expect(inside).toBeLessThan(0.1);
    expect(nearEdge).toBeLessThan(inside * 1.5 + 0.01);
  });
});

/** The seed `createWorldCube.bake` derives. */
function seedOf(seed: number): [number, number, number] {
  const s = (seed * 0.618034) % 1;
  return [s * 97.1, s * 41.3 + 3, s * 13.7 + 7];
}
