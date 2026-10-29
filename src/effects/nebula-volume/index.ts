import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import {
  LINE_PALETTES,
  lineColours,
  paletteStrength,
  type LinePalette,
} from '../../gpu/nebula/lines.ts';
import { PointList } from '../../gpu/points.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { createRandom } from '../../gpu/random.ts';
import { DOSE_PARAMS, dosed } from '../../gpu/safety/dose.ts';
import { createShader, withChunks } from '../../gpu/shader.ts';
import { createSpotLayer, uploadSpots } from '../../gpu/stars/spot.ts';
import { magnitudeLight, makeStars, starColour, starColours } from '../../gpu/stars/stars.ts';
import { createUniformBuffer, defineUniformStruct } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';
import shader from './volume-nebula.wgsl';

const Params = defineUniformStruct('Params', {
  eye: 'vec3f',
  frame: 'f32',
  forward: 'vec3f',
  steps: 'f32',
  right: 'vec3f',
  blend: 'f32',
  up: 'vec3f',
  dust: 'f32',
  tan_fov: 'vec2f',
  march_size: 'vec2f',
  sulphur: 'vec3f',
  density: 'f32',
  hydrogen_alpha: 'vec3f',
  glow: 'f32',
  oxygen: 'vec3f',
  ambient: 'f32',
  hydrogen_beta: 'vec3f',
  lamp_count: 'f32',
  strength: 'vec4f',
  seed: 'vec3f',
});

const NOISE_SIZE = 96;
const LAMPS = 5;
const FIELD_STARS = 2500;
const FOV = (40 * Math.PI) / 180;
const SKY = { r: 0.0012, g: 0.0012, b: 0.0028, a: 1 };

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    ...DOSE_PARAMS,
    palette: { type: 'select', default: 'hubble', options: LINE_PALETTES },
    resolution: {
      type: 'select',
      default: 'half',
      options: ['full', 'half', 'quarter'],
      label: 'march resolution',
    },
    steps: { type: 'number', default: 48, min: 16, max: 128, step: 1 },
    glow: { type: 'number', default: 1, min: 0, max: 3, step: 0.05 },
    dust: { type: 'number', default: 1, min: 0, max: 2, step: 0.05 },
    turn: { type: 'number', default: 1, min: 0, max: 3, step: 0.05, label: 'turn speed' },
    distance: { type: 'number', default: 2.9, min: 1.8, max: 5, step: 0.05 },
    seed: { type: 'number', default: 3, min: 0, max: 100, step: 1 },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0.2 },
  },
  presets: {
    'hubble palette': {},
    'as the eye sees': { palette: 'natural' },
    'full resolution': { resolution: 'full' },
    'thick dust': { dust: 1.8 },
  },

  async create({ device, format, hdr, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'nebula-volume' });
    const uniforms = createUniformBuffer(device, Params, 'nebula-volume');
    const source = withChunks(shader, { 'params.wgsl': Params.wgsl });
    const module = createShader(device, source);
    const bakePipeline = device.createComputePipeline({
      label: 'nebula-volume bake',
      layout: 'auto',
      compute: { module, entryPoint: 'bake' },
    });
    const marchPipeline = createFullscreenPipeline(device, {
      fragment: source,
      entryPoint: 'march',
      format: 'rgba16float',
      label: 'nebula-volume march',
    });
    const accumulatePipeline = createFullscreenPipeline(device, {
      fragment: source,
      entryPoint: 'accumulate',
      format: 'rgba16float',
      label: 'nebula-volume accumulate',
    });
    const compositePipeline = createFullscreenPipeline(device, {
      fragment: source,
      entryPoint: 'composite',
      format: tail.scene.format,
      label: 'nebula-volume composite',
      blend: {
        color: { srcFactor: 'one', dstFactor: 'src-alpha' },
        alpha: { srcFactor: 'zero', dstFactor: 'one' },
      },
    });

    const noise = device.createTexture({
      label: 'nebula-volume noise',
      size: [NOISE_SIZE, NOISE_SIZE, NOISE_SIZE],
      dimension: '3d',
      format: 'rgba16float',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
    const linear = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
      addressModeW: 'clamp-to-edge',
    });
    const lampBuffer = device.createBuffer({
      label: 'nebula-volume lamps',
      size: LAMPS * 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    // The stars inside the cloud, in the box: hot, blue-white, the ones that make it glow.
    const random = createRandom(17);
    const lamps = new Float32Array(LAMPS * 4);
    for (let i = 0; i < LAMPS; i++) {
      const r = 0.15 + 0.35 * random();
      const a = random() * 2 * Math.PI;
      lamps.set(
        [r * Math.cos(a), (random() - 0.5) * 0.5, r * Math.sin(a), 0.02 + 0.05 * random()],
        i * 4,
      );
    }
    device.queue.writeBuffer(lampBuffer, 0, lamps);
    const bakeGroup = device.createBindGroup({
      layout: bakePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniforms.buffer } },
        { binding: 1, resource: noise.createView() },
      ],
    });
    const marchGroup = device.createBindGroup({
      layout: marchPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniforms.buffer } },
        { binding: 2, resource: noise.createView() },
        { binding: 3, resource: linear },
        { binding: 4, resource: { buffer: lampBuffer } },
      ],
    });

    const field = makeStars({ count: FIELD_STARS, seed: 23, brightest: 0, faintest: 7.5 });
    const fieldColours = starColours(field, 0.7);
    const stars = createSpotLayer(device, {
      label: 'nebula-volume stars',
      format: tail.scene.format,
    });
    const lampSpots = createSpotLayer(device, {
      label: 'nebula-volume lamps',
      format: tail.scene.format,
    });
    const list = new PointList();
    const lampList = new PointList();

    let width = 1;
    let height = 1;
    let marchWidth = 1;
    let marchHeight = 1;
    let targets: GPUTexture[] = [];
    let accumulateGroups: GPUBindGroup[] = [];
    let compositeGroups: GPUBindGroup[] = [];
    let sizeKey = '';
    let baked = '';
    let frame = 0;
    let yaw = 0.6;

    const makeTargets = () => {
      const divisor = params.resolution === 'full' ? 1 : params.resolution === 'quarter' ? 4 : 2;
      sizeKey = `${width}x${height}/${divisor}`;
      for (const t of targets) t.destroy();
      marchWidth = Math.max(1, Math.round(width / divisor));
      marchHeight = Math.max(1, Math.round(height / divisor));
      // [march, history A, history B]: the march, and the accumulated cloud ping-ponged.
      targets = [0, 1, 2].map((i) =>
        device.createTexture({
          label: `nebula-volume ${['march', 'history a', 'history b'][i]}`,
          size: [marchWidth, marchHeight],
          format: 'rgba16float',
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        }),
      );
      accumulateGroups = [1, 2].map((into) =>
        device.createBindGroup({
          layout: accumulatePipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: uniforms.buffer } },
            { binding: 5, resource: targets[0]!.createView() },
            { binding: 6, resource: targets[into === 1 ? 2 : 1]!.createView() },
          ],
        }),
      );
      compositeGroups = [1, 2].map((from) =>
        device.createBindGroup({
          layout: compositePipeline.getBindGroupLayout(0),
          entries: [
            { binding: 7, resource: targets[from]!.createView() },
            { binding: 8, resource: linear },
          ],
        }),
      );
      frame = 0;
    };

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        const divisor = params.resolution === 'full' ? 1 : params.resolution === 'quarter' ? 4 : 2;
        if (sizeKey !== `${width}x${height}/${divisor}`) makeTargets();
        yaw += time.delta * 0.03 * params.turn * dosed(params.dose, 0, 1, 1.5);
        const d = params.distance;
        const eye: [number, number, number] = [
          Math.sin(yaw) * d,
          0.35 * d * Math.sin(yaw * 0.37),
          Math.cos(yaw) * d,
        ];
        const len = Math.hypot(...eye);
        const forward: [number, number, number] = [-eye[0] / len, -eye[1] / len, -eye[2] / len];
        const rx = forward[2];
        const rz = -forward[0];
        const rl = Math.hypot(rx, rz);
        const right: [number, number, number] = [rx / rl, 0, rz / rl];
        const up: [number, number, number] = [
          right[1] * forward[2] - right[2] * forward[1],
          right[2] * forward[0] - right[0] * forward[2],
          right[0] * forward[1] - right[1] * forward[0],
        ];
        const aspect = width / height;
        const tanY = Math.tan(FOV / 2);
        const palette = lineColours(params.palette as LinePalette);
        const strength = paletteStrength(params.palette as LinePalette);
        uniforms.set({
          eye,
          frame,
          forward,
          steps: params.steps,
          right,
          // The first frame after a resize has no history; then about four frames of it.
          blend: frame === 0 ? 1 : 0.25,
          up,
          dust: params.dust,
          tan_fov: [tanY * aspect, tanY],
          march_size: [marchWidth, marchHeight],
          sulphur: palette.sulphur,
          density: 6,
          hydrogen_alpha: palette.hydrogenAlpha,
          glow: 0.25 * params.glow,
          oxygen: palette.oxygen,
          ambient: 0.25,
          hydrogen_beta: palette.hydrogenBeta,
          lamp_count: LAMPS,
          strength: [
            strength.sulphur,
            strength.hydrogenAlpha,
            strength.oxygen,
            strength.hydrogenBeta,
          ],
          seed: [params.seed * 1.7, params.seed * 0.3, params.seed * 2.9],
        });
        uniforms.upload();
        const seedKey = String(params.seed);
        if (seedKey !== baked) {
          baked = seedKey;
          const pass = encoder.beginComputePass({
            label: 'nebula-volume bake',
            timestampWrites: profiler.pass('bake'),
          });
          pass.setPipeline(bakePipeline);
          pass.setBindGroup(0, bakeGroup);
          pass.dispatchWorkgroups(NOISE_SIZE / 4, NOISE_SIZE / 4, NOISE_SIZE / 4);
          pass.end();
        }
        renderFullscreen(encoder, targets[0]!.createView(), marchPipeline, [marchGroup], {
          timestampWrites: profiler.pass('march'),
        });
        const into = frame % 2 === 0 ? 1 : 2;
        renderFullscreen(
          encoder,
          targets[into]!.createView(),
          accumulatePipeline,
          [accumulateGroups[into - 1]!],
          {
            timestampWrites: profiler.pass('accumulate'),
          },
        );

        // The field behind, then the cloud over it, then the lamps inside it.
        list.clear();
        const shown = Math.round(dosed(params.dose, 0.3, 0.7, 1) * FIELD_STARS);
        for (let i = 0; i < shown; i++) {
          // Far behind: fixed on the sky, shifting a little with the turn.
          const u = (((field.x[i]! - yaw * 0.05) % 1) + 1) % 1;
          const light = 40 * magnitudeLight(field.magnitude[i]!);
          list.push(
            u * width,
            field.y[i]! * height,
            0.8,
            fieldColours[i * 3]! * light,
            fieldColours[i * 3 + 1]! * light,
            fieldColours[i * 3 + 2]! * light,
          );
        }
        uploadSpots(list, stars);
        stars.encode(
          encoder,
          tail.scene.view,
          { width, height, minSigma: 0.5, clear: SKY },
          profiler,
        );
        renderFullscreen(
          encoder,
          tail.scene.view,
          compositePipeline,
          [compositeGroups[into - 1]!],
          {
            load: true,
            timestampWrites: profiler.pass('composite'),
          },
        );
        lampList.clear();
        const blue = starColour(20_000, 0.7);
        for (let i = 0; i < LAMPS; i++) {
          const p = [
            lamps[i * 4]! - eye[0],
            lamps[i * 4 + 1]! - eye[1],
            lamps[i * 4 + 2]! - eye[2],
          ];
          const z = p[0]! * forward[0] + p[1]! * forward[1] + p[2]! * forward[2];
          if (z <= 0.1) continue;
          const x = (p[0]! * right[0] + p[1]! * right[1] + p[2]! * right[2]) / (z * tanY * aspect);
          const y = (p[0]! * up[0] + p[1]! * up[1] + p[2]! * up[2]) / (z * tanY);
          const light = 300 * lamps[i * 4 + 3]!;
          lampList.push(
            (x * 0.5 + 0.5) * width,
            (0.5 - y * 0.5) * height,
            0.9,
            blue[0] * light,
            blue[1] * light,
            blue[2] * light,
          );
        }
        uploadSpots(lampList, lampSpots);
        lampSpots.encode(
          encoder,
          tail.scene.view,
          { width, height, halo: 0.15, haloScale: 8, haloMin: 0 },
          profiler,
        );
        tail.encode(encoder, target, time, params, profiler);
        frame++;
      },
      stats: () => ({ march: `${marchWidth}×${marchHeight}` }),
      destroy() {
        for (const t of targets) t.destroy();
        noise.destroy();
        lampBuffer.destroy();
        stars.destroy();
        lampSpots.destroy();
        uniforms.destroy();
        tail.destroy();
      },
    };
  },
});
