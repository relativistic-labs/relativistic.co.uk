/**
 * Prepare a diagram from the brand D2 kit (brand/diagrams/d2, rendered by render.sh and copied to
 * src/assets/diagrams) for inlining, so its labels use the page's own fonts:
 * - D2's embedded fonts and stylesheet go; styles/base.css maps its seven palette values to the
 *   theme's custom properties, so the diagram follows light and dark;
 * - its style attributes become presentation attributes (the CSP allows no style attributes);
 * - the base64 class names it gives every group, which nothing styles, go, to keep the HTML small;
 * - the root gets a class, role="img" and a title and description. A wide and a phone layout share
 *   one title and description, in the wide one (an IDREF can point at hidden text).
 */
export function prepareDiagram(raw: string, opts: { id: string; layout: 'wide' | 'tall'; title: string; description: string }): string {
  const { id, layout, title, description } = opts;
  const label = `aria-labelledby="${id}-title" aria-describedby="${id}-desc"`;
  return raw
    .replace(/<\?xml[^>]*\?>/, '')
    .replace(/ class="[A-Za-z0-9+/]{8,}={0,2}"/g, '')
    .replace(/ style=(?:"([^"]*)"|'([^']*)')/g, (_, double: string | undefined, single: string | undefined) =>
      (double ?? single ?? '')
        .split(';')
        .map((d) => d.split(':').map((x) => x.trim()))
        .filter(([k, v]) => k && v)
        .map(([k, v]) => ` ${k}="${v!.replace(/px$/, '')}"`)
        .join(''),
    )
    .replace(/<style type="text\/css"><!\[CDATA\[[\s\S]*?\]\]><\/style>/g, '')
    .replace(/<svg ([^>]*?) width="\d+" height="\d+">/, (_, attrs: string) =>
      layout === 'wide'
        ? `<svg ${attrs} class="diagram__wide" role="img" ${label}><title id="${id}-title">${title}</title><desc id="${id}-desc">${description}</desc>`
        : `<svg ${attrs} class="diagram__tall" role="img" ${label}>`,
    );
}
