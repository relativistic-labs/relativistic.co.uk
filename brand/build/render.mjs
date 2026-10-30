// Renders every raster in brand/ from its vector or HTML source.
//
//   node brand/build/render.mjs [task ...]     tasks: icons social stills routes previews print (default: all)
//
// Needs playwright and sharp. The repository has no package.json on purpose, so
// run it from a scratch folder that has them (packages resolve from the cwd):
//   cd /some/scratch && pnpm add playwright sharp && node /path/to/brand/build/render.mjs
// On this WSL machine Playwright cannot download browsers, so set CHROME to a
// cached Linux Chromium, e.g. ~/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome.

import { writeFileSync, mkdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(join(process.cwd(), 'noop.js'));
const { chromium } = require('playwright');
const sharp = require('sharp');

const BRAND = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = (p) => { const [path, query] = p.split('?'); return pathToFileURL(join(BRAND, path)).href + (query ? '?' + query : ''); };
const SYMBOL_PATH = 'M3 2H6V5L9 2H13L6 9V14H3Z';
const INK = '#0b0f14', PALE = '#f2f0ec';

const tasks = process.argv.slice(2);
const want = (t) => tasks.length === 0 || tasks.includes(t);
const executablePath = process.env.CHROME || undefined;
const browser = await chromium.launch({ headless: true, executablePath });

async function page(viewport, scale = 1, scheme = 'light') {
  const p = await browser.newPage({ viewport, deviceScaleFactor: scale, colorScheme: scheme });
  p.on('pageerror', (e) => console.error('pageerror', e.message));
  p.on('requestfailed', (r) => console.error('requestfailed', r.url()));
  p.on('request', (r) => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) console.error('NON-LOCAL REQUEST', r.url()); });
  return p;
}
async function ready(p) {
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(150);
}
// Write a PNG; `palette` quantises to 256 colours (good for flat art and particle stills).
async function png(buffer, file, { palette = false } = {}) {
  const out = join(BRAND, file);
  mkdirSync(dirname(out), { recursive: true });
  await sharp(buffer).png(palette ? { palette: true, quality: 95, effort: 10, compressionLevel: 9 } : { compressionLevel: 9, effort: 10 }).toFile(out);
  console.log(file.padEnd(44), (statSync(out).size / 1024).toFixed(1), 'KB');
}
async function svgToPng(svg, size) {
  const p = await page({ width: size, height: size });
  await p.setContent(`<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  const buf = await p.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await p.close();
  return buf;
}
// A minimal ICO container holding PNG images (supported by every current browser).
function ico(images) {
  const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  const entries = []; let offset = 6 + 16 * images.length;
  for (const { size, data } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); e.writeUInt8(0, 3); e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8); e.writeUInt32LE(offset, 12);
    offset += data.length; entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

// ---------------------------------------------------------------------------
if (want('icons')) {
  // favicon.ico: a solid ink square (it cannot follow the colour scheme), symbol on the 16-unit grid.
  const tile = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="${INK}"/><path fill="${PALE}" d="${SYMBOL_PATH}"/></svg>`;
  const ico16 = await sharp(await svgToPng(tile, 16)).png().toBuffer();
  const ico32 = await sharp(await svgToPng(tile, 32)).png().toBuffer();
  writeFileSync(join(BRAND, 'icons/favicon.ico'), ico([{ size: 16, data: ico16 }, { size: 32, data: ico32 }]));
  console.log('icons/favicon.ico'.padEnd(44), (statSync(join(BRAND, 'icons/favicon.ico')).size / 1024).toFixed(1), 'KB');

  // apple-touch-icon: 180 px, solid background, symbol 108 px tall (60%), 9 px per grid unit.
  const touch = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180"><rect width="180" height="180" fill="${INK}"/><path fill="${PALE}" transform="translate(18 18) scale(9)" d="${SYMBOL_PATH}"/></svg>`;
  await png(await svgToPng(touch, 180), 'icons/apple-touch-icon.png');
}

// ---------------------------------------------------------------------------
if (want('social')) {
  // Avatar: the vector source is social/avatar.svg (written by marks.mjs).
  const p = await page({ width: 500, height: 500 });
  await p.goto(url('social/avatar.svg'));
  await png(await p.screenshot(), 'social/avatar.png', { palette: true });
  await p.close();

  for (const [file, w, h, scale, out] of [
    ['social/og.html', 1200, 630, 1, 'social/og.png'],
    ['social/linkedin-cover.html', 1128, 191, 1, 'social/linkedin-cover.png'],
    ['social/linkedin-cover.html', 1128, 191, 2, 'social/linkedin-cover@2x.png'],
  ]) {
    const q = await page({ width: w, height: h }, scale);
    await q.goto(url(file));
    await q.waitForSelector('body[data-ready]');
    await ready(q);
    await png(await q.screenshot(), out, { palette: true });
    await q.close();
  }
}

// ---------------------------------------------------------------------------
if (want('stills')) {
  // Four formations x two themes, 800 x 800 CSS px at 2x = 1600 x 1600.
  const p = await page({ width: 800, height: 800 }, 2);
  for (const theme of ['ink', 'paper']) {
    for (const [n, id] of [['001', 'unbound'], ['002', 'granted'], ['003', 'shared'], ['004', 'running']]) {
      await p.goto(url(`field/reference.html?still=${id}&theme=${theme}&t=6`));
      await p.waitForSelector('body[data-ready]');
      await png(await p.screenshot(), `field/stills/${n}-${id}-${theme}@2x.png`, { palette: true });
    }
  }
  await p.close();
}

// ---------------------------------------------------------------------------
if (want('routes')) {
  const p = await page({ width: 1440, height: 900 });
  await p.goto(url('routes/index.html'));
  await ready(p);
  await p.waitForTimeout(400);
  await png(await p.screenshot({ fullPage: true }), 'routes/routes.png', { palette: true });
  await p.close();
}

// ---------------------------------------------------------------------------
if (want('previews')) {
  // Contact sheets for the guidelines page: all twelve slides, and the first page of each document.
  const p = await page({ width: 1600, height: 900 });
  await p.goto(url('slides/index.html'));
  await ready(p);
  const shots = [];
  for (const el of await p.$$('.slide')) shots.push(await sharp(await el.screenshot()).resize(400, 225).toBuffer());
  const W = 4 * 400 + 3 * 8, H = 3 * 225 + 2 * 8;
  await png(await sharp({ create: { width: W, height: H, channels: 3, background: '#2a2d31' } })
    .composite(shots.map((b, i) => ({ input: b, left: (i % 4) * 408, top: Math.floor(i / 4) * 233 }))).png().toBuffer(), 'slides/preview.png', { palette: true });
  await p.close();

  const d = await page({ width: 900, height: 1200 });
  const pages = [];
  await d.goto(url('documents/proposal.html')); await ready(d);
  const doc = await d.$('.doc'); const box = await doc.boundingBox();
  pages.push(await d.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: box.width * 297 / 210 } }));
  await d.goto(url('documents/letter.html')); await ready(d);
  pages.push(await (await d.$('.sheet')).screenshot());
  const scaled = await Promise.all(pages.map((b) => sharp(b).resize({ height: 1000 }).toBuffer({ resolveWithObject: true })));
  let x = 0; const parts = [];
  for (const s of scaled) { parts.push({ input: s.data, left: x, top: 0 }); x += s.info.width + 16; }
  await png(await sharp({ create: { width: x - 16, height: 1000, channels: 3, background: '#d4d1ca' } }).composite(parts).png().toBuffer(), 'documents/preview.png', { palette: true });
  await d.close();
}

// ---------------------------------------------------------------------------
if (want('print')) {
  // PDF exports of the print templates, so they can be checked and shared without a browser.
  const p = await page({ width: 1280, height: 800 });
  for (const [src, out] of [
    ['slides/index.html', 'slides/slides.pdf'],
    ['documents/proposal.html', 'documents/proposal.pdf'],
    ['documents/letter.html', 'documents/letter.pdf'],
  ]) {
    await p.goto(url(src));
    await ready(p);
    await p.waitForTimeout(400);
    await p.pdf({ path: join(BRAND, out), preferCSSPageSize: true, printBackground: true });
    console.log(out.padEnd(44), (statSync(join(BRAND, out)).size / 1024).toFixed(1), 'KB');
  }
  await p.close();
}

await browser.close();
