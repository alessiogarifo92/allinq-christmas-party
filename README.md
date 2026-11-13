# Allinq Christmas Party

RSVP page for the Allinq Christmas Party (December 2026), live at **https://allinq-christmas-party.pages.dev**.

Two events, four steps. On both yes/no questions the *No* button runs away from the mouse and from taps (with a new taunt each try), so the only answer you can give is *Yes*.

1. **Christmas Dinner:** "Are you coming to the Christmas dinner?" (dress code: smart).
2. Name, and the December 2026 evenings you can and can't make for the dinner.
3. **Office Secret Santa:** "Are you in for the Secret Santa?" (snacks, drinks, ugly jumpers).
4. The days you can and can't make for the Secret Santa (one tap copies the dinner days) and an optional note.

Answers are stored in Cloudflare KV. The organiser sees them at `/results?k=<ADMIN_KEY>`: for each event the best dates ranked and a per-day heat calendar, then every answer (with delete), plus a JSON export at `/api/results?k=<ADMIN_KEY>`.

Answers sent with the first, single-event form (top-level `available`/`unavailable`) are kept: they count for both events and are tagged *old form*. When that guest opens the invitation again, their days are pre-filled for both events and re-submitting replaces the old answer.

## How it works

A single Cloudflare Pages project in advanced mode (`_worker.js`, no static assets):

| File | Role |
|---|---|
| `index.html` | The invitation page: runaway No, date picker, snow and confetti. Inlined into the bundle as `page.js` by `build.sh`. |
| `lib.js` | Pure logic: RSVP validation (only `attending: true` is accepted), per-day tally and ranking, escaping. |
| `results.js` | Server-rendered organiser page. |
| `worker.js` | Routes: `GET /`, `POST /api/rsvp`, `GET /results`, `GET /api/results`, `POST /results/delete`. |
| `build.sh` | Generates `page.js` and the single-file bundle `dist/_worker.js`. |
| `deploy.sh` | Uploads `dist/_worker.js` as a new production deployment. |

Bindings, set on the Pages project (Settings → Variables and Secrets / Bindings), never in the repo:

- `RSVP`: KV namespace `festa-natale-rsvp` in production, `allinq-xmas-rsvp-preview` for previews, so test answers never mix with real ones. Each answer is one key, `rsvp:<id>`. The id is kept in the guest's browser, so re-submitting updates their answer instead of adding a new one.
- `ADMIN_KEY`: secret, the key for the results page.

## Commands

```bash
cd /path/to/allinq-christmas-party
npm test        # build + unit tests (validation, tally, escaping, routes against an in-memory KV)
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... npm run deploy                     # production
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... DEPLOY_BRANCH=test npm run deploy   # test URL
```

Test URL: **https://test.allinq-christmas-party.pages.dev** (results at `/results?k=<ADMIN_KEY>`, same key). It uses the preview KV, so try anything there before pushing to `main`.

## Automatic deploy

`.github/workflows/deploy.yml` runs `npm test` on every push and pull request, and on a push to `main` that passes it deploys with `deploy.sh`. It needs two repository secrets (Settings → Secrets and variables → Actions): `CLOUDFLARE_API_TOKEN` (a token with *Cloudflare Pages: Edit*) and `CLOUDFLARE_ACCOUNT_ID`. Without them the deploy step is skipped with a warning. Changes that only touch Markdown or `.claude/` don't trigger it.

KV listings are eventually consistent, so a new answer can take about a minute to appear on the results page.
