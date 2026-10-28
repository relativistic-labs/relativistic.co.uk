/**
 * The shapes the flock now and then drifts into: a padlock, a bar chart, a document page, the light
 * cone and a sphere. Each fills a target buffer with n points in camera space (x right, y up, z
 * towards the viewer), one unit high and w wide; flock.ts scales them to the view and spins the
 * solid ones about the vertical. Flat shapes are sampled by rejection from a test of whether a point
 * is inside, so their density is even and they read as silhouettes at flock density.
 */
type Rand = () => number;
export interface Shape {
  w: number;
  spin: number;
  fill: (rand: Rand, out: Float32Array, n: number) => void;
}

const box = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

function flat(w: number, inside: (x: number, y: number) => boolean): Shape {
  return {
    w,
    spin: 0,
    fill(rand, out, n) {
      for (let i = 0; i < n; ) {
        const x = (rand() - 0.5) * w;
        const y = rand() - 0.5;
        if (!inside(x, y)) continue;
        out[i * 3] = x;
        out[i * 3 + 1] = y;
        out[i * 3 + 2] = (rand() - 0.5) * 0.1;
        i++;
      }
    },
  };
}

function solid(w: number, point: (rand: Rand, out: Float32Array, o: number) => void): Shape {
  return {
    w,
    spin: 0.12, // slow: fast enough to show depth, too slow to leave the flock milling once released
    fill(rand, out, n) {
      for (let i = 0; i < n; i++) point(rand, out, i * 3);
    },
  };
}

const BARS = [0.34, 0.56, 0.46, 0.74, 0.92];
const LINES = [0.6, 0.54, 0.6, 0.36];

export const SHAPES: Shape[] = [
  // A padlock: the shackle, and the body with its keyhole.
  flat(0.68, (x, y) => {
    if (y < 0) return box(x, y, -0.33, -0.5, 0.33, -0.02) && Math.hypot(x, y + 0.2) > 0.065 && !box(x, y, -0.028, -0.38, 0.028, -0.2);
    const r = y > 0.26 ? Math.hypot(x, y - 0.26) : Math.abs(x);
    return r > 0.15 && r < 0.24;
  }),
  // A bar chart on its axes.
  flat(1.3, (x, y) => {
    if (box(x, y, -0.65, -0.5, -0.61, 0.5) || box(x, y, -0.65, -0.5, 0.65, -0.46)) return true;
    const i = Math.floor((x + 0.54) / 0.24);
    return i >= 0 && i < 5 && x + 0.54 - i * 0.24 < 0.16 && y < -0.46 + BARS[i]!;
  }),
  // A page: its edge, a heading and lines of text.
  flat(0.76, (x, y) => {
    if (box(x, y, -0.38, -0.5, 0.38, 0.5) && !box(x, y, -0.34, -0.46, 0.34, 0.46)) return true;
    if (box(x, y, -0.26, 0.24, 0.08, 0.34)) return true;
    const i = Math.floor((0.12 - y) / 0.13);
    return i >= 0 && i < 4 && 0.12 - y - i * 0.13 < 0.055 && x > -0.26 && x < -0.26 + LINES[i]!;
  }),
  // The light cone: 45-degree sides from an event at the bottom, denser towards its rim.
  solid(2, (rand, out, o) => {
    const h = Math.sqrt(rand());
    const a = rand() * 6.283;
    out[o] = Math.cos(a) * h;
    out[o + 1] = h - 0.5;
    out[o + 2] = Math.sin(a) * h;
  }),
  // A sphere.
  solid(1, (rand, out, o) => {
    const y = rand() * 2 - 1;
    const a = rand() * 6.283;
    const r = Math.sqrt(1 - y * y) * 0.5;
    out[o] = Math.cos(a) * r;
    out[o + 1] = y * 0.5;
    out[o + 2] = Math.sin(a) * r;
  }),
];
