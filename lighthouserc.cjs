// Lighthouse CI, mobile (Lighthouse's default emulation). Targets from the technical plan:
// 100 for accessibility, best practices and SEO; performance >= 98 (CI threshold 95 for lab noise);
// LCP <= 1.2 s; CLS 0; TBT 0 ms.
module.exports = {
  ci: {
    collect: {
      // LHCI's own static server compresses responses, as GitHub Pages and Workers do.
      staticDistDir: './dist',
      url: ['http://localhost/', 'http://localhost/privacy/'],
      numberOfRuns: 3,
      chromePath: process.env.CHROME_PATH || undefined,
      settings: { chromeFlags: '--headless=new --no-sandbox --enable-unsafe-swiftshader' },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.95, aggregationMethod: 'median-run' }],
        'categories:accessibility': ['error', { minScore: 1 }],
        'categories:best-practices': ['error', { minScore: 1 }],
        'categories:seo': ['error', { minScore: 1 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 1200, aggregationMethod: 'median-run' }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0 }],
        'total-blocking-time': ['error', { maxNumericValue: 0, aggregationMethod: 'median-run' }],
      },
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci' },
  },
};
