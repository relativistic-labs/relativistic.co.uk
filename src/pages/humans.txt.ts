import type { APIRoute } from 'astro';
import { getFounders } from '../lib/content';
import { show, site } from '../site.config';

// Names appear here only when the team section is on, so holding the team back holds this back too.
export const GET: APIRoute = async () => {
  const lines = ['/* TEAM */', ''];
  if (show.team) {
    for (const f of await getFounders()) lines.push(`  ${f.data.name}: ${f.data.role}`);
    lines.push('');
  }
  lines.push(
    `  Contact: ${site.email}`,
    '',
    '/* SITE */',
    '',
    '  Built with: Astro, plain CSS, one WebGL2 module',
    '  Fonts: Instrument Sans, Commit Mono (SIL Open Font License)',
    '  Third-party requests: none',
    '',
  );
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
