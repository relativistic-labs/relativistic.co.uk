// Finishes the SVGs that d2 writes, for render.sh. Not meant to be run on its own.
//
//   node lib/finish.mjs <out-dir> <file.d2> [<file.d2> ...]
//
// For each out/<name>.svg:
//   1. Theme. brand.d2 styles with the paper hex values (D2 accepts nothing else in a style),
//      so add their ink values to D2's own prefers-color-scheme: dark block. <name>.svg then
//      follows the reader's setting in both D2's theme colours and the brand's classes.
//   2. Forced themes. <name>-paper.svg and <name>-ink.svg ignore the reader's setting, for slides,
//      documents and anything printed.
//   3. Checks. Every font size is at least 12 px, and no colour is outside the palette.
//   4. PNGs. <name>-paper@2x.png and <name>-ink@2x.png, rendered by headless Chromium from the
//      forced SVGs, so a PNG is exactly what a browser shows.
// Then, when render.sh renders everything (SHEETS=1), contact-paper.png and contact-ink.png:
// every file from templates/ on one sheet.
//
// Chromium comes from Playwright (resolved from this repository's node_modules, or the working
// directory). Set CHROME to a Chromium binary if Playwright has not downloaded its own.

import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const D2DIR = resolve(HERE, '..');
const [outDir, ...sources] = process.argv.slice(2);
if (!outDir || sources.length === 0) {
  console.error('usage: node lib/finish.mjs <out-dir> <file.d2> ...');
  process.exit(2);
}

// The palette (brand/tokens.json). Paper values are what brand.d2 writes; ink is what they become.
const PALETTE = {
  bg: ['#ffffff', '#0b0f14'],
  raised: ['#f4f3f1', '#13181e'],
  rule: ['#b4b8bd', '#2b3138'],
  text: ['#151a21', '#f2f0ec'],
  muted: ['#555b64', '#a5abb4'],
  accent: ['#0c6c68', '#59d4cd'],
  signal: ['#bb4717', '#f28c5c'],
};
const ALLOWED = new Set(Object.values(PALETTE).flat());
const DARK = /@media screen and \(prefers-color-scheme:dark\)\{/g;

function inkRules(scope) {
  let css = '';
  for (const [paper, ink] of Object.values(PALETTE)) {
    for (const prop of ['fill', 'stroke']) css += `\n\t\t.${scope} [${prop}="${paper}" i]{${prop}:${ink};}`;
  }
  return css;
}

function theme(svg) {
  const scope = svg.match(/class="(d2-\d+) d2-svg"/)?.[1];
  if (!scope) throw new Error('not a D2 SVG (no d2-svg scope class)');
  if (svg.includes('/* brand: ink values */')) return svg; // already finished
  const m = DARK.exec(svg); DARK.lastIndex = 0;
  if (!m) throw new Error('no dark-theme block: is dark-theme-id set in brand.d2?');
  const at = m.index + m[0].length;
  svg = svg.slice(0, at) + '\n\t\t/* brand: ink values */' + inkRules(scope) + svg.slice(at);
  // D2 takes whole-pixel stroke widths only. The brief's accent and signal paths are 1.5 px,
  // so brand.d2 asks for 2 and this draws them at 1.5 (arrowheads keep their 2 px size).
  const heavy = new RegExp(`<[a-z]+ [^>]*stroke="(?:${PALETTE.accent[0]}|${PALETTE.signal[0]})"[^>]*>`, 'gi');
  svg = svg.replace(heavy, (tag) => tag.replace(/stroke-width:2;/g, 'stroke-width:1.5;').replace(/stroke-width="2"/g, 'stroke-width="1.5"'));
  // sql_table draws its row rules at a fixed 2 px; the brief's hairlines are 1 px.
  svg = svg.replace(/(<line [^>]*style="stroke-width:)2(")/g, '$11$2');
  // Sequence lifelines are dashed 2 px edges in the actor's stroke colour; draw them as hairlines.
  return svg.replace(/(<path [^>]*class="connection" style="stroke-width:)2;stroke-dasharray:[\d.,]+;/g, '$11;stroke-dasharray:4,4;');
}
const forcePaper = (svg) => svg.replace(DARK, '@media not all{');
const forceInk = (svg) => svg.replace(DARK, '@media all{');

function check(name, svg) {
  const problems = [];
  const sizes = [...svg.matchAll(/font-size(?::\s*|=")([\d.]+)/g)].map((m) => +m[1]);
  const small = sizes.filter((s) => s < 12);
  if (small.length) problems.push(`font sizes below 12 px: ${[...new Set(small)].join(', ')}`);
  const colours = new Set([...svg.matchAll(/(?:fill|stroke|color)(?:="|:\s*)(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\b/g)].map((m) => m[1].toLowerCase()));
  const stray = [...colours].filter((c) => !ALLOWED.has(c));
  if (stray.length) problems.push(`colours outside the palette: ${stray.join(', ')}`);
  for (const p of problems) console.error(`  warning: ${name}: ${p}`);
  return problems.length === 0;
}

// ---------------------------------------------------------------------------------------------
const items = [];
for (const src of sources) {
  const name = basename(src, '.d2');
  const file = join(outDir, `${name}.svg`);
  const svg = theme(readFileSync(file, 'utf8'));
  writeFileSync(file, svg);
  writeFileSync(join(outDir, `${name}-paper.svg`), forcePaper(svg));
  writeFileSync(join(outDir, `${name}-ink.svg`), forceInk(svg));
  check(name, svg);
  const text = readFileSync(src, 'utf8');
  const engine = /shape:\s*sequence_diagram/.test(text) ? 'sequence' : (text.match(/layout-engine:\s*([a-z]+)/)?.[1] ?? 'dagre');
  const width = +svg.match(/<svg [^>]*?width="([\d.]+)"/)[1];
  const height = +svg.match(/<svg [^>]*?height="([\d.]+)"/)[1];
  items.push({ name, src, engine, width, height, template: src.split('/').includes('templates') });
}

// ---------------------------------------------------------------------------------------------
const require = (() => {
  for (const base of [process.cwd(), resolve(D2DIR, '../../..')]) {
    const r = createRequire(join(base, 'noop.js'));
    for (const m of ['playwright', '@playwright/test']) {
      try { r.resolve(m); return () => r(m); } catch {}
    }
  }
  return null;
})();
if (!require) {
  console.error('  Playwright not found: SVGs written, PNGs skipped. Run from a folder with playwright installed.');
  process.exit(0);
}
const { chromium } = require();
const cached = join(homedir(), '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome');
const executablePath = process.env.CHROME || (existsSync(cached) ? cached : undefined);
const browser = await chromium.launch({ headless: true, executablePath });

for (const it of items) {
  for (const t of ['paper', 'ink']) {
    const page = await browser.newPage({
      viewport: { width: Math.ceil(it.width), height: Math.ceil(it.height) },
      deviceScaleFactor: 2,
      colorScheme: t === 'ink' ? 'dark' : 'light',
    });
    await page.goto(pathToFileURL(resolve(outDir, `${it.name}-${t}.svg`)).href);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(outDir, `${it.name}-${t}@2x.png`), clip: { x: 0, y: 0, width: Math.ceil(it.width), height: Math.ceil(it.height) } });
    await page.close();
  }
  console.log(`  ${it.name.padEnd(16)} ${it.engine.padEnd(6)} ${Math.round(it.width)} x ${Math.round(it.height)}`);
}

// Contact sheets: the templates in their usual order, two to a row.
const ORDER = ['access', 'architecture', 'flow', 'sequence', 'options', 'hierarchy', 'timeline', 'data-model'];
const rank = (i) => (ORDER.indexOf(i.name) + 1) || 99;
const sheet = process.env.SHEETS === '1' ? items.filter((i) => i.template).sort((a, b) => rank(a) - rank(b)) : [];
if (sheet.length) {
  const fonts = pathToFileURL(resolve(D2DIR, 'fonts')).href;
  for (const t of ['paper', 'ink']) {
    const [bg, raised, rule, text, muted] = ['bg', 'raised', 'rule', 'text', 'muted'].map((k) => PALETTE[k][t === 'paper' ? 0 : 1]);
    const cells = sheet.map((i, n) => `<figure><div class="img"><img src="${pathToFileURL(resolve(outDir, `${i.name}-${t}.svg`)).href}"></div>
      <figcaption><span class="n"><b>${String(n + 1).padStart(2, '0')}</b> / ${i.name}</span><span>${i.engine} · ${Math.round(i.width)} × ${Math.round(i.height)}</span></figcaption></figure>`).join('');
    const html = `<!doctype html><meta charset="utf-8"><style>
      @font-face { font-family: M; src: url("${fonts}/CommitMono-400-Regular.ttf"); }
      body { margin: 0; padding: 40px; background: ${raised}; font: 14px/1.4 M, monospace; color: ${text}; width: 1840px; box-sizing: border-box; }
      h1 { font-size: 14px; font-weight: 400; letter-spacing: .06em; text-transform: uppercase; color: ${muted}; margin: 0 0 24px; }
      main { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
      figure { margin: 0; background: ${bg}; outline: 1px solid ${rule}; }
      .img { height: 560px; display: grid; place-items: center; padding: 16px; }
      .img img { max-width: 848px; max-height: 528px; }
      figcaption { border-top: 1px solid ${rule}; padding: 10px 16px; display: flex; justify-content: space-between; }
      figcaption b { color: ${PALETTE.accent[t === 'paper' ? 0 : 1]}; font-weight: 400; }
      figcaption span { color: ${muted}; }
      figcaption .n { color: ${text}; }
    </style><h1>Relativistic · D2 templates · ${t}</h1><main>${cells}</main>`;
    const tmp = join(outDir, `.contact-${t}.html`);
    writeFileSync(tmp, html);
    const page = await browser.newPage({ viewport: { width: 1840, height: 800 }, deviceScaleFactor: 1, colorScheme: t === 'ink' ? 'dark' : 'light' });
    await page.goto(pathToFileURL(resolve(tmp)).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(outDir, `contact-${t}.png`), fullPage: true });
    await page.close();
    rmSync(tmp);
  }
  console.log(`  contact-paper.png, contact-ink.png: ${sheet.length} templates`);
}
await browser.close();
