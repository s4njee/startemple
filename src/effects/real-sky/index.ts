import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { DOSE_PARAMS, dosed } from '../../gpu/safety/dose.ts';
import { createShader, withChunks } from '../../gpu/shader.ts';
import { decodeCatalogue, precess, yearsSince2000 } from '../../gpu/stars/catalogue.ts';
import { visitorPlace } from '../../gpu/stars/place.ts';
import { julianDate, localSiderealTime } from '../../gpu/stars/sky.ts';
import { magnitudeLight, starColour } from '../../gpu/stars/stars.ts';
import { createUniformBuffer, defineUniformStruct } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';
import shader from './real-sky.wgsl';

const Params = defineUniformStruct('Params', {
  out_size: 'vec2f',
  lst: 'f32',
  latitude: 'f32',
  view_alt: 'f32',
  view_az: 'f32',
  scale: 'f32',
  gain: 'f32',
  sigma: 'f32',
  extinction: 'f32',
  twinkle: 'f32',
  wind: 'f32',
  time: 'f32',
  ridge: 'f32',
  ridge_seed: 'f32',
  glow: 'f32',
  zenith: 'vec3f',
  halo_share: 'f32',
  horizon: 'vec3f',
  halo_scale: 'f32',
  halo_min: 'f32',
});

/** Floats per star in the storage buffer: (ra, dec, light, seed), (r, g, b, unused). */
const STAR_FLOATS = 8;
/** Light of a magnitude-0 star in scene units: as deep-field's, for the tonemap's toe. */
const ZERO_MAGNITUDE_LIGHT = 40;
/** The sky's glow at the zenith and at the horizon, linear: a dark site, with a little town glow. */
const ZENITH: [number, number, number] = [0.0008, 0.001, 0.0025];
const HORIZON: [number, number, number] = [0.012, 0.011, 0.016];
const deg = Math.PI / 180;

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    ...DOSE_PARAMS,
    place: { type: 'select', default: 'time zone', options: ['time zone', 'fixed'] },
    latitude: { type: 'number', default: 40, min: -90, max: 90, step: 0.1, label: 'latitude (°)' },
    longitude: {
      type: 'number',
      default: 0,
      min: -180,
      max: 180,
      step: 0.1,
      label: 'longitude (°, east)',
    },
    hours: { type: 'number', default: 0, min: -24, max: 24, step: 0.25, label: 'hours from now' },
    speed: {
      type: 'number',
      default: 60,
      min: 0,
      max: 600,
      step: 1,
      label: 'time-lapse (× real time)',
    },
    facing: {
      type: 'number',
      default: 180,
      min: 0,
      max: 360,
      step: 1,
      label: 'facing (° from north)',
    },
    lookUp: { type: 'number', default: 32, min: 0, max: 90, step: 1, label: 'looking up (°)' },
    fov: { type: 'number', default: 100, min: 30, max: 180, step: 1, label: 'field of view (°)' },
    limit: { type: 'number', default: 6.5, min: 2, max: 8, step: 0.1, label: 'faintest (mag)' },
    twinkle: { type: 'number', default: 1, min: 0, max: 2, step: 0.05, label: 'scintillation' },
    wind: { type: 'number', default: 1, min: 0.2, max: 2, step: 0.05 },
    extinction: {
      type: 'number',
      default: 0.25,
      min: 0,
      max: 0.6,
      step: 0.01,
      label: 'extinction (mag/airmass)',
    },
    hills: { type: 'number', default: 4, min: 0, max: 15, step: 0.5, label: 'hills (°)' },
    glow: { type: 'number', default: 1, min: 0, max: 4, step: 0.05, label: 'sky glow' },
    saturation: { type: 'number', default: 0.7, min: 0, max: 1, step: 0.01, label: 'star colour' },
    sigma: {
      type: 'number',
      default: 0.8,
      min: 0.5,
      max: 2,
      step: 0.05,
      label: 'spot width (σ, device px)',
    },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0 },
  },
  presets: {
    'tonight, facing south': {},
    'facing north': { facing: 0, lookUp: 30 },
    'whole sky': { lookUp: 90, fov: 180, hills: 2 },
    'still air': { twinkle: 0.2, wind: 0.5 },
    'from Sydney': { place: 'fixed', latitude: -33.87, longitude: 151.21 },
  },

  async create({ device, format, hdr, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'real-sky' });
    const uniforms = createUniformBuffer(device, Params, 'real-sky');
    const fragment = withChunks(shader, { 'params.wgsl': Params.wgsl });
    const skyPipeline = createFullscreenPipeline(device, {
      fragment,
      entryPoint: 'sky_fs',
      format: tail.scene.format,
      label: 'real-sky sky',
    });
    const module = createShader(device, fragment);
    const add: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one', operation: 'add' };
    const starPipeline = device.createRenderPipeline({
      label: 'real-sky stars',
      layout: 'auto',
      vertex: { module, entryPoint: 'star_vs' },
      fragment: {
        module,
        entryPoint: 'star_fs',
        targets: [{ format: tail.scene.format, blend: { color: add, alpha: add } }],
      },
    });

    // The catalogue, precessed to today, brightest first; colours redone when `saturation` moves.
    const started = Date.now();
    const sky = decodeCatalogue();
    precess(sky, yearsSince2000(new Date(started)));
    const data = new Float32Array(sky.count * STAR_FLOATS);
    let saturation = NaN;
    const fill = () => {
      saturation = params.saturation;
      const cache = new Map<number, [number, number, number]>();
      for (let i = 0; i < sky.count; i++) {
        const t = Math.round(sky.temperature[i]! / 25) * 25;
        let c = cache.get(t);
        if (!c) cache.set(t, (c = starColour(t, saturation)));
        const light = ZERO_MAGNITUDE_LIGHT * magnitudeLight(sky.magnitude[i]!);
        data.set([sky.ra[i]!, sky.dec[i]!, light, i, c[0], c[1], c[2], 0], i * STAR_FLOATS);
      }
    };
    fill();
    const starBuffer = device.createBuffer({
      label: 'real-sky catalogue',
      size: data.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(starBuffer, 0, data);
    const skyGroup = device.createBindGroup({
      layout: skyPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniforms.buffer } }],
    });
    const starGroup = device.createBindGroup({
      layout: starPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniforms.buffer } },
        { binding: 1, resource: { buffer: starBuffer } },
      ],
    });
    const here = visitorPlace(new Date(started));

    let width = 1;
    let height = 1;
    // Seconds of sky time passed (time-lapse included), and of real time for the twinkling.
    let skyClock = 0;
    let clock = 0;

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        skyClock += time.delta * params.speed * dosed(params.dose, 0, 1, 1.5);
        clock = (clock + time.delta) % 1024;
        if (params.saturation !== saturation) {
          fill();
          device.queue.writeBuffer(starBuffer, 0, data);
        }
        const fixed = params.place === 'fixed';
        const latitude = (fixed ? params.latitude : here.latitude) * deg;
        const longitude = (fixed ? params.longitude : here.longitude) * deg;
        const when = new Date(started + params.hours * 3_600_000 + skyClock * 1000);
        const fov = params.fov * deg;
        uniforms.set({
          out_size: [width, height],
          lst: localSiderealTime(julianDate(when), longitude),
          latitude,
          view_alt: params.lookUp * deg,
          view_az: params.facing * deg,
          // Pixels per unit of the stereographic plane: the half-height spans fov / 2.
          scale: height / 2 / (2 * Math.tan(fov / 4)),
          gain: 1,
          sigma: params.sigma,
          extinction: params.extinction,
          twinkle: params.twinkle * dosed(params.dose, 0.3, 1, 1.4),
          wind: params.wind,
          time: clock,
          ridge: params.hills * deg,
          ridge_seed: 7.3,
          glow: params.glow,
          zenith: ZENITH,
          halo_share: 0.05,
          horizon: HORIZON,
          halo_scale: 6,
          halo_min: 0.3,
        });
        uniforms.upload();
        renderFullscreen(encoder, tail.scene.view, skyPipeline, [skyGroup], {
          timestampWrites: profiler.pass('sky'),
        });
        // Brightest first: the first n stars are every star down to the limit.
        let shown = 0;
        while (shown < sky.count && sky.magnitude[shown]! <= params.limit) shown++;
        const pass = encoder.beginRenderPass({
          label: 'real-sky stars',
          colorAttachments: [{ view: tail.scene.view, loadOp: 'load', storeOp: 'store' }],
          timestampWrites: profiler.pass('stars'),
        });
        pass.setPipeline(starPipeline);
        pass.setBindGroup(0, starGroup);
        pass.draw(6, shown);
        pass.end();
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({ stars: sky.count }),
      destroy() {
        starBuffer.destroy();
        uniforms.destroy();
        tail.destroy();
      },
    };
  },
});
