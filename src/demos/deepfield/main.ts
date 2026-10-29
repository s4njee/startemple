// The "Galaxy Brain" page (deepfield.html): deep-field fixed behind a whole page in the Hubble
// palette, the way a site would use it. Ordinary page code: mount the effect, turn the nebula's
// colours round the wheel and the page's accent with them, pass the pointer on for the parallax,
// and wire up the toolbar.

import { oklchToLinear, linearToOklch, type Vec3 } from '../../gpu/colour/oklab.ts';
import { createGpuSession } from '../../gpu/device.ts';
import { mountEffect } from '../../shell/host.ts';
import { forwardPointer, reserveToolbar } from '../backdrop/page.ts';
// The shared backdrop page's layout and plates, in this page's colours (deepfield.css imports it).
import './deepfield.css';

const EFFECT = 'deep-field';

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`deep field page: #${id} is missing`);
  return node as T;
}

if (import.meta.env.DEV) {
  const { installShaderOverlay } = await import('../../gpu/shader-overlay.ts');
  installShaderOverlay();
}

const stage = byId('stage');
const status = byId('status');
const paletteName = byId('palette-name');
const pauseButton = byId<HTMLButtonElement>('pause');
const morphSlider = byId<HTMLInputElement>('morph');
const cycleSlider = byId<HTMLInputElement>('cycle');
const cycleValue = byId<HTMLOutputElement>('cycle-value');
const starsSlider = byId<HTMLInputElement>('stars');
const glowSlider = byId<HTMLInputElement>('glow');
const twinkleSlider = byId<HTMLInputElement>('twinkle');

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The colours the accent takes as the nebula turns: the palette's gold (sulphur over hydrogen)
 * and its blue (oxygen), linear, turned by the same OKLCH hue angle the effect gives the gas.
 */
const GOLD: Vec3 = [0.95, 0.52, 0.1];
const BLUE: Vec3 = [0.12, 0.38, 0.95];

const settings: Record<string, unknown> = {
  palette: 'hubble',
  morph: Number(morphSlider.value),
  nebula: Number(glowSlider.value),
  dose: Number(starsSlider.value),
  twinkle: Number(twinkleSlider.value),
  // Three times the effect's own pointer parallax: the near stars swing well across the view.
  parallax: 3,
  // Colours turned up past the photographs' for a page that wants to be vivid.
  vivid: 1.9,
  // The page turns the hue itself (below), so it knows the colour for the accent.
  hueSpeed: 0,
  hue: 0,
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
    : `The nebula is ${playing ? 'drifting' : 'still'}`;
  pauseButton.textContent = playing ? 'Pause' : 'Play';
  if (!ok) pauseButton.disabled = true;
}

/** A linear colour as a CSS colour, turned by `degrees` of OKLCH hue and lifted to read as text. */
function accent(colour: Vec3, degrees: number, lightness: number): string {
  const [, c, h] = linearToOklch(colour);
  const rgb = oklchToLinear([lightness, Math.min(c * 1.4, 0.24), h + (degrees * Math.PI) / 180]);
  const srgb = rgb.map((v) => {
    const x = Math.min(1, Math.max(0, v));
    return Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055));
  });
  return `rgb(${srgb.join(' ')})`;
}

function showHue(degrees: number) {
  const root = document.documentElement.style;
  root.setProperty('--hue', accent(GOLD, degrees, 0.8));
  root.setProperty('--hue-2', accent(BLUE, degrees, 0.72));
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
showHue(0);
render();

reserveToolbar(document.querySelector<HTMLElement>('.toolbar')!);
// The canvas lies behind the page; the parallax follows the pointer passed on to it.
forwardPointer(host);

// --- The colour cycle ------------------------------------------------------------------------------
// While the nebula plays, the page turns its hue at the toolbar's rate, in OKLCH, so lightness holds
// and only the colour moves. 12° a second is a full turn every half minute, well under The Hero's
// Journey's whole-field cap of half a turn a second. The angle is kept here, not in a slider.

let hue = 0;
let last = performance.now();
function cycle(now: number) {
  const delta = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (playing && !document.hidden) {
    hue = ((hue + delta * Number(cycleSlider.value) + 180) % 360) - 180;
    set('hue', hue);
    showHue(hue);
  }
  requestAnimationFrame(cycle);
}
requestAnimationFrame(cycle);

// --- The toolbar -----------------------------------------------------------------------------------

pauseButton.addEventListener('click', () => {
  playing = !playing;
  if (playing) host.resume();
  else host.pause();
  render();
});

morphSlider.addEventListener('input', () => {
  set('morph', Number(morphSlider.value));
  paletteName.textContent =
    Number(morphSlider.value) > 0 ? 'Hubble palette' : 'Hubble palette, still';
});

cycleSlider.addEventListener('input', () => {
  cycleValue.textContent = `${cycleSlider.value}°/s`;
});

starsSlider.addEventListener('input', () => set('dose', Number(starsSlider.value)));
glowSlider.addEventListener('input', () => set('nebula', Number(glowSlider.value)));
twinkleSlider.addEventListener('input', () => set('twinkle', Number(twinkleSlider.value)));

addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  host.destroy();
  session.destroy();
});
