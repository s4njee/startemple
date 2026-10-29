import { createFullscreenPipeline, renderFullscreen } from '../fullscreen.ts';
import { withChunks } from '../shader.ts';
import { createUniformBuffer, defineUniformStruct } from '../uniforms.ts';
import shader from './atmosphere-luts.wgsl';

/*
 * A planet's air (story 5.2): the parameters, the CPU twin of `atmosphere.wgsl`, and Hillaire's
 * tables.
 *
 * Units are kilometres. The defaults are Earth's, as Hillaire's paper (and Bruneton's before it)
 * gives them: Rayleigh scattering of (5.8, 13.6, 33.1) per 1000 km at the ground for red, green and
 * blue, falling with a scale height of 8 km; Mie scattering 4.0 and extinction 4.4 per 1000 km
 * with a scale height of 1.2 km and asymmetry 0.8. Ozone, which absorbs orange and keeps the
 * twilight zenith blue, is left out of all three methods, so they stay comparable; it is a
 * column in the transmittance table that the closed form cannot follow.
 */

export type Vec3 = [number, number, number];

export interface Atmosphere {
  /** The ground's radius and the top of the air, km. */
  ground: number;
  top: number;
  /** Rayleigh scattering at the ground, per km, red, green, blue. */
  rayleigh: Vec3;
  rayleighHeight: number;
  mie: number;
  mieExtinction: number;
  mieHeight: number;
  mieG: number;
}

export const EARTH_AIR: Atmosphere = {
  ground: 6360,
  top: 6460,
  rayleigh: [5.802e-3, 13.558e-3, 33.1e-3],
  rayleighHeight: 8,
  mie: 3.996e-3,
  mieExtinction: 4.4e-3,
  mieHeight: 1.2,
  mieG: 0.8,
};

/**
 * The same air `k` times thicker: heights and the top stretched by k, densities divided by it, so
 * every vertical column, and so the colour of the sky overhead, is unchanged, but the blue limb a
 * planet shows from orbit is k times wider. A page shows a planet a few hundred pixels across, on
 * which Earth's real air is two or three pixels deep.
 */
export function thickerAir(air: Atmosphere, k: number): Atmosphere {
  return {
    ...air,
    top: air.ground + (air.top - air.ground) * k,
    rayleigh: air.rayleigh.map((v) => v / k) as Vec3,
    rayleighHeight: air.rayleighHeight * k,
    mie: air.mie / k,
    mieExtinction: air.mieExtinction / k,
    mieHeight: air.mieHeight * k,
  };
}

/** The fields of `Atmo` in atmosphere.wgsl, for a uniform struct. */
export const ATMO_FIELDS = {
  ground: 'f32',
  top: 'f32',
  rayleigh_height: 'f32',
  mie: 'f32',
  rayleigh: 'vec3f',
  mie_extinction: 'f32',
  mie_height: 'f32',
  mie_g: 'f32',
} as const;

export function atmoValues(air: Atmosphere) {
  return {
    ground: air.ground,
    top: air.top,
    rayleigh: air.rayleigh,
    rayleigh_height: air.rayleighHeight,
    mie: air.mie,
    mie_extinction: air.mieExtinction,
    mie_height: air.mieHeight,
    mie_g: air.mieG,
  };
}

// --- The CPU twin ------------------------------------------------------------------------------

/**
 * Chapman's function for mu ≥ 0: `_atmo_chapman`, sqrt(πx/2) erfcx(sqrt(x/2) mu) with the fitted
 * erfcx. Schüler's c / ((c − 1) mu + 1) is kept beside it, for the comparison in the tests.
 */
export function chapman(x: number, mu: number): number {
  const y = Math.sqrt(0.5 * x) * mu;
  return Math.sqrt((Math.PI / 2) * x) / (1.13 * y + Math.sqrt(0.41275 * y * y + 0.04 * y + 1));
}

export function chapmanSchuler(x: number, mu: number): number {
  const c = Math.sqrt((Math.PI / 2) * x);
  return c / ((c - 1) * mu + 1);
}

/** The column of air (in km at ground density) from radius r to space along cosine mu: `atmo_column`. */
export function column(r: number, mu: number, ground: number, height: number): number {
  if (mu >= 0) return height * Math.exp((ground - r) / height) * chapman(r / height, mu);
  const s = Math.sqrt(Math.max(1 - mu * mu, 0));
  const low = r - (r * mu * mu) / (1 + s);
  const deep = Math.min((ground - low) / height, 80);
  return (
    height *
    (2 * Math.exp(deep) * chapman(low / height, 0) -
      Math.exp((ground - r) / height) * chapman(r / height, -mu))
  );
}

/** The same column by brute force, to the top of the air: the reference for `column`. */
export function columnNumeric(
  r: number,
  mu: number,
  ground: number,
  height: number,
  top: number,
  steps = 20000,
): number {
  const d = toTop(r, mu, top);
  const dt = d / steps;
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) * dt;
    const ri = Math.sqrt(r * r + t * t + 2 * r * mu * t);
    sum += Math.exp(-(ri - ground) / height) * dt;
  }
  return sum;
}

export function toTop(r: number, mu: number, top: number): number {
  return Math.max(-r * mu + Math.sqrt(Math.max(r * r * (mu * mu - 1) + top * top, 0)), 0);
}

/** `atmo_lut_uv`: the transmittance table's coordinates for (radius, cosine). */
export function lutUv(air: Atmosphere, r: number, mu: number): [number, number] {
  const h = Math.sqrt(air.top ** 2 - air.ground ** 2);
  const rho = Math.sqrt(Math.max(r * r - air.ground ** 2, 0));
  const d = toTop(r, mu, air.top);
  const dMin = air.top - r;
  const dMax = rho + h;
  return [(d - dMin) / Math.max(dMax - dMin, 1e-6), rho / h];
}

/** `atmo_lut_r_mu`: its inverse. */
export function lutRadiusCosine(air: Atmosphere, u: number, v: number): [number, number] {
  const h = Math.sqrt(air.top ** 2 - air.ground ** 2);
  const rho = h * v;
  const r = Math.sqrt(rho * rho + air.ground ** 2);
  const dMin = air.top - r;
  const dMax = rho + h;
  const d = dMin + u * (dMax - dMin);
  const mu = d > 0 ? Math.max(-1, Math.min(1, (h * h - rho * rho - d * d) / (2 * r * d))) : 1;
  return [r, mu];
}

export const rayleighPhase = (c: number) => (3 / (16 * Math.PI)) * (1 + c * c);
export function miePhase(c: number, g: number): number {
  const g2 = g * g;
  const k = ((3 / (8 * Math.PI)) * (1 - g2)) / (2 + g2);
  return (k * (1 + c * c)) / Math.max(1 + g2 - 2 * g * c, 1e-4) ** 1.5;
}

const dot = (a: readonly number[], b: readonly number[]) =>
  a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

/** A ray's crossings of a sphere about the origin, or undefined if it misses. */
export function sphereHits(
  ro: readonly number[],
  rd: readonly number[],
  radius: number,
): [number, number] | undefined {
  const b = dot(ro, rd);
  const c = dot(ro, ro) - radius * radius;
  const h = b * b - c;
  if (h < 0) return undefined;
  const s = Math.sqrt(h);
  return [-b - s, -b + s];
}

/**
 * Single scattering along a ray from `ro` (inside or outside the air) by brute force: `steps`
 * along the view, a march of `lightSteps` to the top for the sun at each. Light per unit of sun
 * illuminance. The reference for the GPU's three methods, at any step count.
 */
export function singleScattering(
  air: Atmosphere,
  ro: readonly number[],
  rd: readonly number[],
  sun: readonly number[],
  steps = 256,
  lightSteps = 64,
): { inscatter: Vec3; transmittance: Vec3 } {
  const inscatter: Vec3 = [0, 0, 0];
  const transmittance: Vec3 = [1, 1, 1];
  const top = sphereHits(ro, rd, air.top);
  if (!top || top[1] <= 0) return { inscatter, transmittance };
  const t0 = Math.max(top[0], 0);
  let t1 = top[1];
  const ground = sphereHits(ro, rd, air.ground);
  if (ground && ground[0] > 0) t1 = ground[0];
  const dt = (t1 - t0) / steps;
  const c = dot(rd, sun);
  const pr = rayleighPhase(c);
  const pm = miePhase(c, air.mieG);
  for (let i = 0; i < steps; i++) {
    const t = t0 + (i + 0.5) * dt;
    const p = [ro[0]! + rd[0]! * t, ro[1]! + rd[1]! * t, ro[2]! + rd[2]! * t];
    const r = Math.hypot(p[0]!, p[1]!, p[2]!);
    const muSun = dot(p, sun) / r;
    const dr = Math.exp(-(r - air.ground) / air.rayleighHeight);
    const dm = Math.exp(-(r - air.ground) / air.mieHeight);
    const horizon = -Math.sqrt(Math.max(1 - (air.ground / r) ** 2, 0));
    const lit: Vec3 = [0, 0, 0];
    if (muSun > horizon) {
      let cr = 0;
      let cm = 0;
      const d = toTop(r, muSun, air.top);
      const ds = d / lightSteps;
      for (let k = 0; k < lightSteps; k++) {
        const s = (k + 0.5) * ds;
        const rs = Math.sqrt(r * r + s * s + 2 * r * muSun * s);
        cr += Math.exp(-(rs - air.ground) / air.rayleighHeight) * ds;
        cm += Math.exp(-(rs - air.ground) / air.mieHeight) * ds;
      }
      for (let ch = 0; ch < 3; ch++)
        lit[ch] = Math.exp(-(air.rayleigh[ch]! * cr + air.mieExtinction * cm));
    }
    for (let ch = 0; ch < 3; ch++) {
      const extinction = air.rayleigh[ch]! * dr + air.mieExtinction * dm;
      const source = (air.rayleigh[ch]! * dr * pr + air.mie * dm * pm) * lit[ch]!;
      const step = Math.exp(-extinction * dt);
      inscatter[ch] =
        inscatter[ch]! + (transmittance[ch]! * source * (1 - step)) / Math.max(extinction, 1e-12);
      transmittance[ch] = transmittance[ch]! * step;
    }
  }
  return { inscatter, transmittance };
}

// --- Hillaire's tables on the GPU ----------------------------------------------------------------

const LutParams = defineUniformStruct('LutParams', {
  ...ATMO_FIELDS,
  view_radius: 'f32',
  view_sun: 'f32',
  albedo: 'f32',
  ms: 'f32',
});

export const TRANSMITTANCE_SIZE = [256, 64] as const;
export const MS_SIZE = [32, 32] as const;
export const SKY_VIEW_SIZE = [192, 108] as const;

export interface AtmosphereTables {
  readonly transmittance: GPUTextureView;
  readonly multiple: GPUTextureView;
  readonly skyView: GPUTextureView;
  readonly sampler: GPUSampler;
  /** Bakes the transmittance and multiple-scattering tables now, when the air has changed. */
  bake(air: Atmosphere, albedo?: number): void;
  /** Encodes the sky-view table for a camera at `radius` and the sun at cosine `sunCosine` from its zenith. */
  encodeSkyView(
    encoder: GPUCommandEncoder,
    air: Atmosphere,
    radius: number,
    sunCosine: number,
    multiple: boolean,
    timestampWrites?: GPURenderPassTimestampWrites,
  ): void;
  destroy(): void;
}

export function createAtmosphereTables(device: GPUDevice, label = 'atmosphere'): AtmosphereTables {
  const source = withChunks(shader, { 'lut-params.wgsl': LutParams.wgsl });
  const make = (name: string, [w, h]: readonly [number, number]) =>
    device.createTexture({
      label: `${label} ${name}`,
      size: [w, h],
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
  const transmittance = make('transmittance', TRANSMITTANCE_SIZE);
  const multiple = make('multiple scattering', MS_SIZE);
  const skyView = make('sky view', SKY_VIEW_SIZE);
  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });
  const pipeline = (entryPoint: string) =>
    createFullscreenPipeline(device, {
      fragment: source,
      entryPoint,
      format: 'rgba16float',
      label: `${label} ${entryPoint}`,
    });
  const transmittancePipeline = pipeline('transmittance_fs');
  const msPipeline = pipeline('ms_fs');
  const skyPipeline = pipeline('sky_view_fs');
  // One buffer for the static tables, one for the sky view, which is written each frame.
  const staticUniforms = createUniformBuffer(device, LutParams, `${label} tables`);
  const skyUniforms = createUniformBuffer(device, LutParams, `${label} sky view`);
  const views = {
    transmittance: transmittance.createView(),
    multiple: multiple.createView(),
    skyView: skyView.createView(),
  };
  const transmittanceGroup = device.createBindGroup({
    layout: transmittancePipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: staticUniforms.buffer } }],
  });
  const msGroup = device.createBindGroup({
    layout: msPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: staticUniforms.buffer } },
      { binding: 1, resource: views.transmittance },
      { binding: 3, resource: sampler },
    ],
  });
  const skyGroup = device.createBindGroup({
    layout: skyPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: skyUniforms.buffer } },
      { binding: 1, resource: views.transmittance },
      { binding: 2, resource: views.multiple },
      { binding: 3, resource: sampler },
    ],
  });
  return {
    ...views,
    sampler,
    bake(air, albedo = 0.3) {
      staticUniforms.set({
        ...atmoValues(air),
        view_radius: air.ground,
        view_sun: 1,
        albedo,
        ms: 1,
      });
      staticUniforms.upload();
      const encoder = device.createCommandEncoder({ label: `${label} tables` });
      renderFullscreen(encoder, views.transmittance, transmittancePipeline, [transmittanceGroup]);
      renderFullscreen(encoder, views.multiple, msPipeline, [msGroup]);
      device.queue.submit([encoder.finish()]);
    },
    encodeSkyView(encoder, air, radius, sunCosine, ms, timestampWrites) {
      skyUniforms.set({
        ...atmoValues(air),
        view_radius: radius,
        view_sun: sunCosine,
        albedo: 0.3,
        ms: ms ? 1 : 0,
      });
      skyUniforms.upload();
      renderFullscreen(encoder, views.skyView, skyPipeline, [skyGroup], { timestampWrites });
    },
    destroy() {
      transmittance.destroy();
      multiple.destroy();
      skyView.destroy();
      staticUniforms.destroy();
      skyUniforms.destroy();
    },
  };
}
