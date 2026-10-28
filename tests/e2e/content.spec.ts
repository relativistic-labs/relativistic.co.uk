import { expect, test } from '@playwright/test';
import { countWords, sectionsOn, WORDS_ALL_ON, WORDS_CORE } from './helpers';

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('all content, links and contact details are present @both', async ({ page }) => {
    await page.goto('/');
    const on = await sectionsOn(page);
    const main = page.locator('main');
    await expect(main.locator('h1')).toContainText('Agents can build what your people need');
    for (const id of ['story', 'how-we-work', 'trust', 'contact']) await expect(page.locator(`#${id} h2`)).toBeVisible();
    // Every section after the opening carries the reader's question as a caption.
    await expect(page.locator('main .question')).toHaveCount(await page.locator('main section.section').count());
    await expect(page.locator('#trust .summary dt')).toHaveCount(7);
    await expect(page.locator('#how-we-work figure svg[role="img"]').first()).toBeAttached();
    const mail = page.locator('#contact a[href="mailto:hello@relativistic.co.uk"]');
    await expect(mail).toBeVisible();
    await expect(mail).toHaveText('hello@relativistic.co.uk');
    if (on.team) {
      for (const name of ['Lewis Crawford', 'Ian George', 'Alex Haslehurst', 'Tamlyn Rhodes', 'Harry Robbins']) {
        await expect(page.locator('#team h3', { hasText: name })).toBeVisible();
      }
      await expect(page.locator('#team a[href*="linkedin.com"]')).toHaveCount(5);
      await expect(page.locator('#team img[alt="Harry Robbins"]')).toBeVisible();
    }
    if (on.models) await expect(page.locator('#models .tech', { hasText: 'OpenRouter' })).toBeVisible();
    if (on.sponsorship) await expect(page.locator('#sponsorship a[href="#contact"]')).toBeVisible();
    // The field is an enhancement: with no script it isn't shown at all.
    await expect(page.locator('[data-field]')).toBeHidden();
  });
});

test('word budget for the rendered <main> @both', async ({ page }) => {
  await page.goto('/');
  const on = await sectionsOn(page);
  const limit = on.team || on.models || on.sponsorship ? WORDS_ALL_ON : WORDS_CORE;
  const words = countWords(await page.locator('main').innerText());
  test.info().annotations.push({ type: 'words', description: `${words} of ${limit}` });
  expect(words, `rendered <main> is ${words} words; the limit is ${limit}`).toBeLessThanOrEqual(limit);
});

test('optional sections link only to themselves or to contact @both', async ({ page }) => {
  await page.goto('/');
  const ids = await page.locator('[id]').evaluateAll((els) => els.map((e) => e.id));
  const hrefs = await page.locator('a[href^="#"]').evaluateAll((els) => els.map((e) => e.getAttribute('href')!));
  for (const href of hrefs) expect(ids, `dangling anchor ${href}`).toContain(href.slice(1));
});

test('agent-readable versions respond @both', async ({ request, page }) => {
  const md = await request.get('/index.md');
  expect(md.ok()).toBe(true);
  expect(await md.text()).toContain('# Relativistic');
  const llms = await request.get('/llms.txt');
  expect(llms.ok()).toBe(true);
  expect(await llms.text()).toContain('/index.md');
  await page.goto('/');
  await expect(page.locator('link[rel="alternate"][type="text/markdown"]')).toHaveAttribute('href', '/index.md');
});

test('JSON-LD, Open Graph and icons @both', async ({ page, request }) => {
  await page.goto('/');
  const on = await sectionsOn(page);
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}');
  expect(ld['@type']).toBe('Organization');
  expect(Array.isArray(ld.founder)).toBe(on.team);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://relativistic.co.uk/og.png');
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  for (const icon of ['/favicon.ico', '/icon.svg', '/apple-touch-icon.png', '/og.png', '/robots.txt', '/.well-known/security.txt']) {
    expect((await request.get(icon)).ok(), icon).toBe(true);
  }
});
