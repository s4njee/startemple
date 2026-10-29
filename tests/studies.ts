// Extra configurations for the cost studies, beyond "every effect at its defaults and at each
// preset", which `tests/study.test.ts` runs anyway. Keyed by epic. Use these for sweeps that
// answer a research question (how cost grows with a parameter).

export interface StudyConfig {
  effect: string;
  /** Shown in the report, e.g. "count=220". */
  name: string;
  preset?: string;
  params?: Readonly<Record<string, unknown>>;
  /** What `ctx.gamut` says (story 3.3). Default sRGB. */
  gamut?: 'srgb' | 'p3';
}

const sweep = (
  effect: string,
  key: string,
  values: readonly (string | number)[],
  fixed: Readonly<Record<string, unknown>> = {},
): StudyConfig[] =>
  values.map((value) => ({
    effect,
    name: [...Object.entries(fixed), [key, value]].map(([k, v]) => `${k}=${String(v)}`).join(' '),
    params: { ...fixed, [key]: value },
  }));

export const STUDY_SWEEPS: Readonly<Record<string, readonly StudyConfig[]>> = {
  '1': [
    // 1.2: what the naive stars cost as the intensity, and so the number of stars, rises.
    ...sweep('hello', 'dose', [0.1, 0.35, 0.7, 1]),
  ],
  '2': [
    // 2.2: deep-field's stars as the intensity rises, and the nebula's share of the cost.
    ...sweep('deep-field', 'dose', [0.1, 0.35, 0.7, 1]),
    ...sweep('deep-field', 'nebula', [0]),
    // 2.1: the spot against the point layer's disc, and the halo's cost.
    ...sweep('star-splat', 'spot', ['gaussian', 'disc']),
    ...sweep('star-splat', 'halo', [0, 0.05, 0.2]),
    // 2.5: trails as the star count rises; 2.6: the catalogue down to fainter limits.
    ...sweep('star-trails', 'dose', [0.35, 1]),
    ...sweep('real-sky', 'limit', [4, 6.5, 8]),
  ],
  '3': [
    // 3.4: the volume's march at each resolution and step count.
    ...sweep('nebula-volume', 'resolution', ['full', 'half', 'quarter']),
    ...sweep('nebula-volume', 'steps', [24, 48, 96]),
    // 3.5: the galaxy as its star count rises; 3.6: the collision's stars.
    ...sweep('spiral-galaxy', 'dose', [0.1, 0.35, 1]),
    ...sweep('galaxy-collision', 'dose', [0.35, 1]),
  ],
};
