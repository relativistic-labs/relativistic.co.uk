#!/usr/bin/env node
/**
 * Offline check of internal links and anchors in dist/, for local runs. CI also runs lychee
 * (--offline --include-fragments) on both builds; this is the same check without the binary.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (name.endsWith('.html')) yield p;
  }
}

const ids = (html) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
function target(path) {
  const clean = decodeURIComponent(path);
  for (const candidate of [clean, join(clean, 'index.html'), `${clean}.html`]) {
    const full = join(DIST, candidate);
    if (existsSync(full) && statSync(full).isFile()) return full;
  }
  return null;
}

const broken = [];
let checked = 0;
for (const page of walk(DIST)) {
  const html = readFileSync(page, 'utf8');
  const here = '/' + relative(DIST, page).replace(/index\.html$/, '');
  for (const m of html.matchAll(/\s(?:href|src|srcset)="([^"]+)"/g)) {
    for (const raw of m[1].split(',').map((s) => s.trim().split(/\s+/)[0])) {
      if (!raw || /^(https?:|mailto:|data:|tel:)/.test(raw)) continue;
      checked++;
      const url = new URL(raw, `http://site${here}`);
      const file = url.pathname === here ? page : target(url.pathname);
      if (!file) broken.push(`${here}: ${raw} (missing file)`);
      else if (url.hash && file.endsWith('.html') && !ids(readFileSync(file, 'utf8')).has(url.hash.slice(1))) {
        broken.push(`${here}: ${raw} (missing anchor)`);
      }
    }
  }
}
console.log(`${checked} internal links and anchors checked, ${broken.length} broken`);
for (const b of broken) console.log(`  ${b}`);
process.exit(broken.length ? 1 : 0);
