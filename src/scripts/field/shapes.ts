/**
 * Target positions for the field's drawn formations, sampled in the worker: each shape is drawn
 * once on a small 2D canvas and its filled pixels are sampled, one target per particle. Sorting
 * every shape by x keeps a particle at a similar x from one shape to the next, so the morphs
 * read as calm vertical moves rather than a swirl.
 *
 * Each target is four floats: x, y, z in model units (y up) and a tag. In the document, a tag of
 * k + 1 marks a particle of the k-th typed character and -1 marks the caret.
 */
import wordmarkSvg from '../../../brand/logo/wordmark-on-ink.svg?raw';

export const TEXT = 'once upon a platform...';
export const SHAPES = ['wordmark', 'padlock', 'bar', 'line', 'donut', 'dots', 'document'] as const;
export type ShapeName = (typeof SHAPES)[number];

const PX = 110; // raster pixels per model unit
const WORDMARK_D = /\sd="([^"]+)"/.exec(wordmarkSvg)?.[1] ?? '';
const WORDMARK_BOX = (/viewBox="([^"]+)"/.exec(wordmarkSvg)?.[1] ?? '0 0 1 1').split(' ').map(Number) as [number, number, number, number];

type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
interface Part {
  share: number;
  draw: (g: Ctx, w: number, h: number) => void;
  tag?: (x: number) => number;
}

export interface Built {
  shapes: Float32Array[];
  /** Where the typed line starts and how far each character advances, in model units, and the caret's height. */
  text: { x0: number; advance: number };
}

function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h: number): Ctx {
  const c =
    typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement('canvas'), { width: w, height: h });
  return c.getContext('2d', { willReadFrequently: true }) as Ctx;
}

/** Sample n targets from the parts' filled pixels, in proportion to their shares, then sort by x. */
function sample(g: Ctx, w: number, h: number, parts: Part[], n: number, rand: () => number): Float32Array {
  const total = parts.reduce((s, p) => s + p.share, 0);
  const points: number[][] = [];
  parts.forEach((part, i) => {
    const m = i === parts.length - 1 ? n - points.length : Math.round((n * part.share) / total);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, w, h);
    g.save();
    part.draw(g, w, h);
    g.restore();
    const data = g.getImageData(0, 0, w, h).data;
    const filled: number[] = [];
    for (let p = 3; p < data.length; p += 4) if (data[p]! > 127) filled.push((p - 3) / 4);
    for (let k = 0; k < m; k++) {
      const at = filled.length ? filled[Math.floor(rand() * filled.length)]! : (h / 2) * w + w / 2;
      const x = (at % w) + rand();
      const y = Math.floor(at / w) + rand();
      points.push([(x - w / 2) / PX, (h / 2 - y) / PX, (rand() - 0.5) * 0.08, part.tag ? part.tag(x) : 0]);
    }
  });
  points.sort((a, b) => a[0]! - b[0]!);
  return Float32Array.from(points.flat());
}

const stroke = (g: Ctx, width: number, path: () => void) => {
  g.lineWidth = width;
  g.lineCap = 'butt';
  g.lineJoin = 'miter';
  g.beginPath();
  path();
  g.stroke();
};

/** Chart frame, shared by the bar, line and scatter charts so the morphs between them hold still. */
function chartBox(w: number, h: number) {
  const cw = Math.min(w * 0.8, h * 0.8 * 1.5);
  const ch = cw / 1.5;
  return { cw, ch, x0: (w - cw) / 2, y0: (h - ch) / 2, yB: (h + ch) / 2 };
}
const axes: Part = {
  share: 0.14,
  draw: (g, w, h) => {
    const { cw, ch, x0, y0, yB } = chartBox(w, h);
    stroke(g, Math.max(2, ch * 0.014), () => {
      g.moveTo(x0, y0);
      g.lineTo(x0, yB);
      g.lineTo(x0 + cw, yB);
    });
  },
};
const VALUES = [0.34, 0.52, 0.44, 0.7, 0.6, 0.86];

export async function buildShapes(widthUnits: number, heightUnits: number, n: number, mono: string): Promise<Built> {
  const w = Math.max(64, Math.round(widthUnits * PX));
  const h = Math.max(64, Math.round(heightUnits * PX));
  const g = canvas(w, h);
  const rand = prng(20261028);

  // The document's layout, shared by its parts: a landscape page, so the typed line is as large as it can be.
  const pw = Math.min(w * 0.86, h * 1.5);
  const ph = Math.min(h * 0.8, pw * 0.8);
  const px0 = (w - pw) / 2;
  const py0 = (h - ph) / 2;
  const pad = pw * 0.08;
  const inner = pw - pad * 2;
  const font = Math.min((inner * 0.98) / (TEXT.length * 0.6), ph * 0.11);
  const baseline = py0 + pad + ph * 0.2 + 3 * ph * 0.09 + font * 1.1;
  g.font = `${font}px ${mono}`;
  const advance = g.measureText(TEXT).width / TEXT.length;

  const parts: Record<ShapeName, Part[]> = {
    // Particles spell the outlined wordmark from brand/logo.
    wordmark: [
      {
        share: 1,
        draw: (c, w, h) => {
          const [vx, vy, vw, vh] = WORDMARK_BOX;
          const s = Math.min((w * 0.88) / vw, (h * 0.5) / vh);
          c.translate(w / 2 - (vx + vw / 2) * s, h / 2 - (vy + vh / 2) * s);
          c.scale(s, s);
          c.fill(new Path2D(WORDMARK_D));
        },
      },
    ],
    // A padlock: shackle, body and keyhole.
    padlock: [
      {
        share: 0.32,
        draw: (c, w, h) => {
          const L = Math.min(h * 0.78, w * 0.6);
          const top = (h - L) / 2;
          const r = L * 0.66 * 0.3;
          const t = L * 0.075;
          const by = top + L * 0.5;
          stroke(c, t, () => {
            c.moveTo(w / 2 - r, by + t);
            c.lineTo(w / 2 - r, top + r + t / 2);
            c.arc(w / 2, top + r + t / 2, r, Math.PI, 0);
            c.lineTo(w / 2 + r, by + t);
          });
        },
      },
      {
        share: 0.68,
        draw: (c, w, h) => {
          const L = Math.min(h * 0.78, w * 0.6);
          const bw = L * 0.66;
          const bh = L * 0.5;
          const by = (h - L) / 2 + L - bh;
          c.fillRect(w / 2 - bw / 2, by, bw, bh);
          c.globalCompositeOperation = 'destination-out';
          c.beginPath();
          c.arc(w / 2, by + bh * 0.4, L * 0.06, 0, Math.PI * 2);
          c.fill();
          c.fillRect(w / 2 - L * 0.025, by + bh * 0.4, L * 0.05, bh * 0.3);
        },
      },
    ],
    bar: [
      axes,
      {
        share: 0.86,
        draw: (c, w, h) => {
          const { cw, ch, x0, yB } = chartBox(w, h);
          const slot = cw / VALUES.length;
          VALUES.forEach((v, i) => c.fillRect(x0 + slot * (i + 0.2), yB - ch * v, slot * 0.6, ch * v));
        },
      },
    ],
    line: [
      axes,
      {
        share: 0.86,
        draw: (c, w, h) => {
          const { cw, ch, x0, yB } = chartBox(w, h);
          const slot = cw / VALUES.length;
          const at = (i: number) => [x0 + slot * (i + 0.5), yB - ch * VALUES[i]!] as const;
          stroke(c, ch * 0.03, () => VALUES.forEach((_, i) => (i ? c.lineTo(...at(i)) : c.moveTo(...at(i)))));
          VALUES.forEach((_, i) => {
            c.beginPath();
            c.arc(...at(i), ch * 0.045, 0, Math.PI * 2);
            c.fill();
          });
        },
      },
    ],
    donut: [
      {
        share: 1,
        draw: (c, w, h) => {
          const { ch } = chartBox(w, h);
          let a = -Math.PI / 2;
          for (const f of [0.38, 0.27, 0.2, 0.15]) {
            const b = a + f * Math.PI * 2;
            stroke(c, ch * 0.16, () => c.arc(w / 2, h / 2, ch * 0.38, a + 0.05, b - 0.05));
            a = b;
          }
        },
      },
    ],
    dots: [
      axes,
      {
        share: 0.86,
        draw: (c, w, h) => {
          const { cw, ch, x0, yB } = chartBox(w, h);
          const r = prng(7);
          for (let i = 0; i < 30; i++) {
            const x = 0.06 + 0.88 * r();
            c.beginPath();
            c.arc(x0 + cw * x, yB - ch * (0.12 + 0.62 * x + 0.22 * (r() - 0.5)), ch * 0.026, 0, Math.PI * 2);
            c.fill();
          }
        },
      },
    ],
    // A page with a heading and text lines; the typed line and the caret follow.
    document: [
      { share: 0.14, draw: (c) => stroke(c, Math.max(2, ph * 0.012), () => c.rect(px0, py0, pw, ph)) },
      { share: 0.1, draw: (c) => c.fillRect(px0 + pad, py0 + pad, inner * 0.5, ph * 0.06) },
      {
        share: 0.12,
        draw: (c) => [0.92, 0.84, 0.6].forEach((f, i) => c.fillRect(px0 + pad, py0 + pad + ph * 0.2 + i * ph * 0.09, inner * f, ph * 0.022)),
      },
      {
        share: 0.58,
        draw: (c) => {
          c.font = `${font}px ${mono}`;
          c.textBaseline = 'alphabetic';
          c.fillText(TEXT, px0 + pad, baseline);
        },
        tag: (x) => Math.min(TEXT.length - 1, Math.max(0, Math.floor((x - px0 - pad) / advance))) + 1,
      },
      {
        share: 0.06,
        draw: (c) => c.fillRect(px0 + pad, baseline - font * 0.85, Math.max(2, font * 0.09), font * 1.05),
        tag: () => -1,
      },
    ],
  };

  const shapes: Float32Array[] = [];
  for (const name of SHAPES) {
    shapes.push(sample(g, w, h, parts[name], n, rand));
    await new Promise((r) => setTimeout(r, 0)); // keep each step short where this runs on the main thread
  }
  return { shapes, text: { x0: (px0 + pad - w / 2) / PX, advance: advance / PX } };
}
