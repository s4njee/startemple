import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { DOSE_PARAMS, dosed } from '../../gpu/safety/dose.ts';
import { withChunks } from '../../gpu/shader.ts';
import { createUniformBuffer, defineUniformStruct } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';
import shader from './moon-phase.wgsl';
import { litFraction, phaseForProgress } from './phase.ts';

const Params = defineUniformStruct('Params', {
  centre: 'vec2f',
  radius: 'f32',
  phase: 'f32',
  tilt: 'f32',
  softness: 'f32',
  earthshine: 'f32',
  relief: 'f32',
  light: 'f32',
  shading: 'f32',
});

const deg = Math.PI / 180;

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    ...DOSE_PARAMS,
    progress: { type: 'number', default: 0.35, min: 0, max: 1, step: 0.005, label: 'progress' },
    animate: { type: 'boolean', default: true, label: 'run through the month' },
    cycle: { type: 'number', default: 24, min: 8, max: 120, step: 1, label: 'seconds a month' },
    mapping: {
      type: 'select',
      default: 'lit area',
      options: ['lit area', 'phase angle'],
      label: 'progress is the',
    },
    softness: { type: 'number', default: 0.05, min: 0.005, max: 0.3, step: 0.005 },
    earthshine: { type: 'number', default: 0.008, min: 0, max: 0.1, step: 0.001 },
    relief: { type: 'number', default: 0.07, min: 0, max: 0.5, step: 0.01, label: 'craters' },
    tilt: { type: 'number', default: -20, min: -90, max: 90, step: 1, label: 'tilt (°)' },
    size: { type: 'number', default: 0.38, min: 0.1, max: 0.5, step: 0.01 },
    shading: {
      type: 'select',
      default: 'soft terminator',
      options: ['soft terminator', 'moon temple'],
    },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0.1 },
  },
  presets: {
    'a month': {},
    'progress bar': { animate: false, progress: 0.62 },
    'thin crescent': { animate: false, progress: 0.06, earthshine: 0.02 },
    'hard edge': { animate: false, softness: 0.005, relief: 0 },
    'moon temple': { animate: false, shading: 'moon temple' },
  },

  async create({ device, format, hdr, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'moon-phase' });
    const uniforms = createUniformBuffer(device, Params, 'moon-phase');
    const pipeline = createFullscreenPipeline(device, {
      fragment: withChunks(shader, { 'params.wgsl': Params.wgsl }),
      entryPoint: 'moon_fs',
      format: tail.scene.format,
      label: 'moon-phase',
    });
    const group = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniforms.buffer } }],
    });
    let width = 1;
    let height = 1;
    // A month starts at a waxing crescent, so the first frame (and a held one) shows the Moon.
    let month = 0.12;
    let phase = 0;

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        if (params.animate) {
          month = (month + (time.delta * dosed(params.dose, 0, 1, 1.4)) / params.cycle) % 1;
          phase = month;
        } else {
          phase = phaseForProgress(params.progress, params.mapping === 'lit area');
        }
        uniforms.set({
          centre: [width / 2, height / 2],
          radius: params.size * Math.min(width, height),
          phase,
          tilt: params.tilt * deg,
          softness: params.softness,
          earthshine: params.earthshine,
          relief: params.relief,
          light: 0.9,
          shading: params.shading === 'moon temple' ? 1 : 0,
        });
        uniforms.upload();
        renderFullscreen(encoder, tail.scene.view, pipeline, [group], {
          timestampWrites: profiler.pass('moon'),
        });
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({ lit: `${Math.round(100 * litFraction(phase))}%` }),
      destroy() {
        uniforms.destroy();
        tail.destroy();
      },
    };
  },
});
