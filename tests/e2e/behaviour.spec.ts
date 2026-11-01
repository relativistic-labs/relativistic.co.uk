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
    await expect(card).toHaveClass(/is-observed/, { timeout: 10_000 });
    await expect(card.locator('.shift, .portrait__rendered')).toHaveCount(0);
    await expect(card.locator('img[alt="Harry Robbins"]')).toBeVisible();
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

  test('every other founder shows initials, with no image and no label', async ({ page }) => {
    await expect(page.locator('.portrait--pending')).toHaveCount(4);
    await expect(page.locator('.portrait--pending img')).toHaveCount(0);
    await expect(page.locator('.portrait--pending .portrait__monogram')).toHaveCount(4);
    await expect(page.locator('.portrait p')).toHaveCount(0);
  });
});

test.describe('register your interest', () => {
  test('each package action chooses its option and goes to the form @both', async ({ page }) => {
    await page.goto('/');
    for (const [name, index, value] of [
      ['Request a free trial', 0, 'A free trial of Shared'],
      ['Request a demo', 0, 'A demo of Managed'],
      ['Request a demo', 1, 'A demo of Enterprise'],
    ] as const) {
      await page.getByRole('link', { name }).nth(index).click();
      await expect(page.locator('input[name="interest"]:checked')).toHaveAttribute('value', value);
      await expect(page.locator('#interest-name')).toBeFocused();
      await expect(page).toHaveURL(/#interest$/);
    }
  });

  test('on GitHub Pages, sending writes an email for the visitor to send, and says so', async ({ page }) => {
    await page.goto('/');
    test.skip((await page.locator('#interest').getAttribute('data-send')) === 'worker', 'a Cloudflare build sends through the Worker');
    await page.getByRole('button', { name: 'Register your interest' }).click();
    // Required fields are checked first: nothing is written yet.
    await expect(page.getByRole('status')).toBeEmpty();
    await page.getByLabel('Your name').fill('Ada Lovelace');
    await page.getByLabel('Work email').fill('ada@example.org');
    await page.getByLabel('Organisation').fill('Analytical Engines');
    await page.getByLabel('A demo of Enterprise').check();
    await page.getByLabel('What would your people build?').fill('Reports, & more');
    await page.getByRole('button', { name: 'Register your interest' }).click();
    const status = page.getByRole('status');
    await expect(status).toContainText('Your email app should now have a message to us');
    // The email it wrote is there again as a link, in case the app didn't open.
    const mail = new URL((await status.getByRole('link').getAttribute('href'))!);
    expect(mail.protocol + mail.pathname).toBe('mailto:hello@relativistic.co.uk');
    expect(mail.searchParams.get('subject')).toBe('A demo of Enterprise: Analytical Engines');
    expect(mail.searchParams.get('body')).toContain('Email: ada@example.org');
    expect(mail.searchParams.get('body')).toContain('Reports, & more');
  });

  // The Worker itself is tested in worker/index.test.ts; here it's stood in for, to test the page.
  test.describe('on Cloudflare, through the Worker', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      test.skip((await page.locator('#interest').getAttribute('data-send')) !== 'worker', 'a GitHub Pages build has no Worker');
      await page.getByLabel('Your name').fill('Ada Lovelace');
      await page.getByLabel('Work email').fill('ada@example.org');
      await page.getByLabel('A demo of Enterprise').check();
    });

    test('sends the form, swaps it for a message, and brings it back to send another @both', async ({ page }) => {
      let body = '';
      await page.route('**/interest', async (route) => {
        body = route.request().postData() ?? '';
        await route.fulfill({ json: { ok: true } });
      });
      await page.getByRole('button', { name: 'Register your interest' }).click();
      const sent = new URLSearchParams(body);
      expect(sent.get('name')).toBe('Ada Lovelace');
      expect(sent.get('interest')).toBe('A demo of Enterprise');
      expect(sent.get('website')).toBe('');
      // The form is gone, and the message takes its place, with the focus.
      const heading = page.getByRole('heading', { name: 'Message sent' });
      await expect(heading).toBeFocused();
      await expect(heading).toBeInViewport();
      await expect(page.locator('#interest')).toBeHidden();
      await expect(page.getByText('Thank you. We’ve got your details')).toBeVisible();
      await page.getByRole('button', { name: 'Send another message' }).click();
      await expect(page.locator('#interest')).toBeVisible();
      await expect(heading).toBeHidden();
      await expect(page.getByLabel('Your name')).toHaveValue('');
      await expect(page.getByLabel('Your name')).toBeFocused();
    });

    test('a failure says so, keeps what they typed and offers the email address @both', async ({ page }) => {
      await page.route('**/interest', (route) => route.fulfill({ status: 502, json: { ok: false } }));
      await page.getByRole('button', { name: 'Register your interest' }).click();
      const status = page.getByRole('status');
      await expect(status).toContainText('Sorry, something went wrong on our side.');
      await expect(status.getByRole('link', { name: 'hello@relativistic.co.uk' })).toHaveAttribute('href', 'mailto:hello@relativistic.co.uk');
      await expect(page.getByLabel('Your name')).toHaveValue('Ada Lovelace');
      await expect(page.getByRole('button', { name: 'Register your interest' })).toBeEnabled();
    });
  });
});

test.describe('the workspace sketch', () => {
  test('types a request and builds its result, while on screen', async ({ page }) => {
    await page.goto('/');
    const demo = page.locator('[data-demo]');
    await demo.scrollIntoViewIfNeeded();
    await expect(demo).toHaveClass(/is-live/);
    await expect(page.locator('.demo__typed')).toHaveText(/^Build me/, { timeout: 5000 });
    await expect(page.locator('.demo__scene.is-shown .b.is-on').first()).toBeAttached({ timeout: 8000 });
    await expect(page.locator('.demo__reply')).toHaveClass(/is-on/, { timeout: 12_000 });
  });

  test('pauses and plays from its button (WCAG 2.2.2)', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-demo]').scrollIntoViewIfNeeded();
    const button = page.getByRole('button', { name: 'Pause', exact: true });
    await expect(page.locator('.demo__typed')).toHaveText(/^Build/, { timeout: 5000 });
    await button.click();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    const typed = await page.locator('.demo__typed').textContent();
    await page.waitForTimeout(800);
    expect(await page.locator('.demo__typed').textContent()).toBe(typed);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.locator('.demo__typed')).not.toHaveText(typed!, { timeout: 2000 });
  });

  test('reduced motion: the first request, finished, and nothing to pause', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.locator('[data-demo]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    await expect(page.locator('[data-demo]')).not.toHaveClass(/is-live/);
    await expect(page.locator('[data-demo-pause]')).toBeHidden();
    await expect(page.locator('.demo__ask')).toBeVisible();
    await expect(page.locator('.demo__scene.is-shown')).toHaveCount(1);
  });
});
