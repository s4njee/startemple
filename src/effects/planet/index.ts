import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { DOSE_PARAMS, dosed } from '../../gpu/safety/dose.ts';
import { trackScroll, type ScrollTracker } from '../../gpu/scroll.ts';
import { withChunks } from '../../gpu/shader.ts';
import { createUniformBuffer, defineUniformStruct } from '../../gpu/uniforms.ts';
import {
  ATMO_FIELDS,
  atmoValues,
  createAtmosphereTables,
  EARTH_AIR,
  thickerAir,
} from '../../gpu/world/atmosphere.ts';
import { createStarBackdrop } from '../../gpu/world/backdrop.ts';
import { createWorldCube } from '../../gpu/world/world.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';
import shader from './planet.wgsl';

const Params = defineUniformStruct('Params', {
  ...ATMO_FIELDS,
  eye: 'vec3f',
  steps: 'f32',
  forward: 'vec3f',
  method: 'u32',
  right: 'vec3f',
  ms: 'f32',
  up: 'vec3f',
  inside: 'f32',
  sun: 'vec3f',
  sea: 'f32',
  spin_x: 'vec3f',
  texel: 'f32',
  spin_y: 'vec3f',
  relief: 'f32',
  spin_z: 'vec3f',
  ice_latitude: 'f32',
  cloud_x: 'vec3f',
  cloud_height: 'f32',
  cloud_y: 'vec3f',
  cloud_cover: 'f32',
  cloud_z: 'vec3f',
  cloud_shadow: 'f32',
  tan_fov: 'vec2f',
  shift: 'vec2f',
  pixel_angle: 'f32',
  cloud_opacity: 'f32',
  glint: 'f32',
  cities: 'f32',
  sun_illuminance: 'f32',
  sun_disc: 'f32',
});

type V3 = [number, number, number];
const deg = Math.PI / 180;
const FOV = 34 * deg;
const METHODS = { 'closed form': 0, tables: 1, reference: 2 } as const;
/** The planet's axis: tipped 23.4° to the right in the picture, and 12° towards the viewer. */
const TILT = 23.4 * deg;
const NOD = 12 * deg;
/** One turn every this many seconds at the default intensity: well inside the rotation cap. */
const DAY = 240;
/** The clouds turn a little slower than the ground, so the weather drifts across it. */
const CLOUD_LAG = 0.06;

const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: V3): V3 => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Rows of the turn from the world into a frame whose y is the axis, spun by `angle`. */
function spinRows(angle: number): [V3, V3, V3] {
  const axis = norm([
    Math.sin(TILT) * Math.cos(NOD),
    Math.cos(TILT) * Math.cos(NOD),
    -Math.sin(NOD),
  ]);
  const a = norm(cross(axis, [0, 0, -1]));
  const b = cross(a, axis);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  // The frame's x and z turn about the axis; its rows are the world's view of them.
  const x: V3 = [c * a[0] + s * b[0], c * a[1] + s * b[1], c * a[2] + s * b[2]];
  const z: V3 = [-s * a[0] + c * b[0], -s * a[1] + c * b[1], -s * a[2] + c * b[2]];
  return [x, axis, z];
}

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    ...DOSE_PARAMS,
    view: { type: 'select', default: 'orbit', options: ['orbit', 'ground'] },
    sun: {
      type: 'number',
      default: 72,
      min: 0,
      max: 180,
      step: 1,
      label: 'sun from behind you (°)',
    },
    scroll: { type: 'boolean', default: true, label: 'scrolling turns day to night' },
    sunHeight: {
      type: 'number',
      default: 3,
      min: -8,
      max: 70,
      step: 0.5,
      label: 'sun above the horizon (°, ground)',
    },
    atmosphere: {
      type: 'select',
      default: 'closed form',
      options: Object.keys(METHODS),
      label: 'atmosphere method',
    },
    multiple: { type: 'boolean', default: true, label: 'multiple scattering (tables)' },
    steps: { type: 'number', default: 12, min: 4, max: 64, step: 1, label: 'steps along a ray' },
    air: { type: 'number', default: 2.5, min: 0, max: 6, step: 0.1, label: 'air thickness' },
    sea: { type: 'number', default: 0.08, min: -0.4, max: 0.4, step: 0.01, label: 'sea level' },
    clouds: { type: 'number', default: 0.45, min: 0, max: 1, step: 0.01, label: 'cloud cover' },
    ice: { type: 'number', default: 66, min: 30, max: 90, step: 1, label: 'ice line (°)' },
    cities: { type: 'number', default: 1, min: 0, max: 3, step: 0.05, label: 'city lights' },
    glint: { type: 'number', default: 1, min: 0, max: 2, step: 0.05, label: 'sun glint' },
    seed: { type: 'number', default: 3, min: 0, max: 100, step: 1 },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0.2 },
  },
  presets: {
    'from orbit': {},
    dusk: { sun: 112 },
    'night side': { sun: 158, cities: 1.5 },
    'sunset from the ground': { view: 'ground', atmosphere: 'tables' },
    'noon from the ground': { view: 'ground', sunHeight: 55, atmosphere: 'tables' },
    'a dry world': { sea: -0.3, clouds: 0.15, ice: 80 },
  },

  async create({ device, format, hdr, canvas, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'planet' });
    const stars = createStarBackdrop(device, tail.scene.format, 'planet');
    const cube = createWorldCube(device, 512, 'planet');
    const tables = createAtmosphereTables(device, 'planet');
    const uniforms = createUniformBuffer(device, Params, 'planet');
    const pipeline = createFullscreenPipeline(device, {
      fragment: withChunks(shader, { 'params.wgsl': Params.wgsl }),
      entryPoint: 'planet_fs',
      format: tail.scene.format,
      label: 'planet',
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
        { binding: 1, resource: cube.view },
        { binding: 2, resource: sampler },
        { binding: 3, resource: tables.transmittance },
        { binding: 4, resource: tables.multiple },
        { binding: 5, resource: tables.skyView },
        { binding: 6, resource: tables.sampler },
      ],
    });
    const live =
      typeof window !== 'undefined' && typeof canvas.getBoundingClientRect === 'function';
    const scroll: ScrollTracker | undefined = live ? trackScroll(canvas) : undefined;

    let width = 1;
    let height = 1;
    let turn = 0.9;
    let bakedWorld = '';
    let bakedAir = '';

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        const worldKey = `${params.seed}/${params.sea}`;
        if (worldKey !== bakedWorld) {
          cube.bake(params.seed, params.sea);
          bakedWorld = worldKey;
        }
        const air = thickerAir(EARTH_AIR, Math.max(params.air, 0.05));
        const thin = params.air <= 0;
        const airKey = JSON.stringify(air) + thin;
        if (airKey !== bakedAir) {
          tables.bake(thin ? { ...air, rayleigh: [0, 0, 0], mie: 0, mieExtinction: 0 } : air);
          bakedAir = airKey;
        }
        turn += (time.delta * dosed(params.dose, 0, 1, 1.8) * 2 * Math.PI) / DAY;
        const progress = scroll ? scroll.update(time.delta).progress : 0.5;
        const ground = params.view === 'ground';
        const R = air.ground;
        const tanY = Math.tan(FOV / 2);
        let eye: V3;
        let forward: V3;
        let up: V3;
        let sun: V3;
        if (ground) {
          // On a hill 300 m up, looking along the sun's bearing, 20° to one side, a little up.
          const e = params.sunHeight * deg;
          sun = norm([
            Math.cos(e) * Math.sin(20 * deg),
            Math.sin(e),
            Math.cos(e) * Math.cos(20 * deg),
          ]);
          eye = [0, R + 0.3, 0];
          const look = 7 * deg;
          forward = norm([0, Math.sin(look), Math.cos(look)]);
          up = norm(cross(cross(forward, [0, 1, 0]), forward));
        } else {
          // From four planet radii, the sun swinging round from behind the viewer as the page scrolls.
          const swing = (params.sun + (params.scroll ? (progress - 0.5) * 140 : 0)) * deg;
          const e = 8 * deg;
          sun = norm([Math.sin(swing) * Math.cos(e), Math.sin(e), -Math.cos(swing) * Math.cos(e)]);
          eye = [0, 0, -4 * R];
          forward = [0, 0, 1];
          up = [0, 1, 0];
        }
        const right = norm(cross(up, forward));
        const [sx, sy, sz] = spinRows(turn);
        const [cx, cy, cz] = spinRows(turn * (1 - CLOUD_LAG));
        const method = METHODS[params.atmosphere as keyof typeof METHODS] ?? 0;
        uniforms.set({
          ...atmoValues(
            thin ? { ...air, rayleigh: [0, 0, 0], mie: 0, mieExtinction: 0, top: R + 1 } : air,
          ),
          eye,
          steps: method === 2 ? 64 : params.steps,
          forward,
          method,
          right,
          ms: params.multiple && method === 1 ? 1 : 0,
          up,
          inside: ground ? 1 : 0,
          sun,
          sea: params.sea,
          spin_x: sx,
          texel: 2 / cube.size,
          spin_y: sy,
          relief: 0.035,
          spin_z: sz,
          ice_latitude: params.ice * deg,
          cloud_x: cx,
          cloud_height: 10 * Math.max(params.air, 1),
          cloud_y: cy,
          cloud_cover: params.clouds,
          cloud_z: cz,
          cloud_shadow: 1,
          tan_fov: [tanY * (width / height), tanY],
          shift: [0, 0],
          pixel_angle: (2 * tanY) / height,
          cloud_opacity: 0.9,
          glint: params.glint,
          cities: 0.12 * params.cities,
          sun_illuminance: 9,
          sun_disc: 1 / (Math.PI * 0.00465 ** 2),
        });
        uniforms.upload();
        if (ground && method === 1) {
          tables.encodeSkyView(
            encoder,
            air,
            R + 0.3,
            sun[1],
            params.multiple,
            profiler.pass('sky view'),
          );
        }
        stars.encode(encoder, tail.scene.view, width, height, profiler);
        renderFullscreen(encoder, tail.scene.view, pipeline, [group], {
          load: true,
          timestampWrites: profiler.pass('planet'),
        });
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({ method: params.atmosphere, view: params.view }),
      destroy() {
        scroll?.destroy();
        stars.destroy();
        cube.destroy();
        tables.destroy();
        uniforms.destroy();
        tail.destroy();
      },
    };
  },
});
