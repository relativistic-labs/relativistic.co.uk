import { contact, howWeWork, models as modelsCopy, opening, sponsorship, story, team } from '../content/copy';
import { show, site } from '../site.config';
import { getFounders, getModels, lineupSentence } from './content';

/** The home page as Markdown, from the same content as the HTML (served at /index.md). */
export async function pageMarkdown(): Promise<string> {
  const out: string[] = [`# ${site.name}`, '', `## ${opening.headline}`, '', opening.lede, ''];
  out.push(`## ${story.heading}`, '', ...story.paragraphs.flatMap((p) => [p, '']));
  out.push(`## ${howWeWork.heading}`, '');
  for (const s of howWeWork.steps) out.push(`- **${s.term}** ${s.text}`);
  out.push('', howWeWork.product, '');
  if (show.team) {
    out.push(`## ${team.heading}`, '');
    for (const f of await getFounders()) {
      const links = f.data.links.map((l) => `[${l.label}](${l.url})`).join(' · ');
      out.push(`### ${f.data.name}`, '', `*${f.data.role}*`, '', (f.body ?? '').trim(), '');
      if (links) out.push(links, '');
    }
  }
  if (show.models) {
    out.push(`## ${modelsCopy.heading}`, '', modelsCopy.intro, '', lineupSentence(await getModels()), '', modelsCopy.premium, '');
  }
  if (show.sponsorship) {
    out.push(`## ${sponsorship.heading}`, '', sponsorship.body, '', `**${sponsorship.ask}** ${sponsorship.action}: <${site.email}>`, '');
  }
  out.push(`## ${contact.heading}`, '', contact.body, '', `Email: <${site.email}>`, '');
  return out.join('\n');
}
