import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'star-splat',
  title: 'Star splat',
  epic: '2',
  tier: 'A',
  tags: ['stars', 'building block', 'blackbody'],
  summary:
    "The family's building block, laid out: stars as points with a temperature and a magnitude. A row from 2 400 K to 40 000 K, coloured by Planck's law; a row of magnitudes 0 to 6, a hundred times dimmer at the end; diffraction spikes as a Hubble or a JWST image draws them; over a drifting field drawn from the sky's own statistics. Every star is a Gaussian integrated over each pixel, so it keeps its light and its look wherever it sits.",
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    pattern: 'none',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still of the rows and the field.',
    useCases: ['A reference for star colour and brightness', 'The spot every space effect draws'],
  },
};
