import type { Page } from '@playwright/test';

export const PAGES = ['/', '/privacy/', '/404.html'] as const;

/** Word limits for the rendered <main>: core page (content plan review), and every section on (round 2: 800). */
export const WORDS_CORE = 560;
export const WORDS_ALL_ON = 800;

/** Count words as a reader would: tokens with at least one letter or digit. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

export async function sectionsOn(page: Page) {
  return page.evaluate(() => ({
    team: !!document.getElementById('team'),
    models: !!document.getElementById('models'),
    sponsorship: !!document.getElementById('sponsorship'),
  }));
}

/** Scroll through the whole page so lazy images and observers fire, then come back up. */
export async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
  });
}
