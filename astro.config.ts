import { defineConfig, envField, fontProviders } from 'astro/config';
import cloudflareHeaders from './integrations/cloudflare-headers';
import glsl from './integrations/glsl';

// Font subsets (scripts/subset-font.sh) cover BASIC; the full brand files cover REST. No overlap, so a
// page that only uses BASIC characters never downloads the full files.
const BASIC: [string, ...string[]] = ['U+0020-007E', 'U+00A0', 'U+00A3', 'U+00A9', 'U+00B7', 'U+00D7', 'U+2013-2014', 'U+2018-201D', 'U+2022', 'U+2026', 'U+20AC'];
const REST: [string, ...string[]] = ['U+00A1-00A2', 'U+00A4-00A8', 'U+00AA-00B6', 'U+00B8-00D6', 'U+00D8-024F', 'U+02C6-02DC', 'U+0300-036F', 'U+2010-2012', 'U+2015-2017', 'U+201E-2021', 'U+2030-203A', 'U+2122', 'U+2190-2193', 'U+2212'];

// One build, any host: static output, no adapter. Host-specific files are additions to dist/.
export default defineConfig({
  site: 'https://relativistic.co.uk',
  output: 'static',
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
    // One small stylesheet, inlined: no render-blocking request.
    inlineStylesheets: 'always',
  },
  compressHTML: true,
  devToolbar: { enabled: false },

  // Optional sections are deploy settings, not code changes. All default to off.
  env: {
    schema: {
      SHOW_TEAM: envField.boolean({ context: 'server', access: 'public', default: false }),
      SHOW_MODELS: envField.boolean({ context: 'server', access: 'public', default: false }),
      SHOW_SPONSORSHIP: envField.boolean({ context: 'server', access: 'public', default: false }),
      // Review deployments must never be indexed: adds a robots meta tag here and X-Robots-Tag in _headers.
      REVIEW_BUILD: envField.boolean({ context: 'server', access: 'public', default: false }),
      // Where the build is going. On Cloudflare the interest form posts to the site's Worker
      // (worker/index.ts); on GitHub Pages, which has no server, it stays a mailto: form.
      DEPLOY_TARGET: envField.enum({ context: 'server', access: 'public', values: ['pages', 'cloudflare'], default: 'pages' }),
      // Where a preview build is served, so /llms.txt points agents there rather than at production.
      PREVIEW_URL: envField.string({ context: 'server', access: 'public', optional: true }),
    },
  },

  // Self-hosted brand fonts. Headings use the normal-width Instrument Sans: the width-axis file (57 KB)
  // would exceed the 45 KB critical-path budget on its own. Only the Instrument Sans subset is preloaded.
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Instrument Sans',
      cssVariable: '--font-instrument',
      fallbacks: ['ui-sans-serif', 'system-ui', 'sans-serif'],
      options: {
        variants: [
          {
            src: ['./src/assets/fonts/instrument-sans-wght-basic.woff2'],
            weight: '400 700',
            style: 'normal',
            unicodeRange: BASIC,
          },
          {
            src: ['./brand/fonts/instrument-sans-wght.woff2'],
            weight: '400 700',
            style: 'normal',
            unicodeRange: REST,
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'Commit Mono',
      cssVariable: '--font-commit',
      fallbacks: ['ui-monospace', 'monospace'],
      options: {
        variants: [
          { src: ['./src/assets/fonts/commit-mono-400-basic.woff2'], weight: 400, style: 'normal', unicodeRange: BASIC },
          { src: ['./brand/fonts/commit-mono-400.woff2'], weight: 400, style: 'normal', unicodeRange: REST },
        ],
      },
    },
  ],

  security: {
    // Astro hashes every inline script and style into a <meta> policy. It works on both hosts.
    // frame-ancestors is ignored in <meta>, so Workers sends it as a header (see _headers).
    csp: {
      directives: [
        "default-src 'none'",
        "img-src 'self'",
        "font-src 'self'",
        // Same-origin fetches only: the interest form on Cloudflare, and Lighthouse reading robots.txt.
        "connect-src 'self'",
        "base-uri 'none'",
        // The interest form without JavaScript: on Cloudflare it posts to the site's own Worker; on
        // GitHub Pages it hands its fields to the visitor's email app.
        process.env['DEPLOY_TARGET'] === 'cloudflare' ? "form-action 'self'" : 'form-action mailto:',
      ],
    },
  },

  integrations: [cloudflareHeaders()],
  vite: {
    plugins: [glsl()],
    // The field renders in a module worker; it needs the same GLSL import.
    worker: { format: 'es', plugins: () => [glsl()] },
  },
});
