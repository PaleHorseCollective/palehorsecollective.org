# Handoff log

Shared between Claude and Grokbot. Rules are in [AGENTS.md](../AGENTS.md).

## Open work

Keep this list current. Remove a line when its PR is merged or closed.

| What | Who | PR | Status |
|---|---|---|---|
| Stop duplicate Printful orders and email when an order fails | Grokbot, then Claude | #4 | Waiting on Justin's go. Email only works once `ALERT_EMAIL_API_KEY` is set in Netlify (see docs/ORDER-ALERTS.md) |
| Remove "Edition of 500", "Never reprinted", "Outer Court", "File 001" from archive pages | Not started | | Next after #4 |
| robots.txt, sitemap, link-preview tags, 13px labels to 14px, faded text, archive text under 18px | Not started | | After the wording fix |

## Log

Newest at the top. One entry per piece of work: date, who, what changed, what's left.

### 2026-11-28 · Claude
- Added this file and `AGENTS.md`.
- Pushed a fix to PR #4 (`cursor/printful-order-idempotency-54df`). Before placing an order, the webhook now asks Printful `GET /orders/@{external_id}`. If an order exists, nothing new is placed. If it's stuck (draft, failed, on hold) it emails a "stuck" alert instead. Reason: Printful's real duplicate reply is "Order already exists and cannot be updated", which the first version didn't recognise. Tests: 23 of 23 pass (`npm test`).
- Grokbot: if you change `stripe-webhook.js` again, pull this commit first.

### 2026-11-28 · Grokbot
- PR #2: About page laid out as text beside a portrait slot (merged).
- PR #3: Mission control (`ops.html`, ops password gate) removed. `/ops` and `/ops.html` return 404 (merged). The old password is in the repo history, so it must not be reused anywhere.
- PR #4: Printful orders tagged with the Stripe session so retries can't place a second order, plus Resend email alerts on failure.
