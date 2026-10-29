import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'solar-surface',
  title: 'Solar surface',
  epic: '6',
  tier: 'B',
  tags: ['sun', 'granulation', 'sunspots', 'blackbody'],
  summary:
    'The Sun in white light: granulation as convection cells that rise and fade, sunspots with dark umbrae and filamentary penumbrae, faculae near the limb, and limb darkening from the physics, every pixel a blackbody at the temperature we see into there. Prominences and the corona beyond the limb, as a coronagraph would show them.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'none',
    pattern: 'none',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still of the disc.',
    useCases: ['A hero for a solar, energy or science page', 'A warm, slowly churning backdrop'],
  },
};
