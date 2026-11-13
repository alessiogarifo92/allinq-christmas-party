# Allinq Christmas Party

RSVP page for the Allinq Christmas Party (December 2026), live at **https://allinq-christmas-party.pages.dev**.

1. **Step 1:** "Are you coming to the party?" The *No* button runs away from the mouse and from taps, so the only answer you can give is *Yes*.
2. **Step 2:** name, the December 2026 days you can and can't make (advent-calendar picker) and an optional note.
3. Answers are stored in Cloudflare KV. The organiser sees them at `/results?k=<ADMIN_KEY>`: best dates ranked, a per-day heat calendar, every answer (with delete) and a JSON export at `/api/results?k=<ADMIN_KEY>`.

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

- `RSVP`: KV namespace `festa-natale-rsvp`. Each answer is one key, `rsvp:<id>`. The id is kept in the guest's browser, so re-submitting updates their answer instead of adding a new one.
- `ADMIN_KEY`: secret, the key for the results page.

## Commands

```bash
cd /path/to/allinq-christmas-party
npm test        # build + unit tests (validation, tally, escaping, routes against an in-memory KV)
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... npm run deploy
```

KV listings are eventually consistent, so a new answer can take about a minute to appear on the results page.
