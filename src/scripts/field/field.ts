/**
 * The particle field, in WebGL2. Ported from the canvas reference in brand/field/field.js.
 *
 * Each particle's fixed attributes are uploaded once; each frame sends a few uniforms and makes
 * one draw call (plus one for the apex glow on ink). Main-thread work per frame is close to nothing.
 * Never competes with the page: idle start, stops off-screen and in hidden tabs, sheds particles
 * if frames are slow, and draws one still frame of GRANTED for reduced motion.
 */
import particlesVert from './particles.vert.glsl';
import particlesFrag from './particles.frag.glsl';
import glowVert from './glow.vert.glsl';
import glowFrag from './glow.frag.glsl';

const SCENES = [
  ['001', 'Unbound'],
  ['002', 'Granted'],
  ['003', 'Shared'],
  ['004', 'Running'],
] as const;
const FORMATION_SECONDS = 9; // brief: 8 to 10 s each
const BLEND_START = 0.62; // the last 38% of each formation (about 3.4 s) is the blend
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const TAU = Math.PI * 2;
const APEX = -0.82;
const STILL = { scene: 1, t: 5 }; // reduced motion: one still frame of GRANTED
const STORAGE_KEY = 'relativistic-motion';
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
const darkQuery = matchMedia('(prefers-color-scheme: dark)');

type Colour = [number, number, number];

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

/** Resolve a theme colour (oklch, light-dark()) to sRGB through a 1×1 canvas. */
function readColour(probe: HTMLElement, name: string, ctx: CanvasRenderingContext2D): Colour {
  probe.style.color = `var(${name})`;
  ctx.fillStyle = getComputedStyle(probe).color;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
}

export function startField(root: HTMLElement): void {
  const canvas = root.querySelector('canvas');
  const sceneNumber = root.querySelector('[data-scene-number]');
  const sceneName = root.querySelector('[data-scene-name]');
  const pause = root.querySelector<HTMLButtonElement>('[data-pause]');
  if (!canvas) return;
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    powerPreference: 'low-power',
  });
  if (!gl) return; // no WebGL2: no field, nothing else lost

  let width = 1;
  let height = 1;
  let dpr = 1;
  let count = 0;
  let time = 0;
  let last = 0;
  let raf = 0;
  let running = false;
  let visible = true;
  let paused = false;
  try {
    paused = localStorage.getItem(STORAGE_KEY) === 'paused';
  } catch {
    // storage blocked: motion plays, and the control still works for this visit
  }
  let slowStrikes = 0;
  let windowStart = 0;
  let windowFrames = 0;
  let scene = -1;
  let pinned: typeof STILL | null = null;
  let pointer: [number, number] = [-1e4, -1e4];
  let colours: Record<'particle' | 'accent' | 'signal', Colour>;
  let glow = false;
  let ready = false;
  let gpu: ReturnType<typeof setup> | null = null;

  function compile(type: number, source: string) {
    const shader = gl!.createShader(type)!;
    gl!.shaderSource(shader, source);
    gl!.compileShader(shader);
    return shader;
  }
  function program(vs: string, fs: string) {
    const p = gl!.createProgram()!;
    gl!.attachShader(p, compile(gl!.VERTEX_SHADER, vs));
    gl!.attachShader(p, compile(gl!.FRAGMENT_SHADER, fs));
    gl!.linkProgram(p);
    return p;
  }
  function uniforms(p: WebGLProgram, names: string[]) {
    return Object.fromEntries(names.map((n) => [n, gl!.getUniformLocation(p, n)]));
  }

  // Shaders compile in parallel where the browser allows, so linking never blocks the main thread.
  const parallel = gl.getExtension('KHR_parallel_shader_compile');
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
  function linked(): boolean {
    if (!gpu) return false;
    if (parallel && !(gl!.getProgramParameter(gpu.points, parallel.COMPLETION_STATUS_KHR) && gl!.getProgramParameter(gpu.halo, parallel.COMPLETION_STATUS_KHR))) return false;
    if (!gl!.getProgramParameter(gpu.points, gl!.LINK_STATUS) || !gl!.getProgramParameter(gpu.halo, gl!.LINK_STATUS)) {
      gpu = null; // failed: leave the page as it is
      return false;
    }
    gpu.u = uniforms(gpu.points, ['uT', 'uFrom', 'uTo', 'uBlend', 'uGranted', 'uScale', 'uCenter', 'uSize', 'uPointer', 'uPointerOn', 'uDpr', 'uGlow', 'uParticle', 'uAccent', 'uSignal']);
    gpu.g = uniforms(gpu.halo, ['uC', 'uR', 'uSize', 'uAccent', 'uW']);
    return true;
  }

  // Particle count scales with canvas area: about 2,200 on a desktop, about 1,000 on a phone.
  function upload(n: number) {
    count = n;
    gl!.bindBuffer(gl!.ARRAY_BUFFER, gpu!.buffer);
    gl!.bufferData(gl!.ARRAY_BUFFER, particles(n), gl!.STATIC_DRAW);
  }

  function readTheme() {
    const probe = document.createElement('span');
    probe.hidden = true;
    root.append(probe);
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
    colours = {
      particle: readColour(probe, '--field-particle', ctx),
      accent: readColour(probe, '--field-glow', ctx),
      signal: readColour(probe, '--field-signal', ctx),
    };
    probe.remove();
    glow = darkQuery.matches; // on paper, density does the glow's job
  }

  function resize() {
    const rect = canvas!.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas!.width = Math.round(width * dpr);
    canvas!.height = Math.round(height * dpr);
  }

  function draw(t: number, fixed?: number) {
    if (!gpu || !ready) return;
    const [from, to, blend] = fixed === undefined ? timeline(t) : [fixed, fixed, 0];
    const granted = (from === 1 ? 1 - blend : 0) + (to === 1 && from !== 1 ? blend : 0);
    const scale = Math.min(width, height) * 0.3;
    const cx = width / 2;
    const cy = height / 2;
    const { u, g } = gpu;
    gl!.viewport(0, 0, canvas!.width, canvas!.height);
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
    if (shown !== scene) {
      scene = shown;
      const [n, name] = SCENES[shown]!;
      if (sceneNumber) sceneNumber.textContent = n;
      if (sceneName) sceneName.textContent = name;
    }
    if (!root.classList.contains('is-drawn')) root.classList.add('is-drawn');
  }

  function frame(now: number) {
    raf = 0;
    if (!running) return;
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    time += dt;
    draw(time);
    // If frames average over 20 ms across a second, halve the particles. Still slow: stop on a still.
    if (!windowStart) windowStart = now;
    windowFrames++;
    if (now - windowStart >= 1000) {
      const average = (now - windowStart) / windowFrames;
      windowStart = now;
      windowFrames = 0;
      if (average > 20) {
        if (++slowStrikes === 1) upload(Math.max(250, count >> 1));
        else return showStill();
      }
    }
    raf = requestAnimationFrame(frame);
  }

  function setRunning(on: boolean) {
    if (on === running) return;
    running = on;
    root.dataset['running'] = String(on);
    if (on) {
      last = 0;
      windowStart = 0;
      windowFrames = 0;
      pinned = null;
      raf = requestAnimationFrame(frame);
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  function showStill() {
    setRunning(false);
    root.dataset['running'] = 'false';
    pinned = STILL;
    draw(STILL.t, STILL.scene);
  }

  /** Decide whether the loop should run, from every input that can stop it. */
  function update() {
    if (!ready) return;
    const reduce = motionQuery.matches || slowStrikes > 1;
    if (pause) pause.hidden = motionQuery.matches;
    if (reduce) return showStill();
    const go = visible && !document.hidden && !paused;
    if (go) setRunning(true);
    else {
      setRunning(false);
      if (!pinned && !time) showStill(); // paused before the first frame: show GRANTED, not nothing
    }
  }

  function redraw() {
    if (running) return;
    if (pinned) draw(pinned.t, pinned.scene);
    else draw(time);
  }

  function init() {
    gpu = setup();
    const wait = () => {
      if (!gpu) return;
      if (!linked()) {
        if (gpu) requestAnimationFrame(wait);
        return;
      }
      readTheme();
      resize();
      const area = width * height;
      upload(Math.round(Math.min(2200, Math.max(1000, area / 140))));
      ready = true;
      update();
      if (!running) redraw();
    };
    wait();
  }

  // Inputs
  new ResizeObserver(() => {
    resize();
    redraw();
  }).observe(canvas);
  new IntersectionObserver(([entry]) => {
    visible = !!entry?.isIntersecting;
    update();
  }).observe(canvas);
  document.addEventListener('visibilitychange', update);
  motionQuery.addEventListener('change', update);
  darkQuery.addEventListener('change', () => {
    readTheme();
    redraw();
  });
  addEventListener(
    'pointermove',
    (e) => {
      if (!running) return;
      const r = canvas.getBoundingClientRect();
      pointer = [e.clientX - r.left, e.clientY - r.top];
    },
    { passive: true },
  );
  document.addEventListener('pointerleave', () => (pointer = [-1e4, -1e4]));

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

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    setRunning(false);
    ready = false;
    gpu = null;
  });
  canvas.addEventListener('webglcontextrestored', init);

  init();
}
