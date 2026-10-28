import { expect, test } from '@playwright/test';
import { PAGES, scrollThrough, sectionsOn } from './helpers';

test('no requests to other origins, no console errors @both', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const foreign: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => {
    const url = r.url();
    if (!url.startsWith('data:') && new URL(url).origin !== origin) foreign.push(url);
  });
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  for (const path of PAGES) {
    await page.goto(path);
    await scrollThrough(page);
    await page.waitForTimeout(1500);
  }
  expect(foreign).toEqual([]);
  // The 404 page answers 404 by design; that one console error is expected.
  expect(errors.filter((e) => !/404/.test(e))).toEqual([]);
});

test('no cookies or storage before interaction @both', async ({ page, context }) => {
  await page.goto('/');
  await scrollThrough(page);
  await page.waitForTimeout(1500);
  expect(await context.cookies()).toEqual([]);
  const storage = await page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    idb: (await indexedDB.databases()).length,
  }));
  expect(storage).toEqual({ local: 0, session: 0, idb: 0 });
});

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

  test('clicking the field pauses it, and the choice is remembered only once made', async ({ page }) => {
    await page.goto('/');
    const field = page.locator('[data-field]');
    await expect(field).toHaveAttribute('data-running', 'true', { timeout: 10_000 });
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    await page.getByRole('button', { name: 'Pause background animation' }).click();
    await expect(field).toHaveAttribute('aria-pressed', 'true');
    await expect(field).toHaveAttribute('data-running', 'false');
    await expect(page.getByRole('button', { name: 'Play background animation' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('relativistic-motion'))).toBe('paused');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Play background animation' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-field]')).toHaveClass(/is-drawn/, { timeout: 10_000 });
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

  test('reduced motion: one still frame of the document, no loop, nothing to pause', async ({ page }) => {
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
});

test.describe('founder portraits', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    test.skip(!(await sectionsOn(page)).team, 'team section is off in this build');
  });

  test('the real photo is the only portrait <img> in the HTML', async ({ request }) => {
    const html = await (await request.get('/')).text();
    const imgs = (html.match(/<img\b[^>]*>/g) ?? []).filter((i) => !i.includes('lockup.svg'));
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toContain('alt="Harry Robbins"');
    expect(imgs[0]).toContain('harry-observed');
    expect(html).not.toMatch(/<(img|source)\b[^>]*harry-rendered/);
  });

  test('plays once and ends on the real photo', async ({ page }) => {
    const card = page.locator('.portrait[data-rendered-srcset]');
    await card.scrollIntoViewIfNeeded();
    await expect(card).toHaveClass(/is-rendered/, { timeout: 10_000 });
    await expect(card.locator('.portrait__state')).toHaveText('Rendered / AI');
    await expect(card).toHaveClass(/is-observed/, { timeout: 10_000 });
    await expect(card.locator('.shift, .portrait__rendered')).toHaveCount(0);
    await expect(card.locator('img[alt="Harry Robbins"]')).toBeVisible();
    await expect(card.locator('.portrait__state')).toHaveText('The real photo');
  });

  test('reduced motion never requests the polished layer', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (r) => r.url().includes('harry-rendered') && requested.push(r.url()));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await scrollThrough(page);
    await page.locator('#team').scrollIntoViewIfNeeded();
    await page.waitForTimeout(3000);
    expect(requested).toEqual([]);
    await expect(page.locator('.portrait__rendered, .shift')).toHaveCount(0);
  });

  test('every other founder is marked PORTRAIT TO COME, with no image', async ({ page }) => {
    await expect(page.locator('.portrait--pending')).toHaveCount(4);
    await expect(page.locator('.portrait--pending img')).toHaveCount(0);
    for (const label of await page.locator('.portrait--pending .portrait__state').allInnerTexts()) {
      expect(label).toBe('PORTRAIT TO COME');
    }
  });
});
