import { createGlareLayer, GLARE_FLOATS, type GlareLayer } from '../../gpu/glare/glare.ts';
import { createPointLayer, PointList } from '../../gpu/points.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { DOSE_PARAMS, dosed } from '../../gpu/safety/dose.ts';
import { createSpotLayer, uploadSpots } from '../../gpu/stars/spot.ts';
import { magnitudeLight, makeStars, starColour, starColours } from '../../gpu/stars/stars.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';

/** The sky behind the stars: near black, a little blue, in linear light. */
const SKY = { r: 0.0015, g: 0.0015, b: 0.0035, a: 1 };
/** Light of a magnitude-0 star, in scene units: bright enough for spikes, not so bright it burns. */
const ZERO_MAGNITUDE_LIGHT = 6;
const FIELD_STARS = 2400;
const ROW_TEMPERATURES = [2_400, 3_000, 3_700, 4_500, 5_800, 7_500, 10_000, 15_000, 25_000, 40_000];
const ROW_MAGNITUDES = [0, 1, 2, 3, 4, 5, 6];
const NO_APERTURE = {
  blades: 0,
  rotation: 0,
  curvature: 0,
  rim: 0,
  rings: 0,
  ringCount: 1,
  vignette: 0,
};

/** Stars brighter than this get spikes; fainter ones would not show them. */
const SPIKE_FLOOR = 0.5;
/** The share of a spiked star's light in its spikes. */
const SPIKE_SHARE = 0.2;

interface Spikes {
  spikes: number;
  rotation: number;
  /** The share of the spikes' light in the horizontal streak. */
  streak: number;
}

/** Diffraction spikes as a telescope's support vanes draw them. */
const SPIKES: Record<'hubble' | 'jwst', Spikes> = {
  // Hubble's secondary mirror is held by four vanes: four spikes, here at 45°.
  hubble: { spikes: 4, rotation: Math.PI / 4, streak: 0 },
  // JWST's hexagonal segments give six, and its vertical strut two more across.
  jwst: { spikes: 6, rotation: Math.PI / 2, streak: 0.25 },
};

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    ...DOSE_PARAMS,
    sigma: {
      type: 'number',
      default: 0.8,
      min: 0.3,
      max: 2,
      step: 0.05,
      label: 'spot width (σ, device px)',
    },
    spot: { type: 'select', default: 'gaussian', options: ['gaussian', 'disc'], label: 'spot' },
    saturation: { type: 'number', default: 0.7, min: 0, max: 1, step: 0.01, label: 'colour' },
    spikes: { type: 'select', default: 'jwst', options: ['none', 'hubble', 'jwst'] },
    halo: { type: 'number', default: 0.05, min: 0, max: 0.3, step: 0.01, label: 'halo share' },
    drift: { type: 'number', default: 1, min: 0, max: 3, step: 0.05 },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0 },
  },
  presets: {
    'as the eye sees': {},
    'full colour': { saturation: 1 },
    hubble: { spikes: 'hubble' },
    'disc spots': { spot: 'disc' },
  },

  async create({ device, format, hdr, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'star-splat' });
    const spots = createSpotLayer(device, { label: 'star-splat', format: tail.scene.format });
    const discs = createPointLayer(device, { label: 'star-splat', format: tail.scene.format });
    // One glare layer per set of spikes: a layer's lights and settings, written between passes of
    // one command buffer, would all arrive with the last values.
    const fieldGlare = createGlareLayer(device, {
      label: 'star-splat field',
      format: tail.scene.format,
    });
    const rowGlare = {
      hubble: createGlareLayer(device, { label: 'star-splat hubble', format: tail.scene.format }),
      jwst: createGlareLayer(device, { label: 'star-splat jwst', format: tail.scene.format }),
    };
    const field = makeStars({ count: FIELD_STARS, seed: 11 });
    const list = new PointList();
    let fieldColours = starColours(field, params.saturation);
    let saturation = params.saturation;
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
        clock += time.delta * params.drift * dosed(params.dose, 0, 1, 1.6);
        if (params.saturation !== saturation) {
          saturation = params.saturation;
          fieldColours = starColours(field, saturation);
        }
        const look =
          params.spikes === 'none' ? undefined : SPIKES[params.spikes as keyof typeof SPIKES];
        const sigma = params.sigma;
        // A disc about as sharp as the Gaussian has a radius of 1.25 σ (docs/studies/shimmer.md).
        const size = params.spot === 'disc' ? sigma * 1.25 : sigma;
        const ray = Math.max(6, 0.012 * height);
        const thickness = Math.max(0.6, sigma * 0.8);
        list.clear();
        const fieldLights: number[] = [];
        /** A star; one brighter than `SPIKE_FLOOR` gives `SPIKE_SHARE` of its light to `spikes`. */
        const addStar = (
          x: number,
          y: number,
          light: number,
          c: ArrayLike<number>,
          spikes?: number[],
        ) => {
          const share = spikes && light > SPIKE_FLOOR ? SPIKE_SHARE : 0;
          const core = light * (1 - share);
          list.push(x, y, size, c[0]! * core, c[1]! * core, c[2]! * core);
          if (share > 0)
            spikes!.push(
              x,
              y,
              0,
              0,
              c[0]! * light * share,
              c[1]! * light * share,
              c[2]! * light * share,
              0,
            );
        };

        // The field, drifting slowly to the left: the sky's own magnitudes and temperatures, at
        // half the rows' scale so the rows stand out in front of it.
        const shown = Math.round(dosed(params.dose, 0, 0.7, 1) * FIELD_STARS);
        const drift = 0.004 * clock;
        for (let i = 0; i < shown; i++) {
          const x = (((field.x[i]! - drift) % 1) + 1) % 1;
          const light = 0.5 * ZERO_MAGNITUDE_LIGHT * magnitudeLight(field.magnitude[i]!);
          const colour = fieldColours.subarray(i * 3, i * 3 + 3);
          addStar(x * width, field.y[i]! * height, light, colour, look ? fieldLights : undefined);
        }
        // Row 1: temperature, every star the same light.
        ROW_TEMPERATURES.forEach((t, i) => {
          const x = ((i + 0.5) / ROW_TEMPERATURES.length) * width;
          addStar(x, 0.22 * height, 0.6 * ZERO_MAGNITUDE_LIGHT, starColour(t, params.saturation));
        });
        // Row 2: magnitude, every star the Sun's colour.
        const sun = starColour(5_800, params.saturation);
        ROW_MAGNITUDES.forEach((m, i) => {
          const x = ((i + 0.5) / ROW_MAGNITUDES.length) * width;
          addStar(x, 0.45 * height, ZERO_MAGNITUDE_LIGHT * magnitudeLight(m), sun);
        });
        // Row 3: one bright star three ways: no spikes, Hubble's and JWST's.
        const vega = starColour(9_600, params.saturation);
        const bright = 3 * ZERO_MAGNITUDE_LIGHT;
        const rowLights = { hubble: [] as number[], jwst: [] as number[] };
        addStar(0.25 * width, 0.72 * height, bright, vega);
        addStar(0.5 * width, 0.72 * height, bright, vega, rowLights.hubble);
        addStar(0.75 * width, 0.72 * height, bright, vega, rowLights.jwst);

        if (params.spot === 'disc') {
          list.upload(discs);
          discs.encode(
            encoder,
            tail.scene.view,
            { width, height, aperture: NO_APERTURE, clear: SKY },
            profiler,
          );
        } else {
          uploadSpots(list, spots);
          const frame = {
            width,
            height,
            minSigma: 0.3,
            halo: params.halo,
            haloMin: 0.3,
            clear: SKY,
          };
          spots.encode(encoder, tail.scene.view, frame, profiler);
        }
        const spikes = (layer: GlareLayer, lights: number[], set: Spikes, scale: number) => {
          if (lights.length === 0) return;
          layer.setLights(new Float32Array(lights), lights.length / GLARE_FLOATS);
          layer.encode(encoder, tail.scene.view, {
            width,
            height,
            spikes: set.spikes,
            rotation: set.rotation,
            length: ray * scale,
            thickness,
            spikeShare: 1 - set.streak,
            streakShare: set.streak,
            streakLength: ray * scale * 0.6,
          });
        };
        if (look) spikes(fieldGlare, fieldLights, look, 1);
        spikes(rowGlare.hubble, rowLights.hubble, SPIKES.hubble, 5);
        spikes(rowGlare.jwst, rowLights.jwst, SPIKES.jwst, 5);
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({ stars: list.count }),
      destroy() {
        spots.destroy();
        discs.destroy();
        fieldGlare.destroy();
        rowGlare.hubble.destroy();
        rowGlare.jwst.destroy();
        tail.destroy();
      },
    };
  },
});
