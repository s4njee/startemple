import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'deep-field',
  title: 'Deep field',
  epic: '2',
  tier: 'A',
  tags: ['stars', 'nebula', 'parallax', 'hero'],
  summary:
    "A starfield that never shimmers, over a flat nebula: four depth layers of stars from the sky's own magnitudes and colours, drifting slowly and shifting with the pointer and the page's scroll, in front of hydrogen-red and oxygen-teal gas crossed by dust lanes. Every star keeps its light wherever it sits between pixels; the nebula is drawn once and only moved.",
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    pattern: 'none',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still of the field, or box-shadow stars in CSS over a gradient.',
    useCases: ['A space hero behind a headline', 'A launch or science page background'],
  },
};
