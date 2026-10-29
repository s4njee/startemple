import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'nebula',
  title: 'Nebula',
  epic: '3',
  tier: 'A',
  tags: ['nebula', 'emission lines', 'parallax', 'hero'],
  summary:
    'An emission nebula in three layers, coloured by the lines its gas glows in: hydrogen-alpha red, oxygen teal where the gas is hottest, sulphur at its edges, as the eye sees them or in the Hubble palette. The layers move apart with the pointer and scroll, stars sit between them, and the near layer is dark dust that hides the stars and glow behind it. Each layer is drawn once and only moved.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    pattern: 'none',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still of the nebula.',
    useCases: ['A space hero behind a headline', 'A science or astronomy page background'],
  },
};
