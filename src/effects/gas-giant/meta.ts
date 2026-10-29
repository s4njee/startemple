import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'gas-giant',
  title: 'Gas giant',
  epic: '5',
  tier: 'B',
  tags: ['planet', 'jupiter', 'saturn', 'rings', 'flow'],
  summary:
    "Jupiter, Saturn or Neptune: belts and zones between alternating jets, their clouds carried along by the winds so they shear into streaks and curls, storms like the Great Red Spot that persist and drift with their bands, limb darkening, and Saturn's rings from their real optical depths, with the planet's shadow across them and theirs across it.",
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'none',
    pattern: 'low',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still of the planet.',
    useCases: ['A hero for a science or space page', 'A slow, living backdrop behind a title'],
  },
};
