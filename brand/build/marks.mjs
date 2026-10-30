// Generates the symbol, wordmark, lockups and icon.svg as font-independent SVG.
//
// The wordmark is shaped with Instrument Sans (kerning applied) from
// brand/fonts/instrument-sans-wdth-wght.woff2 and written out as paths, so no
// SVG depends on an installed font.
//
// Needs two npm packages, fontkit and wawoff2. The repository has no
// package.json on purpose, so run it from a scratch folder that has them:
//   cd /some/scratch && pnpm add fontkit wawoff2
//   node /path/to/brand/build/marks.mjs
// Packages resolve from the current working directory.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(join(process.cwd(), 'noop.js'));
const fontkit = require('fontkit');
const wawoff2 = require('wawoff2');

const BRAND = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// The symbol: route A, the worldline r. On a 16-unit grid (the favicon grid):
// stem x 3..6, y 2..14; the arm is a 45-degree band whose lower edge runs from
// the stem at (6, 9) to the point at (13, 2), cut flat at the top. Every vertex
// is a whole unit, so verticals and the notch are pixel-sharp at 16 and 32 px.
// ---------------------------------------------------------------------------
export const SYMBOL_PATH = 'M3 2H6V5L9 2H13L6 9V14H3Z';
export const SYMBOL_BOX = { x: 3, y: 2, w: 10, h: 12 };

// ---------------------------------------------------------------------------
// Wordmark settings
// ---------------------------------------------------------------------------
export const WORDMARK = {
  text: 'relativistic',
  wght: 600,
  wdth: 100,
  tracking: -0.02,     // em; the brief asks for tightened spacing
};
// Lockup: the symbol stands on the baseline and its top meets the ascender of
// the l and t (720 units), so one grid unit is 60 font units. The gap is
// 4 grid units (240 units, just under half the x-height).
const UNIT = 60;
const GAP_UNITS = 4;

export const COLOURS = {
  'on-ink': '#f2f0ec',
  'on-paper': '#151a21',
  black: '#000000',
  white: '#ffffff',
};

const r1 = (n) => Math.round(n * 10) / 10;

export async function loadFont(file = join(BRAND, 'fonts/instrument-sans-wdth-wght.woff2')) {
  const ttf = await wawoff2.decompress(readFileSync(file));
  return fontkit.create(Buffer.from(ttf));
}

// Shape the text and return { d, width, top, bottom, xHeight } in font units,
// with y pointing down and the baseline at y = 0.
export function shape(font, opts = WORDMARK) {
  const f = font.getVariation({ wght: opts.wght, wdth: opts.wdth });
  const run = f.layout(opts.text);
  const track = opts.tracking * f.unitsPerEm;
  let x = 0, minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
  const parts = [];
  run.glyphs.forEach((g, i) => {
    const pos = run.positions[i];
    const gx = x + pos.xOffset, gy = pos.yOffset;
    const cmds = g.path.commands;
    let d = '';
    for (const c of cmds) {
      const a = c.args;
      const P = (j) => `${r1(gx + a[j])} ${r1(-(gy + a[j + 1]))}`;
      if (c.command === 'moveTo') d += `M${P(0)}`;
      else if (c.command === 'lineTo') d += `L${P(0)}`;
      else if (c.command === 'quadraticCurveTo') d += `Q${P(0)} ${P(2)}`;
      else if (c.command === 'bezierCurveTo') d += `C${P(0)} ${P(2)} ${P(4)}`;
      else if (c.command === 'closePath') d += 'Z';
    }
    const bb = g.bbox;
    if (isFinite(bb.minX)) {
      minX = Math.min(minX, gx + bb.minX); maxX = Math.max(maxX, gx + bb.maxX);
      minY = Math.min(minY, -(gy + bb.maxY)); maxY = Math.max(maxY, -(gy + bb.minY));
    }
    parts.push(d);
    x += pos.xAdvance + (i < run.glyphs.length - 1 ? track : 0);
  });
  return { d: parts.join(''), minX, maxX, top: minY, bottom: maxY, xHeight: f.xHeight, ascender: 720 };
}

function svgDoc({ viewBox, w, h, title, body }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${w}" height="${h}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;
}

// Symbol in font units for lockups: scaled so 12 grid units = 720 units, standing on the baseline.
function symbolInFontUnits(x0) {
  // Translate the grid so the symbol's bottom-left (3, 14) lands at (x0, 0).
  return `<path transform="translate(${x0 - SYMBOL_BOX.x * UNIT} ${-14 * UNIT}) scale(${UNIT})" d="${SYMBOL_PATH}"/>`;
}

export function lockupGeometry(word) {
  const symW = SYMBOL_BOX.w * UNIT;           // 600
  const gap = GAP_UNITS * UNIT;               // 270
  const wordX = symW + gap - word.minX;       // shift the wordmark so its ink starts after the gap
  const top = Math.min(-720, word.top);
  const bottom = Math.max(0, word.bottom);
  const width = symW + gap + (word.maxX - word.minX);
  return { symW, gap, wordX, top, bottom, width, height: bottom - top };
}

async function main() {
  const font = await loadFont();
  const word = shape(font);
  const out = (p) => join(BRAND, p);
  mkdirSync(out('logo'), { recursive: true });
  mkdirSync(out('icons'), { recursive: true });

  for (const [name, fill] of Object.entries(COLOURS)) {
    // Symbol: tight viewBox on the 16-unit grid.
    writeFileSync(out(`logo/symbol-${name}.svg`), svgDoc({
      viewBox: `${SYMBOL_BOX.x} ${SYMBOL_BOX.y} ${SYMBOL_BOX.w} ${SYMBOL_BOX.h}`, w: 100, h: 120, title: 'Relativistic',
      body: `<path fill="${fill}" d="${SYMBOL_PATH}"/>`,
    }));

    // Wordmark only.
    const ww = word.maxX - word.minX, wh = word.bottom - word.top;
    writeFileSync(out(`logo/wordmark-${name}.svg`), svgDoc({
      viewBox: `${r1(word.minX)} ${r1(word.top)} ${r1(ww)} ${r1(wh)}`, w: r1(ww / 10), h: r1(wh / 10), title: 'Relativistic',
      body: `<path fill="${fill}" d="${word.d}"/>`,
    }));

    // Horizontal lockup.
    const g = lockupGeometry(word);
    writeFileSync(out(`logo/lockup-${name}.svg`), svgDoc({
      viewBox: `0 ${r1(g.top)} ${r1(g.width)} ${r1(g.height)}`, w: r1(g.width / 10), h: r1(g.height / 10), title: 'Relativistic',
      body: `<g fill="${fill}">${symbolInFontUnits(0)}<path transform="translate(${r1(g.wordX)} 0)" d="${word.d}"/></g>`,
    }));
  }

  // icon.svg: the favicon. Transparent, on the 16-unit grid, colour follows the
  // browser's colour scheme: ink-coloured on light UI, pale on dark UI.
  writeFileSync(out('icons/icon.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><style>path{fill:#151a21}@media (prefers-color-scheme:dark){path{fill:#f2f0ec}}</style><path d="${SYMBOL_PATH}"/></svg>\n`);

  console.log('wordmark width', r1(word.maxX - word.minX), 'height', r1(word.bottom - word.top), 'x-height', word.xHeight);
  // Profile avatar (GitHub, LinkedIn): the symbol on ink, 20 px per grid unit, so
  // it is 240 px tall in 500 and stays well inside the circular crop.
  mkdirSync(out('social'), { recursive: true });
  writeFileSync(out('social/avatar.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500" role="img" aria-label="Relativistic"><title>Relativistic</title><rect width="500" height="500" fill="#0b0f14"/><path fill="#f2f0ec" transform="translate(90 90) scale(20)" d="${SYMBOL_PATH}"/></svg>\n`);

  console.log('lockup', lockupGeometry(word));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
