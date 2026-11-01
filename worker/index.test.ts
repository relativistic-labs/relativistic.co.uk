// The Worker against fake bindings: pnpm test:worker (Node strips the types itself).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import worker, { type Env, type Interest } from './index.ts';

const SITE = 'https://relativistic.co.uk';

function fakeEnv({ limited = false, mailFails = false } = {}) {
  const sent: Interest[] = [];
  const assets: string[] = [];
  const env: Env = {
    ASSETS: {
      fetch: async (r) => {
        assets.push(new URL(r.url).pathname);
        return new Response('asset', { status: 404 });
      },
    },
    MAIL: {
      send: async (m) => {
        if (mailFails) throw new Error('Delivery failed');
        sent.push(m);
      },
    },
    INTEREST_LIMIT: { limit: async () => ({ success: !limited }) },
  };
  return { env, sent, assets };
}

const fields = {
  name: 'Ada Lovelace',
  email: 'ada@example.org',
  organisation: 'Analytical Engines',
  interest: 'A demo of Enterprise',
  build: 'Reports, & more',
};

function post(body: Record<string, string>, { origin = SITE, json = true, site = SITE } = {}) {
  return new Request(`${site}/interest`, {
    method: 'POST',
    headers: { Origin: origin, ...(json ? { Accept: 'application/json' } : {}), 'CF-Connecting-IP': '192.0.2.1' },
    body: new URLSearchParams(body),
  });
}

test('sends the form to the team, replying to the visitor', async () => {
  const { env, sent } = fakeEnv();
  const res = await worker.fetch(post(fields), env);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.subject, 'A demo of Enterprise: Analytical Engines');
  assert.equal(sent[0]!.replyTo, 'ada@example.org');
  assert.match(sent[0]!.text, /^Name: Ada Lovelace$/m);
  assert.match(sent[0]!.text, /Reports, & more/);
});

test('without JavaScript, redirects to the sent page', async () => {
  const { env, sent } = fakeEnv();
  const res = await worker.fetch(post(fields, { json: false }), env);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('Location'), `${SITE}/interest/sent/`);
  assert.equal(sent.length, 1);
});

test('a failed send says so, and redirects a browser without JavaScript to the failed page', async () => {
  const { env } = fakeEnv({ mailFails: true });
  const res = await worker.fetch(post(fields), env);
  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { ok: false });
  const page = await worker.fetch(post(fields, { json: false }), env);
  assert.equal(page.headers.get('Location'), `${SITE}/interest/failed/`);
});

test('refuses posts from other sites', async () => {
  const { env, sent } = fakeEnv();
  const res = await worker.fetch(post(fields, { origin: 'https://example.com' }), env);
  assert.equal(res.status, 403);
  assert.equal(sent.length, 0);
});

test('refuses a visitor over the rate limit', async () => {
  const { env, sent } = fakeEnv({ limited: true });
  assert.equal((await worker.fetch(post(fields), env)).status, 429);
  assert.equal(sent.length, 0);
});

test('drops anything that fills in the bot trap, but says it worked', async () => {
  const { env, sent } = fakeEnv();
  const res = await worker.fetch(post({ ...fields, website: 'https://spam.example' }), env);
  assert.equal(res.status, 200);
  assert.equal(sent.length, 0);
});

test('refuses missing, malformed and oversized fields, and unknown choices', async () => {
  const { env, sent } = fakeEnv();
  for (const bad of [
    { ...fields, name: ' ' },
    { ...fields, email: 'not an email' },
    { ...fields, email: 'ada@example.org\nBcc: everyone@example.org' },
    { ...fields, interest: 'Free money' },
    { ...fields, build: 'x'.repeat(5001) },
  ]) {
    assert.equal((await worker.fetch(post(bad), env)).status, 400, JSON.stringify(bad).slice(0, 80));
  }
  assert.equal(sent.length, 0);
});

test('keeps line breaks out of the subject', async () => {
  const { env, sent } = fakeEnv();
  await worker.fetch(post({ ...fields, organisation: 'Engines\r\nBcc: everyone@example.org' }), env);
  assert.equal(sent[0]!.subject, 'A demo of Enterprise: Engines Bcc: everyone@example.org');
});

test('marks emails from anywhere but production', async () => {
  const { env, sent } = fakeEnv();
  const review = 'https://relativistic-site-review.relativistic-labs.workers.dev';
  await worker.fetch(post(fields, { site: review, origin: review }), env);
  assert.equal(sent[0]!.subject, '[relativistic-site-review.relativistic-labs.workers.dev] A demo of Enterprise: Analytical Engines');
});

test('a GET of /interest goes to the form, and everything else to the assets', async () => {
  const { env, assets } = fakeEnv();
  const res = await worker.fetch(new Request(`${SITE}/interest`), env);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('Location'), `${SITE}/#contact`);
  await worker.fetch(new Request(`${SITE}/nope`), env);
  assert.deepEqual(assets, ['/nope']);
});

// A browser's own form post is a navigation, which the assets layer answers first (405) unless
// /interest is routed to the Worker first. Only a deployed Worker shows this, so check the config.
test('every site config routes /interest to the Worker first', () => {
  for (const file of ['wrangler.jsonc', 'wrangler.review.jsonc']) {
    const jsonc = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const config = JSON.parse(jsonc.replace(/^\s*\/\/.*$/gm, ''));
    assert.ok(config.assets.run_worker_first.includes('/interest'), file);
    assert.equal(config.main, './worker/index.ts', file);
  }
});
