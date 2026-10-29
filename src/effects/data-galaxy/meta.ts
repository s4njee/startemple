import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'data-galaxy',
  title: 'Data galaxy',
  epic: '3',
  tier: 'A',
  tags: ['galaxy', 'data', 'interactive', 'product'],
  summary:
    "A page's own data drawn as a galaxy: every point a star, every cluster an arm in its own colour, every value a brightness, turning slowly. Point at a star to pick it: it lights up, its cluster brightens round it, and the canvas fires an `sr-pick` event with the point's label and value for the page to show.",
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    pattern: 'none',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still of the galaxy, or the data as a plain chart.',
    useCases: ['A product page: "our community"', 'An embedding or clustering, explored by hover'],
  },
};
