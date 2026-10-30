import { SHOW_MODELS, SHOW_SPONSORSHIP, SHOW_TEAM } from 'astro:env/server';

interface Company {
  name: string;
  number: string;
  registeredIn: string;
  office: string;
}

/** "Relativistic" is the working name (content plan review, decision 1), held here once. */
export const site = {
  name: 'Relativistic',
  url: 'https://relativistic.co.uk',
  email: 'hello@relativistic.co.uk',
  github: 'https://github.com/relativistic-labs',
  title: 'Relativistic · Agents can build what your people need',
  description:
    'AI agents that build the tools your people need, safely. Five senior engineers who guide you, guard you and build with you.',
  // UK trading disclosures render in the footer once the company is incorporated.
  company: null as Company | null,
} as const;

/** Optional sections. Each is self-contained: off renders nothing, and nothing links into it. */
export const show = {
  team: SHOW_TEAM,
  models: SHOW_MODELS,
  sponsorship: SHOW_SPONSORSHIP,
} as const;
