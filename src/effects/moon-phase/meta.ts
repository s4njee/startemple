import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'moon-phase',
  title: 'Moon phase',
  epic: '5',
  tier: 'A',
  tags: ['moon', 'loader', 'progress', 'phase'],
  summary:
    "The Moon as a progress indicator: its phase is the value, mapped so the lit area grows evenly, with a soft terminator a loader can sweep, craters the low sun picks out along it, Moon Temple's maria and Lommel-Seeliger face, and earthshine on the dark side, bluish and strongest in a thin crescent.",
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'none',
    pattern: 'none',
    lightPage: 'underlay',
    features: { required: [] },
    fallback:
      'A half disc and a scaled ellipse in CSS, which draw the exact shape of the light; two offset circles do not.',
    useCases: ['A loader or progress indicator', 'A date widget: tonight’s Moon'],
  },
};
