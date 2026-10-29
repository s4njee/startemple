import { PointList } from '../points.ts';
import type { PassProfiler } from '../profiler.ts';
import { createSpotLayer, uploadSpots } from '../stars/spot.ts';
import { magnitudeLight, makeStars, starColours } from '../stars/stars.ts';

// The still field of stars behind a planet, a giant, the Sun or a moon (Epics 5 and 6): 2.1's
// spots, fixed to the screen, drawn first into a cleared scene. The body drawn over them passes
// what is behind it by its alpha, so a star shows through thin air and not through the planet.

export interface StarBackdrop {
  encode(
    encoder: GPUCommandEncoder,
    view: GPUTextureView,
    width: number,
    height: number,
    profiler?: PassProfiler,
    gain?: number,
  ): void;
  destroy(): void;
}

export function createStarBackdrop(
  device: GPUDevice,
  format: GPUTextureFormat,
  label: string,
  { count = 1600, seed = 29, light = 6 }: { count?: number; seed?: number; light?: number } = {},
): StarBackdrop {
  const spots = createSpotLayer(device, { label: `${label} stars`, format });
  const stars = makeStars({ count, seed, brightest: 0.5, faintest: 7.5 });
  const colours = starColours(stars, 0.6);
  const list = new PointList();
  let key = '';
  return {
    encode(encoder, view, width, height, profiler, gain = 1) {
      // Fewer stars on a smaller canvas: the same density per pixel, not per screen.
      const shown = Math.min(count, Math.round((count * width * height) / (1920 * 1080)) + 40);
      const next = `${width}x${height}`;
      if (next !== key) {
        key = next;
        list.clear();
        for (let i = 0; i < shown; i++) {
          const l = light * magnitudeLight(stars.magnitude[i]!);
          list.push(
            stars.x[i]! * width,
            stars.y[i]! * height,
            0.8,
            colours[i * 3]! * l,
            colours[i * 3 + 1]! * l,
            colours[i * 3 + 2]! * l,
          );
        }
        uploadSpots(list, spots);
      }
      spots.encode(
        encoder,
        view,
        { width, height, gain, clear: { r: 0, g: 0, b: 0, a: 1 } },
        profiler,
      );
    },
    destroy() {
      spots.destroy();
    },
  };
}
