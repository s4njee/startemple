import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import { trackPointer, type PointerTracker } from '../../gpu/pointer.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { DOSE_PARAMS, dosed } from '../../gpu/safety/dose.ts';
import { withChunks } from '../../gpu/shader.ts';
import { createUniformBuffer, defineUniformStruct } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import shader from './black-hole.wgsl';
import { meta } from './meta.ts';

const Params = defineUniformStruct('Params', {
  eye: 'vec3f',
  frame: 'f32',
  forward: 'vec3f',
  steps: 'f32',
  right: 'vec3f',
  blend: 'f32',
  up: 'vec3f',
  time: 'f32',
  tan_fov: 'vec2f',
  trace_size: 'vec2f',
  shift: 'vec2f',
  disc_inner: 'f32',
  disc_outer: 'f32',
  disc_temperature: 'f32',
  disc_glow: 'f32',
  disc_transmission: 'f32',
  beaming: 'f32',
  redshift: 'f32',
  pixel_angle: 'f32',
  sky_cells: 'f32',
  sky_density: 'f32',
  sky_glow: 'f32',
  sky_stars: 'f32',
});

const FOV = (34 * Math.PI) / 180;
const deg = Math.PI / 180;
/** How far the pointer swings the view at `steer` 1, from the canvas's centre to its edge. */
const STEER_YAW = 32 * deg;
const STEER_TILT = 16 * deg;
/** The steered view's fastest turn, °/s, and how long it takes to settle on the pointer. */
const STEER_RATE = 24 * deg;
const STEER_EASE = 0.7;
export const RESOLUTIONS = { full: 1, half: 2, quarter: 4 } as const;

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    ...DOSE_PARAMS,
    resolution: {
      type: 'select',
      default: 'half',
      options: Object.keys(RESOLUTIONS),
      label: 'trace resolution',
    },
    steps: { type: 'number', default: 400, min: 60, max: 800, step: 10, label: 'steps (most)' },
    distance: {
      type: 'number',
      default: 26,
      min: 8,
      max: 60,
      step: 0.5,
      label: 'distance (Schwarzschild radii)',
    },
    tilt: { type: 'number', default: 6, min: -30, max: 30, step: 0.5, label: 'above the disc (°)' },
    turn: { type: 'number', default: 1, min: 0, max: 3, step: 0.05, label: 'turn speed' },
    roll: { type: 'number', default: 0, min: -90, max: 90, step: 1, label: 'roll (°)' },
    shiftX: { type: 'number', default: 0, min: -0.4, max: 0.4, step: 0.01, label: 'shift right' },
    shiftY: { type: 'number', default: 0, min: -0.4, max: 0.4, step: 0.01, label: 'shift up' },
    steer: {
      type: 'number',
      default: 1,
      min: 0,
      max: 1,
      step: 0.05,
      label: 'pointer steers the view',
    },
    outer: { type: 'number', default: 14, min: 5, max: 30, step: 0.5, label: 'disc outer edge' },
    temperature: {
      type: 'number',
      default: 7_000,
      min: 2_000,
      max: 20_000,
      step: 100,
      label: 'disc temperature (K)',
    },
    glow: { type: 'number', default: 1, min: 0, max: 4, step: 0.05, label: 'disc glow' },
    beaming: { type: 'number', default: 1, min: 0, max: 1, step: 0.05, label: 'Doppler beaming' },
    redshift: { type: 'boolean', default: true, label: 'gravitational redshift' },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0.6 },
  },
  presets: {
    'interstellar view': {},
    'from above': { tilt: 28 },
    'no beaming': { beaming: 0, redshift: false },
    'full resolution': { resolution: 'full' },
  },

  async create({ device, format, hdr, canvas, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'black-hole' });
    const uniforms = createUniformBuffer(device, Params, 'black-hole');
    const source = withChunks(shader, { 'params.wgsl': Params.wgsl });
    const trace = createFullscreenPipeline(device, {
      fragment: source,
      entryPoint: 'trace',
      format: 'rgba16float',
      label: 'black-hole trace',
    });
    const accumulate = createFullscreenPipeline(device, {
      fragment: source,
      entryPoint: 'accumulate',
      format: 'rgba16float',
      label: 'black-hole accumulate',
    });
    const composite = createFullscreenPipeline(device, {
      fragment: source,
      entryPoint: 'composite',
      format: tail.scene.format,
      label: 'black-hole composite',
    });
    const traceGroup = device.createBindGroup({
      layout: trace.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniforms.buffer } }],
    });
    const linear = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

    let width = 1;
    let height = 1;
    let traceWidth = 1;
    let traceHeight = 1;
    let key = '';
    let targets: GPUTexture[] = [];
    let accumulateGroups: GPUBindGroup[] = [];
    let compositeGroups: GPUBindGroup[] = [];
    let frame = 0;
    let yaw = 0;
    let clock = 0;

    const makeTargets = (divisor: number) => {
      key = `${width}x${height}/${divisor}`;
      for (const t of targets) t.destroy();
      traceWidth = Math.max(1, Math.round(width / divisor));
      traceHeight = Math.max(1, Math.round(height / divisor));
      targets = [0, 1, 2].map((i) =>
        device.createTexture({
          label: `black-hole ${['trace', 'history a', 'history b'][i]}`,
          size: [traceWidth, traceHeight],
          format: 'rgba16float',
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        }),
      );
      accumulateGroups = [1, 2].map((into) =>
        device.createBindGroup({
          layout: accumulate.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: uniforms.buffer } },
            { binding: 1, resource: targets[0]!.createView() },
            { binding: 2, resource: targets[into === 1 ? 2 : 1]!.createView() },
          ],
        }),
      );
      compositeGroups = [1, 2].map((from) =>
        device.createBindGroup({
          layout: composite.getBindGroupLayout(0),
          entries: [
            { binding: 3, resource: targets[from]!.createView() },
            { binding: 4, resource: linear },
          ],
        }),
      );
      frame = 0;
    };

    const live =
      typeof window !== 'undefined' && typeof canvas.getBoundingClientRect === 'function';
    const pointer: PointerTracker | undefined = live ? trackPointer(canvas) : undefined;
    // The pointer's swing of the view, eased and rate-capped: yaw round the hole, tilt above it.
    const steered = { yaw: 0, tilt: 0 };
    let lastEye = '';

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        const divisor = RESOLUTIONS[params.resolution as keyof typeof RESOLUTIONS] ?? 2;
        if (key !== `${width}x${height}/${divisor}`) makeTargets(divisor);
        const pace = dosed(params.dose, 0, 1, 1.5);
        yaw += time.delta * 0.012 * params.turn * pace;
        clock += time.delta * pace;
        // The pointer: its offset from the centre, in the rolled view's axes, so moving along the
        // disc swings the view round the hole and moving across it tips the view over the disc.
        let wantYaw = 0;
        let wantTilt = 0;
        if (pointer?.state.inside && params.steer > 0) {
          const roll = params.roll * deg;
          const px = 2 * pointer.state.x - 1;
          const py = 1 - 2 * pointer.state.y;
          const along = Math.cos(roll) * px + Math.sin(roll) * py;
          const across = -Math.sin(roll) * px + Math.cos(roll) * py;
          wantYaw = -along * STEER_YAW * params.steer;
          wantTilt = across * STEER_TILT * params.steer;
        }
        const ease = 1 - Math.exp(-time.delta / STEER_EASE);
        const most = STEER_RATE * time.delta;
        const clampStep = (v: number) => Math.max(-most, Math.min(most, v));
        steered.yaw += clampStep((wantYaw - steered.yaw) * ease);
        steered.tilt += clampStep((wantTilt - steered.tilt) * ease);
        // The camera: at `distance`, `tilt` above the disc's plane, turning slowly round the hole.
        const d = params.distance;
        const tilt = Math.max(-40 * deg, Math.min(40 * deg, params.tilt * deg + steered.tilt));
        const view = yaw + steered.yaw;
        const eye: [number, number, number] = [
          d * Math.cos(tilt) * Math.sin(view),
          d * Math.sin(tilt),
          -d * Math.cos(tilt) * Math.cos(view),
        ];
        const forward: [number, number, number] = [-eye[0] / d, -eye[1] / d, -eye[2] / d];
        const rl = Math.hypot(forward[2], forward[0]);
        const level: [number, number, number] = [-forward[2] / rl, 0, forward[0] / rl];
        const square: [number, number, number] = [
          level[1] * forward[2] - level[2] * forward[1],
          level[2] * forward[0] - level[0] * forward[2],
          level[0] * forward[1] - level[1] * forward[0],
        ];
        // Rolled about the line of sight, so the disc crosses the screen at `roll` anticlockwise.
        const cr = Math.cos(params.roll * deg);
        const sr = Math.sin(params.roll * deg);
        const right = level.map((v, i) => cr * v - sr * square[i]!) as [number, number, number];
        const up = level.map((v, i) => sr * v + cr * square[i]!) as [number, number, number];
        const tanY = Math.tan(FOV / 2);
        // While the camera moves the history would smear, so it is short; still, it averages longer.
        const eyeKey = eye.map((v) => v.toFixed(5)).join() + params.roll;
        const moving = params.turn * pace > 0 || eyeKey !== lastEye;
        lastEye = eyeKey;
        uniforms.set({
          eye,
          frame,
          forward,
          steps: params.steps,
          right,
          blend: frame === 0 ? 1 : moving ? 0.35 : 0.12,
          up,
          time: clock,
          tan_fov: [tanY * (width / height), tanY],
          trace_size: [traceWidth, traceHeight],
          shift: [2 * params.shiftX, -2 * params.shiftY],
          disc_inner: 3,
          disc_outer: params.outer,
          disc_temperature: params.temperature,
          disc_glow: 0.6 * params.glow,
          disc_transmission: 0.12,
          beaming: params.beaming,
          redshift: params.redshift ? 1 : 0,
          pixel_angle: (2 * tanY) / traceHeight,
          sky_cells: 700,
          sky_density: 0.03,
          sky_glow: 1,
          sky_stars: 1,
        });
        uniforms.upload();
        renderFullscreen(encoder, targets[0]!.createView(), trace, [traceGroup], {
          timestampWrites: profiler.pass('trace'),
        });
        const into = frame % 2 === 0 ? 1 : 2;
        renderFullscreen(
          encoder,
          targets[into]!.createView(),
          accumulate,
          [accumulateGroups[into - 1]!],
          {
            timestampWrites: profiler.pass('accumulate'),
          },
        );
        renderFullscreen(encoder, tail.scene.view, composite, [compositeGroups[into - 1]!], {
          timestampWrites: profiler.pass('composite'),
        });
        tail.encode(encoder, target, time, params, profiler);
        frame++;
      },
      stats: () => ({
        trace: `${traceWidth}×${traceHeight}`,
        // Where the view is: degrees above the disc's plane, and round the hole from the start.
        above: Math.round(Math.max(-40, Math.min(40, params.tilt + steered.tilt / deg))),
        round: Math.round((((((yaw + steered.yaw) / deg + 180) % 360) + 360) % 360) - 180),
      }),
      destroy() {
        pointer?.destroy();
        for (const t of targets) t.destroy();
        uniforms.destroy();
        tail.destroy();
      },
    };
  },
});
