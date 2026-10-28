#!/usr/bin/env node
/**
 * Size budgets, measured on dist/ as Brotli-compressed bytes (technical plan, quality targets).
 *
 *   critical path   HTML with its inlined CSS, plus preloaded fonts      ≤ 45 KB
 *   JavaScript      module scripts and inline scripts, home page only     ≤ 12 KB
 *   the field       its page script plus its worker (or main-thread core) ≤ 9 KB
 *   whole page      everything the home page can load, worst case:        ≤ 450 KB
 *                   every font, the largest portrait candidate, icons
 *                   ... plus the largest polished-portrait candidate      ≤ 600 KB
 *
 * Images are counted at their largest srcset candidate, so the whole-page figure is an upper bound.
 * Also warns (without failing) when security.txt is near expiry.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';

const DIST = new URL('../dist/', import.meta.url).pathname;
const KB = 1000;
const LIMITS = { critical: 45 * KB, js: 12 * KB, field: 9 * KB, page: 450 * KB, pageWithPolished: 600 * KB };

const br = (buf) => brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
const file = (url) => readFileSync(join(DIST, decodeURIComponent(url.split(/[?#]/)[0])));
const size = (url) => br(file(url));
const fmt = (n) => `${(n / KB).toFixed(1)} KB`;

const html = readFileSync(join(DIST, 'index.html'));
const text = html.toString();
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const tags = (name) => text.match(new RegExp(`<${name}\\b[^>]*>`, 'g')) ?? [];

// Critical path: the document and the fonts it preloads.
const preloads = tags('link').filter((t) => attr(t, 'rel') === 'preload' && attr(t, 'as') === 'font').map((t) => attr(t, 'href'));
const critical = br(html) + preloads.reduce((n, u) => n + size(u), 0);

// JavaScript: external modules plus executable inline scripts (JSON-LD is data, not script), and the
// chunks they load. The field renders in a worker, or (where OffscreenCanvas is missing) imports the
// same renderer on the main thread: a browser loads one or the other, so the larger path is counted.
const loaded = new Set();
const chunk = (url) => {
  if (loaded.has(url)) return 0;
  loaded.add(url);
  const body = file(url).toString();
  let total = size(url);
  let alternative = 0;
  for (const m of body.matchAll(/(import\(|new URL\()?\s*["'`]((?:\.{1,2}\/|\/_astro\/)[\w.\-\/]+\.js)["'`]/g)) {
    const n = chunk(new URL(m[2], `http://site${url}`).pathname);
    if (m[1]) alternative = Math.max(alternative, n);
    else total += n;
  }
  return total + alternative;
};
let js = 0;
let field = 0;
for (const m of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  const [, attrs, body] = m;
  if (/type="application\/ld\+json"/.test(attrs)) continue;
  const src = attrs.match(/src="([^"]*)"/)?.[1];
  if (src) {
    const n = chunk(src);
    js += n;
    if (/Field\.astro/.test(src)) field += n;
  }
  else if (body.trim()) {
    js += br(Buffer.from(body));
    for (const i of body.matchAll(/["'`](\/_astro\/[\w.\-]+\.js)["'`]/g)) js += chunk(i[1]);
  }
}

// Whole page, worst case.
const largest = (srcset) =>
  (srcset ?? '')
    .split(',')
    .map((c) => c.trim().split(/\s+/))
    .filter(([u]) => u)
    .sort((a, b) => parseInt(b[1] ?? '0') - parseInt(a[1] ?? '0'))[0]?.[0];
const fonts = [...text.matchAll(/url\(["']?([^"')]+\.woff2)["']?\)/g)].map((m) => m[1]);
const portraits = new Set();
for (const t of tags('source')) if (attr(t, 'type') === 'image/avif') portraits.add(largest(attr(t, 'srcset')));
const polished = new Set(tags('div').map((t) => largest(attr(t, 'data-rendered-srcset'))).filter(Boolean));
const icons = ['/favicon.ico', '/icon.svg'];
const page =
  critical +
  js +
  [...new Set(fonts)].filter((u) => !preloads.includes(u)).reduce((n, u) => n + size(u), 0) +
  [...portraits].reduce((n, u) => n + size(u), 0) +
  icons.reduce((n, u) => n + size(u), 0);
const pageWithPolished = page + [...polished].reduce((n, u) => n + size(u), 0);

console.log(`JavaScript files: ${[...loaded].map((u) => u.split('/').pop()).join(', ')}`);
const rows = [
  ['Critical path (HTML + inlined CSS + preloaded font)', critical, LIMITS.critical],
  ['JavaScript, home page', js, LIMITS.js],
  ['The field (page script and worker)', field, LIMITS.field],
  ['Whole page, no polished layer (upper bound)', page, LIMITS.page],
  ['Whole page, with polished layer (upper bound)', pageWithPolished, LIMITS.pageWithPolished],
];
let failed = false;
for (const [label, value, limit] of rows) {
  const ok = value <= limit;
  failed ||= !ok;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(54)} ${fmt(value).padStart(9)}  / ${fmt(limit)}`);
}

// Warnings, not failures.
const warn = (msg) => console.log(process.env.GITHUB_ACTIONS ? `::warning::${msg}` : `warn  ${msg}`);
const securityTxt = join(DIST, '.well-known/security.txt');
if (existsSync(securityTxt)) {
  const expires = readFileSync(securityTxt, 'utf8').match(/^Expires:\s*(.+)$/m)?.[1];
  const days = expires ? (Date.parse(expires) - Date.now()) / 864e5 : -1;
  if (days < 30) warn(`security.txt expires in ${Math.floor(days)} days; renew it.`);
}
process.exit(failed ? 1 : 0);
