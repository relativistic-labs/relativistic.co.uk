import { defineConfig, envField, fontProviders } from 'astro/config';
import cloudflareHeaders from './integrations/cloudflare-headers';
import glsl from './integrations/glsl';

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
    },
  },

  // Self-hosted brand fonts. Only the normal-width Instrument Sans file is preloaded (30 KB);
  // the width-axis file (57 KB) would exceed the critical-path budget on its own.
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Instrument Sans',
      cssVariable: '--font-instrument',
      fallbacks: ['ui-sans-serif', 'system-ui', 'sans-serif'],
      options: {
        variants: [{ src: ['./brand/fonts/instrument-sans-wght.woff2'], weight: '400 700', style: 'normal' }],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'Commit Mono',
      cssVariable: '--font-commit',
      fallbacks: ['ui-monospace', 'monospace'],
      options: {
        variants: [{ src: ['./brand/fonts/commit-mono-400.woff2'], weight: 400, style: 'normal' }],
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
        "base-uri 'none'",
        "form-action 'none'",
      ],
    },
  },

  integrations: [cloudflareHeaders()],
  vite: { plugins: [glsl()] },
});
