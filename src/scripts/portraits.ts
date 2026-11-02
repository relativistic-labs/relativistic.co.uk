/**
 * Rendered, then observed. The real photo is the card's only <img> in the HTML; this adds the
 * AI-polished layer on top (aria-hidden), only when JavaScript runs and motion is allowed, then
 * plays the Doppler shift when the card comes into view. Afterwards, every so often, the card
 * glitches back to the rendered layer, holds it a moment and shifts to the real photo again, so
 * a reader who missed the first shift still sees what happened. Each card keeps its own irregular
 * timer, so they drift out of step, and none repeats while out of view or in a hidden tab. The
 * animation itself is CSS (styles/base.css, "The portrait shift"); band timings match
 * brand/portraits/glitch.js.
 */
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const DURATION = 600; // --portrait-shift: 500 to 700 ms per shift
const BANDS = 9;
const DELAY = 900; // after the card is mostly in view
const STAGGER = 240; // between cards
const HOLD = 1100; // on the rendered layer, when a repeat glitches back to it
const AGAIN_MIN = 5000; // between repeats, drawn afresh each time
const AGAIN_MAX = 11000;

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

function bands(seed: number): HTMLElement {
  const shift = document.createElement('div');
  shift.className = 'shift';
  shift.setAttribute('aria-hidden', 'true');
  const rand = prng(20261028 + seed);
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
      const ai = `url("${rendered.currentSrc}")`;
      const observed = `url("${real.currentSrc}")`;
      card.append(rendered);
      card.classList.add('is-rendered');

      let cycle = 0;
      let started = false;
      let visible = false;
      let due = false; // a repeat came round while the card was out of sight

      // One shift, to the real photo or back to the rendered one. Fresh bands every time.
      const shift = (toObserved: boolean, then: () => void) => {
        const layer = bands(index * 7919 + cycle++ * 104729);
        layer.style.setProperty('--rendered', toObserved ? ai : observed);
        layer.style.setProperty('--observed', toObserved ? observed : ai);
        card.append(layer);
        card.classList.add('is-shifting');
        card.classList.remove('is-observed');
        setTimeout(() => card.classList.toggle('is-rendered', !toObserved), DURATION / 2);
        setTimeout(() => {
          layer.remove();
          card.classList.remove('is-shifting');
          card.classList.toggle('is-observed', toObserved);
          then();
        }, DURATION + 50);
      };
      const later = () => setTimeout(again, AGAIN_MIN + Math.random() * (AGAIN_MAX - AGAIN_MIN));
      const again = () => {
        if (reduce.matches) return;
        if (!visible || document.hidden) {
          due = true;
          return;
        }
        shift(false, () => setTimeout(() => shift(true, later), HOLD));
      };
      const resume = () => {
        if (!due || !visible || document.hidden) return;
        due = false;
        later();
      };

      new IntersectionObserver(
        ([entry]) => {
          visible = !!entry?.isIntersecting;
          if (!visible) return;
          if (started) return resume();
          started = true;
          setTimeout(() => shift(true, later), DELAY + index * STAGGER);
        },
        { threshold: 0.6 },
      ).observe(card);
      document.addEventListener('visibilitychange', resume);
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
