# WendApply access model – shared contract (2026-11-17)

Integration branch: `access-model` (from production `main` 8e12966). Every builder branches from `access-model` and
owns ONLY the files listed for its part. Orchestrator state: `~/Projects/bewerbungen-tracker-wt/_access/ORCH-STATE.md`.

UI language: Swiss German, "Du", no ß ("ss"), CHF with apostrophe thousands (CHF 1'490).

## 1. Rules (from Panat)

| Who | Access |
|---|---|
| New student (school or private), parent | **7-day free trial from signup** (`auth.users.created_at`). Visible banner "Gratis-Testwoche: noch X Tage" + what happens after + button "Abo wählen". |
| After trial, no paid access | **Hard paywall**. Allowed only: read own data, export (Settings "Daten exportieren"), delete data/account, log out, billing (checkout/portal), family invite/join needed to buy the family plan. |
| Paid active subscription (individual "Einzelabo" or family) | Full access. Family plan covers parent AND linked children (active family members). |
| Payment failed (`past_due`) | **Grace**: access until `current_period_end + 7 days`, banner "Zahlung fehlgeschlagen". `unpaid`/`canceled`/`incomplete_expired`/`paused` = no access. `cancel_at_period_end` = access until period end. |
| Student in a class of a school with a **valid school licence** | Access through the school. No trial text, no paywall, no prices. |
| Teacher / school admin | **No access at all, no trial**, unless linked to a school with a valid licence (school_admins, school_teachers, or teacher of a class whose school is licensed). Otherwise page `/schullizenz`: "Zugang nur mit Schullizenz" + contact support@wendapply.ch + /kontakt. |
| Admin grant | `account_access.free_access_until > now()` → full access (any role, also teachers). |
| Blocked by admin | `account_access.blocked_at is not null` → no access at all (page "Konto gesperrt", contact). Login still works so they can read the message. |

Trial is per **user id**, enforced server-side, never reset by deleting/re-adding data. Re-signup after deleting the account with the
**same e-mail** gets NO new trial (ledger of sha256(lower(trim(email)))) – `+alias`/second address is an accepted risk.

Existing live users at migration time: fresh trial `trial_ends_at = greatest(created_at + 7 days, now() + 7 days)` (so nobody is
locked out by surprise; announced by the banner). Documented in docs/access/MIGRATION.md.

## 2. Prices – new individual plan

No individual (single student) plan exists (`individual` in plans.ts is the school "Individuell" offer). New plan:
`solo` – **"Einzelabo"**, kind `individual`, **CHF 4.90 / Monat or CHF 49 / Jahr** (no VAT), card only, 1 student.
Lookup keys `wendapply_solo_monthly_chf`, `wendapply_solo_yearly_chf`. Consistent with Family CHF 7.90 / 79 (2 accounts).
Only students (not parents, not teachers) buy `solo`; parents buy `family`. Created in Stripe TEST by the backend builder,
in Stripe LIVE by the orchestrator (setup-products script, lookup keys) – never charged in tests.

## 3. Database contract (backend builder implements, others code against it)

Migrations: backend `supabase/migrations/202611180xxxxx_*.sql`; admin builder only if unavoidable `202611181xxxxx_*`;
later fixes `202611183xxxxx_*`. ADDITIVE ONLY, idempotent, RLS on every new table, `security definer set search_path = ''`.

Tables (all RLS on; anon: nothing; authenticated: select own row only where noted; writes ONLY via service_role or definer functions):
- `public.account_access` (user_id uuid pk → auth.users on delete cascade, trial_started_at timestamptz not null, trial_ends_at timestamptz not null,
  free_access_until timestamptz null, free_access_note text null, blocked_at timestamptz null, blocked_reason text null,
  updated_at timestamptz, updated_by uuid null). Row created by trigger after insert on auth.users. Authenticated: select own row.
- `public.trial_ledger` (email_hash text pk, first_trial_ends_at timestamptz, created_at) – survives account deletion. No client access.
- `public.platform_admins` (user_id uuid pk → auth.users, created_at, note). No client access except `public.am_i_platform_admin()` (bool, own uid).
  NOT seeded by migration: added by `scripts/admin/add-admin.mjs <email>` (service role) once Panat confirms his login e-mail.
- `public.admin_audit_log` (id bigserial, at timestamptz default now(), admin_id uuid, action text, target_user uuid null, target_school uuid null,
  details jsonb, ip text null). Append-only (no update/delete for anyone but service_role; trigger blocks update/delete). No client access.
- `public.school_teachers` (school_id uuid → schools, user_id uuid → auth.users, added_by uuid, created_at, pk(school_id,user_id)). School admins
  read own school's rows; writes by school admins via RPC `school_add_teacher(p_school_id, p_email)` / `school_remove_teacher` and by admin (service role).
- `public.billing_subscriptions`: additive column `user_id uuid null` (owner of a `solo` plan); billing_customers likewise if needed.

Functions:
- `public.app_access(p_uid uuid) returns jsonb` (definer, stable; internal, NOT granted to authenticated) and
  `public.my_access() returns jsonb` (granted to authenticated, = app_access(auth.uid())). Shape = `AccessInfo` in `lib/access/types.ts`.
- `public.has_app_access(p_uid uuid default auth.uid()) returns boolean` (definer, stable) – the single gate.
- `public._assert_app_access()` – raises `PAYWALL` (sqlstate P0001, message 'PAYWALL') when no access. Called by every
  security-definer RPC that creates/changes user content (applications, documents, map/shop/coins, friends, class join, AI usage, teacher class RPCs…).
- Restrictive RLS policies (`as restrictive … for insert/update … with check ((select public.has_app_access()))`) on all user-content
  tables. SELECT and DELETE stay as today (read-only + delete own data allowed). Storage buckets (cvs, avatars, documents): insert/update gated too.
- Teacher-side RPCs/tables (classes insert, class invitations, teacher views of students) gated by `has_app_access` (teachers only via licence/grant).
- Edge function `ai-review`, API routes `/api/job-search`, `/api/places`, `/api/reminders/*` (per-user parts): check `my_access`/`has_app_access` with the caller's JWT → `402 {"error":"paywall"}`.
- Licence validity = existing `_licence_state(...)` in ('pilot','active') of `_school_current_licence(school_id)` (dates checked).
- Family coverage: user is an active member (parent or child) of a family whose family subscription (billing_subscriptions.family_id) is in
  active/trialing(Stripe)/past_due-in-grace, or whose family plan row is an admin-assigned `pilot`/`active` plan. The old family 30-day `trial`
  plan row does NOT grant access any more (the per-user trial replaces it).

## 4. Billing API additions (backend)
- `POST /api/billing/checkout` accepts `{ plan: "solo", interval: "month"|"year" }` → owner = caller (must be a student account_type
  school_student/independent_student, not parent, not teacher; 409 already_subscribed if an open solo or covering family sub exists).
- `GET /api/billing/status?owner=me` returns the solo subscription too (shape documented in docs/billing/README.md).
- Webhook maps the solo lookup keys and `metadata.owner_type='user'` / `user_id` → `billing_subscriptions.user_id`.
- Portal works for the solo customer.

## 5. Admin API contract (admin builder implements; uses service role server-side only)
Route group `/admin` (page, noindex, not linked anywhere, `robots` disallow), API `/api/admin/*`. Every request:
1. Bearer JWT → `auth.getUser` → 401. 2. `platform_admins` contains user → else **404** (don't reveal). 3. JWT `aal` must be `aal2`
(Supabase TOTP MFA) → else `403 {"error":"mfa_required"}`; `/admin` UI offers TOTP enrolment/verification. 4. Rate limit
(existing lib/api-rate-limit.ts): 60 req/min per admin, 10/min for mutations. 5. Mutations need `confirm: true` in the body, are written
to `admin_audit_log` (who, what, target, before/after, IP) BEFORE returning 200.
Endpoints: users list/search (email, role, account_type, school, trial_ends_at, access state, subscription status + Stripe dashboard link,
created_at, last_sign_in_at, blocked), user detail; extend/set trial; grant/revoke free access (until date, note); block/unblock; soft delete
(= block + schedule: calls existing account deletion logic only after typed confirmation); schools list/create; licence grant/extend/revoke
(`platform_assign_licence`), seats, valid_until; add/remove school teacher/admin; recent signups (7/30 days); audit log list.

## 6. Onboarding contract (ui builder)
- Role chosen at signup is respected everywhere; asked at most once. "Weiter mit Google" on the signup tab carries the selected role
  (stored in sessionStorage+localStorage `wa_pending_signup` before redirect, applied in `/auth/callback` before `resolveLanding`; picker only
  if nothing is known). Server: the auth.users insert trigger also stores account_type from raw_user_meta_data (backend).
- Parent → `/familie` (create family) with trial banner; student → `/onboarding` then dashboard with trial banner; teacher → licence gate
  (`/schullizenz`) unless licensed → `/teacher/onboarding`; school-licensed student → no trial/paywall UI.
- `lib/access/client.ts` (ui): `loadMyAccess()` = `supabase.rpc('my_access')`, cached per session, refreshed on focus + after billing return.
  Old DB without `my_access` (PGRST202) → treat as full access (feature off) so the app never locks out before the migration is live.
- `workspace-shell.tsx` / `app/teacher/layout.tsx`: when `has_access=false` → render `<Paywall>` (students/parents) or `<LicenceGate>` /
  `<Blocked>` instead of the page, except allow-listed paths: /settings (export + delete), /abo, /familie (parents: create/invite/pay),
  /schullizenz, /kontakt, /hilfe, legal pages, /auth/*, /login.
- New pages: `/abo` (plan choice: Einzelabo for students, Familienpaket for parents; reuses components/billing), `/schullizenz`.
