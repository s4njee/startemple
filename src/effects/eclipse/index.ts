import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { DOSE_PARAMS, dosed } from '../../gpu/safety/dose.ts';
import { withChunks } from '../../gpu/shader.ts';
import { coveredFraction, prominenceColour } from '../../gpu/sun/sun.ts';
import { createUniformBuffer, defineUniformStruct, uniformArray } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import shader from './eclipse.wgsl';
import { meta } from './meta.ts';

const Params = defineUniformStruct('Params', {
  centre: 'vec2f',
  moon: 'vec2f',
  corona_colour: 'vec3f',
  radius: 'f32',
  prominence_colour: 'vec3f',
  moon_radius: 'f32',
  sky: 'vec3f',
  relief: 'f32',
  time: 'f32',
  activity: 'f32',
  seed: 'f32',
  exposure: 'f32',
  sky_level: 'f32',
  arches: uniformArray('vec4f', 4),
});

/** The Moon's radius over the Sun's: 4% larger, for a totality a few minutes long. */
const MOON = 1.04;
/** The lunar limb's relief, as a share of its radius: about three times the real valleys. */
const RELIEF = 0.012;
/** The corona's light at the eye in totality, over the disc's: what the exposure settles for. */
const DARK = 2.5e-6;

const ARCHES: [number, number, number, number][] = [
  [0.6, 0.06, 0.06, 0.02],
  [2.4, 0.03, 0.04, 0.014],
  [3.9, 0.09, 0.05, 0.018],
  [5.4, 0.025, 0.08, 0.012],
];

/** Where the Moon is at `progress` 0 to 1: slow near mid-eclipse, so totality has time. */
export function moonAt(progress: number): [number, number] {
  const s = 2 * progress - 1;
  return [2.3 * Math.sign(s) * Math.abs(s) ** 1.8, 0.012 + 0.05 * s];
}

export type EclipsePhase = 'partial' | "Baily's beads" | 'totality';

export function phaseAt(progress: number, relief = RELIEF): EclipsePhase {
  const [x, y] = moonAt(progress);
  const gap = Math.hypot(x, y) - (MOON - 1);
  if (gap < -relief * MOON) return 'totality';
  if (gap < relief * MOON) return "Baily's beads";
  return 'partial';
}

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    ...DOSE_PARAMS,
    run: { type: 'boolean', default: true, label: 'run the eclipse' },
    cycle: {
      type: 'number',
      default: 40,
      min: 10,
      max: 300,
      step: 1,
      label: 'seconds, contact to contact',
    },
    progress: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.001 },
    relief: { type: 'number', default: 1, min: 0, max: 3, step: 0.05, label: 'lunar limb relief' },
    activity: { type: 'number', default: 0.3, min: 0, max: 1, step: 0.05, label: 'solar activity' },
    size: { type: 'number', default: 0.17, min: 0.05, max: 0.4, step: 0.01 },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0.5 },
  },
  presets: {
    countdown: {},
    totality: { run: false, progress: 0.5 },
    'solar maximum': { run: false, progress: 0.5, activity: 1 },
    'partial phase': { run: false, progress: 0.3 },
  },

  async create({ device, format, hdr, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'eclipse' });
    const uniforms = createUniformBuffer(device, Params, 'eclipse');
    const pipeline = createFullscreenPipeline(device, {
      fragment: withChunks(shader, { 'params.wgsl': Params.wgsl }),
      entryPoint: 'eclipse_fs',
      format: tail.scene.format,
      label: 'eclipse',
    });
    const group = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniforms.buffer } }],
    });
    const pink = prominenceColour();
    const arches = new Float32Array(16);
    ARCHES.forEach((a, i) => arches.set(a, i * 4));
    let width = 1;
    let height = 1;
    let clock = 0;
    // A run starts a quarter of the way in, the Moon a crescent's bite into the Sun.
    let progress = 0.25;
    let exposure: number | undefined;
    let shown = progress;

    const target = (p: number) => {
      const [x, y] = moonAt(p);
      const uncovered = 1 - coveredFraction(1, MOON, Math.hypot(x, y));
      return { exposure: 1 / (uncovered + DARK), uncovered };
    };

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
      },
      frame(time, encoder, out) {
        const pace = dosed(params.dose, 0, 1, 1.6);
        clock += time.delta * pace;
        if (params.run) progress = (progress + (time.delta * pace) / params.cycle) % 1;
        // Held while running, the eclipse shows totality: the corona, never the diamond ring frozen.
        shown = params.run ? (time.still ? 0.5 : progress) : params.progress;
        const want = target(shown);
        if (exposure === undefined || time.still || !params.run) {
          exposure = want.exposure;
        } else {
          // The eye opens slowly in the dark and closes fast in the light, in log exposure.
          const rate = want.exposure > exposure ? 1 / 1.2 : 1 / 0.3;
          const k = 1 - Math.exp(-time.delta * rate);
          exposure = Math.exp(
            Math.log(exposure) + (Math.log(want.exposure) - Math.log(exposure)) * k,
          );
        }
        uniforms.set({
          centre: [width / 2, height / 2],
          moon: moonAt(shown),
          corona_colour: [1, 0.97, 0.93],
          radius: params.size * Math.min(width, height),
          prominence_colour: pink,
          moon_radius: MOON,
          sky: [0.25, 0.45, 1],
          relief: RELIEF * params.relief,
          time: clock,
          activity: params.activity,
          seed: 2.7,
          exposure: exposure * 0.6,
          sky_level: 3e-3 * want.uncovered + 5e-8,
          arches,
        });
        uniforms.upload();
        renderFullscreen(encoder, tail.scene.view, pipeline, [group], {
          timestampWrites: profiler.pass('eclipse'),
        });
        tail.encode(encoder, out, time, params, profiler);
      },
      stats: () => {
        const phase = phaseAt(shown, RELIEF * params.relief);
        // The countdown: seconds to second contact, while the run is before it.
        const second = 0.5 - 0.5 * ((MOON - 1) / 2.3) ** (1 / 1.8);
        const until = params.run && shown < second ? (second - shown) * params.cycle : 0;
        return { phase, 'to totality': until > 0 ? `${until.toFixed(0)} s` : '—' };
      },
      destroy() {
        uniforms.destroy();
        tail.destroy();
      },
    };
  },
});
