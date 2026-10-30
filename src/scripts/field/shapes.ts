/**
 * The pictures the flock builds, in the order of the opening's promise: a financial report, a sales
 * pitch, an app, a document, then the padlock (safely) and the Relativistic mark, the whole the
 * parts make. Each is flat, facing the viewer, one unit high and w wide, with y up; flock.ts scales
 * it to the view. A shape is a test of whether a point is inside it. fill() spreads n points evenly
 * over it on a jittered grid, so edges read crisply at flock density.
 */
type Rand = () => number;
export interface Shape {
  w: number;
  fill: (rand: Rand, out: Float32Array, n: number) => void;
}

const box = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
/** Inside a box but not its inner box: a frame of thickness t. */
const frame = (x: number, y: number, x0: number, y0: number, x1: number, y1: number, t: number) =>
  box(x, y, x0, y0, x1, y1) && !box(x, y, x0 + t, y0 + t, x1 - t, y1 - t);
/** Within r of the segment from (ax, ay) to (bx, by). */
function line(x: number, y: number, ax: number, ay: number, bx: number, by: number, r: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const h = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - ax - dx * h, y - ay - dy * h) < r;
}
/** A fixed jitter per grid cell, so the two passes in fill() agree. */
const jitter = (i: number, j: number) => (((Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) >>> 8) % 1000) / 1000 - 0.5;

function shape(w: number, inside: (x: number, y: number) => boolean): Shape {
  return {
    w,
    fill(rand, out, n) {
      // Size the grid from the share of the box the shape covers, so it holds about n points.
      let hits = 0;
      for (let k = 0; k < 4000; k++) if (inside((rand() - 0.5) * w, rand() - 0.5)) hits++;
      const s = Math.sqrt((w * hits) / 4000 / n) * 0.97;
      const cols = Math.ceil(w / s);
      const rows = Math.ceil(1 / s);
      const at = (i: number, j: number, pass: (x: number, y: number) => void) => {
        const x = (i + 0.5 + jitter(i, j) * 0.6) * s - w / 2;
        const y = (j + 0.5 + jitter(j, i) * 0.6) * s - 0.5;
        if (inside(x, y)) pass(x, y);
      };
      let count = 0;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) at(i, j, () => count++);
      const keep = n / count;
      let m = 0;
      const put = (x: number, y: number) => {
        out[m * 3] = x;
        out[m * 3 + 1] = y;
        out[m * 3 + 2] = (rand() - 0.5) * 0.06;
        m++;
      };
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols && m < n; i++) at(i, j, (x, y) => rand() < keep && put(x, y));
      while (m < n) {
        const x = (rand() - 0.5) * w;
        const y = rand() - 0.5;
        if (inside(x, y)) put(x, y);
      }
    },
  };
}

const BARS = [0.3, 0.5, 0.42, 0.68, 0.9];
const TEXT = [0.6, 0.52, 0.6, 0.34];

export const SHAPES: Shape[] = [
  // A financial report: a bar chart on its axes.
  shape(1.3, (x, y) => {
    if (box(x, y, -0.65, -0.5, -0.6, 0.5) || box(x, y, -0.65, -0.5, 0.65, -0.45)) return true;
    const i = Math.floor((x + 0.52) / 0.235);
    return i >= 0 && i < 5 && x + 0.52 - i * 0.235 < 0.16 && y < -0.45 + BARS[i]!;
  }),
  // A sales pitch: a screen on a stand, with a rising line and its arrowhead.
  shape(1.3, (x, y) => {
    if (frame(x, y, -0.65, -0.16, 0.65, 0.5, 0.055)) return true;
    if (box(x, y, -0.028, -0.5, 0.028, -0.16) || line(x, y, 0, -0.3, -0.26, -0.5, 0.028) || line(x, y, 0, -0.3, 0.26, -0.5, 0.028)) return true;
    if (line(x, y, -0.46, -0.02, -0.18, 0.15, 0.035) || line(x, y, -0.18, 0.15, 0.04, 0.06, 0.035) || line(x, y, 0.04, 0.06, 0.34, 0.3, 0.035)) return true;
    // The arrowhead: a triangle pointing along the last segment, up and to the right.
    const u = (x - 0.34) * 0.78 + (y - 0.3) * 0.62;
    const v = Math.abs(-(x - 0.34) * 0.62 + (y - 0.3) * 0.78);
    return u > -0.04 && u < 0.12 && v < (0.12 - u) * 0.6;
  }),
  // An app: a phone with a grid of tiles and a bar along the bottom.
  shape(0.56, (x, y) => {
    if (frame(x, y, -0.28, -0.5, 0.28, 0.5, 0.05)) return true;
    if (box(x, y, -0.1, -0.42, 0.1, -0.39)) return true;
    const i = Math.floor((x + 0.19) / 0.135);
    const j = Math.floor((0.38 - y) / 0.17);
    return i >= 0 && i < 3 && j >= 0 && j < 4 && x + 0.19 - i * 0.135 < 0.1 && 0.38 - y - j * 0.17 < 0.1;
  }),
  // A document: its page, a heading and lines of text.
  shape(0.76, (x, y) => {
    if (frame(x, y, -0.38, -0.5, 0.38, 0.5, 0.05)) return true;
    if (box(x, y, -0.25, 0.23, 0.1, 0.34)) return true;
    const i = Math.floor((0.11 - y) / 0.13);
    return i >= 0 && i < 4 && 0.11 - y - i * 0.13 < 0.06 && x > -0.25 && x < -0.25 + TEXT[i]!;
  }),
  // A padlock: the shackle, and the body with its keyhole.
  shape(0.68, (x, y) => {
    if (y < 0) return box(x, y, -0.33, -0.5, 0.33, -0.02) && Math.hypot(x, y + 0.2) > 0.065 && !box(x, y, -0.028, -0.38, 0.028, -0.2);
    const r = y > 0.26 ? Math.hypot(x, y - 0.26) : Math.abs(x);
    return r > 0.14 && r < 0.24;
  }),
  // The mark (brand/logo/symbol-*.svg, M3 2H6V5L9 2H13L6 9V14H3Z): the stem and its 45-degree arm.
  shape(5 / 6, (x, y) => (x >= -5 / 12 && x <= -1 / 6) || (x >= -1 / 6 && y <= 0.5 && x - y >= -5 / 12 && x - y <= -1 / 12)),
];
