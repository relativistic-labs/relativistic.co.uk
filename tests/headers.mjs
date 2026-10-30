#!/usr/bin/env node
/**
 * Checks dist/_headers after a Cloudflare build (pnpm build:cloudflare, or build:review with --review):
 * every security header, the immutable cache rule for /_astro/*, and X-Robots-Tag: noindex in review
 * builds only. GitHub Pages builds must have no _headers at all (pass --pages).
 */
import { existsSync, readFileSync } from 'node:fs';

const file = new URL('../dist/_headers', import.meta.url);
const mode = process.argv.includes('--review') ? 'review' : process.argv.includes('--pages') ? 'pages' : 'production';
const fail = (msg) => {
  console.error(`FAIL  ${msg}`);
  process.exit(1);
};

if (mode === 'pages') {
  if (existsSync(file)) fail('dist/_headers exists in a GitHub Pages build; Pages would publish it');
  console.log('ok    no _headers in the GitHub Pages build');
  process.exit(0);
}
if (!existsSync(file)) fail('dist/_headers is missing: build with DEPLOY_TARGET=cloudflare');
const text = readFileSync(file, 'utf8');
const required = [
  "Content-Security-Policy: frame-ancestors 'none'",
  'Strict-Transport-Security: max-age=63072000; includeSubDomains',
  'X-Content-Type-Options: nosniff',
  'Referrer-Policy: strict-origin-when-cross-origin',
  'Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()',
  'Cross-Origin-Opener-Policy: same-origin',
  'Cross-Origin-Resource-Policy: same-origin',
  'Cache-Control: public, max-age=31536000, immutable',
];
for (const line of required) if (!text.includes(line)) fail(`_headers lacks "${line}"`);
const noindex = text.includes('X-Robots-Tag: noindex');
if (mode === 'review' && !noindex) fail('a review build must send X-Robots-Tag: noindex');
if (mode === 'production' && noindex) fail('a production build must not send X-Robots-Tag: noindex');
console.log(`ok    _headers for a ${mode} build: ${required.length} rules${noindex ? ', plus noindex' : ''}`);
