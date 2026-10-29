import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'nebula-volume',
  title: 'Nebula volume',
  epic: '3',
  tier: 'B',
  tags: ['nebula', 'volume', 'ray march', 'emission lines'],
  summary:
    'An emission nebula as a volume, turning slowly: a ray march through 3D noise, its gas glowing in sulphur, hydrogen and oxygen lines brightest near the hot stars inside it, its dust lanes absorbing the glow and the stars behind. Marched at half resolution with jitter averaged over frames, on Fire Temple’s emission-absorption kernel.',
  scorecard: {
    compute: true,
    mobile: 'untested',
    flash: 'low',
    pattern: 'none',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still of the nebula, or the flat nebula.',
    useCases: ['A science showpiece', 'A slow, deep hero background'],
  },
};
