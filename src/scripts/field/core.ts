/**
 * The particle field's renderer, in WebGL2. Ported from the canvas reference in brand/field/field.js.
 *
 * It runs in a worker on an OffscreenCanvas where the browser allows, so no GL work (not even the
 * first shader compile) ever lands on the page's main thread; otherwise it runs on the main thread.
 * Each particle's fixed attributes are uploaded once. Each frame sends a few uniforms and makes one
 * draw call for the points, plus one for the apex glow on ink. The page (field.ts) decides when it
 * runs and tells it the size, theme and pointer.
 */
import particlesVert from './particles.vert.glsl';
import particlesFrag from './particles.frag.glsl';
import glowVert from './glow.vert.glsl';
import glowFrag from './glow.frag.glsl';

export type Colour = [number, number, number];
export type Mode = 'run' | 'pause' | 'still';
export type ToField =
  | { type: 'size'; width: number; height: number; dpr: number }
  | { type: 'theme'; particle: Colour; accent: Colour; signal: Colour; glow: boolean }
  | { type: 'pointer'; x: number; y: number }
  | { type: 'mode'; mode: Mode };
export type FromField = { type: 'scene'; scene: number } | { type: 'drawn' } | { type: 'slow' } | { type: 'failed' };

const FORMATION_SECONDS = 9; // brief: 8 to 10 s each
const BLEND_START = 0.62; // the last 38% of each formation (about 3.4 s) is the blend
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const TAU = Math.PI * 2;
const APEX = -0.82;
const STILL = { scene: 1, t: 5 }; // one still frame of GRANTED

// mulberry32, seeded, so every visitor sees the same field.
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Eight floats per particle. Angles are reduced on the CPU so the GPU's sin and cos stay precise. */
function particles(count: number): Float32Array {
  const rand = prng(20261028);
  const data = new Float32Array(count * 8);
  for (let i = 0; i < count; i++) {
    const angle = i * GOLDEN_ANGLE;
    data.set(
      [
        (i + 0.5) / count,
        angle % TAU,
        rand(),
        rand(),
        rand(),
        0.45 + rand() * 1.1,
        (angle * 0.7) % TAU,
        (i % 3) + (i % 100 === 50 ? 4 : 0), // about 1% signal particles, evenly spaced
      ],
      i * 8,
    );
  }
  return data;
}

function smootherstep(x: number) {
  const t = Math.min(1, Math.max(0, x));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Which two formations are on screen at time t, and how far blended. */
function timeline(t: number): [number, number, number] {
  const phase = t / FORMATION_SECONDS;
  const from = Math.floor(phase) % 4;
  return [from, (from + 1) % 4, smootherstep((phase - Math.floor(phase) - BLEND_START) / (1 - BLEND_START))];
}

const frameLater: (cb: (now: number) => void) => unknown =
  typeof requestAnimationFrame === 'function'
    ? (cb) => requestAnimationFrame(cb)
    : (cb) => setTimeout(() => cb(performance.now()), 16);
const cancelFrame = (id: unknown) =>
  typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id as number) : clearTimeout(id as number);

export function createField(canvas: HTMLCanvasElement | OffscreenCanvas, emit: (m: FromField) => void) {
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
  let count = 0;
  let time = 0;
  let last = 0;
  let raf: unknown = 0;
  let running = false;
  let mode: Mode = 'pause';
  let slowStrikes = 0;
  let windowStart = 0;
  let windowFrames = 0;
  let scene = -1;
  let pinned: typeof STILL | null = null;
  let pointer: [number, number] = [-1e4, -1e4];
  let colours: Record<'particle' | 'accent' | 'signal', Colour> | null = null;
  let glow = false;
  let ready = false;
  let drawn = false;
  let gpu: ReturnType<typeof setup> | null = null;
  const parallel = gl.getExtension('KHR_parallel_shader_compile');

  function program(vs: string, fs: string) {
    const p = gl!.createProgram()!;
    for (const [type, source] of [
      [gl!.VERTEX_SHADER, vs],
      [gl!.FRAGMENT_SHADER, fs],
    ] as const) {
      const shader = gl!.createShader(type)!;
      gl!.shaderSource(shader, source);
      gl!.compileShader(shader);
      gl!.attachShader(p, shader);
    }
    gl!.linkProgram(p);
    return p;
  }
  function uniforms(p: WebGLProgram, names: string) {
    return Object.fromEntries(names.split(' ').map((n) => [n, gl!.getUniformLocation(p, n)]));
  }
  function setup() {
    const points = program(particlesVert, particlesFrag);
    const halo = program(glowVert, glowFrag);
    const buffer = gl!.createBuffer();
    const vao = gl!.createVertexArray();
    gl!.bindVertexArray(vao);
    gl!.bindBuffer(gl!.ARRAY_BUFFER, buffer);
    gl!.enableVertexAttribArray(0);
    gl!.vertexAttribPointer(0, 4, gl!.FLOAT, false, 32, 0);
    gl!.enableVertexAttribArray(1);
    gl!.vertexAttribPointer(1, 4, gl!.FLOAT, false, 32, 16);
    gl!.bindVertexArray(null);
    return { points, halo, buffer, vao, u: {} as Record<string, WebGLUniformLocation | null>, g: {} as Record<string, WebGLUniformLocation | null> };
  }
  /** True once both programs have linked. Polled per frame where shaders compile in parallel. */
  function linked(): boolean {
    if (!gpu) return false;
    const done = (p: WebGLProgram) => !parallel || gl!.getProgramParameter(p, parallel.COMPLETION_STATUS_KHR);
    if (!done(gpu.points) || !done(gpu.halo)) return false;
    if (!gl!.getProgramParameter(gpu.points, gl!.LINK_STATUS) || !gl!.getProgramParameter(gpu.halo, gl!.LINK_STATUS)) {
      gpu = null;
      emit({ type: 'failed' });
      return false;
    }
    gpu.u = uniforms(gpu.points, 'uT uFrom uTo uBlend uGranted uScale uCenter uSize uPointer uPointerOn uDpr uGlow uParticle uAccent uSignal');
    gpu.g = uniforms(gpu.halo, 'uC uR uSize uAccent uW');
    return true;
  }

  // Particle count scales with canvas area: about 2,200 on a desktop, about 1,000 on a phone.
  function upload(n: number) {
    count = n;
    gl!.bindBuffer(gl!.ARRAY_BUFFER, gpu!.buffer);
    gl!.bufferData(gl!.ARRAY_BUFFER, particles(n), gl!.STATIC_DRAW);
  }

  function draw(t: number, fixed?: number) {
    if (!gpu || !ready || !colours || !width) return;
    const [from, to, blend] = fixed === undefined ? timeline(t) : [fixed, fixed, 0];
    const granted = (from === 1 ? 1 - blend : 0) + (to === 1 && from !== 1 ? blend : 0);
    const scale = Math.min(width, height) * 0.3;
    const cx = width / 2;
    const cy = height / 2;
    const { u, g } = gpu;
    gl!.viewport(0, 0, canvas.width, canvas.height);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    gl!.enable(gl!.BLEND);
    gl!.blendFunc(gl!.ONE, gl!.ONE_MINUS_SRC_ALPHA);

    if (glow && granted > 0.001) {
      gl!.useProgram(gpu.halo);
      gl!.uniform2f(g['uC']!, cx, cy - APEX * scale);
      gl!.uniform1f(g['uR']!, scale * 1.1);
      gl!.uniform2f(g['uSize']!, width, height);
      gl!.uniform3fv(g['uAccent']!, colours.accent);
      gl!.uniform1f(g['uW']!, granted);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
    }

    gl!.useProgram(gpu.points);
    gl!.uniform1f(u['uT']!, t);
    gl!.uniform1i(u['uFrom']!, from);
    gl!.uniform1i(u['uTo']!, to);
    gl!.uniform1f(u['uBlend']!, blend);
    gl!.uniform1f(u['uGranted']!, granted);
    gl!.uniform1f(u['uScale']!, scale);
    gl!.uniform2f(u['uCenter']!, cx, cy);
    gl!.uniform2f(u['uSize']!, width, height);
    gl!.uniform2fv(u['uPointer']!, pointer);
    gl!.uniform1f(u['uPointerOn']!, running ? 1 : 0);
    gl!.uniform1f(u['uDpr']!, dpr);
    gl!.uniform1f(u['uGlow']!, glow ? 1 : 0);
    gl!.uniform3fv(u['uParticle']!, colours.particle);
    gl!.uniform3fv(u['uAccent']!, colours.accent);
    gl!.uniform3fv(u['uSignal']!, colours.signal);
    gl!.bindVertexArray(gpu.vao);
    gl!.drawArrays(gl!.POINTS, 0, count);
    gl!.bindVertexArray(null);

    // The scene label changes only when the formation does, never per frame.
    const shown = blend < 0.5 ? from : to;
    if (shown !== scene) emit({ type: 'scene', scene: (scene = shown) });
    if (!drawn) emit({ type: 'drawn' }), (drawn = true);
  }

  function frame(now: number) {
    raf = 0;
    if (!running) return;
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    time += dt;
    draw(time);
    // If frames average over 20 ms across a second, halve the particles. Still slow: a still frame.
    if (!windowStart) windowStart = now;
    windowFrames++;
    if (now - windowStart >= 1000) {
      const average = (now - windowStart) / windowFrames;
      windowStart = now;
      windowFrames = 0;
      if (average > 20) {
        if (++slowStrikes === 1) upload(Math.max(250, count >> 1));
        else {
          emit({ type: 'slow' });
          return apply('still');
        }
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
        pinned = null;
        raf = frameLater(frame);
      } else if (raf) {
        cancelFrame(raf);
        raf = 0;
      }
    }
    // A still frame of GRANTED for reduced motion, and when paused before anything was drawn.
    if (mode === 'still' || (mode === 'pause' && !time)) {
      pinned = STILL;
      draw(STILL.t, STILL.scene);
    }
  }

  function redraw() {
    if (running) return;
    if (pinned) draw(pinned.t, pinned.scene);
    else draw(time);
  }

  /** Start-up in small steps, so no single step is a long task where this runs on the main thread. */
  async function init() {
    gpu = setup();
    while (!linked()) {
      if (!gpu) return;
      await new Promise(frameLater);
    }
    if (width && !count) upload(Math.round(Math.min(2200, Math.max(1000, (width * height) / 140))));
    ready = true;
    apply(mode);
    redraw();
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    if (raf) cancelFrame(raf);
    raf = 0;
    running = ready = false;
    gpu = null;
    count = 0;
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
        if (ready && !count) upload(Math.round(Math.min(2200, Math.max(1000, (width * height) / 140))));
        redraw();
        break;
      case 'theme':
        colours = { particle: m.particle, accent: m.accent, signal: m.signal };
        glow = m.glow; // on paper, density does the glow's job
        redraw();
        break;
      case 'pointer':
        pointer = [m.x, m.y];
        break;
      case 'mode':
        apply(m.mode);
        break;
    }
  };
}
