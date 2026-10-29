import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'orbits',
  title: 'Orbits',
  epic: '4',
  tier: 'A',
  tags: ['solar system', 'planets', 'scroll', 'data'],
  summary:
    "The solar system today, from JPL's published orbital elements: every planet where it is on this date, moving at a few days a second along its orbit. Distances on a logarithmic scale, so Mercury and Neptune both fit, and scrolling the page zooms in on the inner planets.",
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    pattern: 'none',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still of the planets today.',
    useCases: ['An astronomy or education page', 'A "where are the planets now" widget'],
  },
};
