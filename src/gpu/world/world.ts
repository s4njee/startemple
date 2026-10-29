import { createFullscreenPipeline, renderFullscreen } from '../fullscreen.ts';
import { withChunks } from '../shader.ts';
import { createUniformBuffer, defineUniformStruct } from '../uniforms.ts';
import shader from './world-bake.wgsl';

// The world's cube map (story 5.1): `world.wgsl`'s surface baked once into the six faces of a
// cube texture, so a planet's shader reads its height, cloud, lights and moisture with one
// hardware-filtered fetch along a direction. A planet does not change shape, so it is drawn once
// (Snow Temple 4.2): rebaked only when its seed or sea level changes.
//
//   r  height, about −1 to 1        g  cloud density, 0 to 1
//   b  city lights, 0 to 1          a  moisture, 0 dry to 1 wet

const BakeParams = defineUniformStruct('BakeParams', {
  seed: 'vec3f',
  size: 'f32',
  face: 'u32',
  sea: 'f32',
});

export interface WorldCube {
  /** The cube view, for `texture_cube<f32>`. */
  readonly view: GPUTextureView;
  readonly size: number;
  /** Bakes the faces now, on the queue, ahead of whatever the caller submits next. */
  bake(seed: number, sea: number): void;
  destroy(): void;
}

/** A cube `size` texels a face, rgba16float (8 bytes a texel: 12.6 MB at 512). */
export function createWorldCube(device: GPUDevice, size = 512, label = 'world'): WorldCube {
  const texture = device.createTexture({
    label: `${label} cube`,
    size: [size, size, 6],
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  const pipeline = createFullscreenPipeline(device, {
    fragment: withChunks(shader, { 'bake-params.wgsl': BakeParams.wgsl }),
    entryPoint: 'bake_fs',
    format: 'rgba16float',
    label: `${label} bake`,
  });
  const uniforms = createUniformBuffer(device, BakeParams, `${label} bake`);
  const group = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniforms.buffer } }],
  });
  const faces = [0, 1, 2, 3, 4, 5].map((face) =>
    texture.createView({ dimension: '2d', baseArrayLayer: face, arrayLayerCount: 1 }),
  );
  return {
    view: texture.createView({ dimension: 'cube' }),
    size,
    bake(seed, sea) {
      // One submit a face: a uniform written between passes of one command buffer would reach
      // every pass with its last value (Moon Temple), but writes and submits keep their order.
      const s = (seed * 0.618034) % 1;
      for (let face = 0; face < 6; face++) {
        uniforms.set({ seed: [s * 97.1, s * 41.3 + 3, s * 13.7 + 7], size, face, sea });
        uniforms.upload();
        const encoder = device.createCommandEncoder({ label: `${label} bake ${face}` });
        renderFullscreen(encoder, faces[face]!, pipeline, [group]);
        device.queue.submit([encoder.finish()]);
      }
    },
    destroy() {
      texture.destroy();
      uniforms.destroy();
    },
  };
}
