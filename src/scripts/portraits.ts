/**
 * Rendered, then observed. The real photo is the card's only <img> in the HTML; this adds the
 * AI-polished layer on top (aria-hidden) when JavaScript runs, then plays the Doppler shift when
 * the card comes into view. Afterwards, every so often, the card glitches back to the rendered
 * layer, holds it a moment and shifts to the real photo again, so a reader who missed the first
 * shift still sees what happened. Each card keeps its own irregular timer, so they drift out of
 * step, and none repeats while out of view or in a hidden tab. The animation itself is CSS
 * (styles/base.css, "The portrait shift"); band timings match brand/portraits/glitch.js.
 *
 * The repeats go on for as long as the section is in view, so the Portraits control can stop
 * them (WCAG 2.2.2 Pause, Stop, Hide): Smart holds every card on the edit, Real on the photo, and
 * Both is the cycle. The choice is stored only once someone makes it. With reduced motion the
 * default is Real, the edit isn't fetched until someone asks for it, and every shift is a cut.
 */
type Mode = 'smart' | 'real' | 'both';
const MODES: readonly Mode[] = ['smart', 'real', 'both'];
const STORAGE_KEY = 'relativistic:portraits';

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

/** One card. Loads its edit when first asked to, then follows the mode it's given. */
function portrait(card: HTMLElement, index: number, mode: () => Mode) {
  const real = card.querySelector<HTMLImageElement>('img');
  const srcset = card.dataset['renderedSrcset'];
  let loading = false;
  let ready = false;
  let ai = '';
  let observed = '';

  let shown: 'rendered' | 'observed' = 'observed';
  let cycle = 0;
  let started = false; // the first shift, on first sight, has been played or skipped
  let visible = false;
  let due = false; // a repeat came round while the card was out of sight
  let busy = false; // a shift is under way: it finishes before anything else happens
  let pending = false; // and then the mode is applied again
  let timer = 0;

  // One shift, to the real photo or back to the rendered one. Fresh bands every time; a cut with
  // reduced motion.
  const shift = (toObserved: boolean, then: () => void) => {
    const done = () => {
      busy = false;
      shown = toObserved ? 'observed' : 'rendered';
      if (pending) {
        pending = false;
        apply();
      } else then();
    };
    busy = true;
    card.classList.remove('is-observed');
    if (reduce.matches) {
      card.classList.toggle('is-rendered', !toObserved);
      card.classList.toggle('is-observed', toObserved);
      return done();
    }
    const layer = bands(index * 7919 + cycle++ * 104729);
    layer.style.setProperty('--rendered', toObserved ? ai : observed);
    layer.style.setProperty('--observed', toObserved ? observed : ai);
    card.append(layer);
    card.classList.add('is-shifting');
    setTimeout(() => card.classList.toggle('is-rendered', !toObserved), DURATION / 2);
    setTimeout(() => {
      layer.remove();
      card.classList.remove('is-shifting');
      card.classList.toggle('is-observed', toObserved);
      done();
    }, DURATION + 50);
  };
  const later = () => {
    timer = window.setTimeout(again, AGAIN_MIN + Math.random() * (AGAIN_MAX - AGAIN_MIN));
  };
  const again = () => {
    if (mode() !== 'both') return;
    if (!visible || document.hidden) {
      due = true;
      return;
    }
    shift(false, () => (timer = window.setTimeout(() => shift(true, later), HOLD)));
  };
  const resume = () => {
    if (!due || !visible || document.hidden || mode() !== 'both') return;
    due = false;
    later();
  };

  /** Bring the card to the current mode: stop whatever it was doing, then start from where it is. */
  function apply() {
    if (!ready) return;
    if (busy) {
      pending = true;
      return;
    }
    clearTimeout(timer);
    due = false;
    const m = mode();
    if (m !== 'both') {
      started = true;
      if (shown !== (m === 'smart' ? 'rendered' : 'observed')) shift(m === 'real', () => {});
    } else if (shown === 'observed') later();
    else if (started) shift(true, later);
    else if (visible) {
      // The first shift waits for the card to be seen, so the reader sees it happen.
      timer = window.setTimeout(() => {
        started = true;
        shift(true, later);
      }, DELAY + index * STAGGER);
    }
  }

  function load() {
    if (loading || !real || !srcset) return;
    loading = true;
    const rendered = new Image();
    rendered.alt = '';
    rendered.className = 'portrait__rendered';
    rendered.setAttribute('aria-hidden', 'true');
    rendered.sizes = real.sizes;
    rendered.srcset = srcset;
    Promise.all([rendered.decode(), real.decode()])
      .then(() => {
        ai = `url("${rendered.currentSrc}")`;
        observed = `url("${real.currentSrc}")`;
        card.append(rendered);
        ready = true;
        // Smart and Both start on the edit without a shift: the card isn't being watched yet.
        if (mode() !== 'real') {
          shown = 'rendered';
          card.classList.add('is-rendered');
        }
        new IntersectionObserver(
          ([entry]) => {
            visible = !!entry?.isIntersecting;
            if (!visible) return;
            if (!started) apply();
            else resume();
          },
          { threshold: 0.6 },
        ).observe(card);
        document.addEventListener('visibilitychange', resume);
        apply();
      })
      .catch(() => {
        /* keep the real photo */
      });
  }

  return { load, apply };
}

export function initPortraits(section: Element, control: HTMLFieldSetElement | null): void {
  const cards = [...section.querySelectorAll<HTMLElement>('.portrait[data-rendered-srcset]')];
  if (!cards.length) return;

  let mode: Mode = reduce.matches ? 'real' : 'both';
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as Mode | null;
    if (stored && MODES.includes(stored)) mode = stored;
  } catch {
    // storage blocked: the default, and choosing still works for this visit
  }
  const portraits = cards.map((card, i) => portrait(card, i, () => mode));

  // Fetch the polished layer as the team section approaches, so it is what the reader sees first.
  let near = false;
  const loadAll = () => near && mode !== 'real' && portraits.forEach((p) => p.load());
  const watch = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      watch.disconnect();
      near = true;
      loadAll();
    },
    { rootMargin: '0px 0px 75% 0px' },
  );
  watch.observe(section);

  if (!control) return;
  for (const input of control.querySelectorAll<HTMLInputElement>('input[name="portraits"]')) {
    input.checked = input.value === mode;
    input.addEventListener('change', () => {
      if (!input.checked) return;
      mode = input.value as Mode;
      try {
        localStorage.setItem(STORAGE_KEY, mode);
      } catch {
        // storage blocked: the choice lasts for this visit
      }
      loadAll();
      portraits.forEach((p) => p.apply());
    });
  }
  control.hidden = false;
}
