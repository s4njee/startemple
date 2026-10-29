// Story 2.7: a drifting starfield five ways (experiments/star-compare.html), by star count, in
// headless Chrome at 1280 x 720: frame rate, main-thread time (Chrome's Performance metrics) and
// the compositor and GPU process from a trace, since compositor-animated elements and WebGPU are
// both drawn there. After Snow Temple's experiments/snow-compare.mjs. Writes
// docs/studies/star-compare.md.
//
//   node experiments/star-compare.mjs [--base http://localhost:5500] [--seconds 5]
//
// Start the dev server first, and leave the GPU otherwise idle.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../scripts/chrome.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const base = option('--base', 'http://localhost:5500').replace(/\/$/, '');
const SECONDS = Number(option('--seconds', 5));

/** Union of top-level task time per thread group, in ms over the whole trace. */
function busyTime(events) {
  const names = new Map();
  for (const e of events) {
    if (e.ph === 'M' && e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args.name);
  }
  const groups = {
    compositor: (name) => name === 'Compositor',
    gpu: (name) => name === 'CrGpuMain' || name === 'VizCompositorThread',
  };
  const intervals = new Map();
  for (const e of events) {
    if (e.ph !== 'X' || !String(e.cat).includes('toplevel') || !e.dur) continue;
    const key = `${e.pid}:${e.tid}`;
    if (!intervals.has(key)) intervals.set(key, []);
    intervals.get(key).push([e.ts, e.ts + e.dur]);
  }
  const totals = { compositor: 0, gpu: 0 };
  for (const [key, list] of intervals) {
    const group = Object.keys(groups).find((g) => groups[g](names.get(key) ?? ''));
    if (!group) continue;
    list.sort((a, b) => a[0] - b[0]);
    let busy = 0;
    let [start, end] = list[0];
    for (const [s, e] of list.slice(1)) {
      if (s > end) {
        busy += end - start;
        [start, end] = [s, e];
      } else end = Math.max(end, e);
    }
    busy += end - start;
    totals[group] += busy / 1000;
  }
  return totals;
}

async function measure(chrome, test) {
  chrome.errors.length = 0;
  await chrome.page('Page.navigate', {
    url: `${base}/experiments/star-compare.html?${test.query}`,
  });
  for (let i = 0; i < 100 && !(await chrome.evaluate('window.__ready === true')); i++)
    await sleep(100);
  await sleep(2500);
  await chrome.evaluate(`(() => {
    window.__frames = 0;
    const tick = () => { window.__frames++; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  })()`);
  const metric = async () =>
    Object.fromEntries(
      (await chrome.page('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]),
    );
  const events = [];
  const done = new Promise((resolve) => {
    const off = chrome.on((message) => {
      if (message.method === 'Tracing.dataCollected') events.push(...message.params.value);
      if (message.method === 'Tracing.tracingComplete') {
        off();
        resolve();
      }
    });
  });
  await chrome.browser('Tracing.start', { categories: 'toplevel', transferMode: 'ReportEvents' });
  const before = await metric();
  await sleep(SECONDS * 1000);
  const after = await metric();
  const frames = await chrome.evaluate('window.__frames');
  await chrome.browser('Tracing.end');
  await done;
  const busy = busyTime(events);
  const perSecond = (key) => (1000 * ((after[key] ?? 0) - (before[key] ?? 0))) / SECONDS;
  return {
    ...test,
    fps: frames / SECONDS,
    main: perSecond('TaskDuration'),
    style: perSecond('RecalcStyleDuration'),
    compositor: busy.compositor / SECONDS,
    gpu: busy.gpu / SECONDS,
    errors: chrome.errors.length,
  };
}

// deep-field shows dosed(dose, 0, 0.6, 1) of its 6000 stars.
const shown = (dose) =>
  Math.round((dose <= 0.35 ? (0.6 * dose) / 0.35 : 0.6 + (0.4 * (dose - 0.35)) / 0.65) * 6000);
const tests = [{ method: 'none', query: 'method=none', n: 0 }];
for (const n of [100, 400, 1600, 6400]) {
  tests.push({ method: 'css', query: `method=css&n=${n}`, n });
  tests.push({ method: 'dom', query: `method=dom&n=${n}`, n });
  tests.push({ method: 'canvas', query: `method=canvas&n=${n}`, n });
}
for (const n of [400, 1600, 6400, 25600])
  tests.push({ method: 'shadow', query: `method=shadow&n=${n}`, n });
for (const dose of [0.1, 0.35, 0.7, 1]) {
  tests.push({ method: 'webgpu', query: `method=webgpu&dose=${dose}`, n: shown(dose) });
}

const chrome = await launchChrome();
const rows = [];
try {
  await chrome.page('Performance.enable', { timeDomain: 'timeTicks' });
  await chrome.page('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  for (const test of tests) {
    const row = await measure(chrome, test);
    rows.push(row);
    console.log(
      `${row.method.padEnd(7)} ${String(row.n).padStart(5)}: ${row.fps.toFixed(1)} fps, main ${row.main.toFixed(1)} ms/s (style ${row.style.toFixed(1)}), compositor ${row.compositor.toFixed(1)} ms/s, GPU process ${row.gpu.toFixed(1)} ms/s${row.errors ? `, ${row.errors} errors` : ''}`,
    );
  }
} finally {
  chrome.close();
}

const name = {
  none: 'nothing (the page alone)',
  css: 'CSS keyframes, an element a star',
  dom: 'elements moved from script',
  canvas: '2D canvas, arc() a star',
  shadow: 'box-shadow, three layers',
  webgpu: 'WebGPU `deep-field`, stars only',
};
const table = rows
  .map(
    (r) =>
      `| ${name[r.method]} | ${r.n} | ${r.fps.toFixed(0)} | ${r.main.toFixed(1)} | ${r.style.toFixed(1)} | ${r.compositor.toFixed(1)} | ${r.gpu.toFixed(1)} |`,
  )
  .join('\n');
// The hand-written findings (docs/studies/star-compare.findings.md) follow the measured table.
const findingsFile = 'docs/studies/star-compare.findings.md';
const findings = existsSync(findingsFile) ? `\n${readFileSync(findingsFile, 'utf8')}` : '';
writeFileSync(
  'docs/studies/star-compare.md',
  `# A starfield five ways (story 2.7)

Measured ${new Date().toISOString().slice(0, 10)} by \`node experiments/star-compare.mjs\`, in headless Chrome at 1280 × 720 on this machine (an Apple M1 Max), ${SECONDS} s per row after 2.5 s to settle. Main thread and style come from Chrome's Performance metrics; compositor and GPU process are the busy time of those threads in a trace. All in milliseconds of work per second of wall time: 1000 would be a thread that is never idle.

| Method | Stars | fps | Main thread (ms/s) | of which style | Compositor (ms/s) | GPU process (ms/s) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${table}

WebGPU's star count is how many \`deep-field\` shows at doses 0.1, 0.35, 0.7 and 1, with its nebula off.
${findings}`,
);
console.log('wrote docs/studies/star-compare.md');
