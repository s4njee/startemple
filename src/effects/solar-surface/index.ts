import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { DOSE_PARAMS, dosed } from '../../gpu/safety/dose.ts';
import { withChunks } from '../../gpu/shader.ts';
import { prominenceColour } from '../../gpu/sun/sun.ts';
import { createUniformBuffer, defineUniformStruct, uniformArray } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';
import shader from './solar-surface.wgsl';

const Params = defineUniformStruct('Params', {
  centre: 'vec2f',
  radius: 'f32',
  time: 'f32',
  tint: 'vec3f',
  rotation: 'f32',
  corona_colour: 'vec3f',
  axis: 'f32',
  prominence_colour: 'vec3f',
  granules: 'f32',
  contrast: 'f32',
  activity: 'f32',
  seed: 'f32',
  beyond: 'f32',
  light: 'f32',
  filter_tint: 'f32',
  spots: uniformArray('vec4f', 6),
  arches: uniformArray('vec4f', 4),
});

const deg = Math.PI / 180;

/** Sunspots on the Sun's turning frame: longitude, latitude, umbra and penumbra radii (radians). */
const SPOTS: [number, number, number, number][] = [
  [0.15, 0.22, 0.018, 0.042],
  [0.25, 0.2, 0.008, 0.02],
  [-0.5, -0.3, 0.012, 0.03],
  [-0.44, -0.27, 0.006, 0.014],
  [0.9, -0.18, 0.01, 0.024],
  [-1.2, 0.25, 0.014, 0.035],
];

/** Prominences on the limb: position angle, half-span, height and thickness (solar radii). */
const ARCHES: [number, number, number, number][] = [
  [0.5, 0.07, 0.07, 0.022],
  [2.7, 0.04, 0.05, 0.016],
  [4.1, 0.1, 0.045, 0.02],
  [5.6, 0.03, 0.09, 0.014],
];

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    ...DOSE_PARAMS,
    granules: {
      type: 'number',
      default: 150,
      min: 40,
      max: 1200,
      step: 10,
      label: 'granules across the disc',
    },
    contrast: {
      type: 'number',
      default: 0.04,
      min: 0,
      max: 0.1,
      step: 0.005,
      label: 'granule contrast',
    },
    activity: { type: 'number', default: 0.6, min: 0, max: 1, step: 0.05, label: 'solar activity' },
    turn: { type: 'number', default: 1, min: 0, max: 5, step: 0.05, label: 'rotation speed' },
    zoom: { type: 'number', default: 1, min: 1, max: 12, step: 0.1 },
    beyond: {
      type: 'number',
      default: 6,
      min: 0,
      max: 30,
      step: 0.1,
      label: 'corona and prominences (×10⁴)',
    },
    filter: {
      type: 'number',
      default: 0.35,
      min: 0,
      max: 1,
      step: 0.05,
      label: 'solar filter tint',
    },
    ...TAIL_PARAMS,
    exposure: { ...TAIL_PARAMS.exposure, default: 0.8 },
    bloom: { ...TAIL_PARAMS.bloom, default: 0.15 },
  },
  presets: {
    'the disc': {},
    'close up': { zoom: 7, granules: 900 },
    'quiet sun': { activity: 0 },
    'white light': { filter: 0 },
    'through a filter': { filter: 1 },
  },

  async create({ device, format, hdr, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'solar-surface' });
    const uniforms = createUniformBuffer(device, Params, 'solar-surface');
    const pipeline = createFullscreenPipeline(device, {
      fragment: withChunks(shader, { 'params.wgsl': Params.wgsl }),
      entryPoint: 'sun_fs',
      format: tail.scene.format,
      label: 'solar-surface',
    });
    const group = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniforms.buffer } }],
    });
    const pink = prominenceColour();
    let width = 1;
    let height = 1;
    let clock = 3;
    let rotation = 0;

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        const pace = dosed(params.dose, 0, 1, 1.8);
        // A granule lives about six seconds here (eight minutes on the Sun).
        clock += (time.delta * pace) / 6;
        rotation += time.delta * pace * params.turn * 0.4 * deg;
        const radius = 0.44 * Math.min(width, height) * params.zoom;
        // Zoomed in, the view centres on the largest spot group, which turns with the Sun.
        const [lon, lat] = SPOTS[0]!;
        const look =
          params.zoom > 1
            ? [Math.cos(lat) * Math.sin(lon + rotation), Math.sin(lat) * Math.cos(7 * deg)]
            : [0, 0];
        const shown = Math.round(params.activity * SPOTS.length);
        const spots = new Float32Array(24);
        SPOTS.slice(0, shown).forEach((s, i) => spots.set(s, i * 4));
        const arches = new Float32Array(16);
        ARCHES.forEach((a, i) => arches.set(a, i * 4));
        uniforms.set({
          centre: [width / 2 - look[0]! * radius, height / 2 + look[1]! * radius],
          radius,
          time: clock,
          tint: [1.25, 0.62, 0.18],
          rotation,
          corona_colour: [1, 0.97, 0.92],
          axis: 7 * deg,
          prominence_colour: pink,
          granules: params.granules,
          contrast: params.contrast,
          activity: params.activity,
          seed: 4.2,
          beyond: params.beyond * 1e4,
          light: 0.42,
          filter_tint: params.filter,
          spots,
          arches,
        });
        uniforms.upload();
        renderFullscreen(encoder, tail.scene.view, pipeline, [group], {
          timestampWrites: profiler.pass('sun'),
        });
        tail.encode(encoder, target, time, params, profiler);
      },
      destroy() {
        uniforms.destroy();
        tail.destroy();
      },
    };
  },
});
