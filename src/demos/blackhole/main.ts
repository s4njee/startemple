// The "Event Horizon" page (blackhole.html): black-hole fixed behind a whole page, rolled 45° so its
// disc runs up to the top right, the hole off to the right of the text. Ordinary page code: mount
// the effect, place the hole for the window's shape, pass the pointer on so it flies the view, show
// where the view is, and wire up the toolbar.

import { createGpuSession } from '../../gpu/device.ts';
import { mountEffect } from '../../shell/host.ts';
import { forwardPointer, reserveToolbar } from '../backdrop/page.ts';
// The shared backdrop page's layout and plates, in this page's colours (blackhole.css imports it).
import './blackhole.css';

const EFFECT = 'black-hole';

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`black hole page: #${id} is missing`);
  return node as T;
}

if (import.meta.env.DEV) {
  const { installShaderOverlay } = await import('../../gpu/shader-overlay.ts');
  installShaderOverlay();
}

const stage = byId('stage');
const status = byId('status');
const viewName = byId('view-name');
const readout = byId('view-readout');
const pauseButton = byId<HTMLButtonElement>('pause');
const temperatureSlider = byId<HTMLInputElement>('temperature');
const temperatureValue = byId<HTMLOutputElement>('temperature-value');
const beamingSlider = byId<HTMLInputElement>('beaming');
const glowSlider = byId<HTMLInputElement>('glow');
const turnSlider = byId<HTMLInputElement>('turn');
const steerBox = byId<HTMLInputElement>('steer');

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const narrow = matchMedia('(max-width: 760px)');

/**
 * Where the hole sits and how far away: up and to the right of the text on a wide window, above it
 * on a narrow one. The view's height is fixed at 34°, so on a tall window the camera stands back
 * to keep the hole inside the width.
 */
const framing = () => {
  const tall = Math.max(1, (1.4 * innerHeight) / innerWidth);
  return narrow.matches
    ? { shiftX: 0, shiftY: 0.18, distance: Math.min(60, 30 * tall) }
    : { shiftX: 0.22, shiftY: 0.1, distance: Math.min(60, 30 * tall) };
};

const settings: Record<string, unknown> = {
  // The disc runs up to the top right.
  roll: 45,
  ...framing(),
  tilt: 8,
  temperature: Number(temperatureSlider.value),
  beaming: Number(beamingSlider.value),
  glow: Number(glowSlider.value),
  turn: Number(turnSlider.value),
  steer: steerBox.checked ? 1 : 0,
  bloom: 0.5,
  exposure: 0.85,
};

const session = await createGpuSession();
let playing = !reducedMotion;

function set(key: string, value: unknown) {
  settings[key] = value;
  const params = host.loaded?.params;
  if (params) params[key] = value as (typeof params)[string];
}

function render() {
  const ok = session.state.ok;
  document.body.dataset.state = !ok ? 'fallback' : playing ? 'live' : 'paused';
  status.textContent = !ok
    ? 'WebGPU is unavailable'
    : `The disc is ${playing ? 'turning' : 'held still'}`;
  pauseButton.textContent = playing ? 'Pause' : 'Play';
  if (!ok) pauseButton.disabled = true;
}

const host = mountEffect(session, stage, EFFECT, {
  initialParams: settings,
  paused: !playing,
  allowHdr: true,
});
host.onLoad(() => {
  pauseButton.disabled = false;
  render();
});
session.onChange(render);
render();

reserveToolbar(document.querySelector<HTMLElement>('.toolbar')!);
// The canvas lies behind the page; the view follows the pointer passed on to it.
forwardPointer(host);

addEventListener('resize', () => {
  for (const [key, value] of Object.entries(framing())) set(key, value);
});

// --- Where the view is ---------------------------------------------------------------------------
// The effect reports the view's angles every frame; the caption and toolbar say them in words,
// updated only when they change.

let shown = '';
host.onStats((stats) => {
  const above = Number(stats.effect?.above ?? 0);
  const round = Number(stats.effect?.round ?? 0);
  const words =
    above === 0
      ? 'EDGE ON TO THE DISC'
      : `${Math.abs(above)}° ${above > 0 ? 'ABOVE' : 'BELOW'} THE DISC`;
  const key = `${words}/${round}`;
  if (key === shown) return;
  shown = key;
  readout.textContent = `02 — ${words}`;
  viewName.textContent = `${Math.abs(round)}° round the hole`;
});

// --- The toolbar -----------------------------------------------------------------------------------

pauseButton.addEventListener('click', () => {
  playing = !playing;
  if (playing) host.resume();
  else host.pause();
  render();
});

temperatureSlider.addEventListener('input', () => {
  set('temperature', Number(temperatureSlider.value));
  temperatureValue.textContent = `${temperatureSlider.value} K`;
});
beamingSlider.addEventListener('input', () => set('beaming', Number(beamingSlider.value)));
glowSlider.addEventListener('input', () => set('glow', Number(glowSlider.value)));
turnSlider.addEventListener('input', () => set('turn', Number(turnSlider.value)));
steerBox.addEventListener('change', () => set('steer', steerBox.checked ? 1 : 0));

addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  host.destroy();
  session.destroy();
});
