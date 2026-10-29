import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'star-trails',
  title: 'Star trails',
  epic: '2',
  tier: 'A',
  tags: ['stars', 'long exposure', 'hero'],
  summary:
    'A long exposure facing the celestial pole: every star sweeps an arc of 15° an hour round it, coloured by its temperature, over a dark skyline. The exposure grows over forty seconds to an hour and three quarters of sky, holds, and starts again. Drawn in closed form, each arc at its current length, so nothing accumulates and nothing is lost on a resize.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    pattern: 'low',
    // Concentric arcs longer than about 28° read as a regular pattern (notes, Safety).
    patternPresets: ['all night'],
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still of the full exposure.',
    useCases: ['A slow, calm night hero', 'An astronomy or photography page'],
  },
};
