import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { createRandom } from '../../gpu/random.ts';
import { DOSE_PARAMS, dosed } from '../../gpu/safety/dose.ts';
import { createShader, withChunks } from '../../gpu/shader.ts';
import { starColour } from '../../gpu/stars/stars.ts';
import { createUniformBuffer, defineUniformStruct } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import shader from './collision.wgsl';
import { meta } from './meta.ts';

const Params = defineUniformStruct('Params', {
  out_size: 'vec2f',
  count: 'f32',
  dt: 'f32',
  substeps: 'f32',
  softening: 'f32',
  view_turn: 'f32',
  view_tilt: 'f32',
  scale: 'f32',
  sigma: 'f32',
  gain: 'f32',
  pad: 'f32',
  colour_a: 'vec3f',
  pad1: 'f32',
  colour_b: 'vec3f',
});

/** Stars a galaxy; both are simulated, `dose` decides how many are drawn. */
const PER_GALAXY = 12_000;
const BODY_FLOATS = 8;
const MAX_SUBSTEPS = 8;
/** Units: G = 1, each core's mass 1, a disc's radius about 1. */
const MASS = 1;
const PERICENTRE = 1.4;
const SOFTENING = 0.06;
/** Where on the parabola the run starts (angle from pericentre) and how long it lasts. */
const START_ANGLE = -2.25;
const RUN_TIME = 26;
const FADE = 1.5;
const deg = Math.PI / 180;

type Vec3 = [number, number, number];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    ...DOSE_PARAMS,
    speed: { type: 'number', default: 1, min: 0.1, max: 3, step: 0.05, label: 'time' },
    tiltB: {
      type: 'number',
      default: 55,
      min: 0,
      max: 180,
      step: 1,
      label: "second disc's tilt (°)",
    },
    view: { type: 'number', default: 62, min: 0, max: 90, step: 1, label: 'view from above (°)' },
    turn: { type: 'number', default: 20, min: -180, max: 180, step: 1, label: 'view turn (°)' },
    size: { type: 'number', default: 0.07, min: 0.03, max: 0.15, step: 0.005, label: 'zoom' },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0 },
  },
  presets: {
    'tidal tails': {},
    'both prograde': { tiltB: 10 },
    'one retrograde': { tiltB: 170 },
    'from the side': { view: 10 },
  },

  async create({ device, format, hdr, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'galaxy-collision' });
    const uniforms = createUniformBuffer(device, Params, 'galaxy-collision');
    const module = createShader(device, withChunks(shader, { 'params.wgsl': Params.wgsl }));
    const stepPipeline = device.createComputePipeline({
      label: 'galaxy-collision step',
      layout: 'auto',
      compute: { module, entryPoint: 'step' },
    });
    const add: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one', operation: 'add' };
    const starPipeline = device.createRenderPipeline({
      label: 'galaxy-collision stars',
      layout: 'auto',
      vertex: { module, entryPoint: 'star_vs' },
      fragment: {
        module,
        entryPoint: 'star_fs',
        targets: [{ format: tail.scene.format, blend: { color: add, alpha: add } }],
      },
    });
    const total = 2 * PER_GALAXY;
    const bodies = device.createBuffer({
      label: 'galaxy-collision bodies',
      size: total * BODY_FLOATS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const coreBuffer = device.createBuffer({
      label: 'galaxy-collision cores',
      size: (MAX_SUBSTEPS + 1) * 2 * 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const stepGroup = device.createBindGroup({
      layout: stepPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniforms.buffer } },
        { binding: 1, resource: { buffer: bodies } },
        { binding: 2, resource: { buffer: coreBuffer } },
      ],
    });
    const starGroup = device.createBindGroup({
      layout: starPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniforms.buffer } },
        { binding: 3, resource: { buffer: bodies } },
      ],
    });

    // The cores' relative orbit: a parabola with pericentre q, in the x-z plane, for μ = 2M.
    const mu = 2 * MASS;
    let rel: Vec3 = [0, 0, 0];
    let relVel: Vec3 = [0, 0, 0];
    let simTime = 0;
    let tiltB = NaN;
    const coreA = (): Vec3 => [-0.5 * rel[0], -0.5 * rel[1], -0.5 * rel[2]];
    const coreB = (): Vec3 => [0.5 * rel[0], 0.5 * rel[1], 0.5 * rel[2]];

    /** Starts a run: the cores on their parabola, each disc on circular orbits round its core. */
    const reset = () => {
      tiltB = params.tiltB;
      simTime = 0;
      const p = 2 * PERICENTRE;
      const r = p / (1 + Math.cos(START_ANGLE));
      rel = [r * Math.cos(START_ANGLE), 0, r * Math.sin(START_ANGLE)];
      const k = Math.sqrt(mu / p);
      // Radial and transverse speeds on a parabola, turned into x-z.
      const vr = k * Math.sin(START_ANGLE);
      const vt = k * (1 + Math.cos(START_ANGLE));
      relVel = [
        vr * Math.cos(START_ANGLE) - vt * Math.sin(START_ANGLE),
        0,
        vr * Math.sin(START_ANGLE) + vt * Math.cos(START_ANGLE),
      ];
      // The orbit's angular momentum: a disc spinning the same way is prograde.
      const orbitSpin = norm(cross(rel, relVel));
      const spinA = norm([orbitSpin[0] + 0.15, orbitSpin[1], orbitSpin[2] + 0.1]);
      const b = tiltB * deg;
      const spinB: Vec3 = norm([
        orbitSpin[0],
        orbitSpin[1] * Math.cos(b) - orbitSpin[2] * Math.sin(b),
        orbitSpin[1] * Math.sin(b) + orbitSpin[2] * Math.cos(b),
      ]);
      const random = createRandom(31);
      const data = new Float32Array(total * BODY_FLOATS);
      const fill = (start: number, centre: Vec3, velocity: Vec3, spin: Vec3, which: number) => {
        const helper: Vec3 = Math.abs(spin[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        const u = norm(cross(spin, helper));
        const w = cross(spin, u);
        for (let i = 0; i < PER_GALAXY; i++) {
          // An exponential disc, cut at 1.2, and a few stars in a central knot.
          let radius = -0.32 * Math.log(1 - random() * 0.97);
          radius = Math.min(1.2, 0.02 + radius);
          const angle = random() * 2 * Math.PI;
          const c = Math.cos(angle);
          const s = Math.sin(angle);
          // The circular speed in the cores' softened gravity, so stars near the centre orbit too.
          const soft = radius * radius + SOFTENING * SOFTENING;
          const speed = Math.sqrt((MASS * radius * radius) / (soft * Math.sqrt(soft)));
          const pos = [0, 1, 2].map((j) => centre[j]! + radius * (u[j]! * c + w[j]! * s));
          const vel = [0, 1, 2].map((j) => velocity[j]! + speed * (-u[j]! * s + w[j]! * c));
          // Fainter towards the centre, where the stars crowd, so the core glows rather than burns.
          const light = (0.3 + 1.7 * random() ** 3) * Math.min(1, 0.25 + radius * 2);
          data.set(
            [pos[0]!, pos[1]!, pos[2]!, which, vel[0]!, vel[1]!, vel[2]!, light],
            (start + i) * BODY_FLOATS,
          );
        }
      };
      const half = (v: Vec3, sign: number): Vec3 => [
        0.5 * sign * v[0],
        0.5 * sign * v[1],
        0.5 * sign * v[2],
      ];
      fill(0, coreA(), half(relVel, -1), spinA, 0);
      fill(PER_GALAXY, coreB(), half(relVel, 1), spinB, 1);
      device.queue.writeBuffer(bodies, 0, data);
    };
    reset();

    /** Leapfrog of the two cores' relative orbit, writing each sub-step's core positions. */
    const cores = new Float32Array((MAX_SUBSTEPS + 1) * 8);
    const advanceCores = (dt: number, substeps: number) => {
      const accel = (r: Vec3): Vec3 => {
        const r2 = r[0] * r[0] + r[1] * r[1] + r[2] * r[2];
        const f = -mu / (r2 * Math.sqrt(r2));
        return [f * r[0], f * r[1], f * r[2]];
      };
      const write = (k: number) => {
        cores.set([...coreA(), MASS, ...coreB(), MASS], k * 8);
      };
      write(0);
      for (let k = 0; k < substeps; k++) {
        let a = accel(rel);
        relVel = [
          relVel[0] + 0.5 * dt * a[0],
          relVel[1] + 0.5 * dt * a[1],
          relVel[2] + 0.5 * dt * a[2],
        ];
        rel = [rel[0] + dt * relVel[0], rel[1] + dt * relVel[1], rel[2] + dt * relVel[2]];
        a = accel(rel);
        relVel = [
          relVel[0] + 0.5 * dt * a[0],
          relVel[1] + 0.5 * dt * a[1],
          relVel[2] + 0.5 * dt * a[2],
        ];
        write(k + 1);
      }
      device.queue.writeBuffer(coreBuffer, 0, cores, 0, (substeps + 1) * 8);
    };

    let width = 1;
    let height = 1;

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        if (params.tiltB !== tiltB || simTime > RUN_TIME + FADE) reset();
        // Simulation time: 0.3 units a second, a passage in about a minute and a half. The discs'
        // spin is whole-field rotation to the motion check: at 0.45 units a second it read 5.4° a
        // second, over the 5° cap, so the clock is slower and the strong dose quickens it less.
        const step = time.delta * 0.3 * params.speed * dosed(params.dose, 0.3, 1, 1.2);
        const substeps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(step / 0.012)));
        const dt = step / substeps;
        if (step > 0) advanceCores(dt, substeps);
        simTime += step;
        const fading =
          simTime > RUN_TIME
            ? Math.max(0, 1 - (simTime - RUN_TIME) / FADE)
            : Math.min(1, simTime / FADE + 0.2);
        uniforms.set({
          out_size: [width, height],
          count: total,
          dt,
          substeps: step > 0 ? substeps : 0,
          softening: SOFTENING,
          view_turn: params.turn * deg,
          view_tilt: params.view * deg,
          scale: params.size * height,
          sigma: 0.8,
          gain: fading,
          colour_a: starColour(8_500, 0.6),
          colour_b: starColour(4_800, 0.7),
        });
        uniforms.upload();
        if (step > 0) {
          const compute = encoder.beginComputePass({
            label: 'galaxy-collision step',
            timestampWrites: profiler.pass('step'),
          });
          compute.setPipeline(stepPipeline);
          compute.setBindGroup(0, stepGroup);
          compute.dispatchWorkgroups(Math.ceil(total / 64));
          compute.end();
        }
        // Half of each galaxy's stars at a low dose: drawn from both, interleaved by index.
        const shown = Math.round(dosed(params.dose, 0.3, 1, 1) * PER_GALAXY);
        const pass = encoder.beginRenderPass({
          label: 'galaxy-collision stars',
          colorAttachments: [
            {
              view: tail.scene.view,
              loadOp: 'clear',
              clearValue: { r: 0.0008, g: 0.0008, b: 0.0016, a: 1 },
              storeOp: 'store',
            },
          ],
          timestampWrites: profiler.pass('stars'),
        });
        pass.setPipeline(starPipeline);
        pass.setBindGroup(0, starGroup);
        pass.draw(6, shown, 0, 0);
        pass.draw(6, shown, 0, PER_GALAXY);
        pass.end();
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({ bodies: total, time: Math.round(simTime * 10) / 10 }),
      destroy() {
        bodies.destroy();
        coreBuffer.destroy();
        uniforms.destroy();
        tail.destroy();
      },
    };
  },
});
