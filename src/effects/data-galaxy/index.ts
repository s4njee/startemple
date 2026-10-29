import { oklchToLinear } from '../../gpu/colour/oklab.ts';
import { PointList } from '../../gpu/points.ts';
import { trackPointer, type PointerTracker } from '../../gpu/pointer.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { createRandom } from '../../gpu/random.ts';
import { DOSE_PARAMS, dosed } from '../../gpu/safety/dose.ts';
import { createSpotLayer, uploadSpots } from '../../gpu/stars/spot.ts';
import { defineEffect } from '../types.ts';
import { sampleData, type DataPoint } from './data.ts';
import { meta } from './meta.ts';

/** How near the pointer a point must be to be picked, CSS pixels. */
const PICK_RADIUS = 14;
const deg = Math.PI / 180;

/** The event a page listens for on the canvas: which point the pointer is over, if any. */
export interface PickDetail {
  index: number;
  cluster: number;
  clusterName: string;
  value: number;
  label: string;
}

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    ...DOSE_PARAMS,
    points: { type: 'number', default: 3000, min: 200, max: 10000, step: 100 },
    clusters: { type: 'number', default: 5, min: 2, max: 6, step: 1 },
    twist: { type: 'number', default: 4.2, min: 0, max: 9, step: 0.1, label: 'arm twist (rad)' },
    spread: { type: 'number', default: 0.25, min: 0, max: 0.8, step: 0.01, label: 'arm width' },
    inclination: {
      type: 'number',
      default: 50,
      min: 0,
      max: 80,
      step: 1,
      label: 'inclination (°)',
    },
    spin: { type: 'number', default: 1, min: 0, max: 3, step: 0.05, label: 'rotation' },
    seed: { type: 'number', default: 4, min: 0, max: 100, step: 1 },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0 },
  },
  presets: {
    'five clusters': {},
    'face on': { inclination: 5 },
    'many points': { points: 9000, spread: 0.32 },
    'two groups': { clusters: 2, twist: 3 },
  },

  async create({ device, format, hdr, canvas, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'data-galaxy' });
    const spots = createSpotLayer(device, { label: 'data-galaxy', format: tail.scene.format });
    const picked = createSpotLayer(device, {
      label: 'data-galaxy pick',
      format: tail.scene.format,
    });
    const list = new PointList();
    const pickList = new PointList();
    const live =
      typeof window !== 'undefined' && typeof canvas.getBoundingClientRect === 'function';
    const pointer: PointerTracker | undefined = live ? trackPointer(canvas) : undefined;

    let key = '';
    let points: DataPoint[] = [];
    let clusterNames: string[] = [];
    /** Each point's place in the galaxy's plane at t = 0: radius and angle, and a scatter. */
    let place = new Float32Array(0);
    let colours: [number, number, number][] = [];
    const build = () => {
      key = JSON.stringify([
        params.points,
        params.clusters,
        params.seed,
        params.twist,
        params.spread,
      ]);
      const data = sampleData(Math.round(params.points), Math.round(params.clusters), params.seed);
      points = data.points;
      clusterNames = data.clusters;
      const random = createRandom(params.seed + 101);
      place = new Float32Array(points.length * 2);
      points.forEach((p, i) => {
        // Along its cluster's arm by its order; brighter points nearer the core, where it is busiest.
        const r = 0.1 + 0.85 * (0.3 * (1 - p.value) + 0.7 * p.order);
        const arm = (2 * Math.PI * p.cluster) / data.clusters.length;
        const scatter = (random() - 0.5) * params.spread * (0.6 + r);
        place.set([r * (1 + 0.15 * (random() - 0.5)), arm + params.twist * r + scatter], i * 2);
      });
      // A colour per cluster, evenly round the hue wheel at one lightness, so none outshines another.
      colours = data.clusters.map((_, k) => {
        const c = oklchToLinear([0.82, 0.11, (2 * Math.PI * k) / data.clusters.length + 0.6]);
        return c.map((v) => Math.max(0, v)) as [number, number, number];
      });
    };

    let width = 1;
    let height = 1;
    let dpr = 1;
    let angle = 0;
    let pick = -1;
    let pickCluster = -1;

    return {
      resize(w, h, ratio) {
        width = w;
        height = h;
        dpr = ratio;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        const k = JSON.stringify([
          params.points,
          params.clusters,
          params.seed,
          params.twist,
          params.spread,
        ]);
        if (k !== key) build();
        angle += time.delta * 0.02 * params.spin * dosed(params.dose, 0, 1, 1.5);
        const scale = 0.44 * height;
        const tilt = Math.cos(params.inclination * deg);
        const cx = width / 2;
        const cy = height / 2;
        const shown = Math.min(
          points.length,
          Math.round(dosed(params.dose, 0.3, 1, 1) * points.length),
        );

        // Where every point is, on the CPU: the picking needs it, and at a few thousand it is cheap.
        const xs = new Float32Array(shown);
        const ys = new Float32Array(shown);
        for (let i = 0; i < shown; i++) {
          const r = place[i * 2]!;
          const a = place[i * 2 + 1]! + angle;
          xs[i] = cx + Math.cos(a) * r * scale;
          ys[i] = cy + Math.sin(a) * r * scale * tilt;
        }
        // The point under the pointer: the nearest within the pick radius.
        let best = -1;
        if (pointer?.state.inside) {
          const px = pointer.state.x * width;
          const py = pointer.state.y * height;
          let nearest = (PICK_RADIUS * dpr) ** 2;
          for (let i = 0; i < shown; i++) {
            const d = (xs[i]! - px) ** 2 + (ys[i]! - py) ** 2;
            if (d < nearest) {
              nearest = d;
              best = i;
            }
          }
        }
        if (best !== pick) {
          pick = best;
          pickCluster = best >= 0 ? points[best]!.cluster : -1;
          const detail: PickDetail | null =
            best >= 0
              ? {
                  index: best,
                  cluster: points[best]!.cluster,
                  clusterName: clusterNames[points[best]!.cluster]!,
                  value: points[best]!.value,
                  label: points[best]!.label,
                }
              : null;
          if (live) canvas.dispatchEvent(new CustomEvent('sr-pick', { detail, bubbles: true }));
        }

        list.clear();
        for (let i = 0; i < shown; i++) {
          const p = points[i]!;
          const c = colours[p.cluster]!;
          // Brightness from the value; the picked point's cluster lifted so it stands out together.
          const lift = pickCluster < 0 ? 1 : p.cluster === pickCluster ? 2.2 : 0.45;
          const light = (0.6 + 14 * p.value) * lift;
          list.push(xs[i]!, ys[i]!, 0.9, c[0] * light, c[1] * light, c[2] * light);
        }
        uploadSpots(list, spots);
        spots.encode(
          encoder,
          tail.scene.view,
          {
            width,
            height,
            minSigma: 0.5,
            halo: 0.06,
            haloMin: 0.6,
            clear: { r: 0.0008, g: 0.0008, b: 0.0016, a: 1 },
          },
          profiler,
        );
        pickList.clear();
        if (pick >= 0) {
          // The picked point: a bright core and a wide halo round it, so it reads under the cursor.
          pickList.push(xs[pick]!, ys[pick]!, 1.6, 30, 30, 30);
        }
        uploadSpots(pickList, picked);
        picked.encode(
          encoder,
          tail.scene.view,
          { width, height, halo: 0.5, haloScale: 9, haloMin: 0 },
          profiler,
        );
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({ picked: pick >= 0 ? points[pick]!.label : 'none' }),
      destroy() {
        pointer?.destroy();
        spots.destroy();
        picked.destroy();
        tail.destroy();
      },
    };
  },
});
