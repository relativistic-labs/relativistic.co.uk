/**
 * Rendered, then observed. The real photo is the card's only <img> in the HTML; this adds the
 * AI-polished layer on top (aria-hidden), only when JavaScript runs and motion is allowed, then
 * plays the Doppler shift once when the card comes into view. The animation itself is CSS
 * (styles/base.css, "The portrait shift"); band timings match brand/portraits/glitch.js.
 */
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const DURATION = 600; // --portrait-shift: 500 to 700 ms, once, never loops
const BANDS = 9;
const DELAY = 900; // after the card is mostly in view
const STAGGER = 240; // between cards

function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function el(className: string, parent: Element): HTMLElement {
  const node = document.createElement('div');
  node.className = className;
  parent.append(node);
  return node;
}

function bands(index: number): HTMLElement {
  const shift = document.createElement('div');
  shift.className = 'shift';
  shift.setAttribute('aria-hidden', 'true');
  const rand = prng(20261028 + index * 7919);
  for (let k = 0; k < BANDS; k++) {
    const start = 0.05 + rand() * 0.25;
    const amp = (3.5 + rand() * 6) * (rand() < 0.5 ? -1 : 1); // % of the frame's width
    const end = start + 0.45 + rand() * 0.2;
    const swap = 0.3 + rand() * 0.35;
    const band = el('shift__band', shift);
    const vars: Record<string, string> = {
      '--c0': String(k / BANDS),
      '--c1': String((k + 1) / BANDS),
      '--amp': `${amp.toFixed(2)}cqw`,
      '--start': `${Math.round(start * DURATION)}ms`,
      '--dur': `${Math.round((end - start) * DURATION)}ms`,
      '--swap': swap.toFixed(3),
    };
    for (const [name, value] of Object.entries(vars)) band.style.setProperty(name, value);
    for (const layer of ['rendered', 'observed']) {
      el(`shift__layer shift__layer--${layer} shift__layer--blue`, band);
      el(`shift__layer shift__layer--${layer} shift__layer--red`, band);
    }
  }
  return shift;
}

function prepare(card: HTMLElement, index: number) {
  const real = card.querySelector<HTMLImageElement>('img');
  const srcset = card.dataset['renderedSrcset'];
  if (!real || !srcset || reduce.matches) return;

  const rendered = new Image();
  rendered.alt = '';
  rendered.className = 'portrait__rendered';
  rendered.setAttribute('aria-hidden', 'true');
  rendered.sizes = real.sizes;
  rendered.srcset = srcset;
  Promise.all([rendered.decode(), real.decode()])
    .then(() => {
      if (reduce.matches) return;
      const shift = bands(index);
      card.style.setProperty('--rendered', `url("${rendered.currentSrc}")`);
      card.style.setProperty('--observed', `url("${real.currentSrc}")`);
      card.append(rendered, shift);
      card.classList.add('is-rendered');

      const play = () => {
        card.classList.add('is-shifting');
        setTimeout(() => card.classList.remove('is-rendered'), DURATION / 2);
        setTimeout(() => {
          shift.remove();
          rendered.remove();
          card.classList.remove('is-shifting');
          card.classList.add('is-observed');
        }, DURATION + 50);
      };
      const seen = new IntersectionObserver(
        ([entry]) => {
          if (!entry?.isIntersecting) return;
          seen.disconnect();
          setTimeout(play, DELAY + index * STAGGER);
        },
        { threshold: 0.6 },
      );
      seen.observe(card);
    })
    .catch(() => {
      /* keep the real photo */
    });
}

export function initPortraits(section: Element): void {
  if (reduce.matches) return;
  const cards = [...section.querySelectorAll<HTMLElement>('.portrait[data-rendered-srcset]')];
  if (!cards.length) return;
  // Fetch the polished layer as the team section approaches, so it is what the reader sees first.
  const near = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      near.disconnect();
      cards.forEach(prepare);
    },
    { rootMargin: '0px 0px 75% 0px' },
  );
  near.observe(section);
}
