import { getCollection } from 'astro:content';
import type { CollectionEntry } from 'astro:content';
import { models } from '../content/copy';

export async function getFounders(): Promise<Array<CollectionEntry<'founders'>>> {
  return (await getCollection('founders')).sort((a, b) => a.data.order - b.data.order);
}

export async function getProviders(): Promise<string[]> {
  return (await getCollection('models')).map((m) => m.data).sort((a, b) => a.order - b.order).map((m) => m.provider);
}

/** "…, or use A, B and C. Every call goes through one gateway…" */
export function providersSentence(providers: string[]): string {
  const named = providers.length < 2 ? providers.join('') : `${providers.slice(0, -1).join(', ')} or ${providers.at(-1)}`;
  return `${models.before} ${named}. ${models.after}`;
}
