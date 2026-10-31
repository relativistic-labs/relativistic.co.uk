/**
 * The background field's renderer, in WebGL2: a murmuration (flock.ts) drawn as one instanced draw
 * call a frame, from one buffer upload.
 *
 * It runs in a worker on an OffscreenCanvas where the browser allows, so neither the simulation nor
 * any GL work lands on the page's main thread; otherwise it runs on the main thread in short steps.
 * The page (field.ts) decides when it runs and tells it the size and theme.
 */
import vert from './birds.vert.glsl';
import frag from './birds.frag.glsl';
import { createFlock, DISTANCE, PITCH, type Flock, type FlockParams } from './flock';

export type Colour = [number, number, number];
export type Mode = 'run' | 'pause' | 'still';
export type ToField =
  | { type: 'size'; width: number; height: number; dpr: number }
  | { type: 'theme'; particle: Colour; accent: Colour; glow: boolean }
  | { type: 'mode'; mode: Mode }
  | { type: 'params'; params: Partial<FlockParams> };
export type FromField = { type: 'drawn' } | { type: 'slow' } | { type: 'failed' };

const ALPHA = 0.4; // quiet: dense folds and pictures darken, single birds barely show
const STILL = 0.52; // the reduced-motion still is drawn darker, so it reads as intended
const WARM = 150; // steps of 1/20 s the flock flies before its first frame (the still): long enough to fold

const frameLater: (cb: (now: number) => void) => unknown =
  typeof requestAnimationFrame === 'function'
    ? (cb) => requestAnimationFrame(cb)
    : (cb) => setTimeout(() => cb(performance.now()), 16);
const cancelFrame = (id: unknown) =>
  typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id as number) : clearTimeout(id as number);
const pause = () => new Promise((r) => setTimeout(r));

export function createField(canvas: HTMLCanvasElement | OffscreenCanvas, demo: boolean, emit: (m: FromField) => void) {
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    powerPreference: 'low-power',
  }) as WebGL2RenderingContext | null;
  if (!gl) return null;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let raf: unknown = 0;
  let last = 0;
  let running = false;
  let ready = false;
  let drawn = false;
  let starting = false;
  let mode: Mode = 'pause';
  let slow = 0; // 0: fine; 1: birds halved; 2: birds halved and the last second was slow
  let windowStart = 0;
  let windowFrames = 0;
  let colours: Record<'particle' | 'accent', Colour> | null = null;
  let glow = false;
  let flock: Flock | null = null;
  let params: Partial<FlockParams> = {};
  let still: Float32Array | null = null;
  let gpu: { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> } | null = null;
  let parallel: KHR_parallel_shader_compile | null = null;

  function setup() {
    const p = gl!.createProgram()!;
    for (const [type, source] of [
      [gl!.VERTEX_SHADER, vert],
      [gl!.FRAGMENT_SHADER, frag],
    ] as const) {
      const shader = gl!.createShader(type)!;
      gl!.shaderSource(shader, source);
      gl!.compileShader(shader);
      gl!.attachShader(p, shader);
    }
    gl!.linkProgram(p);
    return { p, u: {} };
  }

  /** True once the program has linked. Polled where shaders compile in parallel. */
  function linked(): boolean {
    if (!gpu) return false;
    if (parallel && !gl!.getProgramParameter(gpu.p, parallel.COMPLETION_STATUS_KHR)) return false;
    if (!gl!.getProgramParameter(gpu.p, gl!.LINK_STATUS)) {
      gpu = null;
      emit({ type: 'failed' });
      return false;
    }
    for (const n of 'uCam uSize uDpr uAlpha uGlow uInk uAccent'.split(' ')) gpu.u[n] = gl!.getUniformLocation(gpu.p, n);
    return true;
  }

  /** One buffer and its layout: eight floats a bird, read as two attributes, one bird an instance. */
  function buffers(max: number) {
    gl!.bindVertexArray(gl!.createVertexArray());
    gl!.bindBuffer(gl!.ARRAY_BUFFER, gl!.createBuffer());
    gl!.bufferData(gl!.ARRAY_BUFFER, max * 32, gl!.DYNAMIC_DRAW);
    for (const i of [0, 1]) {
      gl!.enableVertexAttribArray(i);
      gl!.vertexAttribPointer(i, 4, gl!.FLOAT, false, 32, i * 16);
      gl!.vertexAttribDivisor(i, 1);
    }
  }

  function draw(isStill: boolean) {
    if (!gpu || !ready || !colours || !width || !flock) return;
    const n = flock.n;
    const u = gpu.u;
    gl!.viewport(0, 0, canvas.width, canvas.height);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    gl!.enable(gl!.BLEND);
    gl!.blendFunc(gl!.ONE, gl!.ONE_MINUS_SRC_ALPHA);
    gl!.useProgram(gpu.p);
    gl!.bufferSubData(gl!.ARRAY_BUFFER, 0, isStill ? still! : flock.S, 0, n * 8);
    gl!.uniform4f(u['uCam']!, Math.cos(PITCH), Math.sin(PITCH), DISTANCE, height / 2 / flock.halfH);
    gl!.uniform2f(u['uSize']!, width, height);
    gl!.uniform1f(u['uDpr']!, dpr);
    gl!.uniform1f(u['uAlpha']!, isStill ? STILL : ALPHA);
    gl!.uniform1f(u['uGlow']!, glow ? 1 : 0);
    gl!.uniform3fv(u['uInk']!, colours.particle);
    gl!.uniform3fv(u['uAccent']!, colours.accent);
    gl!.drawArraysInstanced(gl!.TRIANGLE_STRIP, 0, 4, n);
    if (!drawn) emit({ type: 'drawn' }), (drawn = true);
  }

  function frame(now: number) {
    raf = 0;
    if (!running || !flock) return;
    flock.step(last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60);
    last = now;
    draw(false);
    // If frames average over 20 ms across a second, halve the birds; still slow the next second, a
    // still frame. Later, only two slow seconds in a row stop it, so a passing hiccup doesn't.
    if (!windowStart) windowStart = now;
    windowFrames++;
    // (Not for recordings, where a GPU-less machine's screen recorder is what makes frames slow.)
    if (!demo && now - windowStart >= 1000) {
      const average = (now - windowStart) / windowFrames;
      windowStart = now;
      windowFrames = 0;
      if (average <= 20) slow = slow && 1;
      else if (slow === 2) {
        emit({ type: 'slow' });
        return apply('still');
      } else {
        if (!slow) flock.shed();
        slow = 2;
      }
    }
    raf = frameLater(frame);
  }

  function apply(next: Mode) {
    mode = next;
    if (!ready) return;
    const run = mode === 'run';
    if (run !== running) {
      running = run;
      if (run) {
        last = windowStart = windowFrames = 0;
        raf = frameLater(frame);
      } else if (raf) {
        cancelFrame(raf);
        raf = 0;
      }
    }
    if (!run) draw(mode === 'still');
  }

  /**
   * Start-up in short steps, so no single step is a long task where this runs on the main thread:
   * link the program, then let the flock fly for a few seconds, so the first frame (and the still)
   * is already a murmuration with folds rather than a cloud of birds that haven't met.
   */
  async function init() {
    if (starting) return;
    starting = true;
    await pause(); // creating the context was one task; the program is another
    parallel = gl!.getExtension('KHR_parallel_shader_compile');
    gpu = setup();
    while (!linked()) {
      if (!gpu) return;
      await new Promise(frameLater);
    }
    await pause();
    while (!width) await new Promise(frameLater);
    if (!flock) {
      // About 3,200 birds beside the headline on a desktop and 1,500 in the band on a phone.
      flock = createFlock(Math.round(Math.min(3600, Math.max(900, (width * height) / 40))), demo, params);
      // Warm up in a square roost whatever the canvas, so the flock folds the same way on a phone.
      flock.aspect(1);
      flock.reset();
      for (let s = 1; s <= WARM; s++) {
        flock.step(1 / 20);
        if (!(s % 3)) await pause();
      }
      flock.aspect(width / height);
      flock.show();
      still = flock.S.slice();
    }
    buffers(flock.S.length / 8);
    starting = false;
    ready = true;
    apply(mode);
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    if (raf) cancelFrame(raf);
    raf = 0;
    running = ready = false;
    gpu = null;
  });
  canvas.addEventListener('webglcontextrestored', () => void init());
  void init();

  return function handle(m: ToField) {
    switch (m.type) {
      case 'size':
        width = m.width;
        height = m.height;
        dpr = m.dpr;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        flock?.aspect(width / height);
        if (!running) draw(mode === 'still');
        break;
      case 'theme':
        colours = { particle: m.particle, accent: m.accent };
        glow = m.glow;
        if (!running) draw(mode === 'still');
        break;
      case 'mode':
        apply(m.mode);
        break;
      case 'params':
        params = { ...params, ...m.params };
        flock?.tune(m.params);
        break;
    }
  };
}
