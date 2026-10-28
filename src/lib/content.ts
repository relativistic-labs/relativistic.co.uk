import { getCollection } from 'astro:content';
import type { CollectionEntry } from 'astro:content';

export async function getFounders(): Promise<Array<CollectionEntry<'founders'>>> {
  return (await getCollection('founders')).sort((a, b) => a.data.order - b.data.order);
}

export async function getModels(): Promise<Array<CollectionEntry<'models'>['data']>> {
  return (await getCollection('models')).map((m) => m.data).sort((a, b) => a.order - b.order);
}

function list(items: string[]): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** "Current line-up (October 2026): A, B and C, served from [UK/EU] infrastructure." */
export function lineupSentence(models: Array<CollectionEntry<'models'>['data']>): string {
  const included = models.filter((m) => m.tier === 'included');
  const latest = new Date(Math.max(...included.map((m) => m.evaluated.getTime())));
  const month = latest.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const places = [...new Set(included.map((m) => m.servedFrom))];
  return `Current line-up (${month}): ${list(included.map((m) => m.model))}, served from ${list(places)} infrastructure.`;
}
