import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'galaxy-collision',
  title: 'Galaxy collision',
  epic: '3',
  tier: 'A',
  tags: ['galaxy', 'gravity', 'compute', 'showpiece'],
  summary:
    "Two disc galaxies passing each other on a parabolic orbit, as Toomre and Toomre showed in 1972: each a massive core with 12 000 stars round it, which feel both cores' gravity, so the close pass throws out long tidal tails and a bridge between them. Integrated in compute, sub-step by sub-step, over a minute's passage; then it begins again.",
  scorecard: {
    compute: true,
    mobile: 'untested',
    flash: 'low',
    pattern: 'none',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still of the tails at their longest.',
    useCases: ['A science showpiece', 'A "merging" or "two worlds" hero'],
  },
};
