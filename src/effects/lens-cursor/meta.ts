import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'lens-cursor',
  title: 'Lens cursor',
  epic: '4',
  tier: 'A',
  tags: ['black hole', 'gravitational lens', 'cursor', 'interactive'],
  summary:
    'The pointer as a small black hole: a gravitational lens that bends whatever is behind it into an Einstein ring, with a second, flipped image inside, a black shadow and its faint photon ring. One pass, by the thin-lens equation, over a nebula the effect draws or an image the page hands over.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    pattern: 'none',
    lightPage: 'yes',
    features: { required: [] },
    fallback: 'The picture behind, unlensed.',
    useCases: ['A cursor for a science or space page', 'A hover over a hero image'],
  },
};
