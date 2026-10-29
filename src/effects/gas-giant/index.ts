import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { DOSE_PARAMS, dosed } from '../../gpu/safety/dose.ts';
import { withChunks } from '../../gpu/shader.ts';
import { createUniformBuffer, defineUniformStruct, uniformArray } from '../../gpu/uniforms.ts';
import { createStarBackdrop } from '../../gpu/world/backdrop.ts';
import { createRingTexture } from '../../gpu/world/rings.ts';
import { defineEffect } from '../types.ts';
import shader from './gas-giant.wgsl';
import { meta } from './meta.ts';

const Params = defineUniformStruct('Params', {
  eye: 'vec3f',
  time: 'f32',
  forward: 'vec3f',
  period: 'f32',
  right: 'vec3f',
  bands: 'f32',
  up: 'vec3f',
  band_phase: 'f32',
  sun: 'vec3f',
  wind: 'f32',
  spin_x: 'vec3f',
  equator_jet: 'f32',
  spin_y: 'vec3f',
  minnaert: 'f32',
  spin_z: 'vec3f',
  light: 'f32',
  zone: 'vec3f',
  night: 'f32',
  belt: 'vec3f',
  rings: 'f32',
  polar: 'vec3f',
  pixel_angle: 'f32',
  ring_colour: 'vec3f',
  tan_fov: 'vec2f',
  shift: 'vec2f',
  storms: uniformArray('vec4f', 4),
  storm_colours: uniformArray('vec4f', 4),
});

type V3 = [number, number, number];
const deg = Math.PI / 180;
const FOV = 34 * deg;

interface World {
  zone: V3;
  belt: V3;
  polar: V3;
  bands: number;
  bandPhase: number;
  /** Radians of longitude a second at the default intensity, at the strongest jets. */
  wind: number;
  equatorJet: number;
  minnaert: number;
  rings: boolean;
  /** How far the axis tips towards the viewer, so the rings open. */
  opening: number;
  /** (longitude, latitude, half-width, half-height) radians, and (colour, strength). */
  storms: [number, number, number, number, V3, number][];
}

const WORLDS: Record<string, World> = {
  jupiter: {
    zone: [0.78, 0.7, 0.57],
    belt: [0.5, 0.31, 0.19],
    polar: [0.42, 0.38, 0.35],
    bands: 18,
    bandPhase: 0.6,
    wind: 0.012,
    equatorJet: 0.5,
    minnaert: 1.05,
    rings: false,
    opening: 3,
    storms: [
      [1.25, -22 * deg, 12 * deg, 6 * deg, [0.74, 0.34, 0.2], 0.85],
      [1.9, -33 * deg, 3 * deg, 2 * deg, [0.95, 0.93, 0.88], 0.9],
      [2.35, -33.5 * deg, 2.6 * deg, 1.8 * deg, [0.95, 0.93, 0.88], 0.85],
      [-1.5, 36 * deg, 2.3 * deg, 1.7 * deg, [0.9, 0.88, 0.84], 0.6],
    ],
  },
  saturn: {
    zone: [0.82, 0.72, 0.52],
    belt: [0.68, 0.55, 0.36],
    polar: [0.5, 0.53, 0.52],
    bands: 24,
    bandPhase: 1.1,
    wind: 0.018,
    equatorJet: 0.9,
    minnaert: 1.0,
    rings: true,
    opening: 22,
    storms: [[1.3, 40 * deg, 3 * deg, 1.7 * deg, [0.95, 0.92, 0.85], 0.5]],
  },
  neptune: {
    zone: [0.27, 0.45, 0.86],
    belt: [0.17, 0.31, 0.72],
    polar: [0.22, 0.36, 0.7],
    bands: 8,
    bandPhase: 0.2,
    wind: 0.02,
    equatorJet: -0.6,
    minnaert: 1.1,
    rings: false,
    opening: 8,
    storms: [
      [1.35, -20 * deg, 9 * deg, 4.5 * deg, [0.05, 0.1, 0.32], 0.8],
      [1.37, -13 * deg, 5 * deg, 1 * deg, [0.9, 0.93, 0.98], 0.8],
    ],
  },
};

/** One turn every this many seconds at the default intensity. */
const DAY = 300;

const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: V3): V3 => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    ...DOSE_PARAMS,
    world: { type: 'select', default: 'jupiter', options: Object.keys(WORLDS) },
    rings: { type: 'select', default: 'auto', options: ['auto', 'on', 'off'] },
    wind: { type: 'number', default: 1, min: 0, max: 4, step: 0.05, label: 'wind' },
    storms: { type: 'boolean', default: true },
    sun: {
      type: 'number',
      default: 30,
      min: 0,
      max: 175,
      step: 1,
      label: 'sun from behind you (°)',
    },
    opening: {
      type: 'number',
      default: -1,
      min: -1,
      max: 40,
      step: 1,
      label: 'tipped towards you (°, −1 for the world’s own)',
    },
    zoom: { type: 'number', default: 1, min: 0.5, max: 3, step: 0.05 },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0.15 },
  },
  presets: {
    jupiter: {},
    saturn: { world: 'saturn' },
    'saturn lit from behind': { world: 'saturn', sun: 168, exposure: 1.8 },
    neptune: { world: 'neptune' },
    'jupiter, close': { zoom: 2.2, wind: 1.5 },
  },

  async create({ device, format, hdr, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'gas-giant' });
    const stars = createStarBackdrop(device, tail.scene.format, 'gas-giant');
    const rings = createRingTexture(device, 'gas-giant');
    const uniforms = createUniformBuffer(device, Params, 'gas-giant');
    const pipeline = createFullscreenPipeline(device, {
      fragment: withChunks(shader, { 'params.wgsl': Params.wgsl }),
      entryPoint: 'giant_fs',
      format: tail.scene.format,
      label: 'gas-giant',
      blend: {
        color: { srcFactor: 'one', dstFactor: 'src-alpha' },
        alpha: { srcFactor: 'zero', dstFactor: 'one' },
      },
    });
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    const group = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniforms.buffer } },
        { binding: 1, resource: rings.createView() },
        { binding: 2, resource: sampler },
      ],
    });

    let width = 1;
    let height = 1;
    let clock = 40;
    let turn = 0;

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        const world = WORLDS[params.world] ?? WORLDS.jupiter!;
        const pace = dosed(params.dose, 0, 1, 1.8);
        clock += time.delta * pace;
        turn += (time.delta * pace * 2 * Math.PI) / DAY;
        const ringed = params.rings === 'on' || (params.rings === 'auto' && world.rings);
        const distance = (ringed ? 7.4 : 4.6) / params.zoom;
        const eye: V3 = [0, 0, -distance];
        const forward: V3 = [0, 0, 1];
        const up: V3 = [0, 1, 0];
        const right = norm(cross(up, forward));
        // The axis: tipped towards the viewer to open the rings, rolled a little in the picture.
        const open = (params.opening >= 0 ? params.opening : world.opening) * deg;
        const roll = -14 * deg;
        const axis = norm([
          -Math.sin(roll) * Math.cos(open),
          Math.cos(roll) * Math.cos(open),
          -Math.sin(open),
        ]);
        const a = norm(cross(axis, [0, 0, -1]));
        const b = cross(a, axis);
        const c = Math.cos(turn);
        const s = Math.sin(turn);
        const sx: V3 = [c * a[0] + s * b[0], c * a[1] + s * b[1], c * a[2] + s * b[2]];
        const sz: V3 = [-s * a[0] + c * b[0], -s * a[1] + c * b[1], -s * a[2] + c * b[2]];
        const swing = params.sun * deg;
        const lift = 12 * deg;
        const sun = norm([
          -Math.sin(swing) * Math.cos(lift),
          Math.sin(lift),
          -Math.cos(swing) * Math.cos(lift),
        ]);
        const storms = new Float32Array(16);
        const colours = new Float32Array(16);
        if (params.storms) {
          world.storms.forEach(([lon, lat, w, h, colour, strength], i) => {
            storms.set([lon, lat, w, h], i * 4);
            colours.set([...colour, strength], i * 4);
          });
        }
        const tanY = Math.tan(FOV / 2);
        uniforms.set({
          eye,
          time: clock,
          forward,
          period: 36,
          right,
          bands: world.bands,
          up,
          band_phase: world.bandPhase,
          sun,
          wind: world.wind * params.wind,
          spin_x: sx,
          equator_jet: world.equatorJet,
          spin_y: axis,
          minnaert: world.minnaert,
          spin_z: sz,
          light: 0.72,
          zone: world.zone,
          night: 0.004,
          belt: world.belt,
          rings: ringed ? 1 : 0,
          polar: world.polar,
          pixel_angle: (2 * tanY) / height,
          ring_colour: [0.75, 0.66, 0.53],
          tan_fov: [tanY * (width / height), tanY],
          shift: [0, 0],
          storms,
          storm_colours: colours,
        });
        uniforms.upload();
        stars.encode(encoder, tail.scene.view, width, height, profiler);
        renderFullscreen(encoder, tail.scene.view, pipeline, [group], {
          load: true,
          timestampWrites: profiler.pass('giant'),
        });
        tail.encode(encoder, target, time, params, profiler);
      },
      destroy() {
        stars.destroy();
        rings.destroy();
        uniforms.destroy();
        tail.destroy();
      },
    };
  },
});
