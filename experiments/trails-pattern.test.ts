import { it, vi } from 'vitest';
import { analysePattern, luminanceOf } from '../src/gpu/safety/pattern.ts';
import { mountHeadless } from '../tests/headless.ts';

vi.setConfig({ testTimeout: 1_200_000 });

// Story 2.5: star trails through the pattern analyser as the exposure grows. Concentric arcs are
// stripes; at what exposure, star count and contrast do they read as a regular pattern?
it('trails pattern', async () => {
  const rows: string[] = [];
  for (const [label, params] of [
    ['default (1.75 h)', {}],
    ['2.5 h', { hours: 2.5 }],
    ['dose 0.2', { dose: 0.2 }],
    ['6 h', { hours: 6, grow: 90 }],
    ['6 h dose 0.2', { hours: 6, grow: 90, dose: 0.2 }],
    ['default, wide trails', { sigma: 1.4 }],
  ] as const) {
    const mounted = await mountHeadless('star-trails', { width: 480, height: 270, params });
    const grow = (params as { grow?: number }).grow ?? 40;
    const verdicts: string[] = [];
    // Through the exposure: from a third of the way in (where it starts) to the full length.
    let at = grow / 3;
    for (const share of [0.34, 0.5, 0.75, 1]) {
      mounted.step(Math.round((share * grow - at) * 60));
      at = share * grow;
      const report = analysePattern(luminanceOf(await mounted.read(), 480, 270), 480, 270);
      verdicts.push(`${Math.round(share * 100)}%: ${report.verdict}`);
    }
    mounted.destroy();
    rows.push(`| ${label} | ${verdicts.join(' | ')} |`);
  }
  console.log(rows.join('\n'));
});
