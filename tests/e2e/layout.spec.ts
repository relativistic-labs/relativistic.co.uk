import { expect, test } from '@playwright/test';
import { PAGES, sectionsOn } from './helpers';

// Runs in the phone project (390 × 844): see playwright.config.ts.

test('nothing overflows sideways @both', async ({ page }) => {
  for (const path of PAGES) {
    await page.goto(path);
    const [scroll, width] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(scroll, `${path} is ${scroll}px wide in a ${width}px viewport`).toBeLessThanOrEqual(width);
  }
});

test('the phone diagram shows, at a readable size @both', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#example .diagram__wide')).toBeHidden();
  const tall = page.locator('#example .diagram__tall');
  await expect(tall).toBeVisible();
  // D2 labels are 16 px at 1×; shown at 75% or more they stay at 12 px or larger.
  const scale = await tall.evaluate((svg) => svg.getBoundingClientRect().width / (svg as SVGSVGElement).viewBox.baseVal.width);
  expect(scale).toBeGreaterThanOrEqual(0.74);
});

test('packages stack, one per row @both', async ({ page }) => {
  await page.goto('/');
  const boxes = await page.locator('#packages .packages > li').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().left));
  expect(new Set(boxes.map(Math.round)).size).toBe(1);
});

test('founder profiles are 16 px on a phone', async ({ page }) => {
  await page.goto('/');
  test.skip(!(await sectionsOn(page)).team, 'team section is off in this build');
  for (const size of await page.locator('.founder__profile').evaluateAll((els) => els.map((e) => getComputedStyle(e).fontSize))) {
    expect(size).toBe('16px');
  }
});
