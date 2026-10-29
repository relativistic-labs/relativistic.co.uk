import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import type { Loader } from 'astro/loaders';
import { z } from 'astro/zod';
import { countWords } from './lib/words';

/** Each founder's profile is at most 34 words (round 3, raised for Harry's profile), so five editors can't break the page budget. */
export const PROFILE_MAX_WORDS = 34;

const foundersGlob = glob({ pattern: '*.md', base: './src/content/founders' });

/** glob(), plus a check the schema can't make: the Markdown body (the profile) is no longer than PROFILE_MAX_WORDS. */
const foundersLoader: Loader = {
  name: 'founders',
  load: async (context) => {
    await foundersGlob.load(context);
    for (const entry of context.store.values()) {
      const words = countWords(entry.body ?? '');
      if (words > PROFILE_MAX_WORDS) {
        throw new Error(`Founder profile "${entry.id}" is ${words} words; the limit is ${PROFILE_MAX_WORDS}.`);
      }
    }
  },
};

const founders = defineCollection({
  loader: foundersLoader,
  schema: ({ image }) =>
    z
      .object({
        name: z.string(),
        role: z.string().refine((r) => countWords(r) <= 6, 'Role must be six words or fewer'),
        order: z.number().int().positive(),
        // A missing or misspelt photo fails the build. "to-come" is the explicit placeholder.
        portrait: z.union([image(), z.literal('to-come')]),
        // The AI-polished layer that glitches away. Optional: a founder can opt out.
        portraitRendered: image().optional(),
        // Never rendered unless the founder asks.
        pronouns: z.string().optional(),
        links: z.array(z.object({ label: z.string(), url: z.url() })).max(2).default([]),
      })
      .refine((f) => !(f.portraitRendered && f.portrait === 'to-come'), {
        message: 'portraitRendered needs a real portrait to reveal',
      }),
});

const models = defineCollection({
  loader: file('src/content/models.yaml'),
  schema: z.object({
    order: z.number().int().positive(),
    provider: z.string(),
  }),
});

export const collections = { founders, models };
