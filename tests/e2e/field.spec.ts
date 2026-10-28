import { expect, test } from '@playwright/test';

// The background field: a murmuration in a worker, behind a toggle button (WCAG 2.2.2).
const NAME = 'Pause background animation';

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

  test('makes no long tasks', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { longTasks: number[] }).longTasks = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) (window as unknown as { longTasks: number[] }).longTasks.push(e.duration);
      }).observe({ type: 'longtask', buffered: true });
    });
    await page.goto('/');
    await expect(page.locator('[data-field]')).toHaveAttribute('data-running', 'true', { timeout: 10_000 });
    await page.waitForTimeout(3000);
    const tasks = await page.evaluate(() => (window as unknown as { longTasks: number[] }).longTasks);
    expect(tasks, `long tasks (ms): ${tasks.join(', ')}`).toEqual([]);
  });

  test('without OffscreenCanvas it runs on the main thread, still without long tasks', async ({ page }) => {
    await page.addInitScript(() => {
      delete (HTMLCanvasElement.prototype as Partial<HTMLCanvasElement>).transferControlToOffscreen;
      (window as unknown as { longTasks: number[] }).longTasks = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) (window as unknown as { longTasks: number[] }).longTasks.push(e.duration);
      }).observe({ type: 'longtask', buffered: true });
    });
    await page.goto('/');
    await expect(page.locator('[data-field]')).toHaveClass(/is-drawn/, { timeout: 10_000 });
    await page.waitForTimeout(2000);
    const tasks = await page.evaluate(() => (window as unknown as { longTasks: number[] }).longTasks);
    expect(tasks, `long tasks (ms): ${tasks.join(', ')}`).toEqual([]);
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
