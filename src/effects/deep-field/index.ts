import {
  flickerIntensity,
  FLICKER_SAFE_MAX_RATE,
  type FlickerSettings,
} from '../../gpu/flicker.ts';
import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import { PointList } from '../../gpu/points.ts';
import { trackPointer, type PointerTracker } from '../../gpu/pointer.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { DOSE_PARAMS, dosed } from '../../gpu/safety/dose.ts';
import { trackScroll, type ScrollTracker } from '../../gpu/scroll.ts';
import { withChunks } from '../../gpu/shader.ts';
import { createSpotLayer, uploadSpots } from '../../gpu/stars/spot.ts';
import { magnitudeLight, makeStars, starColours } from '../../gpu/stars/stars.ts';
import { createUniformBuffer, defineUniformStruct } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';
import shader from './nebula.wgsl';

const Params = defineUniformStruct('Params', {
  offset: 'vec2f',
  aspect: 'f32',
  margin: 'f32',
  sky: 'vec3f',
  scale: 'f32',
  seed: 'vec2f',
  glow: 'f32',
  dust: 'f32',
  oxygen: 'f32',
  palette: 'f32',
  /** The morph's clock, noise units; `morph` is 1 while it flows. */
  time: 'f32',
  morph: 'f32',
  /** The nebula's hue turn, radians, and its OKLCH chroma scale. */
  hue: 'f32',
  vivid: 'f32',
});

/** Noise units a second the nebula flows at a morph of 1: a slow churn, not a boil. */
const MORPH_RATE = 0.06;
/** The baked nebula's size as a share of the view: half when still, a third while it morphs. */
const STILL_SCALE = 0.5;
const MORPH_SCALE = 1 / 3;

/** The most stars `dose` asks for; 60% of them at the default. */
const MAX_STARS = 6000;
/**
 * Depth layers, far to near: how far each moves with the parallax, and how much dimmer than its
 * stars' magnitudes it draws them (far layers hold the faint, crowded background).
 */
const LAYERS = [
  { depth: 0.2, dimming: 1 },
  { depth: 0.4, dimming: 0.6 },
  { depth: 0.65, dimming: 0.25 },
  { depth: 1, dimming: 0 },
] as const;
/** The nebula's share of the parallax: it is further away than any of the stars. */
const NEBULA_DEPTH = 0.1;
/** Room round the view, in views, that the stars wrap through and the baked nebula covers. */
const MARGIN = 0.12;
/**
 * Light of a magnitude-0 star in scene units. The tail's ACES curve has a toe that crushes faint
 * light, so a background field needs more than star-splat's 6 for its sixth-magnitude stars to
 * show at all; the brightest are rolled off by the same curve.
 */
const ZERO_MAGNITUDE_LIGHT = 40;
/** The sky's own faint glow, linear. */
const SKY: [number, number, number] = [0.0012, 0.0012, 0.0028];
/**
 * Screen widths a second the nearest layer drifts at the default. The whole field drifts one way,
 * but the layers' different speeds break it up (Snow Temple 2.1): far under the 0.05 cap.
 */
const DRIFT = 0.004;

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    ...DOSE_PARAMS,
    drift: { type: 'number', default: 1, min: 0, max: 3, step: 0.05 },
    parallax: {
      type: 'number',
      default: 1,
      min: 0,
      max: 3,
      step: 0.05,
      label: 'parallax (pointer, scroll)',
    },
    sigma: {
      type: 'number',
      default: 0.8,
      min: 0.5,
      max: 2,
      step: 0.05,
      label: 'spot width (σ, device px)',
    },
    saturation: { type: 'number', default: 0.7, min: 0, max: 1, step: 0.01, label: 'star colour' },
    halo: { type: 'number', default: 0.05, min: 0, max: 0.3, step: 0.01, label: 'halo share' },
    nebula: { type: 'number', default: 1, min: 0, max: 3, step: 0.05, label: 'nebula glow' },
    dust: { type: 'number', default: 0.85, min: 0, max: 1, step: 0.01 },
    oxygen: { type: 'number', default: 0.7, min: 0, max: 2, step: 0.05, label: 'oxygen (teal)' },
    palette: { type: 'select', default: 'natural', options: ['natural', 'hubble'] },
    seed: { type: 'number', default: 3, min: 0, max: 100, step: 1 },
    morph: {
      type: 'number',
      default: 0,
      min: 0,
      max: 3,
      step: 0.05,
      label: 'nebula morph (re-bakes every frame)',
    },
    hue: { type: 'number', default: 0, min: -180, max: 180, step: 1, label: 'nebula hue (°)' },
    // Stars in space hold still; twinkling is what the air does to them. Off by default.
    twinkle: { type: 'number', default: 0, min: 0, max: 0.9, step: 0.01, label: 'twinkle' },
    twinkleRate: {
      type: 'number',
      default: 2.5,
      min: 0.5,
      max: FLICKER_SAFE_MAX_RATE,
      step: 0.1,
      label: 'twinkle rate (knots/s)',
    },
    vivid: {
      type: 'number',
      default: 1,
      min: 0,
      max: 3,
      step: 0.05,
      label: 'nebula colour strength',
    },
    // Under The Hero's Journey's whole-field hue cap of half a turn a second, by a factor of three.
    hueSpeed: { type: 'number', default: 0, min: 0, max: 60, step: 1, label: 'colour cycle (°/s)' },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0 },
  },
  presets: {
    'deep field': {},
    'stars only': { nebula: 0 },
    'hubble palette': { palette: 'hubble' },
    'dense and still': { dose: 0.6, drift: 0 },
    'living hubble': { palette: 'hubble', morph: 1, hueSpeed: 12, vivid: 1.6, twinkle: 0.5 },
    twinkling: { twinkle: 0.6 },
  },

  async create({ device, format, hdr, canvas, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'deep-field' });
    const spots = createSpotLayer(device, { label: 'deep-field', format: tail.scene.format });
    const uniforms = createUniformBuffer(device, Params, 'deep-field');
    const fragment = withChunks(shader, { 'params.wgsl': Params.wgsl });
    const bakePipeline = createFullscreenPipeline(device, {
      fragment,
      entryPoint: 'bake',
      format: 'rgba16float',
      label: 'deep-field nebula bake',
    });
    const compositePipeline = createFullscreenPipeline(device, {
      fragment,
      entryPoint: 'composite',
      format: tail.scene.format,
      label: 'deep-field nebula',
    });
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    const bakeGroup = device.createBindGroup({
      layout: bakePipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniforms.buffer } }],
    });
    let baked: GPUTexture | undefined;
    let compositeGroup: GPUBindGroup | undefined;
    let bakedKey = '';

    // The pointer and the page's scroll move the layers; neither exists in a headless test.
    const live =
      typeof window !== 'undefined' && typeof canvas.getBoundingClientRect === 'function';
    let pointer: PointerTracker | undefined;
    let scroll: ScrollTracker | undefined;
    if (live) {
      pointer = trackPointer(canvas);
      scroll = trackScroll(canvas);
    }

    const stars = makeStars({ count: MAX_STARS, seed: 5, brightest: -1, faintest: 7.5 });
    let colours = starColours(stars, params.saturation);
    let saturation = params.saturation;
    const list = new PointList();
    let width = 1;
    let height = 1;
    let clock = 0;
    let morphClock = 0;
    let hueClock = 0;
    let twinkleClock = 0;
    // The parallax offset, eased, in view heights.
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
        morphClock += time.delta * params.morph * MORPH_RATE;
        hueClock = (hueClock + time.delta * params.hueSpeed) % 360;
        // The flicker signal repeats every 1024 s; its clock wraps there.
        twinkleClock = (twinkleClock + time.delta) % 1024;
        if (params.saturation !== saturation) {
          saturation = params.saturation;
          colours = starColours(stars, saturation);
        }
        // Where the pointer and scroll ask the view to look, eased so a jump of the pointer glides.
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
          // The drift, in widths; the look, in heights, turned into widths for x.
          x: depth * (DRIFT * clock + (params.parallax * look.x) / aspect),
          y: depth * params.parallax * look.y,
        });

        // The nebula: baked again only when its size or settings change, or every frame while it
        // morphs. The texture is remade when the view's size or the morph's resolution changes.
        const morphing = params.morph > 0;
        const key = JSON.stringify([
          morphing,
          width,
          height,
          params.nebula,
          params.dust,
          params.oxygen,
          params.palette,
          params.seed,
        ]);
        const nebulaShift = shift(NEBULA_DEPTH);
        uniforms.set({
          offset: [nebulaShift.x / (1 + 2 * MARGIN), nebulaShift.y / (1 + 2 * MARGIN)],
          aspect,
          margin: MARGIN,
          sky: SKY,
          scale: 2.2,
          seed: [params.seed * 17.3, params.seed * 5.1],
          glow: 0.16 * params.nebula,
          dust: params.dust,
          oxygen: params.oxygen,
          palette: params.palette === 'hubble' ? 1 : 0,
          time: morphClock,
          morph: morphing ? 1 : 0,
          hue: ((params.hue + hueClock) * Math.PI) / 180,
          vivid: params.vivid,
        });
        uniforms.upload();
        const resized = key !== bakedKey;
        if (resized) {
          bakedKey = key;
          baked?.destroy();
          const scale = (morphing ? MORPH_SCALE : STILL_SCALE) * (1 + 2 * MARGIN);
          baked = device.createTexture({
            label: 'deep-field nebula',
            size: [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))],
            format: 'rgba16float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
          });
          compositeGroup = device.createBindGroup({
            layout: compositePipeline.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: { buffer: uniforms.buffer } },
              { binding: 1, resource: baked.createView() },
              { binding: 2, resource: sampler },
            ],
          });
        }
        if (resized || morphing) {
          renderFullscreen(encoder, baked!.createView(), bakePipeline, [bakeGroup], {
            timestampWrites: profiler.pass('nebula bake'),
          });
        }
        renderFullscreen(encoder, tail.scene.view, compositePipeline, [compositeGroup!], {
          timestampWrites: profiler.pass('nebula'),
        });

        // The stars, layer by layer, each wrapping through the margin as it drifts.
        const shown = Math.round(dosed(params.dose, 0, 0.6, 1) * MAX_STARS);
        const span = 1 + 2 * MARGIN;
        // Twinkle: each star's light times its own band-limited flicker signal (Fire Temple's
        // construction, src/gpu/flicker.ts), divided by the signal's mean so the field's average
        // light holds. Each signal is capped at three flashes a second, whatever its seed.
        const twinkle: FlickerSettings = {
          rate: params.twinkleRate,
          depth: params.twinkle,
          shimmer: params.twinkle > 0 ? 0.02 : 0,
          shimmerRate: 12,
        };
        const twinkleMean = 1 - (twinkle.depth + twinkle.shimmer) / 2;
        list.clear();
        for (let i = 0; i < shown; i++) {
          const layer =
            LAYERS[Math.min(LAYERS.length - 1, Math.floor(stars.z[i]! * LAYERS.length))]!;
          const s = shift(layer.depth);
          const u = ((((stars.x[i]! * span - s.x) % span) + span) % span) - MARGIN;
          const v = ((((stars.y[i]! * span - s.y) % span) + span) % span) - MARGIN;
          let light = ZERO_MAGNITUDE_LIGHT * magnitudeLight(stars.magnitude[i]! + layer.dimming);
          if (twinkle.depth > 0) light *= flickerIntensity(twinkleClock, i, twinkle) / twinkleMean;
          list.push(
            u * width,
            v * height,
            params.sigma,
            colours[i * 3]! * light,
            colours[i * 3 + 1]! * light,
            colours[i * 3 + 2]! * light,
          );
        }
        uploadSpots(list, spots);
        spots.encode(
          encoder,
          tail.scene.view,
          { width, height, minSigma: 0.5, halo: params.halo, haloMin: 0.3 },
          profiler,
        );
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({ stars: list.count }),
      destroy() {
        pointer?.destroy();
        scroll?.destroy();
        baked?.destroy();
        spots.destroy();
        uniforms.destroy();
        tail.destroy();
      },
    };
  },
});
