/**
 * The particle field, page side. Decides when the field runs, and tells the renderer (core.ts)
 * the size, theme and pointer. The renderer runs in a worker on an OffscreenCanvas where possible.
 *
 * Never competes with the page: idle start, stops off-screen and in hidden tabs, sheds particles
 * if frames are slow, and shows one still frame of GRANTED for reduced motion.
 */
import type { Colour, FromField, Mode, ToField } from './core';

const SCENES = [
  ['001', 'Unbound'],
  ['002', 'Granted'],
  ['003', 'Shared'],
  ['004', 'Running'],
] as const;
const STORAGE_KEY = 'relativistic-motion';
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

export async function startField(root: HTMLElement): Promise<void> {
  const canvas = root.querySelector('canvas');
  const sceneNumber = root.querySelector('[data-scene-number]');
  const sceneName = root.querySelector('[data-scene-name]');
  const pause = root.querySelector<HTMLButtonElement>('[data-pause]');
  if (!canvas || !('WebGL2RenderingContext' in window)) return; // no WebGL2: no field, nothing else lost

  let visible = true;
  let slow = false;
  let mode: Mode | null = null;
  let paused = false;
  try {
    paused = localStorage.getItem(STORAGE_KEY) === 'paused';
  } catch {
    // storage blocked: motion plays, and the control still works for this visit
  }

  const receive = (m: FromField) => {
    if (m.type === 'scene') {
      const [n, name] = SCENES[m.scene]!;
      if (sceneNumber) sceneNumber.textContent = n;
      if (sceneName) sceneName.textContent = name;
    } else if (m.type === 'drawn') root.classList.add('is-drawn');
    else if (m.type === 'slow') (slow = true), update();
  };

  let send: (m: ToField) => void;
  if ('transferControlToOffscreen' in canvas) {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'field' });
    const offscreen = canvas.transferControlToOffscreen();
    worker.postMessage({ canvas: offscreen }, [offscreen]);
    worker.onmessage = (e: MessageEvent<FromField>) => receive(e.data);
    send = (m) => worker.postMessage(m);
  } else {
    const { createField } = await import('./core');
    const handle = createField(canvas, receive);
    if (!handle) return;
    send = handle;
  }

  /** Decide whether the field runs, from every input that can stop it. */
  function update() {
    if (pause) pause.hidden = motionQuery.matches;
    const next: Mode = motionQuery.matches || slow ? 'still' : visible && !document.hidden && !paused ? 'run' : 'pause';
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
  window.addEventListener(
    'pointermove',
    (e: PointerEvent) => {
      if (mode !== 'run') return;
      const r = canvas.getBoundingClientRect();
      send({ type: 'pointer', x: e.clientX - r.left, y: e.clientY - r.top });
    },
    { passive: true },
  );
  document.addEventListener('pointerleave', () => send({ type: 'pointer', x: -1e4, y: -1e4 }));

  // WCAG 2.2.2: a visible control. The choice is stored only once someone presses it.
  if (pause) {
    pause.setAttribute('aria-pressed', String(paused));
    pause.addEventListener('click', () => {
      paused = !paused;
      pause.setAttribute('aria-pressed', String(paused));
      try {
        localStorage.setItem(STORAGE_KEY, paused ? 'paused' : 'playing');
      } catch {
        // storage blocked: the choice lasts for this visit
      }
      update();
    });
  }
  update();
}
