/**
 * The services schematic, drawn with the brand D2 kit (brand/diagrams/d2/examples/services.d2 and
 * services-tall.d2, rendered by render.sh and copied to src/assets/diagrams). Inlined so its labels
 * use the page's own Commit Mono: the fonts and stylesheet D2 embeds are removed, and styles/base.css
 * maps its seven palette values to the theme's custom properties, so it follows light and dark.
 * The wide layout shows from 720 px; the one-column layout below that, at a readable size.
 */
import wideSource from '../assets/diagrams/services.svg?raw';
import tallSource from '../assets/diagrams/services-tall.svg?raw';

const TITLE = 'What we deliver, and which service delivers each part';
const DESC =
  'Our support (Run) covers governance and getting the platform approved: DPIA, security review and policies (Start). ' +
  'Inside your Cloudflare account (Start), with EU data where needed, sits Cloudflare OS (Start) with its blueprints (Start, Grow). ' +
  'Cloudflare OS reaches your data and systems through auth and connectors (Start), and every model call goes through ' +
  'AI Gateway (Start, Run), which applies budgets and audit, to the models you choose.';

// The D2 kit still draws on the old cream paper; map its paper values to the site's white paper.
// The ink mapping in its stylesheet keys on these same values, so dark mode follows.
const PAPER: Record<string, string> = { f9f6f2: 'ffffff', efece7: 'f4f3f1', d4d1ca: 'b4b8bd' };
const repaper = (text: string) => text.replace(/#(f9f6f2|efece7|d4d1ca)/gi, (_, hex: string) => `#${PAPER[hex.toLowerCase()]}`);

function prepare(raw: string, variant: 'wide' | 'tall'): string {
  return (
    repaper(raw)
      .replace(/<\?xml[^>]*\?>/, '')
      // D2 names each group with a base64 class nothing styles; dropping them keeps the HTML small.
      .replace(/ class="[A-Za-z0-9+/]{8,}={0,2}"/g, '')
      // The CSP allows no style attributes: D2's become presentation attributes.
      .replace(/ style=(?:"([^"]*)"|'([^']*)')/g, (_, double: string | undefined, single: string | undefined) =>
        (double ?? single ?? '')
          .split(';')
          .map((d) => d.split(':').map((x) => x.trim()))
          .filter(([k, v]) => k && v)
          .map(([k, v]) => ` ${k}="${v!.replace(/px$/, '')}"`)
          .join(''),
      )
      // D2's stylesheet (embedded fonts, its own theme) goes; styles/base.css maps its palette to ours.
      .replace(/<style type="text\/css"><!\[CDATA\[[\s\S]*?\]\]><\/style>/g, '')
      .replace(/<svg ([^>]*?) width="\d+" height="\d+">/, (_, attrs: string) =>
        // One title and description, in the wide layout, serve both (an IDREF can point at hidden text).
        variant === 'wide'
          ? `<svg ${attrs} class="services__wide" role="img" aria-labelledby="services-title" aria-describedby="services-desc">` +
            `<title id="services-title">${TITLE}</title><desc id="services-desc">${DESC}</desc>`
          : `<svg ${attrs} class="services__tall" role="img" aria-labelledby="services-title" aria-describedby="services-desc">`,
      )
  );
}

export const diagram = { wide: prepare(wideSource, 'wide'), tall: prepare(tallSource, 'tall') };
