import type { APIRoute } from 'astro';
import { PREVIEW_URL } from 'astro:env/server';
import { opening } from '../content/copy';
import { show, site } from '../site.config';

export const GET: APIRoute = () => {
  // A preview build points agents at itself, not at production.
  const url = (path: string) => new URL(path, PREVIEW_URL ?? site.url).href;
  const body = [
    `# ${site.name}`,
    '',
    `> ${site.description}`,
    '',
    opening.lede,
    '',
    '## Pages',
    '',
    `- [${site.name} in Markdown](${url('/index.md')}): the whole home page${show.team ? ', including the founders' : ''}, as one Markdown file`,
    `- [Privacy](${url('/privacy/')}): no cookies, no tracking, and what happens to an email you send us`,
    '',
    '## Contact',
    '',
    `- Email: ${site.email}`,
    `- Code: ${site.github}`,
    '',
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
