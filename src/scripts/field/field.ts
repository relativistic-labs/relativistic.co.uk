/**
 * The background field, page side. The field is a button: clicking or tapping it (or Enter or Space
 * on it) pauses and plays the animation, which meets WCAG 2.2.2 without any visible control. This
 * side decides when the field runs and tells the renderer (core.ts) the size and theme; the renderer
 * runs in a worker on an OffscreenCanvas where possible.
 *
 * Never competes with the page: idle start, stops off-screen and in hidden tabs, sheds particles if
 * frames are slow, and shows one still frame (the document) for reduced motion.
 */
import type { Colour, FromField, Mode, ToField } from './core';

const STORAGE_KEY = 'relativistic-motion';
const LABEL = { playing: 'Pause background animation', paused: 'Play background animation' };
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
const darkQuery = matchMedia('(prefers-color-scheme: dark)');

/** Resolve a theme colour (oklch, light-dark()) to sRGB through a 1×1 canvas. */
function theme(root: HTMLElement): ToField {
  const probe = document.createElement('span');
  probe.hidden = true;
  root.append(probe);
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
  const read = (name: string): Colour => {
    probe.style.color = `var(${name})`;
    ctx.fillStyle = getComputedStyle(probe).color;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
    return [r / 255, g / 255, b / 255];
  };
  const message: ToField = {
    type: 'theme',
    particle: read('--field-particle'),
    accent: read('--field-glow'),
    signal: read('--field-signal'),
    glow: darkQuery.matches,
  };
  probe.remove();
  return message;
}

export async function startField(root: HTMLButtonElement): Promise<void> {
  const canvas = root.querySelector('canvas');
  const off = () => {
    root.disabled = true;
    root.classList.add('is-off');
  };
  if (!canvas || !('WebGL2RenderingContext' in window)) return off(); // no WebGL2: no field, nothing else lost

  let visible = true;
  let slow = false;
  let mode: Mode | null = null;
  let paused = false;
  try {
    paused = localStorage.getItem(STORAGE_KEY) === 'paused';
  } catch {
    // storage blocked: motion plays, and pausing still works for this visit
  }

  const receive = (m: FromField) => {
    if (m.type === 'drawn') root.classList.add('is-drawn');
    else if (m.type === 'slow') (slow = true), update();
    else if (m.type === 'failed') off();
  };

  let send: (m: ToField) => void;
  if ('transferControlToOffscreen' in canvas) {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'field' });
    const offscreen = canvas.transferControlToOffscreen();
    worker.postMessage({ canvas: offscreen, mono: root.dataset['mono'] }, [offscreen]);
    worker.onmessage = (e: MessageEvent<FromField>) => receive(e.data);
    send = (m) => worker.postMessage(m);
  } else {
    const { createField } = await import('./core');
    const handle = createField(canvas, root.dataset['mono'], receive);
    if (!handle) return off();
    send = handle;
  }

  /** Decide whether the field runs, from every input that can stop it. */
  function update() {
    const still = motionQuery.matches || slow;
    // Reduced motion: a still frame, so there's nothing to pause.
    root.disabled = still;
    root.setAttribute('aria-pressed', String(paused || still));
    root.setAttribute('aria-label', paused || still ? LABEL.paused : LABEL.playing);
    const next: Mode = still ? 'still' : visible && !document.hidden && !paused ? 'run' : 'pause';
    if (next === mode) return;
    mode = next;
    root.dataset['running'] = String(next === 'run');
    send({ type: 'mode', mode: next });
  }

  new ResizeObserver(([entry]) => {
    const box = entry?.contentRect;
    if (box) send({ type: 'size', width: Math.max(1, box.width), height: Math.max(1, box.height), dpr: Math.min(devicePixelRatio || 1, 2) });
  }).observe(canvas);
  new IntersectionObserver(([entry]) => {
    visible = !!entry?.isIntersecting;
    update();
  }).observe(canvas);
  send(theme(root));
  darkQuery.addEventListener('change', () => send(theme(root)));
  document.addEventListener('visibilitychange', update);
  motionQuery.addEventListener('change', update);

  // The choice is stored only once someone makes it.
  root.addEventListener('click', () => {
    paused = !paused;
    try {
      localStorage.setItem(STORAGE_KEY, paused ? 'paused' : 'playing');
    } catch {
      // storage blocked: the choice lasts for this visit
    }
    update();
  });
  update();
}
