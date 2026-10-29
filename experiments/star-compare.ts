// Story 2.7: a drifting starfield five ways, chosen by the query string, for
// experiments/star-compare.mjs.
//
//   ?method=shadow&n=1600   box-shadow stars: three layers, each one element with a shadow per star
//   ?method=css&n=400       CSS keyframes of plain values, one element per star
//   ?method=dom&n=400       elements moved from script every frame
//   ?method=canvas&n=400    a 2D canvas, every star drawn with arc() every frame
//   ?method=webgpu&dose=0.35   deep-field with its nebula off, on a canvas behind the page
//
// Every method draws white stars of 1 to 3 px drifting slowly to the left, nearer ones faster.
// `window.__ready` turns true when the field is running.

import { mount } from '../src/lib/index.ts';
import { effect } from '../src/effects/deep-field/index.ts';

declare global {
  interface Window {
    __ready?: boolean;
  }
}

const query = new URLSearchParams(location.search);
const method = query.get('method') ?? 'shadow';
const n = Number(query.get('n') ?? 400);
const random = (() => {
  let s = 12345;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
})();
/** Seconds to cross the view, for layer 0 (far) to 2 (near). */
const CROSSING = [240, 140, 80];

function layer(className: string) {
  const element = document.createElement('div');
  element.className = `sky ${className}`;
  document.body.prepend(element);
  return element;
}

function shadow() {
  const sky = layer('shadow');
  for (let k = 0; k < 3; k++) {
    const count = Math.round(n * [0.6, 0.3, 0.1][k]!);
    const shadows = Array.from({ length: count }, () => {
      const spread = k;
      return `${(100 * random()).toFixed(2)}vw ${(100 * random()).toFixed(2)}vh 0 ${spread}px rgba(255,255,255,${(0.4 + 0.6 * random()).toFixed(2)})`;
    }).join(',');
    // Two copies, one a screen to the right, so the slide loops without a gap.
    for (const left of ['0', '100vw']) {
      const element = document.createElement('b');
      element.style.left = left;
      element.style.boxShadow = shadows;
      element.style.animationDuration = `${CROSSING[k]}s`;
      sky.append(element);
    }
  }
}

function css() {
  const sky = layer('css');
  for (let i = 0; i < n; i++) {
    const star = document.createElement('i');
    const k = Math.min(2, Math.floor(random() * 3));
    const size = 1 + k;
    const duration = CROSSING[k]!;
    star.style.width = star.style.height = `${size}px`;
    star.style.top = `${100 * random()}vh`;
    star.style.opacity = String(0.4 + 0.6 * random());
    star.style.animationDuration = `${duration}s`;
    star.style.animationDelay = `${-duration * random()}s`;
    sky.append(star);
  }
}

function stars() {
  return Array.from({ length: n }, () => {
    const k = Math.min(2, Math.floor(random() * 3));
    return {
      k,
      x: random() * innerWidth,
      y: random() * innerHeight,
      size: 1 + k,
      light: 0.4 + 0.6 * random(),
      speed: innerWidth / CROSSING[k]!,
    };
  });
}

function dom() {
  const sky = layer('dom');
  const field = stars().map((star) => {
    const element = document.createElement('i');
    element.style.width = element.style.height = `${star.size}px`;
    element.style.opacity = String(star.light);
    sky.append(element);
    return { ...star, element };
  });
  let last = performance.now();
  const tick = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    for (const star of field) {
      star.x -= star.speed * dt;
      if (star.x < -4) star.x += innerWidth + 8;
      star.element.style.transform = `translate3d(${star.x}px, ${star.y}px, 0)`;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function canvas2d() {
  const canvas = document.createElement('canvas');
  canvas.className = 'sky';
  document.body.prepend(canvas);
  const context = canvas.getContext('2d')!;
  const field = stars();
  let last = performance.now();
  const tick = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const dpr = devicePixelRatio;
    if (canvas.width !== innerWidth * dpr) {
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, innerWidth, innerHeight);
    for (const star of field) {
      star.x -= star.speed * dt;
      if (star.x < -4) star.x += innerWidth + 8;
      context.globalAlpha = star.light;
      context.fillStyle = '#fff';
      context.beginPath();
      context.arc(star.x, star.y, star.size / 2, 0, Math.PI * 2);
      context.fill();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

async function webgpu() {
  const canvas = document.createElement('canvas');
  canvas.className = 'sky';
  document.body.prepend(canvas);
  await mount(canvas, effect, {
    initialParams: { dose: Number(query.get('dose') ?? 0.35), nebula: 0 },
  });
}

if (method === 'shadow') shadow();
else if (method === 'css') css();
else if (method === 'dom') dom();
else if (method === 'canvas') canvas2d();
else if (method === 'webgpu') await webgpu();
window.__ready = true;
