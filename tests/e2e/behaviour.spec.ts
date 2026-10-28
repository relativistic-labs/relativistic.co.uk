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
    await expect(card.locator('.portrait__state')).toHaveText('As observed');
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
