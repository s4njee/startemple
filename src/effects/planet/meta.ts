import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'planet',
  title: 'Planet',
  epic: '5',
  tier: 'B',
  tags: ['planet', 'atmosphere', 'scattering', 'scroll'],
  summary:
    'An Earthlike world from orbit, every pixel a ray: continents and mountains on a cube map with no seams, oceans that catch the sun, clouds with their shadows on the ground, city lights past the terminator, and blue air scattered at the limb and reddened at dusk. Scrolling the page turns it from day to night.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'none',
    pattern: 'none',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still of the planet half lit.',
    useCases: [
      'A hero for a space, climate or geography page that turns from day to night on scroll',
      'A sky at sunset, from the same atmosphere, behind a landing page',
    ],
  },
};
