import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { DOSE_PARAMS, dosed } from '../../gpu/safety/dose.ts';
import { createShader, withChunks } from '../../gpu/shader.ts';
import { magnitudeLight, makeStars, starColour, starColours } from '../../gpu/stars/stars.ts';
import { createUniformBuffer, defineUniformStruct } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';
import shader from './star-trails.wgsl';

const Params = defineUniformStruct('Params', {
  out_size: 'vec2f',
  pole: 'vec2f',
  scale: 'f32',
  sweep: 'f32',
  sigma: 'f32',
  gain: 'f32',
  min_radius: 'f32',
  hills: 'f32',
  seed: 'f32',
  glow: 'f32',
  zenith: 'vec3f',
  horizon: 'vec3f',
});

/** Must match SEGMENTS in star-trails.wgsl. */
const SEGMENTS = 24;
const MAX_STARS = 4000;
/** Floats per star: (distance from the pole in frame heights, start angle, light, unused), colour. */
const TRAIL_FLOATS = 8;
/** Light of a magnitude-0 star; a trail spreads it along the arc, so it needs more than a spot. */
const ZERO_MAGNITUDE_LIGHT = 1200;
/** The sky turns 15° an hour (sidereal: 360° in 23 h 56 min). */
const DEGREES_PER_HOUR = 360 / 23.9345;
/**
 * The longest arc the pattern analyser reads as no pattern: concentric arcs are stripes, and past
 * about 28° of sky (under two hours) they read as a regular pattern however few the stars
 * (experiments/trails-pattern.test.ts). The default keeps under it; longer exposures are declared
 * presets behind the gate, and a held frame never shows more than this.
 */
const SAFE_SWEEP = (26 * Math.PI) / 180;
const ZENITH: [number, number, number] = [0.0006, 0.0008, 0.002];
const HORIZON: [number, number, number] = [0.008, 0.008, 0.013];

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    ...DOSE_PARAMS,
    hours: {
      type: 'number',
      default: 1.75,
      min: 0.25,
      max: 6,
      step: 0.25,
      label: 'exposure (hours)',
    },
    grow: {
      type: 'number',
      default: 40,
      min: 10,
      max: 120,
      step: 1,
      label: 'seconds to expose',
    },
    sigma: {
      type: 'number',
      default: 0.8,
      min: 0.5,
      max: 2,
      step: 0.05,
      label: 'trail width (σ, device px)',
    },
    saturation: { type: 'number', default: 0.85, min: 0, max: 1, step: 0.01, label: 'star colour' },
    poleHeight: {
      type: 'number',
      default: 0.3,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'pole (share of the height)',
    },
    hills: { type: 'number', default: 0.16, min: 0, max: 0.5, step: 0.01 },
    glow: { type: 'number', default: 1, min: 0, max: 4, step: 0.05, label: 'sky glow' },
    seed: { type: 'number', default: 2, min: 0, max: 100, step: 1 },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0 },
  },
  presets: {
    'an hour and three quarters': {},
    'all night': { hours: 6, grow: 90 },
    'a short one': { hours: 0.75, grow: 20 },
    'pole overhead': { poleHeight: 0.5, hills: 0.06 },
  },

  async create({ device, format, hdr, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'star-trails' });
    const uniforms = createUniformBuffer(device, Params, 'star-trails');
    const fragment = withChunks(shader, { 'params.wgsl': Params.wgsl });
    const skyPipeline = createFullscreenPipeline(device, {
      fragment,
      entryPoint: 'sky_fs',
      format: tail.scene.format,
      label: 'star-trails sky',
    });
    const groundPipeline = createFullscreenPipeline(device, {
      fragment,
      entryPoint: 'ground_fs',
      format: tail.scene.format,
      label: 'star-trails ground',
      blend: {
        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
      },
    });
    const module = createShader(device, fragment);
    const add: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one', operation: 'add' };
    const trailPipeline = device.createRenderPipeline({
      label: 'star-trails trails',
      layout: 'auto',
      vertex: { module, entryPoint: 'trail_vs' },
      fragment: {
        module,
        entryPoint: 'trail_fs',
        targets: [{ format: tail.scene.format, blend: { color: add, alpha: add } }],
      },
    });

    // The stars, from the sky's statistics, spread evenly over the area round the pole out to the
    // farthest corner the pole can be from (distance as the square root of a uniform draw).
    const stars = makeStars({ count: MAX_STARS, seed: 9, brightest: -0.5, faintest: 6.5 });
    const data = new Float32Array(MAX_STARS * TRAIL_FLOATS);
    let saturation = NaN;
    const fill = () => {
      saturation = params.saturation;
      const colours = starColours(stars, saturation);
      for (let i = 0; i < MAX_STARS; i++) {
        const distance = 1.6 * Math.sqrt(stars.x[i]!);
        const angle = 2 * Math.PI * stars.y[i]!;
        const light = ZERO_MAGNITUDE_LIGHT * magnitudeLight(stars.magnitude[i]!);
        data.set(
          [distance, angle, light, 0, colours[i * 3]!, colours[i * 3 + 1]!, colours[i * 3 + 2]!, 0],
          i * TRAIL_FLOATS,
        );
      }
      // The first star is the pole star: magnitude 2, under a degree from the pole, so it draws the
      // short bright arc at the centre of every photograph of the northern pole.
      const polaris = starColour(6_000, saturation);
      data.set([0.03, 1.1, ZERO_MAGNITUDE_LIGHT * magnitudeLight(2), 0, ...polaris, 0], 0);
    };
    fill();
    const buffer = device.createBuffer({
      label: 'star-trails stars',
      size: data.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(buffer, 0, data);
    const skyGroup = device.createBindGroup({
      layout: skyPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniforms.buffer } }],
    });
    const groundGroup = device.createBindGroup({
      layout: groundPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniforms.buffer } }],
    });
    const trailGroup = device.createBindGroup({
      layout: trailPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniforms.buffer } },
        { binding: 1, resource: { buffer } },
      ],
    });

    let width = 1;
    let height = 1;
    // The loop starts a third of the way into an exposure, so the first frame already shows trails.
    let clock = params.grow / 3;

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        clock += time.delta;
        if (params.saturation !== saturation) {
          fill();
          device.queue.writeBuffer(buffer, 0, data);
        }
        // The exposure's loop: the trails grow over `grow` seconds, hold for a fifth of that, then
        // fade over four seconds and start again. A held frame freezes the exposure where it is:
        // never brighter than the effect looks while it plays.
        const hold = params.grow * 0.2;
        const fade = 4;
        const cycle = params.grow + hold + fade;
        const t = clock % cycle;
        const grown = Math.min(1, t / params.grow);
        const fading = t > params.grow + hold ? 1 - (t - params.grow - hold) / fade : 1;
        const full = ((params.hours * DEGREES_PER_HOUR * Math.PI) / 180) * grown;
        const sweep = time.still ? Math.min(full, SAFE_SWEEP) : full;
        uniforms.set({
          out_size: [width, height],
          pole: [width / 2, params.poleHeight * height],
          scale: height,
          sweep,
          sigma: params.sigma,
          gain: dosed(params.dose, 0.4, 1, 1.4) * Math.max(0, fading),
          min_radius: 0.02 * height,
          hills: params.hills,
          seed: params.seed,
          glow: params.glow,
          zenith: ZENITH,
          horizon: HORIZON,
        });
        uniforms.upload();
        renderFullscreen(encoder, tail.scene.view, skyPipeline, [skyGroup], {
          timestampWrites: profiler.pass('sky'),
        });
        const shown = Math.round(dosed(params.dose, 0, 0.55, 1) * MAX_STARS);
        const pass = encoder.beginRenderPass({
          label: 'star-trails trails',
          colorAttachments: [{ view: tail.scene.view, loadOp: 'load', storeOp: 'store' }],
          timestampWrites: profiler.pass('trails'),
        });
        pass.setPipeline(trailPipeline);
        pass.setBindGroup(0, trailGroup);
        pass.draw(6, shown * SEGMENTS);
        pass.end();
        renderFullscreen(encoder, tail.scene.view, groundPipeline, [groundGroup], {
          load: true,
          timestampWrites: profiler.pass('ground'),
        });
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({ trails: Math.round(dosed(params.dose, 0, 0.55, 1) * MAX_STARS) }),
      destroy() {
        buffer.destroy();
        uniforms.destroy();
        tail.destroy();
      },
    };
  },
});
