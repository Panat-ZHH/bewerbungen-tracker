# Reminders (item 15, notification settings item 37)

## What exists
- **In-app:** dashboard section «Erinnerungen» (`components/reminders/reminders-card.tsx`), computed in the browser by `lib/reminders.ts#computeReminders` from the applications: deadlines within *N days* (also missed ones for 7 days) and «N Tage kein Update» for sent applications. No storage needed.
- **Settings:** table `reminder_settings` (RLS: own row). UI `components/settings/notification-settings.tsx` (channels in-app / e-mail / push, days before deadline, stale days, calendar feed for all deadlines).
- **.ics:** application detail page downloads a single-deadline `.ics` (client side). **Calendar feed:** table `calendar_feeds` (RLS: own rows), token = 32 random bytes (base64url). Public URL `GET /api/ics/feed/<token>`; revoke = delete the row (then 404). Feed per application (detail page) or one for all deadlines (settings).
- **Web Push:** `public/sw.js`, `POST/DELETE /api/reminders/push` (stores `push_subscriptions`, RLS: own), `GET` returns the public VAPID key. Implemented on `node:crypto` (`lib/reminders-push.ts`, RFC 8291/8292), no extra dependency.
- **Digest (e-mail + push):** `POST /api/reminders/digest` (Bearer `REMINDERS_CRON_SECRET`, `?dryRun=1`), called daily 07:00 UTC by `netlify/functions/reminders-digest.mjs`. Each reminder is sent once per channel (`reminder_log`, service role only).

## Environment variables (names only)
| Name | Where | Purpose |
|---|---|---|
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | server (`.env.local`, Netlify) | Web Push. Optional `VAPID_SUBJECT` (`mailto:` contact), default `mailto:support@wendapply.ch` |
| `REMINDERS_CRON_SECRET` | server | protects the digest route (min. 16 chars) |
| `SUPABASE_SERVICE_ROLE_KEY` | server | digest + public feed read data across users. Without it the routes answer 503 |
| `SMTP_HOST`, `SMTP_PORT` (465 implicit TLS, else STARTTLS), `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | server | mail sender (`lib/reminders-mail.ts`). **Until all are set the mailer is a no-op that only logs**, nothing is sent |
| `APP_URL` | server | base URL for links in mails and for the Netlify function (falls back to Netlify's `URL`) |

Keys were generated once and stored only in `.env.local` and the Netlify production env.

## Operations
- Test without sending: `curl -X POST -H "Authorization: Bearer $REMINDERS_CRON_SECRET" "$APP_URL/api/reminders/digest?dryRun=1"`.
- Rotate VAPID keys: existing push subscriptions stop working and users must re-enable push.
- Migration: `20261109060000_reminders.sql` (tables + RLS only; no functions).
