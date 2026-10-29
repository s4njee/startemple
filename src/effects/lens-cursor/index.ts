import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import { trackPointer, type PointerTracker } from '../../gpu/pointer.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { DOSE_PARAMS, dosed } from '../../gpu/safety/dose.ts';
import { withChunks } from '../../gpu/shader.ts';
import { createUniformBuffer, defineUniformStruct } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import shader from './lens.wgsl';
import { meta } from './meta.ts';

const Params = defineUniformStruct('Params', {
  out_size: 'vec2f',
  centre: 'vec2f',
  einstein: 'f32',
  shadow: 'f32',
  ring: 'f32',
  glow: 'f32',
  aspect: 'f32',
  seed: 'f32',
});

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    ...DOSE_PARAMS,
    size: {
      type: 'number',
      default: 0.08,
      min: 0.02,
      max: 0.3,
      step: 0.005,
      label: 'Einstein radius (heights)',
    },
    shadow: {
      type: 'number',
      default: 0.42,
      min: 0,
      max: 0.9,
      step: 0.01,
      label: 'shadow (share)',
    },
    ring: { type: 'number', default: 0.6, min: 0, max: 3, step: 0.05, label: 'photon ring' },
    follow: { type: 'number', default: 0.12, min: 0.02, max: 1, step: 0.01, label: 'follow (s)' },
    image: { type: 'text', default: '', label: 'image URL (blank: a nebula)' },
    seed: { type: 'number', default: 2, min: 0, max: 100, step: 1 },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0 },
  },
  presets: {
    'small hole': {},
    'big hole': { size: 0.18 },
    'no shadow': { shadow: 0, ring: 0 },
  },

  async create({ device, format, hdr, canvas, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'lens-cursor' });
    const uniforms = createUniformBuffer(device, Params, 'lens-cursor');
    const source = withChunks(shader, { 'params.wgsl': Params.wgsl });
    const bake = createFullscreenPipeline(device, {
      fragment: source,
      entryPoint: 'bake',
      format: 'rgba16float',
      label: 'lens-cursor bake',
    });
    const lens = createFullscreenPipeline(device, {
      fragment: source,
      entryPoint: 'lens',
      format: tail.scene.format,
      label: 'lens-cursor lens',
    });
    const bakeGroup = device.createBindGroup({
      layout: bake.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniforms.buffer } }],
    });
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    const live =
      typeof window !== 'undefined' && typeof canvas.getBoundingClientRect === 'function';
    const pointer: PointerTracker | undefined = live ? trackPointer(canvas) : undefined;

    let width = 1;
    let height = 1;
    let scene: GPUTexture | undefined;
    let image: GPUTexture | undefined;
    let lensGroup: GPUBindGroup | undefined;
    let bakedKey = '';
    let imageUrl = '';
    let clock = 0;
    const at = { x: 0.5, y: 0.5 };

    /** A page's own picture as the source, sRGB-decoded on sampling. */
    const loadImage = async (url: string) => {
      try {
        const blob = await (await fetch(url)).blob();
        const bitmap = await createImageBitmap(blob);
        const texture = device.createTexture({
          label: 'lens-cursor image',
          size: [bitmap.width, bitmap.height],
          format: 'rgba8unorm-srgb',
          usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_DST |
            GPUTextureUsage.RENDER_ATTACHMENT,
        });
        device.queue.copyExternalImageToTexture({ source: bitmap }, { texture }, [
          bitmap.width,
          bitmap.height,
        ]);
        image?.destroy();
        image = texture;
        bakedKey = '';
      } catch (error) {
        console.warn('[startemple] lens-cursor could not load the image:', error);
      }
    };

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
        bakedKey = '';
      },
      frame(time, encoder, target) {
        clock += time.delta * dosed(params.dose, 0, 1, 1.5);
        if (live && params.image !== imageUrl) {
          imageUrl = params.image as string;
          if (imageUrl) void loadImage(imageUrl);
          else {
            image?.destroy();
            image = undefined;
            bakedKey = '';
          }
        }
        // Where the lens is: on the pointer, eased; away from it, wandering slowly.
        let wantX = 0.5 + 0.3 * Math.sin(clock * 0.21);
        let wantY = 0.5 + 0.22 * Math.sin(clock * 0.29 + 1.3);
        if (pointer?.state.inside) {
          wantX = pointer.state.x;
          wantY = pointer.state.y;
        }
        const ease = 1 - Math.exp(-time.delta / Math.max(params.follow, 0.01));
        at.x += (wantX - at.x) * ease;
        at.y += (wantY - at.y) * ease;
        uniforms.set({
          out_size: [width, height],
          centre: [at.x * width, at.y * height],
          einstein: params.size * height,
          shadow: params.shadow,
          ring: params.ring,
          glow: 1,
          aspect: width / height,
          seed: params.seed,
        });
        uniforms.upload();
        const key = `${width}x${height}/${params.seed}/${image ? 'image' : 'nebula'}`;
        if (key !== bakedKey) {
          bakedKey = key;
          if (!image) {
            scene?.destroy();
            scene = device.createTexture({
              label: 'lens-cursor scene',
              size: [width, height],
              format: 'rgba16float',
              usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            });
            renderFullscreen(encoder, scene.createView(), bake, [bakeGroup], {
              timestampWrites: profiler.pass('bake'),
            });
          }
          lensGroup = device.createBindGroup({
            layout: lens.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: { buffer: uniforms.buffer } },
              { binding: 1, resource: (image ?? scene!).createView() },
              { binding: 2, resource: sampler },
            ],
          });
        }
        renderFullscreen(encoder, tail.scene.view, lens, [lensGroup!], {
          timestampWrites: profiler.pass('lens'),
        });
        tail.encode(encoder, target, time, params, profiler);
      },
      destroy() {
        pointer?.destroy();
        scene?.destroy();
        image?.destroy();
        uniforms.destroy();
        tail.destroy();
      },
    };
  },
});
