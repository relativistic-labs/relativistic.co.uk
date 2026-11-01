import { expect, test } from '@playwright/test';
import { AVOID, sectionsOn, wordsIn, WORDS_ALL_ON, WORDS_CORE, WORDS_MODELS, WORDS_SPONSORSHIP } from './helpers';

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('all content, links and contact details are present @both', async ({ page }) => {
    await page.goto('/');
    const on = await sectionsOn(page);
    const main = page.locator('main');
    await expect(main.locator('h1')).toContainText('Agents can build what your people need');
    for (const id of ['example', 'help', 'packages', 'trust', 'story', 'demo', 'contact']) await expect(page.locator(`#${id} h2`)).toBeVisible();
    // Every section after the opening carries the reader's question as a caption.
    await expect(page.locator('main .question')).toHaveCount(await page.locator('main section.section').count());
    await expect(page.locator('#trust .summary dt')).toHaveCount(9);
    await expect(page.locator('#packages h3')).toHaveText(['Shared', 'Managed', 'Enterprise']);
    await expect(page.locator('#example figure svg[role="img"]').first()).toBeAttached();
    // The form still works: on Cloudflare it posts to the Worker, and on GitHub Pages browsers hand
    // a mailto: form to the email app.
    const form = page.locator('#interest');
    const worker = (await form.getAttribute('data-send')) === 'worker';
    await expect(form).toHaveAttribute('action', worker ? '/interest' : /^mailto:hello@relativistic\.co\.uk/);
    await expect(page.locator('#packages a[href="#interest"]')).toHaveText(['Request a free trial', 'Request a demo', 'Request a demo']);
    // The workspace sketch shows its first request, finished.
    await expect(page.locator('#demo .demo__ask')).toHaveText('Build me a pitch deck for our new product launch');
    await expect(page.locator('#demo .demo__scene.is-shown')).toHaveCount(1);
    await expect(page.locator('[data-demo-pause]')).toBeHidden();
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

  // The page's own policy (form-action in the CSP) must let the form post to the Worker: a browser
  // drops a blocked post without a word. The Worker is stood in for here.
  test('on Cloudflare, the form posts to the Worker and lands on the sent page @both', async ({ page }) => {
    await page.goto('/');
    test.skip((await page.locator('#interest').getAttribute('data-send')) !== 'worker', 'a GitHub Pages build hands the form to the email app');
    let body = '';
    await page.route('**/interest', async (route) => {
      body = route.request().postData() ?? '';
      await route.fulfill({ status: 303, headers: { Location: '/interest/sent/' } });
    });
    await page.getByLabel('Your name').fill('Ada Lovelace');
    await page.getByLabel('Work email').fill('ada@example.org');
    await page.getByRole('button', { name: 'Register your interest' }).click();
    await expect(page).toHaveURL(/\/interest\/sent\/$/);
    await expect(page.locator('h1')).toHaveText('Thank you');
    expect(new URLSearchParams(body).get('name')).toBe('Ada Lovelace');
  });
});

test('word budget for the rendered <main> @both', async ({ page }) => {
  await page.goto('/');
  const on = await sectionsOn(page);
  const models = on.models ? await wordsIn(page, '#models') : 0;
  const sponsorship = on.sponsorship ? await wordsIn(page, '#sponsorship') : 0;
  const words = (await wordsIn(page, 'main')) - models - sponsorship;
  const limit = on.team ? WORDS_ALL_ON : WORDS_CORE;
  test.info().annotations.push({ type: 'words', description: `${words} of ${limit} (models ${models}, sponsorship ${sponsorship})` });
  expect(words, `rendered <main> is ${words} words; the limit is ${limit}`).toBeLessThanOrEqual(limit);
  expect(models).toBeLessThanOrEqual(WORDS_MODELS);
  expect(sponsorship).toBeLessThanOrEqual(WORDS_SPONSORSHIP);
});

test('plain words: no product or infrastructure jargon, Cloudflare OS named once @both', async ({ page }) => {
  await page.goto('/');
  const text = await page.locator('main').evaluate((m) => {
    const clone = m.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('svg').forEach((s) => s.remove());
    return clone.textContent ?? '';
  });
  for (const word of AVOID) expect(text, `"${word}" is on the page`).not.toMatch(new RegExp(`\\b${word}\\b`, 'i'));
  expect(text.match(/\bkeys?\b/gi)?.length ?? 0, '"key" only in "passwords or keys"').toBe(text.match(/passwords or keys/g)?.length ?? 0);
  expect(text.match(/Cloudflare OS/g)?.length ?? 0).toBe(1);
});

test('/index.md says what the page says, including the diagram @both', async ({ page, request }) => {
  const md = (await (await request.get('/index.md')).text()).replace(/\*\*|\*|^#+ |\[([^\]]*)\]\([^)]*\)|[<>]/gm, '$1').replace(/\s+/g, ' ');
  await page.goto('/');
  const pieces = await page.locator('main').evaluate((m) =>
    [...m.querySelectorAll('h1, h2, h3, p, li, dt, dd, desc')]
      .filter((e) => !e.closest('.opening__action, .packages__action, .portrait, .founder__links, .demo__window, .demo__control, form') && !e.querySelector('p, li, h3'))
      .map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter(Boolean),
  );
  expect(pieces.length).toBeGreaterThan(20);
  for (const piece of pieces) expect(md, `missing from /index.md: ${piece}`).toContain(piece);
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
