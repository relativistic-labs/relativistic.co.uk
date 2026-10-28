import type { Page } from '@playwright/test';

export const PAGES = ['/', '/privacy/', '/404.html'] as const;

/**
 * Word limits for the rendered <main> (round 3 brief): 700 for the page with the team on, 560 without it,
 * counting headings, captions and button labels but not diagram labels. Models and sponsorship are off
 * by default and have their own allowances, so switching them on can't hide an overrun elsewhere.
 */
export const WORDS_CORE = 560;
export const WORDS_ALL_ON = 700;
export const WORDS_MODELS = 60;
export const WORDS_SPONSORSHIP = 100;

/** Words in an element as a reader sees them, leaving out diagram labels. */
export async function wordsIn(page: Page, selector: string): Promise<number> {
  const text = await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return '';
    // innerText needs a rendered element: lay out a copy without the diagrams, off-screen.
    const copy = el.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('figure svg').forEach((svg) => svg.remove());
    copy.removeAttribute('id');
    copy.style.position = 'absolute';
    copy.style.left = '-100000px';
    copy.style.width = `${el.offsetWidth}px`;
    document.body.append(copy);
    const t = copy.innerText;
    copy.remove();
    return t;
  }, selector);
  return countWords(text);
}

/** Words the round 3 brief keeps off the home page: product and infrastructure jargon. */
export const AVOID = [
  'Cloudflare account',
  'Workers',
  'Durable Objects',
  'R2',
  'AI Gateway',
  'gateway',
  'jurisdiction',
  'sovereign',
  'EU',
  'BYO',
  'blueprint',
  'connector',
  'provider',
  'DPIA',
  'on-prem',
];

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
