import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import { lineColours } from '../../gpu/nebula/lines.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { createRandom } from '../../gpu/random.ts';
import { DOSE_PARAMS, dosed } from '../../gpu/safety/dose.ts';
import { createShader, withChunks } from '../../gpu/shader.ts';
import { sampleMagnitude, starColour } from '../../gpu/stars/stars.ts';
import { createUniformBuffer, defineUniformStruct } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import shader from './galaxy.wgsl';
import { meta } from './meta.ts';

const Params = defineUniformStruct('Params', {
  out_size: 'vec2f',
  scale: 'f32',
  time: 'f32',
  twist: 'f32',
  pattern_angle: 'f32',
  ellipticity: 'f32',
  orbit_speed: 'f32',
  core: 'f32',
  inclination: 'f32',
  position_angle: 'f32',
  sigma: 'f32',
  gain: 'f32',
  tracers: 'f32',
  dust: 'f32',
  dust_size: 'f32',
  bulge: 'f32',
  bulge_radius: 'f32',
  disc: 'f32',
  glow: 'f32',
  bulge_colour: 'vec3f',
  sky_pad: 'f32',
  disc_colour: 'vec3f',
  pad: 'f32',
  sky: 'vec3f',
});

const STAR_FLOATS = 8;
const MAX_STARS = 120_000;
const DUST = 8_000;
const TRACERS = 12;
const deg = Math.PI / 180;

/** The share of the stars in each population. */
const SHARE = { bulge: 0.16, young: 0.22, hii: 0.012 };

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    ...DOSE_PARAMS,
    twist: { type: 'number', default: 6.5, min: 0, max: 14, step: 0.1, label: 'arm twist (rad)' },
    ellipticity: { type: 'number', default: 0.32, min: 0, max: 0.6, step: 0.01 },
    inclination: {
      type: 'number',
      default: 58,
      min: 0,
      max: 85,
      step: 1,
      label: 'inclination (°)',
    },
    turn: { type: 'number', default: -25, min: -90, max: 90, step: 1, label: 'position angle (°)' },
    orbits: {
      type: 'number',
      default: 1,
      min: 0,
      max: 4,
      step: 0.05,
      label: 'orbit speed (stars)',
    },
    pattern: {
      type: 'number',
      default: 0.35,
      min: 0,
      max: 2,
      step: 0.05,
      label: 'pattern speed (arms)',
    },
    tracers: { type: 'number', default: 1, min: 1, max: 40, step: 1, label: 'tracer brightness' },
    dust: { type: 'number', default: 1, min: 0, max: 2, step: 0.05 },
    glow: { type: 'number', default: 1, min: 0, max: 3, step: 0.05, label: 'bulge and disc glow' },
    hii: { type: 'number', default: 1, min: 0, max: 3, step: 0.05, label: 'H II regions' },
    size: { type: 'number', default: 0.46, min: 0.2, max: 1, step: 0.01, label: 'size (heights)' },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0 },
  },
  presets: {
    'grand design': {},
    'face on': { inclination: 8, turn: 0 },
    'edge on': { inclination: 82, turn: -12 },
    'watch the stars': { tracers: 30, glow: 0.5 },
    'tightly wound': { twist: 11, ellipticity: 0.22 },
  },

  async create({ device, format, hdr, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'spiral-galaxy' });
    const uniforms = createUniformBuffer(device, Params, 'spiral-galaxy');
    const source = withChunks(shader, { 'params.wgsl': Params.wgsl });
    const module = createShader(device, source);
    const add: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one', operation: 'add' };
    const multiply: GPUBlendComponent = { srcFactor: 'zero', dstFactor: 'src', operation: 'add' };
    const starPipeline = device.createRenderPipeline({
      label: 'spiral-galaxy stars',
      layout: 'auto',
      vertex: { module, entryPoint: 'star_vs' },
      fragment: {
        module,
        entryPoint: 'star_fs',
        targets: [{ format: tail.scene.format, blend: { color: add, alpha: add } }],
      },
    });
    const dustPipeline = device.createRenderPipeline({
      label: 'spiral-galaxy dust',
      layout: 'auto',
      vertex: { module, entryPoint: 'dust_vs' },
      fragment: {
        module,
        entryPoint: 'dust_fs',
        targets: [{ format: tail.scene.format, blend: { color: multiply, alpha: multiply } }],
      },
    });
    const glowPipeline = createFullscreenPipeline(device, {
      fragment: source,
      entryPoint: 'glow_fs',
      format: tail.scene.format,
      label: 'spiral-galaxy glow',
    });

    // The galaxy, built once. Sizes from an exponential disc; phases at random, except for the
    // populations born in the arms, which sit where the ellipses crowd (the ends of their major
    // axes) and spread a little round it.
    const random = createRandom(21);
    const total = MAX_STARS + DUST;
    const data = new Float32Array(total * STAR_FLOATS);
    const hii = lineColours('natural').hydrogenAlpha;
    const exponentialRadius = (scale: number, max: number) => {
      for (;;) {
        const r = -scale * Math.log(1 - random() * 0.999);
        if (r < max) return r;
      }
    };
    // An offset from the arm's phase (the shader adds `arm_phase`), on one arm or the other.
    const armPhase = (spread: number) => (random() < 0.5 ? 0 : Math.PI) + (random() - 0.5) * spread;
    const put = (
      i: number,
      a: number,
      phase: number,
      kind: number,
      height: number,
      light: number[],
    ) =>
      data.set(
        [a, phase, kind, height, light[0]!, light[1]!, light[2]!, light[3] ?? 0],
        i * STAR_FLOATS,
      );
    // Brightest first is not needed here: populations are interleaved so a lower dose keeps them all.
    for (let i = 0; i < MAX_STARS; i++) {
      const u = random();
      // A narrow range of magnitudes: a galaxy's stars are all far away, and the field is their sum.
      const m = sampleMagnitude(random(), 3, 9);
      const brightness = 3 * 10 ** (-0.4 * (m - 4));
      if (i < TRACERS) {
        const c = starColour(7_000, 0.4);
        put(
          i,
          0.25 + 0.6 * random(),
          random() * 2 * Math.PI,
          5,
          0,
          c.map((v) => v * 0.6),
        );
      } else if (u < SHARE.hii) {
        const c = hii.map((v) => v * 1.2);
        // Inside 0.72 of the radius: past it the ellipses are nearly round, and an "arm" closes into a ring.
        put(i, 0.18 + exponentialRadius(0.25, 0.54), armPhase(1.0), 3, 0, c);
      } else if (u < SHARE.hii + SHARE.bulge) {
        const a = exponentialRadius(0.06, 0.25);
        const c = starColour(3_800 + 1_400 * random(), 0.75);
        put(
          i,
          a,
          random() * 2 * Math.PI,
          1,
          (random() - 0.5) * 1.2 * a,
          c.map((v) => v * brightness),
        );
      } else if (u < SHARE.hii + SHARE.bulge + SHARE.young) {
        const c = starColour(9_000 + 16_000 * random(), 0.8);
        put(
          i,
          0.14 + exponentialRadius(0.25, 0.58),
          armPhase(1.8),
          2,
          0,
          c.map((v) => v * brightness * 1.6),
        );
      } else {
        const c = starColour(4_200 + 2_600 * random(), 0.7);
        put(
          i,
          exponentialRadius(0.3, 1),
          random() * 2 * Math.PI,
          0,
          (random() - 0.5) * 0.02,
          c.map((v) => v * brightness),
        );
      }
    }
    // Dust: just inside the arms (a little behind the crowding point), in the light slot's alpha.
    // Dust crowds at the arms as the stars do, so each smudge is faint, or together they go opaque.
    for (let i = MAX_STARS; i < total; i++) {
      put(i, 0.24 + exponentialRadius(0.25, 0.46), armPhase(0.5) - 0.55, 4, 0, [
        0,
        0,
        0,
        0.012 + 0.02 * random(),
      ]);
    }
    const buffer = device.createBuffer({
      label: 'spiral-galaxy stars',
      size: data.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(buffer, 0, data);
    const group = (pipeline: GPURenderPipeline) =>
      device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniforms.buffer } },
          { binding: 1, resource: { buffer } },
        ],
      });
    const starGroup = group(starPipeline);
    const dustGroup = group(dustPipeline);
    const glowGroup = device.createBindGroup({
      layout: glowPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniforms.buffer } }],
    });

    let width = 1;
    let height = 1;
    let clock = 0;
    let patternAngle = 0;

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        const pace = dosed(params.dose, 0, 1, 1.5);
        clock += time.delta * params.orbits * pace;
        patternAngle += time.delta * params.pattern * 0.012 * pace;
        uniforms.set({
          out_size: [width, height],
          scale: params.size * height,
          time: clock,
          twist: params.twist,
          pattern_angle: patternAngle,
          ellipticity: params.ellipticity,
          // Radians a second at the core's edge: the outer stars take minutes to go round.
          orbit_speed: 0.004,
          core: 0.08,
          inclination: params.inclination * deg,
          position_angle: params.turn * deg,
          sigma: 0.8,
          gain: 1,
          tracers: params.tracers,
          dust: params.dust,
          dust_size: 0.009 * height,
          bulge: 3,
          bulge_radius: 0.07,
          disc: 0.07,
          glow: params.glow,
          bulge_colour: starColour(4_300, 0.8),
          sky_pad: 0,
          disc_colour: starColour(5_600, 0.6),
          pad: 0,
          sky: [0.0008, 0.0008, 0.0016],
        });
        uniforms.upload();
        renderFullscreen(encoder, tail.scene.view, glowPipeline, [glowGroup], {
          timestampWrites: profiler.pass('glow'),
        });
        const shown = Math.round(dosed(params.dose, 0.15, 0.6, 1) * MAX_STARS);
        let pass = encoder.beginRenderPass({
          label: 'spiral-galaxy stars',
          colorAttachments: [{ view: tail.scene.view, loadOp: 'load', storeOp: 'store' }],
          timestampWrites: profiler.pass('stars'),
        });
        pass.setPipeline(starPipeline);
        pass.setBindGroup(0, starGroup);
        pass.draw(6, shown);
        pass.end();
        if (params.dust > 0) {
          pass = encoder.beginRenderPass({
            label: 'spiral-galaxy dust',
            colorAttachments: [{ view: tail.scene.view, loadOp: 'load', storeOp: 'store' }],
            timestampWrites: profiler.pass('dust'),
          });
          pass.setPipeline(dustPipeline);
          pass.setBindGroup(0, dustGroup);
          pass.draw(6, DUST, 0, MAX_STARS);
          pass.end();
        }
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({ stars: Math.round(dosed(params.dose, 0.15, 0.6, 1) * MAX_STARS) }),
      destroy() {
        buffer.destroy();
        uniforms.destroy();
        tail.destroy();
      },
    };
  },
});
