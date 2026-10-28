# Cayenne website

Astro site for Cloudflare. Every page in `src/pages` wraps its designed body from `src/html` in the shared layout `src/layouts/Base.astro`.

- `public/site.css`, `public/site.js`: the shared design system and behaviour (nav, phone menu, sticky course bar, FAQ rows, the AI pill).
- `public/motion.css`, `public/motion.js`: the motion layer (button shimmer, a different entrance for each scroll stop, a slow float on one visual per screen, page transitions). All of it stops for reduced motion.
- `scripts/check-pages.mjs`: checks the built site, every scroll stop exactly one screen, no sideways scroll, no errors.

```
npm install
npm run build
node scripts/check-pages.mjs            # all pages, four screen sizes
npm run dev
```

## Live features

The site runs as one Cloudflare Worker (`src/worker.ts`, settings in `wrangler.jsonc`). Every feature below stays switched off, and the page shows its built-in example, until its settings are added in Cloudflare (Workers and Pages, this Worker, Settings, Variables and Secrets). Never put keys in this repo.

| Setting | What it switches on |
|---|---|
| `ANTHROPIC_API_KEY` | Module 1 written live for each business, and the daily Insights draft |
| `GOOGLE_PLACES_KEY` | Real Google business search in the course form |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Sign in with Google (redirect URL: `https://<domain>/api/auth/callback`) |
| `SESSION_SECRET` | Any long random text. Signs sign-in cookies and the Insights review links |
| `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_TO` | Form messages and the Insights draft by email |
| `SITE_URL` | The live address, e.g. `https://example.co.uk`, used in emailed links |
| `INSIGHTS_APPROVER` | Who approves Insights (email). Defaults to `MAIL_TO` |
| `INSIGHTS_AUTO_PUBLISH` | Set to `on` only to skip approval and publish each draft straight away |

The `DATA` KV namespace holds form copies, course progress, rate limits and the Insights editions. Cloudflare creates it on the first deploy.

## Insights

- 05:00 UTC each day (5am winter, 6am summer, UK time) the Worker asks Claude, with web search, for 7 stories: 3 breaking, 4 under the radar, from around the world. Only links that came back from the search are kept.
- The approver gets an email with a private review link (valid four days). Untick any story, then Approve and publish, or Skip today. Nothing goes live without approval unless `INSIGHTS_AUTO_PUBLISH` is `on`.
- The approver can also sign in with Google and open `/insights/review` to read today's draft, or write one by hand.
- Pages: `/insights` (latest), `/insights/<date>` (each edition), `/insights/review` (private, not indexed).

Local testing: put test values in `.dev.vars` (ignored by git), then `npm run build` and `npx astro preview`.
