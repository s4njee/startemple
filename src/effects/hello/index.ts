import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { DOSE_PARAMS, dosed } from '../../gpu/safety/dose.ts';
import { createShader, withChunks } from '../../gpu/shader.ts';
import { createUniformBuffer, defineUniformStruct } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import shader from './stars.wgsl';
import { meta } from './meta.ts';

const Params = defineUniformStruct('Params', {
  width: 'f32',
  height: 'f32',
  time: 'f32',
  speed: 'f32',
  size: 'f32',
  gain: 'f32',
  count: 'f32',
});

/** The most stars `dose` asks for; instances past `count` draw nothing. */
const MAX_STARS = 900;

/** The sky behind the stars: near black, a little blue, in linear light. */
const SKY = { r: 0.002, g: 0.002, b: 0.005, a: 1 };

export const effect = defineEffect({
  meta,
  params: {
    ...DOSE_PARAMS,
    size: { type: 'number', default: 1.2, min: 0.5, max: 4, step: 0.05, label: 'star radius (px)' },
    speed: { type: 'number', default: 1, min: 0, max: 3, step: 0.05, label: 'drift' },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0 },
  },
  presets: {
    calm: {},
    sparse: { dose: 0.15 },
    // Tiny discs: where the naive spot crawls most (story 2.3's baseline).
    'pinpoint stars': { size: 0.6 },
  },

  async create({ device, format, hdr, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'hello' });
    const uniforms = createUniformBuffer(device, Params, 'hello params');
    const module = createShader(device, withChunks(shader, { 'params.wgsl': Params.wgsl }));
    const pipeline = device.createRenderPipeline({
      label: 'hello stars',
      layout: 'auto',
      vertex: { module, entryPoint: 'star_vs' },
      fragment: {
        module,
        entryPoint: 'star_fs',
        // Light adds onto the sky.
        targets: [
          {
            format: tail.scene.format,
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one' },
              alpha: { srcFactor: 'zero', dstFactor: 'one' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-strip' },
    });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniforms.buffer } }],
    });
    let width = 1;
    let height = 1;
    let clock = 0;

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        clock += time.delta;
        uniforms.set({
          width,
          height,
          time: clock,
          speed: params.speed * dosed(params.dose, 0, 1, 1.6),
          size: params.size,
          gain: dosed(params.dose, 0.5, 1, 1.3),
          count: dosed(params.dose, 0, 400, MAX_STARS),
        });
        uniforms.upload();
        const pass = encoder.beginRenderPass({
          label: 'hello stars',
          colorAttachments: [
            { view: tail.scene.view, loadOp: 'clear', clearValue: SKY, storeOp: 'store' },
          ],
          timestampWrites: profiler.pass('stars'),
        });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(4, MAX_STARS);
        pass.end();
        tail.encode(encoder, target, time, params, profiler);
      },
      destroy() {
        uniforms.destroy();
        tail.destroy();
      },
    };
  },
});
