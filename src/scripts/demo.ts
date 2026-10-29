/**
 * The workspace sketch (components/Demo.astro), played: each request is typed and sent, then its
 * result is built element by element (CSS does the motion), held, and the next begins. A list of
 * steps, each with its own wait, so pausing stops exactly where it is and playing carries on.
 *
 * It plays only while on screen in a visible tab, and never with reduced motion (the sketch then
 * stays as the HTML has it: the first request, finished). The Pause button meets WCAG 2.2.2.
 */
interface Scene {
  ask: string;
  reply: string;
  title: string;
}

const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const TYPE = 28; // ms a character
const BUILD = 110; // ms between elements of a result
const HOLD = 3400; // ms a finished result stays

export function initDemo(root: HTMLElement, button: HTMLButtonElement): void {
  const scenes = JSON.parse(root.dataset['scenes'] ?? '[]') as Scene[];
  const get = (s: string) => root.querySelector<HTMLElement>(s)!;
  const typed = get('.demo__typed');
  const ask = get('.demo__ask');
  const thinking = get('.demo__thinking');
  const reply = get('.demo__reply');
  const title = get('.demo__title');
  const stages = [...root.querySelectorAll<SVGSVGElement>('.demo__scene')];
  if (!scenes.length || stages.length !== scenes.length || reduce.matches) return;

  // The steps for one scene: [wait before it, in ms; what it does].
  type Step = [number, () => void];
  const steps = (i: number): Step[] => {
    const s = scenes[i]!;
    const parts = [...stages[i]!.querySelectorAll('.b')];
    // The last result stays while the next request is typed; sending it swaps them over.
    return [
      [0, () => {
        for (const p of parts) p.classList.remove('is-on');
        typed.textContent = '';
        typed.classList.add('is-typing');
      }],
      ...[...s.ask].map((c, k): Step => [k ? TYPE : 500, () => (typed.textContent += c)]),
      [450, () => {
        typed.classList.remove('is-typing');
        typed.textContent = '';
        for (const el of [ask, thinking, reply]) el.classList.remove('is-on');
        stages.forEach((st, k) => st.classList.toggle('is-shown', k === i));
        title.textContent = s.title;
      }],
      [350, () => {
        ask.textContent = s.ask;
        ask.classList.add('is-on');
      }],
      [450, () => thinking.classList.add('is-on')],
      ...parts.map((p, k): Step => [k ? BUILD : 400, () => p.classList.add('is-on')]),
      [600, () => {
        thinking.classList.remove('is-on');
        reply.textContent = s.reply;
        reply.classList.add('is-on');
      }],
      [HOLD, () => {}],
    ];
  };

  let scene = 0;
  let list = steps(0);
  let at = 0;
  let timer = 0;
  let visible = false;
  let paused = false;

  const run = () => {
    if (at >= list.length) {
      scene = (scene + 1) % scenes.length;
      list = steps(scene);
      at = 0;
    }
    const [wait, act] = list[at]!;
    timer = window.setTimeout(() => {
      act();
      at++;
      run();
    }, wait);
  };
  const update = () => {
    clearTimeout(timer);
    timer = 0;
    if (reduce.matches) {
      // Back to the still: the first request, finished.
      root.classList.remove('is-live');
      button.hidden = true;
      return;
    }
    if (visible && !paused && !document.hidden) run();
  };

  root.classList.add('is-live');
  button.hidden = false;
  button.addEventListener('click', () => {
    paused = !paused;
    button.textContent = paused ? 'Play' : 'Pause';
    update();
  });
  new IntersectionObserver(([entry]) => {
    visible = !!entry?.isIntersecting;
    update();
  }).observe(root);
  document.addEventListener('visibilitychange', update);
  reduce.addEventListener('change', update);
}
