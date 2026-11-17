# Access model – go-live steps (only after Panat's explicit yes)

Project: Supabase `bhwreehwirrloxagyypi` (account PRIVAT, CLI `/Users/panat.ruangsri/JARVIS/bin/sb privat …`), Netlify site
`bewerbungen-pawat` (production branch `main`), Stripe LIVE account `acct_1UcSQ3JAaBKruAMr`. Never print keys.

## 0. Before

- All gates green on the integration branch (`npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`) and the access e2e
  run against a Netlify PREVIEW with `enforce_test` probe users (see 3).
- Panat confirms his admin login e-mail (FINDINGS #10 – do not guess).

## 1. Backup ⚠️

```bash
/Users/panat.ruangsri/JARVIS/bin/sb privat db dump --linked -f ~/Backups/wendapply-$(date +%Y%m%d-%H%M)-schema.sql
/Users/panat.ruangsri/JARVIS/bin/sb privat db dump --linked --data-only -f ~/Backups/wendapply-$(date +%Y%m%d-%H%M)-data.sql
```
Check both files are non-empty. Keep them out of git.

## 2. Database ⚠️

```bash
/Users/panat.ruangsri/JARVIS/bin/sb privat db push --linked --dry-run   # must list exactly the 20261118* migrations
/Users/panat.ruangsri/JARVIS/bin/sb privat db push --linked
```
Harmless for live users: `enforce_mode` stays `test_users` (MIGRATION.md). Verify (read-only):
`select enforce_mode from public.access_settings;` → `test_users`; `select count(*) from public.account_access;` = number of users.

## 3. Deploy app + edge function ⚠️

1. Merge the integration branch into `main` and push → Netlify production deploy. Wait for "published".
2. Edge function: `/Users/panat.ruangsri/JARVIS/bin/sb privat functions deploy ai-review` (adds the 402 paywall check).
3. Smoke test on wendapply.ch with throwaway `probe-*@wendapply-probe.invalid` users (admin API, confirmed, no mails), one with
   `update public.account_access set enforce_test = true, trial_ends_at = now() - interval '1 day' where user_id = '<probe>';`
   → paywall visible, writes refused with PAYWALL, export / "Meine Daten löschen" / account deletion work; normal probe → no banner.
   Delete the probe users afterwards and verify.

## 4. Switch on ⚠️ (Panat's yes)

SQL editor (runs as service role / postgres):
```sql
select public.access_go_live();
-- → {"enforce_mode":"on","went_live_at":"…","trials_rebased":N}
```
Every pre-existing user now has 7 days from this moment; new users get 7 days from their e-mail confirmation.

## 5. Platform admin

```bash
source ~/.config/alfred/tmp/wendapply-sr.env   # SR + URL, never echo them
NEXT_PUBLIC_SUPABASE_URL=https://bhwreehwirrloxagyypi.supabase.co node scripts/admin/add-admin.mjs <panat-login-email> --note "owner"
```
Prints only `OK: …` / `FAILED: …`. Then Panat opens `/admin` and enrols TOTP (MFA) – the admin API needs aal2.

## 6. Live solo prices ⚠️

```bash
STRIPE_ALLOW_LIVE=yes STRIPE_LIVE_SECRET_KEY=<live key, only for this call> node scripts/stripe/setup-products.mjs --live
```
Idempotent (lookup keys `wendapply_solo_monthly_chf` CHF 4.90, `wendapply_solo_yearly_chf` CHF 49). Check in the Stripe dashboard.
Afterwards move `~/.config/alfred/stripe-live.key` to the Trash (FINDINGS #11).

## Rollback (instant, no deploy)

```sql
update public.access_settings set enforce_mode = 'off' where id = 1;
```
Everyone has full access again and the UI hides banners/paywall (`enforced = false`). To re-enable: `enforce_mode = 'on'`
(do NOT run access_go_live again unless you want to re-base trials – it is idempotent and keeps the first `went_live_at`).
Code rollback = redeploy the previous Netlify deploy; the database part can stay (inert in `off`).
