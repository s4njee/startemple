import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'eclipse',
  title: 'Total eclipse',
  epic: '6',
  tier: 'A',
  tags: ['sun', 'moon', 'eclipse', 'corona', 'countdown'],
  summary:
    "A total solar eclipse as a countdown: the Moon slides over the Sun, the last of the photosphere breaks into Baily's beads through the valleys on the Moon's limb, the diamond ring flares, and the corona, a millionth of the disc's brightness, comes out with the pink chromosphere and prominences as the eye's exposure follows the light.",
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    pattern: 'none',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still of totality.',
    useCases: ['A launch countdown to a date', 'A hero for an eclipse or astronomy page'],
  },
};
