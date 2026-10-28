/**
 * The background field's renderer, in WebGL2.
 *
 * It runs in a worker on an OffscreenCanvas where the browser allows, so no GL work and no shape
 * sampling ever lands on the page's main thread; otherwise it runs on the main thread. Each
 * particle's fixed attributes are uploaded once, and each drawn shape once (shapes.ts). Each frame
 * sends a few uniforms and makes one draw call for the points, plus one for the cone's faint glow
 * on ink. The page (field.ts) decides when it runs and tells it the size and theme.
 *
 * Sequence, looping: scatter, the wordmark, a padlock, four charts (bar, line, donut, scatter plot),
 * a document that types "once upon a platform...", the light cone, a sphere.
 */
import particlesVert from './particles.vert.glsl';
import particlesFrag from './particles.frag.glsl';
import glowVert from './glow.vert.glsl';
import glowFrag from './glow.frag.glsl';
import { buildShapes, SHAPES, TEXT, type Built, type ShapeName } from './shapes';

export type Colour = [number, number, number];
export type Mode = 'run' | 'pause' | 'still';
export type ToField =
  | { type: 'size'; width: number; height: number; dpr: number }
  | { type: 'theme'; particle: Colour; accent: Colour; signal: Colour; glow: boolean }
  | { type: 'mode'; mode: Mode };
export type FromField = { type: 'drawn' } | { type: 'slow' } | { type: 'failed' };

const SCATTER = 0;
const CONE = 1;
const SPHERE = 2;
type Step = { analytic: number; hold: number } | { shape: ShapeName; hold: number };
const SEQUENCE: Step[] = [
  { analytic: SCATTER, hold: 9 },
  { shape: 'wordmark', hold: 9 },
  { shape: 'padlock', hold: 9 },
  { shape: 'bar', hold: 4 },
  { shape: 'line', hold: 4 },
  { shape: 'donut', hold: 4 },
  { shape: 'dots', hold: 4 },
  { shape: 'document', hold: 12 },
  { analytic: CONE, hold: 9 },
  { analytic: SPHERE, hold: 9 },
];
const LOOP = SEQUENCE.reduce((s, x) => s + x.hold, 0);
const DOC = SHAPES.indexOf('document');
const STILL = { step: SEQUENCE.findIndex((s) => 'shape' in s && s.shape === 'document'), local: 11 };
const ALPHA = 0.72; // quieter than the reference field

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

// When each character of the typed line appears, seconds into the document: about seven a second,
// a little uneven, with a beat after each space.
const TYPED_AT: number[] = (() => {
  const rand = prng(23);
  let t = 1.2;
  return [...TEXT].map((ch) => (t += (0.55 + rand() * 0.9) / 7 + (ch === ' ' ? 0.1 : 0)));
})();

/** Eight floats per particle. Angles are reduced on the CPU so the GPU's sin and cos stay precise. */
function particles(count: number): Float32Array {
  const rand = prng(20261028);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const data = new Float32Array(count * 8);
  for (let i = 0; i < count; i++) {
    const angle = i * golden;
    // prettier-ignore
    data.set([(i + 0.5) / count, angle % (Math.PI * 2), rand(), rand(), rand(), 0.45 + rand() * 1.0, (angle * 0.7) % (Math.PI * 2), i % 100 === 50 ? 1 : 0], i * 8);
  }
  return data;
}

const smootherstep = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/** Which step is on screen at time t, which one is blending in, how far, and the time within the step. */
function timeline(t: number): [number, number, number, number] {
  let local = ((t % LOOP) + LOOP) % LOOP;
  let i = 0;
  while (local >= SEQUENCE[i]!.hold) local -= SEQUENCE[i++]!.hold;
  const hold = SEQUENCE[i]!.hold;
  const blend = Math.min(3.2, hold * 0.35); // slow, eased blends
  return [i, (i + 1) % SEQUENCE.length, smootherstep((local - (hold - blend)) / blend), local];
}

const frameLater: (cb: (now: number) => void) => unknown =
  typeof requestAnimationFrame === 'function'
    ? (cb) => requestAnimationFrame(cb)
    : (cb) => setTimeout(() => cb(performance.now()), 16);
const cancelFrame = (id: unknown) =>
  typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id as number) : clearTimeout(id as number);

async function loadMono(url: string | undefined): Promise<string> {
  if (!url) return 'monospace';
  try {
    const face = new FontFace('Relativistic Mono', `url(${url})`);
    await face.load();
    ((self as unknown as { fonts?: FontFaceSet }).fonts ?? document.fonts).add(face);
    return '"Relativistic Mono", monospace';
  } catch {
    return 'monospace';
  }
}

export function createField(canvas: HTMLCanvasElement | OffscreenCanvas, monoUrl: string | undefined, emit: (m: FromField) => void) {
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
  let colours: Record<'particle' | 'accent' | 'signal', Colour> | null = null;
  let glow = false;
  let ready = false;
  let drawn = false;
  let built: Built | null = null;
  let builtFor = '';
  let building = false;
  let bound: [number, number] = [-2, -2]; // -2: nothing bound yet (-1 means "no shape")
  let gpu: ReturnType<typeof setup> | null = null;
  const parallel = gl.getExtension('KHR_parallel_shader_compile');
  const mono = loadMono(monoUrl);

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
    const base = gl!.createBuffer();
    const shapes = SHAPES.map(() => gl!.createBuffer());
    const vao = gl!.createVertexArray();
    gl!.bindVertexArray(vao);
    gl!.bindBuffer(gl!.ARRAY_BUFFER, base);
    gl!.enableVertexAttribArray(0);
    gl!.vertexAttribPointer(0, 4, gl!.FLOAT, false, 32, 0);
    gl!.enableVertexAttribArray(1);
    gl!.vertexAttribPointer(1, 4, gl!.FLOAT, false, 32, 16);
    gl!.enableVertexAttribArray(2);
    gl!.enableVertexAttribArray(3);
    gl!.bindVertexArray(null);
    return { points, halo, base, shapes, vao, u: {} as Record<string, WebGLUniformLocation | null>, g: {} as Record<string, WebGLUniformLocation | null> };
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
    gpu.u = uniforms(gpu.points, 'uT uFrom uTo uBlend uCone uDocSlot uDoc uTyped uCaret uCaretOn uScale uCenter uSize uDpr uGlow uAlpha uParticle uAccent uSignal');
    gpu.g = uniforms(gpu.halo, 'uC uR uSize uAccent uW');
    return true;
  }

  /** Particle count scales with canvas area (about 2,200 on a desktop, 1,400 on a phone); shapes follow. */
  function upload(n: number) {
    count = n;
    gl!.bindBuffer(gl!.ARRAY_BUFFER, gpu!.base);
    gl!.bufferData(gl!.ARRAY_BUFFER, particles(n), gl!.STATIC_DRAW);
    for (const b of gpu!.shapes) {
      gl!.bindBuffer(gl!.ARRAY_BUFFER, b);
      gl!.bufferData(gl!.ARRAY_BUFFER, n * 16, gl!.STATIC_DRAW);
    }
    built = null;
    builtFor = '';
    bound = [-2, -2];
    void rebuild();
  }

  /** Sample the shapes for this canvas's proportions. Re-run when they change noticeably. */
  async function rebuild() {
    const scale = Math.min(width, height) * 0.3;
    if (!gpu || !width || !count || building) return;
    const key = `${count}:${Math.round((width / scale) * 8)}:${Math.round((height / scale) * 8)}`;
    if (key === builtFor) return;
    building = true;
    const result = await buildShapes(width / scale, height / scale, count, await mono);
    building = false;
    if (!gpu) return;
    if (result.shapes[0]!.length !== count * 4) return void rebuild(); // the count changed while sampling
    result.shapes.forEach((data, i) => {
      gl!.bindBuffer(gl!.ARRAY_BUFFER, gpu!.shapes[i]!);
      gl!.bufferData(gl!.ARRAY_BUFFER, data, gl!.STATIC_DRAW);
    });
    built = result;
    builtFor = key;
    bound = [-2, -2];
    apply(mode);
    void rebuild(); // in case the size changed while sampling
  }

  /** Point attribute slots 2 and 3 at the shapes on screen; only when the pair changes. */
  function bind(slot: 2 | 3, shape: number) {
    const i = slot - 2;
    if (bound[i] === shape) return;
    bound[i] = shape;
    gl!.bindBuffer(gl!.ARRAY_BUFFER, gpu!.shapes[Math.max(0, shape)]!);
    gl!.vertexAttribPointer(slot, 4, gl!.FLOAT, false, 16, 0);
  }

  function draw(t: number, still = false) {
    if (!gpu || !ready || !colours || !width || (still && !built)) return;
    const [fromStep, toStep, blend, local] = still ? [STILL.step, STILL.step, 0, STILL.local] : timeline(t);
    const kind = (step: number) => {
      const s = SEQUENCE[step]!;
      return 'analytic' in s ? { f: s.analytic, shape: -1 } : built ? { f: -1, shape: SHAPES.indexOf(s.shape) } : { f: SCATTER, shape: -1 };
    };
    const from = kind(fromStep);
    const to = kind(toStep);
    const { u, g } = gpu;
    gl!.bindVertexArray(gpu.vao);
    bind(2, from.shape);
    bind(3, to.shape);
    const cone = (from.f === CONE ? 1 - blend : 0) + (to.f === CONE && from.f !== CONE ? blend : 0);
    const docSlot = from.shape === DOC ? 3 : to.shape === DOC ? 4 : 0;
    const doc = docSlot === 3 ? 1 - blend : docSlot === 4 ? blend : 0;

    // Typing: nothing typed while the page arrives, then about seven characters a second.
    const typedAt = (s: number) => TYPED_AT.reduce((n, at) => n + Math.min(1, Math.max(0, (s - at) / 0.05)), 0);
    const typed = docSlot === 3 ? typedAt(local) : 0;
    const typing = docSlot === 3 && local > TYPED_AT[0]! - 0.3 && local < TYPED_AT.at(-1)! + 0.3;
    const caretOn = typing || still ? 1 : 0.5 + 0.5 * Math.max(-1, Math.min(1, Math.cos(local * Math.PI * 2) * 6));
    const text = built?.text ?? { x0: 0, advance: 0 };

    const scale = Math.min(width, height) * 0.3;
    const cx = width / 2;
    const cy = height / 2;
    gl!.viewport(0, 0, canvas.width, canvas.height);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    gl!.enable(gl!.BLEND);
    gl!.blendFunc(gl!.ONE, gl!.ONE_MINUS_SRC_ALPHA);

    if (glow && cone > 0.001) {
      gl!.useProgram(gpu.halo);
      gl!.uniform2f(g['uC']!, cx, cy + 0.82 * scale);
      gl!.uniform1f(g['uR']!, scale * 1.1);
      gl!.uniform2f(g['uSize']!, width, height);
      gl!.uniform3fv(g['uAccent']!, colours.accent);
      gl!.uniform1f(g['uW']!, cone);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
    }

    gl!.useProgram(gpu.points);
    gl!.uniform1f(u['uT']!, t);
    gl!.uniform1i(u['uFrom']!, from.shape >= 0 ? 3 : from.f);
    gl!.uniform1i(u['uTo']!, to.shape >= 0 ? 4 : to.f);
    gl!.uniform1f(u['uBlend']!, blend);
    gl!.uniform1f(u['uCone']!, cone);
    gl!.uniform1i(u['uDocSlot']!, docSlot);
    gl!.uniform1f(u['uDoc']!, doc);
    gl!.uniform1f(u['uTyped']!, still ? TEXT.length : typed);
    gl!.uniform2f(u['uCaret']!, text.x0 + Math.ceil(still ? TEXT.length : typed - 0.001) * text.advance + text.advance * 0.1, 0);
    gl!.uniform1f(u['uCaretOn']!, caretOn);
    gl!.uniform1f(u['uScale']!, scale);
    gl!.uniform2f(u['uCenter']!, cx, cy);
    gl!.uniform2f(u['uSize']!, width, height);
    gl!.uniform1f(u['uDpr']!, dpr);
    gl!.uniform1f(u['uGlow']!, glow ? 1 : 0);
    gl!.uniform1f(u['uAlpha']!, ALPHA);
    gl!.uniform3fv(u['uParticle']!, colours.particle);
    gl!.uniform3fv(u['uAccent']!, colours.accent);
    gl!.uniform3fv(u['uSignal']!, colours.signal);
    gl!.drawArrays(gl!.POINTS, 0, count);
    gl!.bindVertexArray(null);

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
        if (++slowStrikes === 1) upload(Math.max(500, count >> 1));
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
        raf = frameLater(frame);
      } else if (raf) {
        cancelFrame(raf);
        raf = 0;
      }
    }
    // The still: the document with its line typed, for reduced motion or a pause before any motion.
    if (mode === 'still' || (mode === 'pause' && !time)) draw(0, true);
  }

  function redraw() {
    if (running) return;
    if (mode === 'still' || !time) draw(0, true);
    else draw(time);
  }

  /** Start-up in small steps, so no single step is a long task where this runs on the main thread. */
  async function init() {
    gpu = setup();
    while (!linked()) {
      if (!gpu) return;
      await new Promise(frameLater);
    }
    if (width) upload(Math.round(Math.min(2400, Math.max(1400, (width * height) / 140))));
    ready = true;
    apply(mode);
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
        if (ready && !count) upload(Math.round(Math.min(2400, Math.max(1400, (width * height) / 140))));
        else void rebuild();
        redraw();
        break;
      case 'theme':
        colours = { particle: m.particle, accent: m.accent, signal: m.signal };
        glow = m.glow; // on paper, density does the glow's job
        redraw();
        break;
      case 'mode':
        apply(m.mode);
        break;
    }
  };
}
