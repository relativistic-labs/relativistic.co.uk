import type { APIRoute } from 'astro';
import { pageMarkdown } from '../lib/markdown';

export const GET: APIRoute = async () =>
  new Response(await pageMarkdown(), { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
