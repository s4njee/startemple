import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'black-hole',
  title: 'Black hole',
  epic: '4',
  tier: 'C',
  tags: ['black hole', 'gravity', 'ray tracing', 'showpiece'],
  summary:
    "A black hole with a glowing accretion disc, every ray traced through Schwarzschild's metric: the disc's far side bent up over the top and under the bottom, the thin photon ring, the shadow. The side of the disc coming towards you is Doppler-brightened and bluer, the inner edge dimmed by gravitational redshift, and the starfield behind is lensed round it, after the hole in Interstellar.",
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    pattern: 'low',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still of the hole, or the thin-lens cursor.',
    useCases: ['A science showpiece', 'A dramatic hero for a launch or a talk'],
  },
};
