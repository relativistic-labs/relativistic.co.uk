import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PREVIEW_PORT ?? 4330);

// Runs against `astro preview` of whatever is in dist/: the only place the CSP is live.
// --ignore-lock keeps it in the foreground (Astro 7 backgrounds preview when it detects an agent).
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 2,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    // Headless Chromium draws WebGL2 with SwiftShader, so the field is exercised for real.
    launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /layout\.spec/ },
    // A phone (390 × 844): the accessibility and layout checks again at phone width.
    {
      name: 'phone',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
      testMatch: /(accessibility|layout)\.spec/,
    },
  ],
  webServer: {
    command: `pnpm exec astro preview --port ${PORT} --host 127.0.0.1 --ignore-lock`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
