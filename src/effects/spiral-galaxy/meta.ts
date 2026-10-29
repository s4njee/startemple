import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'spiral-galaxy',
  title: 'Spiral galaxy',
  epic: '3',
  tier: 'B',
  tags: ['galaxy', 'density wave', 'stars', 'hero'],
  summary:
    'A spiral galaxy by the density wave: every star on an ellipse whose orientation turns with its size, so the ellipses crowd into two arms that keep their shape while every star moves through them. A golden bulge, blue young stars and pink H II regions along the arms, dust lanes just inside them, and a dozen tracer stars to watch the stars outrun the arms.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    pattern: 'none',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still of the galaxy.',
    useCases: ['A science or space hero', 'A "data as a galaxy" starting point'],
  },
};
