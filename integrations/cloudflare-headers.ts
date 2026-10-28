import { writeFile } from 'node:fs/promises';
import type { AstroIntegration } from 'astro';

/**
 * Response headers for Cloudflare Workers static assets.
 *
 * Workers parses `_headers` and doesn't serve it, but GitHub Pages would publish it as an
 * ordinary file. So it is written into dist/ only when DEPLOY_TARGET=cloudflare.
 * Review builds (REVIEW_BUILD=true) also send X-Robots-Tag: noindex on every path.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': "frame-ancestors 'none'",
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

export const IMMUTABLE = 'public, max-age=31536000, immutable';

export function headersFile(review = false): string {
  const headers = review ? { ...SECURITY_HEADERS, 'X-Robots-Tag': 'noindex' } : SECURITY_HEADERS;
  const all = Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`);
  return ['/*', ...all, '/_astro/*', `  Cache-Control: ${IMMUTABLE}`, ''].join('\n');
}

export default function cloudflareHeaders(): AstroIntegration {
  return {
    name: 'cloudflare-headers',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        if (process.env.DEPLOY_TARGET !== 'cloudflare') return;
        const review = process.env.REVIEW_BUILD === 'true';
        await writeFile(new URL('_headers', dir), headersFile(review));
        logger.info(`wrote _headers for Cloudflare Workers${review ? ' (review build: noindex)' : ''}`);
      },
    },
  };
}
