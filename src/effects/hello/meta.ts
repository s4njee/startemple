import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'hello',
  title: 'Hello',
  epic: '1',
  tier: 'A',
  tags: ['scaffold', 'stars'],
  summary:
    'The smallest effect: a few hundred stars drifting slowly across a dark field, one instanced draw through the HDR tail. Each star is a naive fixed disc, the baseline the energy-conserving star spot is measured against. Every later effect starts from this shape.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    pattern: 'none',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still of the stars, or box-shadow stars in CSS.',
    useCases: ['The template for new effects'],
  },
};
