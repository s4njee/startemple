import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'real-sky',
  title: 'Real sky',
  epic: '2',
  tier: 'A',
  tags: ['stars', 'catalogue', 'night sky', 'scintillation'],
  summary:
    "The sky above you tonight: the 9 096 stars of the Yale Bright Star Catalogue where they are for your time zone's city at this moment, with the planets among them, turning in a gentle time-lapse over a dark skyline. Each star's altitude comes from the sidereal time and your latitude on the GPU; low stars are dimmed by the air and twinkle harder and faster, and bright ones flash colours, as they do near the horizon.",
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    pattern: 'none',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still of tonight’s sky, drawn once on the server or as a poster.',
    useCases: [
      '"The sky above you tonight" on an astronomy or travel page',
      'A night-sky hero that is true to the visitor’s place',
    ],
  },
};
