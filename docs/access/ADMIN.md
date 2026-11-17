# WendApply platform admin (`/admin`)

Internal dashboard for Panat to manage people, trials, free access, blocks, schools and licences. Contract: SPEC.md §5.
Hidden on purpose: not linked anywhere in the app, `robots.txt` disallows `/admin`, the page and every API answer are
`noindex`, and for anyone who is not a platform admin the API answers **404** (the route "does not exist").

## 1. Become an admin (once)

1. Sign up / log in normally on wendapply.ch with the e-mail you want to use as admin.
2. On the server (service role, never in the browser), add yourself to `public.platform_admins`:

   ```bash
   source ~/.config/alfred/tmp/wendapply-sr.env   # SR + URL, never print it
   node scripts/admin/add-admin.mjs <your-login-email>
   ```

   (`scripts/admin/add-admin.mjs` is built by the backend part. There is NO seed in any migration and the admin e-mail is
   not stored in the code.) To remove an admin, delete the row from `public.platform_admins` (SQL editor, service role) or use the script if it offers a remove option.
3. Open `https://wendapply.ch/admin` (bookmark it).
   - **Logged in with Google** ("Mit Google anmelden"): the dashboard opens directly. Google's own 2-step verification
     protects the login. The dashboard shows a hint "Zwei-Faktor einrichten" to additionally enrol an authenticator app
     (recommended, optional). Once a TOTP factor is enrolled, every visit asks for the code (aal2) – also after Google.
   - **Logged in any other way** (password, magic link): the page asks for **two-factor authentication (TOTP)**:
     scan the QR code with an authenticator app (1Password, Google Authenticator, Authy …), enter the 6-digit code.
     From then on every visit to `/admin` asks for a fresh code when your session is not yet at level `aal2`.
   TOTP MFA must be enabled in Supabase → Authentication → Multi-Factor (it is on by default for TOTP).

Lost the authenticator? Delete your factor in Supabase → Authentication → Users → (you) → MFA factors, then enrol again.

## 2. What you can do

| Tab | Features |
|---|---|
| **Personen** | Search (e-mail, name, id), filter by access state (blocked / free access / trial running / trial over), role, subscription (with / without open subscription) and school (a school / no school). Row: e-mail, role, account type, school(s), access state from `app_access()`, trial end, subscription status + Stripe link, created, last sign-in, MFA, blocked. |
| Person detail | Full `AccessInfo`, `account_access` row, subscriptions (Stripe dashboard links for subscription and customer), families, classes, the last 20 audit entries for this person. Actions below. |
| **Neu** | Sign-ups of the last 7 / 30 days (per day + list). |
| **Schulen** | List with current licence (package, state, valid until, seats), student / admin / teacher counts. Create a school. Detail: all licences, admins, teachers, classes, audit. |
| **Protokoll** | `admin_audit_log`, newest first, filter by action, person, school, admin, date. |

Person actions (all need a confirmation dialog; the API needs `confirm: true`):

| Action | Effect |
|---|---|
| `set_trial` | `account_access.trial_ends_at` = given day (end of day, UTC). Range: 1 year back … 2 years ahead. |
| `extend_trial` | + 1 … 365 days from the later of now / current trial end. |
| `grant_access` / `revoke_access` | `{ forever: true }` = "Gratis (unbefristet)" (`free_access_forever`) **or** `{ until }` (future date, ≤ 10 years) – exactly one – + optional note (≤ 500); records who / when. Revoke clears all of it. Works for every role, also teachers. Blocked wins over a grant. |
| `block` / `unblock` | `blocked_at` + reason (1 … 500). Blocked people can still log in and see "Konto gesperrt". You cannot block yourself. |
| `soft_delete` | Step 1 of deleting: type the person's e-mail → the account is blocked with reason "Zur Löschung vorgemerkt". |
| `delete_account` | Step 2, only for a blocked account, e-mail typed again: runs the existing deletion path (`lib/account-delete-server.ts`: files, rows by cascade, auth user). Refused (409 `subscription_active`) while the person is the last manager of a family / school subscription that still renews – cancel it in Stripe first. Platform admins cannot be deleted here. |

School actions: `grant_access` (`{ forever: true }` or `{ until }`, optional note – free access for all students, teachers and school
admins of the school, no seat limit, stored in `school_access_grants`), `revoke_access` (409 `not_granted` when none), `create` (name, canton, country CH/DE/AT), `assign_licence` (via `platform_assign_licence`: package
pilot/starter/professional/enterprise/custom, status, student_limit – required for custom –, start, end, billing interval,
notes), `update_licence` (valid_until for normal licences, pilot_end for pilots, student_limit, notes), `revoke_licence`
(status → cancelled), `add_admin` (via `platform_add_school_admin`, by e-mail of an existing account), `remove_admin`,
`add_teacher` / `remove_teacher` (`school_teachers`, by e-mail of an existing account).

### Gratis-Zugang (free access) – click path

- **Person**: `/admin` → tab **Personen** → search the e-mail → open the row → **Gratis-Zugang geben** → choose **Unbefristet**
  (or **Bis Datum** + date) → optional note → **Bestätigen**. The row and the header show the badge "Gratis (unbefristet)" /
  "Gratis bis …"; filter **Zugang → Gratis (unbefristet)**. Remove: **Gratis-Zugang entfernen** → **Bestätigen**.
- **School**: tab **Schulen** → open the school → card **Gratis-Zugang** → **Gratis-Zugang geben** → **Unbefristet** / **Bis Datum** →
  **Bestätigen**. Remove: **Entziehen**. The person sees "Gratis (unbefristet)" on `/abo` and in Settings → Abo, no trial banner, no prices.

## 3. API (`/api/admin/*`)

All requests: `Authorization: Bearer <Supabase access token>` – no cookies are read (CSRF-safe). Answers are JSON with
`Cache-Control: no-store`, `X-Robots-Tag: noindex`.

| Method + path | Body / query | Answer |
|---|---|---|
| `GET /api/admin/me` | | `{ user_id, email, aal: "aal1"\|"aal2", auth: "totp"\|"google", mfa_enrolled }` |
| `GET /api/admin/users` | `q, page, state=all\|blocked\|grant\|grant_forever\|trial\|trial_over, role=all\|student\|teacher\|school_admin\|parent, sub=all\|active\|none, school=all\|none\|<uuid>` | `Paged<AdminUserRow>` (50 per page) |
| `GET /api/admin/users/:id` | | `AdminUserDetail` |
| `POST /api/admin/users/:id` | `{ action, confirm: true, … }` (see above) | `{ ok, account_access }` / `{ ok, deleted }` |
| `GET /api/admin/signups` | `days=7\|30` | `{ days, total, by_day[], users[] }` |
| `GET /api/admin/schools` | `q` | `{ items: AdminSchoolRow[] }` |
| `POST /api/admin/schools` | `{ action: "create", name, canton_or_state?, country?, confirm: true }` | `{ ok, school_id }` |
| `GET /api/admin/schools/:id` | | `AdminSchoolDetail` |
| `POST /api/admin/schools/:id` | `{ action, confirm: true, … }` | `{ ok, … }` |
| `GET /api/admin/audit` | `page, action, admin_id, target_user, target_school, since=YYYY-MM-DD` | `Paged<AuditEntry>` |

Types: `lib/admin/types.ts`. Errors (generic on purpose, never DB messages): `401 unauthenticated`, `404 not_found`,
`403 mfa_required`, `403 reauth_required`, `429 rate_limited` (+ `Retry-After`), `400 invalid_input` + `field`, `409 conflict` + `reason`
(`self`, `not_blocked`, `not_granted`, `platform_admin`, `user_not_found`, `already_member`, `licence_closed`, `already_cancelled`),
`409 subscription_active`, `500 failed`, `503 not_configured`.

## 4. Security design

Order of checks (`lib/admin/guard.ts`): per-IP brake (120 / min, before any work) → bearer token verified by Supabase Auth
(`auth.getUser`) → `sub` claim must equal the verified user → `platform_admins` row, else 404 → JWT claim `aal = aal2`,
else 403 `mfa_required` (exception: admin WITHOUT a verified MFA factor, session started by Google OAuth – `amr` contains
`oauth` – and a Google identity whose e-mail Google marked `email_verified` and equals the confirmed account e-mail → passes at
`aal1`; password / magic-link / recovery sessions and unverified e-mails never do) → **fresh login**: the newest `amr`
timestamp of the token (the time of the last real authentication – Google, password, TOTP; a token refresh keeps it) must be
at most `ADMIN_SESSION_MAX_AGE_HOURS` old (default 12, 1 … 168), else 403 `reauth_required` and `/admin` signs this browser
out and asks for a new login (a stolen refresh token stops working for `/admin` after that window) → 60 requests / min per admin, plus 10 / min for mutations. Limits are tunable with
`RATE_LIMIT_ADMIN_IP`, `RATE_LIMIT_ADMIN_USER`, `RATE_LIMIT_ADMIN_MUTATION_USER` (`limit[/seconds]`); `RATE_LIMIT_DISABLED=1` switches them off.

- The service role is used only in `lib/admin/server.ts`, only after the guard passed (allow-listed in `tests/security-audit.test.mjs`).
- Every mutation: JSON body with `confirm: true`, only known keys, strict types (uuid, real dates, enums, lengths, no control
  characters). The audit row (`admin_id, action, target_user/target_school, details.before/after, ip`) is written **before**
  the change; if the audit insert fails, nothing changes; if the change fails, a second `<action>.failed` row is written.
- The browser only holds what the logged-in admin fetched, in React state (no storage). No admin data in the client bundle.
- `/admin` is a dynamic page (`Cache-Control: private, no-store`, `X-Robots-Tag: noindex`), so no copy sits in the Netlify CDN.

### Rules for every NEW admin endpoint / action (security review #3)

1. A route file under `app/api/admin/**` only calls `adminApi().<method>`; the method goes through `run()` → `guard()` (never
   skip it, never read cookies, never trust a client-sent user id / role / admin flag). `mutation: true` for anything that writes.
2. Validate everything with `lib/admin/validate.ts` (`onlyKeys`, `uuid`, `int`, `oneOf`, `text`, `instant`, `date`); body needs
   `confirm: true`. Errors only via `fail()` codes – never a DB message, never a stack.
3. Write the audit row through `audited()` BEFORE the change (actor, target, `details.before/after`); a failed change logs `<action>.failed`.
4. Self-protection: an admin can never block / delete / revoke access of themself or of another platform admin (revoke_access: enforced since re-audit #4); nothing may
   insert into or delete from `platform_admins` through the API (service role script only).
5. SQL: new admin RPCs are `security definer`, `set search_path = ''`, `revoke all … from public, anon, authenticated` and
   `grant execute … to service_role` only; no grants on admin tables to `anon` / `authenticated`; `admin_audit_log` stays append-only.
6. Search / filter input never goes into PostgREST `.or()` / `.filter()` strings or string-built SQL (filter in memory or use `.eq/.in`).
7. Add the new route to the "admin routes go through adminApi" test and a 401 / 404 / 403 / reauth test for it.

## 5. Tests

- `tests/admin-api.test.mjs` – guard (401 / 404 / 403 / 200), validation, rate limits, audit-before-apply for every mutation, hidden route.
- `tests/admin-store.test.mjs` – the service-role store against a fake supabase client.
- `scripts/admin-e2e.mjs` – Playwright against `next dev` with the Supabase auth and `/api/admin/*` mocked in the browser:
  login prompt, 404 look, MFA enrolment, dashboard tabs, actions with confirmation; screenshots desktop + mobile, light + dark
  into `~/Projects/bewerbungen-tracker-wt/_access/admin-shots/`.
  `PLAYWRIGHT=<…/playwright-core/index.mjs> CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node scripts/admin-e2e.mjs`
