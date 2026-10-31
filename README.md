# Relativistic

The site for Relativistic: one static page, built with Astro, that deploys unchanged to GitHub Pages and to Cloudflare Workers static assets.

- No framework runtime, no third-party requests, no cookies, no server code.
- JavaScript draws the particle field and the portrait shift, and nothing else. Every word and link works without it.
- `brand/` is the master copy of the visual system. The site imports `brand/tokens.css` and loads its fonts from `brand/fonts/` (plus the subsets in `src/assets/fonts/`, made by `scripts/subset-font.sh`).

## Working on it

Node 24 and pnpm (see `.node-version` and `packageManager`).

```sh
pnpm install
pnpm dev                     # Vite watches src/ only; don't enable polling
pnpm build && pnpm preview   # the only way to see the CSP working
```

Astro 7 runs `astro preview` in the background when it detects a coding agent. Use `astro preview --ignore-lock` for a foreground server, or `astro preview stop`.

## Content and switches

- Copy: `src/content/copy.ts`. Founders: `src/content/founders/*.md` (a profile over 34 words, or a missing portrait, fails the build). Models: `src/content/models.yaml`.
- Optional sections are build-time flags, all off by default: `SHOW_TEAM`, `SHOW_MODELS`, `SHOW_SPONSORSHIP`. Each renders nothing when off, and nothing outside it links to it.
- `/index.md`, `/llms.txt` and `humans.txt` are generated from the same content and follow the same switches.
- Company details render in the footer once `site.company` is set in `src/site.config.ts`.

## Checks

| Command | Checks |
|---|---|
| `pnpm check` | Types and content schemas |
| `pnpm build:all-on`, `pnpm build:all-off` | Both builds |
| `pnpm validate` | HTML validity |
| `pnpm links` | Internal links and anchors (CI also runs lychee) |
| `pnpm budget` | Brotli sizes: critical path, JavaScript, whole page |
| `pnpm test:e2e` | Playwright and axe against `astro preview` of `dist/` |
| `pnpm lhci` | Lighthouse CI, mobile |

`.github/workflows/ci.yml` runs all of them on every pull request, against both builds.

## Publishing

**Cloudflare Workers (production).** Merging to `main` deploys: once CI passes, `.github/workflows/deploy.yml` runs `pnpm deploy:production` on the commit CI checked. That builds with `pnpm build:cloudflare`, which writes `dist/_headers` with the security headers, and deploys `wrangler.jsonc`: a static-assets Worker with no script, in the Relativistic Cloudflare account. Optional sections follow the repository variables `SHOW_TEAM`, `SHOW_MODELS` and `SHOW_SPONSORSHIP` (Settings > Variables), all off by default. To redeploy without a change, run the Deploy workflow by hand from `main` (Actions > Deploy > Run workflow). `pnpm dev:workers` runs it locally.

The deploy token is `CLOUDFLARE_API_TOKEN` in the `cloudflare-prod` environment: Workers Editor on `relativistic-site`, `relativistic-site-review` and `relativistic-field-lab` only, expiring 31 October 2027. It can upload new versions of those Workers and nothing else: it can't create a Worker, and it has no zone access. The custom domain `relativistic.co.uk`, DNS, the www redirect and Access in front of the review build belong to the private `relativistic-labs/infra` repository (OpenTofu), so a new hostname or route is a change there. A new Worker has to be deployed once by someone with their own Cloudflare login, then added to the token.

**GitHub Pages (fallback).** Pushes to `main` still build the site and upload `dist/` only (`.github/workflows/pages.yml`), with the optional sections following the repository variables of the same names. DNS no longer points there.

**Review build.** `pnpm deploy:review` builds with every section on and deploys `wrangler.review.jsonc` (`relativistic-site-review`, also in the Relativistic account) to https://relativistic-site-review.relativistic-labs.workers.dev only. Run it from CI with the Deploy workflow, target `review`. Review builds send `X-Robots-Tag: noindex` on every path and a robots `noindex` meta tag on every page. Cloudflare Access in front of it, by one-time PIN to the team list, is managed in the infra repository.

## Keep out of Git

This repository is public. Planning documents in `docs/plans/` and anything in `scratch/` stay local and are ignored by Git.
