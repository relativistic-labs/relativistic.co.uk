import { expect, test, type Page } from '@playwright/test';

// The background field: a murmuration in a worker, behind a toggle button (WCAG 2.2.2).
const NAME = 'Pause background animation';

// Long tasks caused by script, from Long Animation Frame timing: any one script (a callback, an
// event handler, a module's evaluation) that ran 50 ms or more. Plain long tasks would also count
// the browser's own first style, layout and paint of the page, which takes 50 to 80 ms on a busy
// machine with no script running, and made these tests flaky.
function recordLongScripts() {
  const w = window as unknown as { longScripts: string[] };
  w.longScripts = [];
  new PerformanceObserver((list) => {
    type Frame = { scripts: { invoker: string; sourceURL: string; duration: number }[] };
    for (const frame of list.getEntries() as unknown as Frame[]) {
      for (const s of frame.scripts) {
        if (s.duration >= 50) w.longScripts.push(`${s.invoker} ${s.sourceURL.split('/').pop()} ${Math.round(s.duration)}`);
      }
    }
  }).observe({ type: 'long-animation-frame', buffered: true });
}
const longScripts = (page: Page) => page.evaluate(() => (window as unknown as { longScripts: string[] }).longScripts);

test.describe('the field', () => {
  test('runs when visible, stops off-screen and in a hidden tab', async ({ page }) => {
    await page.goto('/');
    const field = page.locator('[data-field]');
    await expect(field).toHaveAttribute('data-running', 'true', { timeout: 10_000 });
    await expect(field).toHaveClass(/is-drawn/);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(field).toHaveAttribute('data-running', 'false');
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(field).toHaveAttribute('data-running', 'true');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(field).toHaveAttribute('data-running', 'false');
  });

  test('is one toggle button with a fixed name, so it is announced once', async ({ page }) => {
    await page.goto('/');
    const field = page.locator('[data-field]');
    await expect(field).toHaveAttribute('data-running', 'true', { timeout: 10_000 });
    await expect(page.getByRole('button', { name: NAME, exact: true, pressed: false })).toBeVisible();
    await expect(field.locator('canvas')).toHaveAttribute('aria-hidden', 'true');
    await field.click();
    // The state changes; the name doesn't.
    await expect(page.getByRole('button', { name: NAME, exact: true, pressed: true })).toBeVisible();
  });

  test('clicking the field pauses it, and the choice is remembered only once made', async ({ page }) => {
    await page.goto('/');
    const field = page.locator('[data-field]');
    await expect(field).toHaveAttribute('data-running', 'true', { timeout: 10_000 });
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    await page.getByRole('button', { name: NAME }).click();
    await expect(field).toHaveAttribute('aria-pressed', 'true');
    await expect(field).toHaveAttribute('data-running', 'false');
    expect(await page.evaluate(() => localStorage.getItem('relativistic-motion'))).toBe('paused');
    await page.reload();
    await expect(page.locator('[data-field]')).toHaveClass(/is-drawn/, { timeout: 10_000 });
    await expect(page.getByRole('button', { name: NAME })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-field]')).not.toHaveAttribute('data-running', 'true');
  });

  test('the keyboard pauses and plays it too (WCAG 2.2.2)', async ({ page }) => {
    await page.goto('/');
    const field = page.locator('[data-field]');
    await expect(field).toHaveAttribute('data-running', 'true', { timeout: 10_000 });
    await field.focus();
    await page.keyboard.press('Space');
    await expect(field).toHaveAttribute('data-running', 'false');
    await page.keyboard.press('Enter');
    await expect(field).toHaveAttribute('data-running', 'true');
  });

  test.describe('timing', () => {
    // These measure wall-clock time under SwiftShader, which a busy machine stretches now and then
    // (about one run in 15 with three workers). A real regression fails every attempt.
    test.describe.configure({ retries: 2 });

    test('its scripts make no long tasks', async ({ page }) => {
      await page.addInitScript(recordLongScripts);
      await page.goto('/');
      await expect(page.locator('[data-field]')).toHaveAttribute('data-running', 'true', { timeout: 10_000 });
      await page.waitForTimeout(3000);
      const scripts = await longScripts(page);
      expect(scripts, `long scripts: ${scripts.join('; ')}`).toEqual([]);
    });

    test('without OffscreenCanvas it runs on the main thread in short steps', async ({ page }) => {
      await page.addInitScript(() => {
        delete (HTMLCanvasElement.prototype as Partial<HTMLCanvasElement>).transferControlToOffscreen;
      });
      await page.addInitScript(recordLongScripts);
      await page.goto('/');
      await expect(page.locator('[data-field]')).toHaveAttribute('data-running', 'true', { timeout: 10_000 });
      await expect(page.locator('[data-field]')).toHaveClass(/is-drawn/);
      await page.waitForTimeout(2000);
      // Creating the WebGL context is one call the page can't split; under SwiftShader it can take
      // about 50 ms. Everything else (linking, the flock's warm-up, every frame) runs in short steps,
      // though on a busy machine one SwiftShader frame can also pass 50 ms. Doing the warm-up or a
      // frame in one block would take well over 100 ms.
      const scripts = await longScripts(page);
      expect(scripts.length, `long scripts: ${scripts.join('; ')}`).toBeLessThanOrEqual(2);
      expect(scripts.filter((s) => Number(s.split(' ').pop()) > 100), `long scripts: ${scripts.join('; ')}`).toEqual([]);
    });
  });

  test('reduced motion: one still frame of the flock, no loop, nothing to pause', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const field = page.locator('[data-field]');
    await expect(field).toHaveClass(/is-drawn/, { timeout: 10_000 });
    await expect(field).toHaveAttribute('data-running', 'false');
    await expect(field).toBeDisabled();
    // Follows live changes to the setting.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(field).toHaveAttribute('data-running', 'true');
  });

  test('if the worker fails, the field turns off and gives its space back', async ({ page }) => {
    await page.route(/\/_astro\/worker-[^/]+\.js$/, (route) => route.fulfill({ status: 404, body: '' }));
    await page.goto('/');
    const field = page.locator('[data-field]');
    await expect(field).toHaveClass(/is-off/, { timeout: 10_000 });
    await expect(field).toBeHidden();
    expect(await field.boundingBox()).toBeNull();
    await expect(page.locator('h1')).toBeVisible();
  });

  test('without WebGL2 there is no field, and nothing else is lost', async ({ page }) => {
    await page.addInitScript(() => {
      delete (window as Partial<Window & typeof globalThis>).WebGL2RenderingContext;
    });
    await page.goto('/');
    const field = page.locator('[data-field]');
    await expect(field).toHaveClass(/is-off/, { timeout: 10_000 });
    await expect(field).toBeHidden();
    await expect(page.locator('h1')).toBeVisible();
  });
});

test.describe('the field on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('is a short band above the headline', async ({ page }) => {
    await page.goto('/');
    const field = page.locator('[data-field]');
    await expect(field).toHaveClass(/is-drawn/, { timeout: 10_000 });
    const box = (await field.boundingBox())!;
    const h1 = (await page.locator('h1').boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(170);
    expect(box.y + box.height).toBeLessThanOrEqual(h1.y);
  });
});
