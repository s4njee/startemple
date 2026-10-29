import { PointList } from '../../gpu/points.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { DOSE_PARAMS, dosed } from '../../gpu/safety/dose.ts';
import { trackScroll, type ScrollTracker } from '../../gpu/scroll.ts';
import { julianDate } from '../../gpu/stars/sky.ts';
import {
  elements,
  heliocentric,
  orbitPoint,
  PLANET_COLOURS,
  PLANETS,
  type Planet,
} from '../../gpu/stars/planets.ts';
import { createSpotLayer, uploadSpots } from '../../gpu/stars/spot.ts';
import { starColour } from '../../gpu/stars/stars.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';

const deg = Math.PI / 180;
/** The innermost distance the scale shows, AU: Mercury's perihelion is 0.31. */
const INNER = 0.2;
/** Each planet's spot width, device pixels: the giants larger. Not to scale; nothing would show. */
const SIZE: Record<Planet, number> = {
  mercury: 1.1,
  venus: 1.6,
  earth: 1.6,
  mars: 1.3,
  jupiter: 2.6,
  saturn: 2.3,
  uranus: 1.8,
  neptune: 1.8,
};

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    ...DOSE_PARAMS,
    days: { type: 'number', default: 6, min: 0, max: 60, step: 0.5, label: 'days a second' },
    reach: { type: 'number', default: 35, min: 2, max: 40, step: 0.5, label: 'out to (AU)' },
    view: { type: 'number', default: 62, min: 10, max: 90, step: 1, label: 'view from above (°)' },
    scroll: { type: 'boolean', default: true, label: 'scrolling zooms in' },
    lines: { type: 'number', default: 1, min: 0, max: 3, step: 0.05, label: 'orbit lines' },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0.3 },
  },
  presets: {
    'the whole system': {},
    'inner planets': { reach: 2.2, days: 2 },
    'from above': { view: 90 },
    'a year in a minute': { days: 6 },
  },

  async create({ device, format, hdr, canvas, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'orbits' });
    const lineSpots = createSpotLayer(device, { label: 'orbits lines', format: tail.scene.format });
    const bodySpots = createSpotLayer(device, {
      label: 'orbits bodies',
      format: tail.scene.format,
    });
    const lines = new PointList();
    const bodies = new PointList();
    const live =
      typeof window !== 'undefined' && typeof canvas.getBoundingClientRect === 'function';
    const scroll: ScrollTracker | undefined = live ? trackScroll(canvas) : undefined;
    const startJd = julianDate(new Date());
    // The orbits barely change over centuries: their shapes are taken once, at today's elements.
    const orbits = PLANETS.map((planet) => ({ planet, ...elements(planet, startJd) }));

    let width = 1;
    let height = 1;
    let days = 0;
    let linesKey = '';
    let reach = params.reach;

    /** Screen position of a heliocentric point (AU): log distance from the Sun, then the view tilt. */
    const toScreen = (p: readonly number[], outer: number): [number, number] => {
      const r = Math.hypot(p[0]!, p[1]!);
      const radius = 0.46 * height;
      const t = Math.max(0, Math.log(Math.max(r, 1e-6) / INNER) / Math.log(outer / INNER));
      const rho = radius * t;
      const angle = Math.atan2(p[1]!, p[0]!);
      return [
        width / 2 + rho * Math.cos(angle),
        height / 2 - rho * Math.sin(angle) * Math.sin(params.view * deg),
      ];
    };

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
        linesKey = '';
      },
      frame(time, encoder, target) {
        days += time.delta * params.days * dosed(params.dose, 0, 1, 1.5);
        // Scrolling the page zooms in: the outer edge comes in from `reach` towards the inner
        // planets over two screens of scroll, eased.
        let outer = params.reach;
        if (scroll && params.scroll) {
          const share = Math.min(
            1,
            Math.max(
              0,
              scroll.update(time.delta).offset /
                (2 * Math.max(1, height / (globalThis.devicePixelRatio ?? 1))),
            ),
          );
          outer = params.reach * Math.exp(-share * Math.log(Math.max(1, params.reach / 2)));
        }
        reach += (outer - reach) * (1 - Math.exp(-time.delta / 0.25));

        // The orbit lines, rebuilt only when the view changes: a spot every 0.8 px along each.
        const key = JSON.stringify([
          width,
          height,
          Math.round(reach * 200),
          params.view,
          params.lines,
        ]);
        if (key !== linesKey) {
          linesKey = key;
          lines.clear();
          for (const o of orbits) {
            const colour = PLANET_COLOURS[o.planet];
            const samples: [number, number][] = [];
            const n = 2048;
            for (let k = 0; k <= n; k++) {
              samples.push(
                toScreen(orbitPoint(o.a, o.e, o.I, o.omega, o.node, (2 * Math.PI * k) / n), reach),
              );
            }
            for (let k = 0; k < n; k++) {
              const [x0, y0] = samples[k]!;
              const [x1, y1] = samples[k + 1]!;
              const length = Math.hypot(x1 - x0, y1 - y0);
              const steps = Math.max(1, Math.ceil(length / 0.8));
              const light = 0.035 * params.lines * (length / steps);
              for (let s = 0; s < steps; s++) {
                const u = s / steps;
                lines.push(
                  x0 + u * (x1 - x0),
                  y0 + u * (y1 - y0),
                  0.6,
                  colour[0] * light,
                  colour[1] * light,
                  colour[2] * light,
                );
              }
            }
          }
          uploadSpots(lines, lineSpots);
        }

        // The Sun and the planets where they are on the day.
        bodies.clear();
        const sun = starColour(5_800, 0.6);
        bodies.push(width / 2, height / 2, 2.2, sun[0] * 60, sun[1] * 60, sun[2] * 60);
        for (const planet of PLANETS) {
          const p = heliocentric(planet, startJd + days);
          const [x, y] = toScreen(p, reach);
          const c = PLANET_COLOURS[planet];
          const light = 10 + 6 * SIZE[planet];
          bodies.push(x, y, SIZE[planet], c[0] * light, c[1] * light, c[2] * light);
        }
        uploadSpots(bodies, bodySpots);
        lineSpots.encode(
          encoder,
          tail.scene.view,
          { width, height, minSigma: 0.5, clear: { r: 0.0008, g: 0.0008, b: 0.0016, a: 1 } },
          profiler,
        );
        bodySpots.encode(
          encoder,
          tail.scene.view,
          { width, height, halo: 0.25, haloScale: 8, haloMin: 0 },
          profiler,
        );
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({
        date: new Date((startJd + days - 2_440_587.5) * 86_400_000).toISOString().slice(0, 10),
        reach: `${reach.toFixed(1)} AU`,
      }),
      destroy() {
        scroll?.destroy();
        lineSpots.destroy();
        bodySpots.destroy();
        tail.destroy();
      },
    };
  },
});
