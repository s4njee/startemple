import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import {
  LINE_PALETTES,
  lineColours,
  paletteStrength,
  type LinePalette,
} from '../../gpu/nebula/lines.ts';
import { PointList } from '../../gpu/points.ts';
import { trackPointer, type PointerTracker } from '../../gpu/pointer.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { DOSE_PARAMS, dosed } from '../../gpu/safety/dose.ts';
import { trackScroll, type ScrollTracker } from '../../gpu/scroll.ts';
import { withChunks } from '../../gpu/shader.ts';
import { createSpotLayer, uploadSpots, type SpotLayer } from '../../gpu/stars/spot.ts';
import { magnitudeLight, makeStars, starColours, type Stars } from '../../gpu/stars/stars.ts';
import { createUniformBuffer, defineUniformStruct } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';
import shader from './nebula.wgsl';

const Params = defineUniformStruct('Params', {
  offset: 'vec2f',
  aspect: 'f32',
  margin: 'f32',
  seed: 'vec2f',
  scale: 'f32',
  glow: 'f32',
  sulphur: 'vec3f',
  dust: 'f32',
  hydrogen_alpha: 'vec3f',
  pad0: 'f32',
  oxygen: 'vec3f',
  pad1: 'f32',
  hydrogen_beta: 'vec3f',
  pad2: 'f32',
  /** Line strengths: sulphur, Hα, oxygen, Hβ. */
  strength: 'vec4f',
  sky: 'vec3f',
});

/**
 * The three layers, far to near: their share of the parallax, the noise's scale, how much light
 * and how much dust each has. The near one is mostly dust, dark lanes and pillars against the glow.
 */
const LAYERS = [
  { depth: 0.06, scale: 1.5, glow: 1, dust: 0.35, stars: 0.55 },
  { depth: 0.16, scale: 2.3, glow: 0.7, dust: 0.55, stars: 0.3 },
  { depth: 0.4, scale: 3.1, glow: 0.18, dust: 1, stars: 0.15 },
] as const;
const MARGIN = 0.12;
const MAX_STARS = 5000;
const ZERO_MAGNITUDE_LIGHT = 40;
const SKY: [number, number, number] = [0.0012, 0.0012, 0.0028];
/** Screen widths a second the nearest layer drifts at the default. */
const DRIFT = 0.004;

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    ...DOSE_PARAMS,
    palette: { type: 'select', default: 'natural', options: LINE_PALETTES },
    glow: { type: 'number', default: 1, min: 0, max: 3, step: 0.05, label: 'nebula glow' },
    dust: { type: 'number', default: 1, min: 0, max: 1.5, step: 0.05 },
    oxygen: { type: 'number', default: 1, min: 0, max: 3, step: 0.05, label: 'oxygen (O III)' },
    sulphur: { type: 'number', default: 1, min: 0, max: 3, step: 0.05, label: 'sulphur (S II)' },
    drift: { type: 'number', default: 1, min: 0, max: 3, step: 0.05 },
    parallax: {
      type: 'number',
      default: 1,
      min: 0,
      max: 3,
      step: 0.05,
      label: 'parallax (pointer, scroll)',
    },
    seed: { type: 'number', default: 5, min: 0, max: 100, step: 1 },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0 },
  },
  presets: {
    'as the eye sees': {},
    'hubble palette': { palette: 'hubble' },
    'two lines': { palette: 'hoo' },
    'dark pillars': { dust: 1.4, glow: 1.3 },
  },

  async create({ device, format, hdr, canvas, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'nebula' });
    const fragment = withChunks(shader, { 'params.wgsl': Params.wgsl });
    const bakePipeline = createFullscreenPipeline(device, {
      fragment,
      entryPoint: 'bake',
      format: 'rgba16float',
      label: 'nebula bake',
    });
    // Each layer over what is behind it: behind * transmittance + light.
    const compositePipeline = createFullscreenPipeline(device, {
      fragment,
      entryPoint: 'composite',
      format: tail.scene.format,
      label: 'nebula layer',
      blend: {
        color: { srcFactor: 'one', dstFactor: 'src-alpha' },
        alpha: { srcFactor: 'zero', dstFactor: 'one' },
      },
    });
    const skyPipeline = createFullscreenPipeline(device, {
      fragment,
      entryPoint: 'sky',
      format: tail.scene.format,
      label: 'nebula sky',
    });
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

    // One uniform buffer, texture and star layer per depth: a buffer written between passes of one
    // command buffer would reach them all with its last value.
    const layers = LAYERS.map((config, i) => {
      const uniforms = createUniformBuffer(device, Params, `nebula layer ${i}`);
      return {
        config,
        uniforms,
        bakeGroup: device.createBindGroup({
          layout: bakePipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer: uniforms.buffer } }],
        }),
        texture: undefined as GPUTexture | undefined,
        compositeGroup: undefined as GPUBindGroup | undefined,
        spots: createSpotLayer(device, {
          label: `nebula stars ${i}`,
          format: tail.scene.format,
        }) as SpotLayer,
        list: new PointList(),
      };
    });
    const skyUniforms = createUniformBuffer(device, Params, 'nebula sky');
    const skyGroup = device.createBindGroup({
      layout: skyPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: skyUniforms.buffer } }],
    });

    const live =
      typeof window !== 'undefined' && typeof canvas.getBoundingClientRect === 'function';
    let pointer: PointerTracker | undefined;
    let scroll: ScrollTracker | undefined;
    if (live) {
      pointer = trackPointer(canvas);
      scroll = trackScroll(canvas);
    }

    const stars: Stars = makeStars({ count: MAX_STARS, seed: 13, brightest: -1, faintest: 7.5 });
    const colours = starColours(stars, 0.7);
    let width = 1;
    let height = 1;
    let clock = 0;
    let bakedKey = '';
    const look = { x: 0, y: 0 };

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
        bakedKey = '';
      },
      frame(time, encoder, target) {
        clock += time.delta * params.drift * dosed(params.dose, 0, 1, 1.6);
        let wantX = 0;
        let wantY = 0;
        if (pointer?.state.inside) {
          wantX = (pointer.state.x - 0.5) * 0.04;
          wantY = (pointer.state.y - 0.5) * 0.04;
        }
        if (scroll) wantY += (scroll.update(time.delta).offset / Math.max(1, height)) * 0.25;
        const ease = 1 - Math.exp(-time.delta / 0.6);
        look.x += (wantX - look.x) * ease;
        look.y += (wantY - look.y) * ease;
        const aspect = width / height;
        const shift = (depth: number) => ({
          x: depth * (DRIFT * clock + (params.parallax * look.x) / aspect),
          y: depth * params.parallax * look.y,
        });

        const palette = lineColours(params.palette as LinePalette);
        const strength = paletteStrength(params.palette as LinePalette);
        const key = JSON.stringify([
          width,
          height,
          params.palette,
          params.glow,
          params.dust,
          params.oxygen,
          params.sulphur,
          params.seed,
        ]);
        const rebake = key !== bakedKey;
        bakedKey = key;
        skyUniforms.set({ sky: SKY });
        skyUniforms.upload();
        renderFullscreen(encoder, tail.scene.view, skyPipeline, [skyGroup], {
          timestampWrites: profiler.pass('sky'),
        });

        const shown = Math.round(dosed(params.dose, 0, 0.6, 1) * MAX_STARS);
        const span = 1 + 2 * MARGIN;
        let first = 0;
        layers.forEach((layer, i) => {
          const s = shift(layer.config.depth);
          layer.uniforms.set({
            offset: [s.x / span, s.y / span],
            aspect,
            margin: MARGIN,
            seed: [params.seed * 17.3 + i * 31.7, params.seed * 5.1 + i * 13.1],
            scale: layer.config.scale,
            glow: 0.12 * params.glow * layer.config.glow,
            sulphur: palette.sulphur,
            dust: params.dust * layer.config.dust,
            hydrogen_alpha: palette.hydrogenAlpha,
            oxygen: palette.oxygen,
            hydrogen_beta: palette.hydrogenBeta,
            strength: [
              strength.sulphur * params.sulphur,
              strength.hydrogenAlpha,
              strength.oxygen * params.oxygen,
              strength.hydrogenBeta,
            ],
            sky: SKY,
          });
          layer.uniforms.upload();
          if (rebake || !layer.texture) {
            layer.texture?.destroy();
            const scale = 0.5 * span;
            layer.texture = device.createTexture({
              label: `nebula layer ${i}`,
              size: [
                Math.max(1, Math.round(width * scale)),
                Math.max(1, Math.round(height * scale)),
              ],
              format: 'rgba16float',
              usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            });
            layer.compositeGroup = device.createBindGroup({
              layout: compositePipeline.getBindGroupLayout(0),
              entries: [
                { binding: 0, resource: { buffer: layer.uniforms.buffer } },
                { binding: 1, resource: layer.texture.createView() },
                { binding: 2, resource: sampler },
              ],
            });
            renderFullscreen(encoder, layer.texture.createView(), bakePipeline, [layer.bakeGroup], {
              timestampWrites: profiler.pass(`bake ${i}`),
            });
          }
          renderFullscreen(encoder, tail.scene.view, compositePipeline, [layer.compositeGroup!], {
            load: true,
            timestampWrites: profiler.pass(`layer ${i}`),
          });
          // The stars just in front of this layer, behind the next: a share of the field each.
          const count = Math.round(layer.config.stars * shown);
          const starShift = shift(layer.config.depth * 1.5 + 0.05);
          layer.list.clear();
          for (let k = first; k < Math.min(shown, first + count); k++) {
            const u = ((((stars.x[k]! * span - starShift.x) % span) + span) % span) - MARGIN;
            const v = ((((stars.y[k]! * span - starShift.y) % span) + span) % span) - MARGIN;
            // Far groups dimmer: they are farther, and seen through more gas.
            const light =
              ZERO_MAGNITUDE_LIGHT * magnitudeLight(stars.magnitude[k]! + 0.8 * (2 - i));
            layer.list.push(
              u * width,
              v * height,
              0.8,
              colours[k * 3]! * light,
              colours[k * 3 + 1]! * light,
              colours[k * 3 + 2]! * light,
            );
          }
          first += count;
          uploadSpots(layer.list, layer.spots);
          layer.spots.encode(
            encoder,
            tail.scene.view,
            { width, height, minSigma: 0.5, halo: 0.05, haloMin: 0.3 },
            profiler,
          );
        });
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({ stars: Math.round(dosed(params.dose, 0, 0.6, 1) * MAX_STARS) }),
      destroy() {
        pointer?.destroy();
        scroll?.destroy();
        for (const layer of layers) {
          layer.texture?.destroy();
          layer.uniforms.destroy();
          layer.spots.destroy();
        }
        skyUniforms.destroy();
        tail.destroy();
      },
    };
  },
});
