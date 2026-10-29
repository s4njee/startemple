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
  ],
};
