/**
 * The site's Worker. Static assets are served before it runs, except /interest (run_worker_first),
 * so it sees only the register-your-interest form and paths that would be a 404.
 *
 * The form is emailed to the team by relativistic-mail (in the infra repository), over a service
 * binding: that Worker holds the team list, so no addresses live in this public repository.
 * It answers JSON to the page's script, and redirects a browser without JavaScript to
 * /interest/sent/ or /interest/failed/.
 */
import { contact } from '../src/content/copy.ts';

export interface Interest {
  subject: string;
  text: string;
  replyTo: string;
}

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** relativistic-mail's Team entrypoint: emails everyone on the team list, or throws. */
  MAIL: { send(message: Interest): Promise<void> };
  /** Per visitor address: enough for a person to retry, not for a script to fill inboxes. */
  INTEREST_LIMIT: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

const PRODUCTION = 'relativistic.co.uk';
const CHOICES: readonly string[] = contact.choices.map((c) => c.label);
const LIMITS = { name: 200, email: 254, organisation: 200, build: 5000 } as const;
// Deliberately loose: the browser has already checked it. Mostly this keeps out line breaks.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/interest') return env.ASSETS.fetch(request);
    if (request.method !== 'POST') return Response.redirect(new URL('/#contact', url).href, 303);
    return interest(request, env, url);
  },
};

type Outcome = 'sent' | 'failed' | 'refused';

async function interest(request: Request, env: Env, url: URL): Promise<Response> {
  const json = (request.headers.get('Accept') ?? '').includes('application/json');
  const reply = (outcome: Outcome, status: number) =>
    json
      ? Response.json({ ok: outcome === 'sent' }, { status, headers: { 'Cache-Control': 'no-store' } })
      : Response.redirect(new URL(outcome === 'sent' ? '/interest/sent/' : '/interest/failed/', url).href, 303);

  // Only this site's own pages may post here. Browsers send Origin with every form post.
  if (request.headers.get('Origin') !== url.origin) return reply('refused', 403);

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (!(await env.INTEREST_LIMIT.limit({ key: ip })).success) return reply('refused', 429);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply('refused', 400);
  }
  const get = (name: string) => String(form.get(name) ?? '').trim();

  // The bot trap: people never see this field. Say it worked, so a bot learns nothing.
  if (get('website')) return reply('sent', 200);

  const fields = { name: get('name'), email: get('email'), organisation: get('organisation'), build: get('build') };
  const interest = get('interest');
  const tooLong = (Object.keys(LIMITS) as (keyof typeof LIMITS)[]).some((k) => fields[k].length > LIMITS[k]);
  if (!fields.name || !EMAIL.test(fields.email) || !CHOICES.includes(interest) || tooLong) return reply('refused', 400);

  // Anything not from production (the review build, wrangler dev) says where it came from.
  const from = url.hostname === PRODUCTION ? '' : `[${url.hostname}] `;
  const message: Interest = {
    subject: `${from}${interest}: ${fields.organisation || fields.name}`.replace(/[\r\n]+/g, ' '),
    replyTo: fields.email,
    text: [
      `Name: ${fields.name}`,
      `Email: ${fields.email}`,
      `Organisation: ${fields.organisation}`,
      `Interested in: ${interest}`,
      '',
      fields.build,
      '',
      `Sent from the form at ${url.origin}. Reply to this email to reply to them.`,
    ].join('\n'),
  };

  try {
    await env.MAIL.send(message);
  } catch (e) {
    // No personal details in the log: just that it failed, and why.
    console.error(`interest form: sending failed: ${e instanceof Error ? e.message : String(e)}`);
    return reply('failed', 502);
  }
  return reply('sent', 200);
}
