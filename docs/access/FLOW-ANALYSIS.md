# WendApply access model: flow analysis (UX/flow analyst, 2026-11-17)

Basis: production code on branch `acc-flow` (= `main` 8e12966 + SPEC commits 85ec42d/6998d21) and a live probe of
https://wendapply.ch with 5 throwaway users (`probe-flow-*@wendapply-probe.invalid`, created confirmed via the admin API,
all deleted afterwards, deletion verified: `GET /admin/users/<id>` = 404, no `*@wendapply-probe.invalid` user left).
Probe script: `_access/flow-probe.mjs`, raw results: `_access/flow-probe.json`, screenshots: `_access/flow-shots/`.
Earlier orchestrator findings (`_access/FINDINGS.md` 1–11) are not repeated in detail, only referenced as F1…F11.

Owner of the fix: **backend** = DB / RPC / API / billing, **ui** = onboarding / routing / banner / paywall pages,
**admin** = /admin + admin API. Severity: critical (users locked out / pay for nothing / data rights broken),
high (wrong role experience or a dead end), medium (confusing, workaround exists), low (polish).

---

## 1. Gaps

### Critical

| # | Role | Gap | Steps | Expected | Actual / risk | File:line | Fix |
|---|---|---|---|---|---|---|---|
| G1 | student (trial over) | **Joining a licensed class is impossible once the trial is over.** SPEC §3 says `_assert_app_access()` is called by "class join" RPCs, and §6's allow-list does not contain `/classes/join/*` or `/classes`. The class code is exactly how a student GETS school-licence access. | Private student signs up in August, trial ends, in September the teacher hands out a class code of a licensed school → opens `/classes/join/<code>` | Join works, access switches to `school_licence`, paywall disappears | Paywall replaces the join page; the join RPC raises PAYWALL | SPEC.md §3 (`_assert_app_access` list), §6 allow-list; `app/classes/join/[code]/page.tsx:79-91`; `lib/classes.ts joinClass/acceptInvite` | **backend**: `join_class` / `accept_class_invite` / `preview_class` / `preview_invite` must NOT call `_assert_app_access` (or only when the class's school is unlicensed AND the user has no access – simplest: never gate joining). **ui**: add `/classes/join/*` (+ the "Klassencode" field on `/classes`) to the paywall allow-list, and put a "Klassencode eingeben" entry on the paywall itself. |
| G2 | all (trial over) | **"Meine Daten löschen" breaks under the paywall.** It is implemented with UPDATEs (`profiles.update(CLEARED_PROFILE)`, `cvs.update(...)`), not DELETEs. SPEC §3 adds restrictive `for update … with check (has_app_access())` policies → the clear fails with an RLS error after the trial, although SPEC §1 promises "delete data" stays allowed. | Trial over → Einstellungen → "Meine Daten löschen" | Data cleared | `new row violates row-level security policy` → "Die Daten konnten nicht vollständig gelöscht werden" | `lib/storage.ts:41` (clearLocalData); `supabase/migrations/20261117163000_profiles_clear_keeps_account.sql` (trigger turns DELETE into UPDATE too) | **backend**: either exempt `profiles` and `cvs` from the restrictive UPDATE policy, or (better) add a definer RPC `clear_my_data()` that blanks/deletes without the gate and switch the client to it (**ui**, `lib/storage.ts`). Test: paywalled user can clear data and export. Same check for storage `remove` on `cvs`/`avatars` (DELETE stays allowed – keep it). |
| G3 | parent / child (trial over) | **Family RPCs needed to buy and to join must stay ungated.** SPEC §1 allows "family invite/join needed to buy the family plan", but §3 says every definer RPC that "creates/changes user content" asserts access. `family_create`, `family_create_invite`, `family_join`, `family_set_consent`, `account_set_type` (birth year is required before `family_join`, family_accounts.sql:473) all write rows. | Parent's trial is over → creates family → invites child → child (trial over) opens invite → enters Jahrgang → joins → parent pays | Whole chain works under the paywall | Any of these raising PAYWALL makes the family plan unbuyable | `supabase/migrations/20261116140000_family_accounts.sql:324,390,430,455-480` | **backend**: explicit allow-list of ungated RPCs in the migration + a PGlite test that a paywalled parent and child can complete create → invite → join → consent. **ui**: `/familie/einladung/*` and the Jahrgang dialog on the child side must be reachable under the paywall (SPEC §6 lists `/familie` only "parents" – children need it too). |
| G4 | private student with solo / family subscription | **Account deletion with a running solo subscription.** `account_billing_blockers` only knows `family` and `school` owners. A student with an active `solo` sub deletes the account → Stripe keeps charging, nobody can open the portal. | Student buys Einzelabo → Einstellungen → Konto löschen | 409 "Kündige zuerst dein Abo" (or auto-cancel at period end) | Account deleted, subscription orphaned | `supabase/migrations/20261117120000_account_delete_billing_guard.sql:10-26`; `app/api/account/delete` | **backend**: add a `solo` branch (`billing_subscriptions.user_id = p_user_id`, renewing statuses). **ui**: delete dialog shows the "Abo zuerst kündigen" link to the portal for `solo` too. |

### High

| # | Role | Gap | Steps | Expected | Actual | File:line | Fix |
|---|---|---|---|---|---|---|---|
| G5 | all new Google signups | **Role chosen on the signup tab is lost with "Weiter mit Google"** (= F1, Panat's "asked twice" bug). Same for the preselected role + Jahrgang on family invite links (screenshot A1 shows "Schüler:in privat" + Jahrgang preselected next to the Google button). | Signup tab → Elternteil → Weiter mit Google | Lands on `/familie` | `/auth/role` asks "Wie nutzt du WendApply?" again; Jahrgang must be re-entered | `app/login/page.tsx:127-137`; `lib/role.ts:107` | **ui** per SPEC §6 (`wa_pending_signup` incl. birth year, applied in `/auth/callback`; on the *login* tab Google must not apply a stale pending choice for an existing account). **backend**: insert trigger reads `account_type`. |
| G6 | school admin | **School admins get the student experience.** `loadMyRole` maps every role that is not `teacher` to `student`, so a `user_roles.role = 'school_admin'` user lands on `/dashboard` + student tour, sees prices / would see the student trial banner and paywall. If created without metadata they are first sent to the role picker, where `set_my_role` raises FORBIDDEN and the fallback silently makes them "student". | Platform creates school admin → admin logs in | Lands on `/schul-admin`; no trial/paywall UI; licence status visible | `/auth/role` → `/onboarding` → `/dashboard` | `lib/role.ts:73-83, 86-98`; `supabase/migrations/20261116100000_b2b_schools_licences.sql:225` | **ui**: `UserRole` gets `school_admin` (or route by `AccessInfo.role`); home = `/schul-admin`; `needsRoleChoice` false for school admins. **backend**: `my_access().role = 'school_admin'` also when the user only has a `school_admins` row. **admin**: creating a school admin sets `role_confirmed` metadata. |
| G7 | anyone who picked the wrong role | **No way to change the role after the one-time picker.** Under the new model a student who taps "Lehrperson" by mistake is stuck on `/schullizenz` forever (teachers have no trial). `set_my_role` allows switching while there are no classes, but no UI calls it except the picker, and the picker never shows again (`role_confirmed`). | Signup → Lehrperson (by mistake) | `/schullizenz` offers "Ich bin Schüler:in / Elternteil" → role switch | Dead end (today: teacher onboarding) | `lib/role.ts:47-51, 86-98`; `app/auth/role/page.tsx:31` | **ui**: on `/schullizenz` a "Falsche Rolle gewählt?" link → picker in "switch" mode (calls `set_my_role` + `account_set_type`). **backend**: role switch must not reset the trial (trial is per user id – keep), and switching teacher→student must not give a teacher a way to keep teacher RPCs (they are gated by role + licence, OK). |
| G8 | school student (signup "Schule") | **"Schule" signup never asks for the class code.** The 5-step tour (Willkommen → Profil → Bewerbung → KI-Check → Fertig) has no class step; the student only finds "Klassen" later. Under the new model these students start a paid trial, see "Abo wählen" and prices although their school may be licensed. | Signup → Schule → onboarding | Step "Klassencode" first (skip = "Ich habe noch keinen Code"); with a licensed class: no trial banner at all | Tour without class code; trial/paywall would show | `components/onboarding/student-onboarding.tsx:33`; `components/onboarding/role-cards.tsx:9` | **ui**: class-code step for `school` choice; trial banner for school students without class says "Hast Du einen Klassencode? Damit zahlt Deine Schule." |
| G9 | teacher | **Teachers can create classes without a licence** (= F4, live: teacher lands on `/teacher/onboarding` "Erste Klasse"). Also teacher opening a family invite is silently redirected to the teacher onboarding (no explanation). | Signup → Lehrperson | `/schullizenz` unless licensed | `/teacher/onboarding` → create class | `app/teacher/layout.tsx:25-31`; `lib/role.ts:111` | **ui**: licence gate in `app/teacher/layout.tsx` before the onboarding redirect. **backend**: `create_class`, class invitations, teacher views gated. |
| G10 | user without metadata (first Google login) | **Cannot reach Einstellungen (export / delete) before choosing a role.** The shell redirects every workspace page incl. `/settings` to `/auth/role` (live: `/settings` → `/auth/role?next=%2Fsettings`). Someone who only wants to delete the account must first pick a role. | First Google login → wants to leave | `/settings` reachable (SPEC §6 allow-list) | Forced role picker | `components/layout/workspace-shell.tsx:102` | **ui**: skip `needsRoleChoice` redirect for allow-listed paths (`/settings`, `/kontakt`, `/hilfe`, legal). |
| G11 | blocked user | **Blocked users need export + delete too** (DSG / GDPR right to data and erasure). SPEC §1 says "no access at all"; §6 allow-list does not say whether `<Blocked>` wins over `/settings`. | Admin blocks user → user logs in | "Konto gesperrt" + links "Daten exportieren", "Konto löschen", Kontakt | Undefined | SPEC.md §1, §6 | **ui** + decision for Panat (recommended: allow export + delete + logout while blocked). **backend**: export/delete endpoints must not check `blocked`. |
| G12 | school-licensed student | **Licence ends / student removed from class → instant hard paywall** without explanation (trial long over). AccessInfo only says `state: expired, reason: none`. | School licence runs out on 31.7. | Banner "Die Lizenz Deiner Schule ist abgelaufen" + options (Einzelabo, Familienpaket, Lehrperson fragen) | Generic paywall with prices, no context | `lib/access/types.ts` (no "previous reason") | **backend**: add `school` (last school) or `expired_reason: 'school_licence_ended' | 'trial_ended' | 'subscription_ended'` to `AccessInfo` (CONTRACT CHANGE, additive). **ui**: paywall copy per reason. |

### Medium

| # | Role | Gap | Steps / expected vs actual | File:line | Fix |
|---|---|---|---|---|---|
| G13 | all e-mail signups | **Trial starts at `auth.users.created_at`, before the e-mail is confirmed.** Someone who confirms 5 days later has 2 days left. | Use `coalesce(email_confirmed_at, created_at)` (Google: equal) or set `trial_started_at` on first confirmed sign-in; keep the per-email ledger | SPEC.md §1, §3 (trigger after insert) | **backend** (CONTRACT CHANGE, small) |
| G14 | child in a paid family | **Family coverage only for `active` members.** A child under 16 joins → `pending` until the parent grants consent → not covered although the parent paid; child sees prices. | Child should see "Warte auf die Zustimmung Deiner Eltern" (no prices); parent's family page shows "Zustimmung geben" first | SPEC.md §3 family coverage; `family_accounts.sql:205-207` | **backend**: decide (recommended: pending member counts as covered for 7 days, or AccessInfo flag `family_pending`). **ui**: copy. |
| G15 | student with solo + school/family | **Double payment.** Student with Einzelabo joins a licensed class or a paid family → keeps paying. Checkout already refuses solo when a covering family sub exists (§4), but not the reverse. | After join: banner "Du bist jetzt über Deine Schule/Familie abgedeckt – Abo kündigen?" with portal link | SPEC.md §4 | **ui** (banner using `AccessInfo.subscription` + reason), **backend**: family checkout warns if a child has an open solo sub (low). |
| G16 | parent | **Class invite link is silently dropped for parents** (live: parent with `next=/classes/join/…` and direct open → `/familie`, no message). Same for teacher on a family invite. | Short notice "Dieser Link ist für Schüler:innen" | `lib/family-core.ts:94` (PARENT_BLOCKED incl. `/classes`); `lib/role.ts:30` | **ui** |
| G17 | invite links | **Invite comes after the 5-step tour.** Live: indep student logging in with `next=/familie/einladung/…` lands on `/onboarding?next=…`; the invite (and for the access model: the thing that may grant access) is only shown after the tour. | Invite first, then tour | `lib/role.ts:112` | **ui**: if `next` is `/classes/join/*` or `/familie/einladung/*`, go there first and offer the tour afterwards. |
| G18 | logged-out invite visitor | **Login page opens on the "Anmelden" tab even for invite links** (people with no account must find "Konto erstellen"). The role preset is correct (live: `fuer=kind` → independent, `fuer=eltern` → parent, class link → school). | Open signup tab when `next` is an invite and no session | `app/login/page.tsx:29, 41-51` | **ui** |
| G19 | all | **Marketing / in-app copy says "kostenlos" for students** (login sticker "Gratis für Schüler:innen", /hilfe FAQ "Nein. … kostenlos", start page, /familien, /schulen, family copy "Für dich bleibt WendApply kostenlos" – live on the student family page). Contradicts trial + paywall for private students. | Copy: "7 Tage gratis testen", "Mit Schullizenz für Schüler:innen gratis" | `app/login/page.tsx:165`; `app/hilfe/page.tsx:27`; `app/page.tsx:41`; `app/familien/page.tsx:59,96,127`; `lib/family-copy.ts:62,127,146`; `lib/family-core.ts:308,317`; `components/billing/logic.ts:21`; `lib/seo/offer.ts:14-16` | **ui** (copy; the `/preise` page needs the Einzelabo + family + trial block) |
| G20 | parent | **Role truth is client metadata.** Routing uses `user_metadata.account_type` (`isParentMeta`) which the user can edit with `auth.updateUser`; the server truth is `profiles.account_type`. Under the access model the UI must route by `AccessInfo.role/account_type` (server), else a user can make the UI show the parent view and the "Familienpaket" checkout path while the API sees a student (= F2). | — | `lib/family-core.ts:91`; `components/layout/workspace-shell.tsx:107,159`; `lib/role.ts:110` | **ui**: use `my_access()` for role routing once loaded; metadata only as fallback before the RPC exists. |
| G21 | all | **`/schul-admin` open to every role** (= F5, live: teacher, parent and student see "Keine Schule zugeordnet"). With the licence gate teachers will be sent to `/schullizenz` but `/schul-admin` stays reachable. | Non-admins → home; school admins → `/schul-admin` | `app/schul-admin/page.tsx:17-21` | **ui** |
| G22 | parent | **`/familie/bezahlen` (in-app checkout) live says "Die Bezahlung in der App ist gerade ausgeschaltet"** while Stripe is live via the family page – two payment entry points, one disabled. The new `/abo` page must be the single entry; old URL should redirect. | — | `app/familie/bezahlen/page.tsx`; `components/billing/in-app-checkout` | **ui** |

### Low

- G23 **Student `?next=/teacher/...`** goes through the tour first, then silently to `/dashboard` (live `/onboarding?next=%2Fteacher%2Fclasses`). Drop teacher-only `next` before the tour (`lib/role.ts:112`). ui.
- G24 **"Meine Daten löschen" leaves documents, AI reviews, village/coins, friends, family links** (only applications, profile fields, CV files). Rename to "Bewerbungen und Profil löschen" or extend; not access-related but users may expect a reset. backend/ui.
- G25 **Re-signup after deletion:** the trial ledger must be written by the deletion path BEFORE `auth.users` is removed (cascade deletes `account_access`). Also delete via admin "soft delete". backend test.
- G26 **Pending invite in localStorage survives logout/another user** (`components/friends/shared` pendingInvitePath): user B on the same device gets user A's class invite after login. Clear on logout. ui.
- G27 **`/schullizenz` and `/abo` do not exist yet** (live: 404 page). Expected – just make sure the old public `/preise` links to `/abo` only for signed-in users. ui.

### Verified OK (live)
- Password signup roles land correctly (parent → `/familie`, school/indep → `/onboarding`).
- Family invite links preselect the right signup role and show the hint (A1/A2 screenshots); class links preselect "Schule".
- Role picker after first Google login: picking "Elternteil" stores `account_type=parent`, syncs it, lands on `/familie` (B3).
- Account deletion via Einstellungen (typed `LÖSCHEN` + password) works and redirects to `/login?deleted=1` with the confirmation text; user gone (F3).
- `safeNextPath` rejects `//`, `/login`, control chars.

---

## 2. Intended screen sequences after the access model (per role, consistent with SPEC)

Common rules: banners/paywall/gates only when `AccessInfo.enforced = true`. Allow-list under paywall/gate:
`/settings` (export, clear data, delete), `/abo`, `/familie` + `/familie/einladung/*` (parents AND students),
`/classes` code field + `/classes/join/*` (students), `/schullizenz`, `/kontakt`, `/hilfe`, legal pages, `/auth/*`, `/login`, logout.
Banner text ("Gratis-Testwoche: noch X Tage" + "Danach brauchst Du ein Abo" + button "Abo wählen") on every workspace page while `state = trial`.

**Parent (Elternteil)**
1. `/login` signup tab → "Elternteil" → e-mail or Google (role kept, G5) → confirmation mail (password) → `/auth/callback`.
2. `/familie` step 1 "Familie erstellen" + trial banner (`trial_days_left`).
3. Step 2 "Kind verbinden" (invite link `?fuer=kind`) – works also after the trial (G3).
4. Step 3 "Familienpaket wählen" → `/abo` (family only, no Einzelabo) → Stripe → `/abo?status=success` → `loadMyAccess()` refreshed → banner gone, state `active` (`family_subscription`).
5. Trial over without payment: `/familie` stays usable for create/invite/pay; child overview pages show `<Paywall>` (parent) with "Familienpaket wählen".
6. Payment failed: banner "Zahlung fehlgeschlagen – bis <grace_until>" + "Zahlungsmethode ändern" (portal).

**Student via school/class**
1. Signup "Schule" (or opens `/classes/join/<code>` logged out → signup preselected "Schule", signup tab open G18).
2. If a `next` invite exists: class join page FIRST (G17), then tour. Otherwise onboarding step "Klassencode" (G8) → tour.
3. Class of a licensed school: `reason = school_licence` → no banner, no prices, no trial text anywhere (also not on `/familie` – family plan text hidden).
4. Class of an unlicensed school / no class yet: same as private student (trial banner; banner adds "Hast Du einen Klassencode?").
5. Licence ends: paywall with reason "Lizenz Deiner Schule abgelaufen" (G12) + Klassencode / Einzelabo / Eltern einladen.

**Private (independent) student without family**
1. Signup "Schüler:in privat" + Jahrgang (kept with Google, G5) → `/onboarding` tour → `/dashboard` with trial banner.
2. "Abo wählen" → `/abo`: Einzelabo CHF 4.90/Monat or CHF 49/Jahr; secondary: "Lieber über Deine Eltern? Eltern einladen" (→ `/familie`, child_invites_parent) and "Klassencode eingeben".
3. Trial over → `<Paywall>` on all non-allow-listed pages: read-only data visible? (SPEC: read own data allowed – recommended: paywall card on top, data list read-only below, all create/edit buttons disabled), export/delete in Einstellungen.
4. After payment → state `active` (`subscription`); cancel at period end → banner "Abo endet am …".

**Private student with family**
1. Same signup as above, or via parent's invite `/familie/einladung/<code>?fuer=kind` (signup preselected "Schüler:in privat" + Jahrgang).
2. Joins family (works under paywall, G3). Under 16: "Warte auf Zustimmung" state (G14) – no prices.
3. Parent pays → child `reason = family_subscription`, no banner. Child never sees the Einzelabo offer while covered; `/abo` for a covered child shows "Du bist über das Familienpaket abgedeckt".
4. Child has own Einzelabo and joins paid family → banner "Doppelt bezahlt? Einzelabo kündigen" (G15).

**Teacher (Lehrperson)**
1. Signup "Lehrperson" → `/auth/callback` → licence check.
2. No licence: `/schullizenz` "Zugang nur mit Schullizenz" + own login e-mail displayed ("Gib diese Adresse Deiner Schuladministration") + support@wendapply.ch + `/kontakt` + "Falsche Rolle gewählt?" (G7). No trial, no banner, no prices for students.
3. Licensed (school_teachers / school_admins / class of licensed school) or admin grant → `/teacher/onboarding` (name, first class) → `/teacher`.
4. Licence ends: `/schullizenz` with "Die Lizenz Deiner Schule ist abgelaufen"; existing classes read-only via export? (decision: teacher keeps read access to class list, no new invitations).

**School admin**
1. Created by WendApply admin (admin UI) or `school_add_admin`; logs in → `/schul-admin` (G6), never the student tour or role picker.
2. Valid licence: `/schul-admin` (licence, seats, teachers list with "Lehrperson hinzufügen" by e-mail = `school_add_teacher`), `/teacher` if also teacher.
3. No / expired licence: `/schul-admin` with licence status + "Lizenz verlängern" (billing card) – `/schul-admin` and school billing must be on the licence-gate allow-list for school admins.

**First Google login without metadata**
1. If `wa_pending_signup` exists → applied in `/auth/callback`, no picker (G5).
2. Else `/auth/role` once; `/settings`, `/kontakt`, `/hilfe` reachable without picking (G10). Then the role's sequence above; trial already counts from `created_at` (or confirmation, G13).

**Invite links**
- `/classes/join/<code>` logged out → `/login?next=…` signup tab "Schule" → after signup/confirm: join page first → join (always allowed) → access recomputed (licence → banner disappears) → tour.
- `/familie/einladung/<code>?fuer=kind|eltern` → signup preselected → join page first (birth year dialog for children) → family; prices only for parents.
- Wrong role opens an invite (parent ↔ class link, teacher ↔ family link): explicit message, not a silent redirect (G16).

**Login with `?next=`**
- Safe `next` kept through signup, e-mail confirmation and Google. If `next` is not allowed for the role → home without the tour detour (G23). If paywalled: page renders the paywall in place (allow-listed pages render normally).

**Account deletion / "Meine Daten löschen"**
- Always reachable (trial over, paywall, licence gate, blocked – G11), never blocked by RLS (G2).
- Running solo/family/school subscription that still renews → 409 with portal link (G4).
- Deletion writes the trial ledger before removing the user (G25); re-signup with the same e-mail → no new trial, `state = expired` right away with the copy "Für diese E-Mail-Adresse wurde die Testwoche schon genutzt".

---

## 3. CONTRACT CHANGES proposed (not applied – for the orchestrator)
1. `AccessInfo.expired_reason: 'trial_ended' | 'subscription_ended' | 'school_licence_ended' | null` (G12) and optionally `family_pending: boolean` (G14).
2. Trial start = `coalesce(email_confirmed_at, created_at)` (G13).
3. Explicit list of RPCs that never call `_assert_app_access`: class join/preview, family create/invite/join/consent/leave, `account_set_type`, `set_my_role` (no classes), export, `clear_my_data` (new), account deletion, billing.
4. `AccessRole` routing must also cover users who are only in `school_admins` (G6).
5. §6 allow-list: add `/classes`, `/classes/join/*`, `/familie/einladung/*` for students; `/schul-admin` for school admins.
