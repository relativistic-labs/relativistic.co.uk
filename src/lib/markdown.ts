import { contact, example, help, models as modelsCopy, opening, packages, sponsorship, story, team, trust } from '../content/copy';
import { show, site } from '../site.config';
import { getFounders, getProviders, providersSentence } from './content';

/**
 * The home page as Markdown, from the same content as the HTML (served at /index.md), in the
 * same order, with each section's question, and the example diagram described in words.
 * tests/e2e/content.spec.ts checks that every piece of text on the page is here too.
 */
export async function pageMarkdown(): Promise<string> {
  const out: string[] = [`# ${site.name}`, '', `## ${opening.headline}`, '', opening.lede, ''];
  const section = (question: string, heading: string) => out.push(`*${question}*`, '', `## ${heading}`, '');

  section(example.question, example.heading);
  out.push(...example.paragraphs.flatMap((p) => [p, '']), `${example.diagram.title}: ${example.diagram.description}`, '');

  section(help.question, help.heading);
  for (const i of help.items) out.push(`- **${i.term}** ${i.text}`);
  out.push('');

  section(packages.question, packages.heading);
  for (const p of packages.items) out.push(`### ${p.name}`, '', `*${p.tag}*`, '', p.text, '');
  out.push(packages.money, '');

  section(trust.question, trust.heading);
  out.push(trust.inset, '');
  for (const r of trust.rows) out.push(`- **${r.key}:** ${r.value}`);
  out.push('');

  section(story.question, story.heading);
  out.push(...story.paragraphs.flatMap((p) => [p, '']));

  if (show.team) {
    section(team.question, team.heading);
    for (const f of await getFounders()) {
      const links = f.data.links.map((l) => `[${l.label}](${l.url})`).join(' · ');
      out.push(`### ${f.data.name}`, '', `*${f.data.role}*`, '', (f.body ?? '').trim(), '');
      if (links) out.push(links, '');
    }
  }
  if (show.models) {
    section(modelsCopy.question, modelsCopy.heading);
    out.push(providersSentence(await getProviders()), '');
  }
  if (show.sponsorship) {
    section(sponsorship.question, sponsorship.heading);
    out.push(sponsorship.body, '', `**${sponsorship.ask}** ${sponsorship.action}.`, '');
  }
  section(contact.question, contact.heading);
  out.push(contact.body, '', `Email: <${site.email}>`, '');
  return out.join('\n');
}
