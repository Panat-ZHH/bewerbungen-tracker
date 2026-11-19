# Onboarding funnel + product tour – database contract

Migration: `supabase/migrations/20261119100000_onboarding_funnel.sql` (additive, idempotent, after 20261118800000).
Spec: `_onboarding/SPEC-DATA.md` (§2.4 schema, §3 save path, §4 weekly goal, §5.1 tour API). Client: `lib/funnel/**`, `lib/tour/state.ts`,
`lib/rewards.ts` (weekly goal), `lib/role.ts` (routing). Tests: `tests/onb-data-funnel-db.test.mjs`, `tests/onb-data-tour-db.test.mjs`
(PGlite, all migrations), `tests/onb-data-unit.test.mjs`, `tests/onb-data-purge.test.mjs`.

## Objects

| Object | Kind | Who may call / write | Notes |
|---|---|---|---|
| `profiles.weekly_goal` smallint 1–20 | column | owner (RLS own row; paywall clear-update trigger) + `weekly_goal_set` | dashboard goal; localStorage `wendapply-weekly-goal` is only a cache |
| `profiles.help_wishes` text[] ≤ 5, enum | column | owner + `funnel_apply` | student `lebenslauf brief schnuppern ueberblick eltern`, parent `ueberblick fristen dokumente ermutigen` |
| `profiles.funnel_completed_at`, `funnel_version` | columns | **only** `funnel_apply` (trigger `profiles_funnel_guard` pins them for authenticated/anon) | apply-once marker; kept by «Meine Daten löschen» |
| `profiles_funnel_limits` | CHECK | – | ranges + enum above |
| `product_tour_state (user_id, tour, version, status, last_step, updated_at)` | table | SELECT own row; writes only via `tour_state_set` | cascade on user delete; picked up by `export_my_data()` |
| `funnel_apply(p_answers jsonb default null) → jsonb` | definer RPC, **ungated** | authenticated | validates everything (§ below), apply-once, role rules, rate limit `funnel` 10/h user, 300/h IP; `null` = read `raw_user_meta_data.wa_funnel` |
| `tour_state_set(p_tour, p_version, p_status, p_step default null) → jsonb` | definer RPC, **ungated** | authenticated | upsert own row; rate limit `tour` 60/h user, 1200/h IP; errors `INVALID_REQUEST` (detail = field) |
| `weekly_goal_set(p_goal int) → smallint` | definer RPC, **paywall-wrapped** (`_acc_wrap`) | authenticated | rate limit `weekly-goal` 120/h user, 2400/h IP |
| `privacy_release_unconfirmed_trial(p_uid uuid) → boolean` | definer RPC | **service_role only** | used by `scripts/admin/purge-unconfirmed.mjs` before deleting a never-confirmed sign-up |
| `_funnel_clean(text)`, `_funnel_role_of(uuid)`, `_profiles_funnel_guard()` | helpers | nobody (revoked) | |
| `_access_gate_clear_update()`, `_profiles_delete_keeps_account()` | **replaced** (same body + `weekly_goal`, `help_wishes`) | – | `CLEARED_PROFILE` in `lib/storage.ts` must match (parity tests) |

## funnel_apply rules

- Payload ≤ 4 KB, unknown keys rejected, `v = 1`, every value type-checked with `jsonb_typeof` before a cast. Error `INVALID_FUNNEL`,
  `detail` = field name only (never the value) – same order and field names as `validatePayload()` in `lib/funnel/validate.ts`
  (parity test runs one corpus through both).
- Strings: NUL and C1 controls refused on the raw value; invisible / bidi characters stripped (same set as sec-release's
  `_strip_invisible_columns`), whitespace collapsed; first name 1–40 with ≥ 1 letter, place ≤ 60, ≤ 3 professions 1–60 each, deduped
  case-insensitively. Birth year y−100…y−8, start year y−1…y+4 (only with professions), weekly goal 1–10, enums for school level
  (9 labels), canton (26 codes), help wishes per role.
- Apply once: not when `funnel_completed_at` or `onboarding_completed_at` is set (`already_done`) or the account is ≥ 14 days old
  (`not_new`). Advisory lock per user → parallel calls apply once.
- Roles: student/parent via `account_set_type` rules, staff via `set_my_role('teacher')` (licence gate unchanged, no access). An
  established other role (teacher, school admin, pupil in a class asking for parent, family child getting older) is not changed:
  `role_mismatch: true`, only the first name is saved. Never `school_admin`, `platform_admins`, grants or `account_access` columns.
- Works without app access (expired trial) and for unlicensed teachers (definer insert passes the restrictive insert policy and the
  clear-update trigger).

## Rollback

- **Normal rollback = app only** (redeploy the previous production deploy). The old app never reads the new columns/table; the two
  replaced trigger functions behave identically for the old columns. Nothing to undo in the DB.
- **Backup first** (orchestrator, before `db push`): schema + data dump of `public.profiles`, `public.user_roles` (or a PITR point);
  note the timestamp in `_onboarding/STATE.md`.
- Emergency DB revert – only after the app rollback, loses weekly goals, help wishes and tour state, **not additive → only with
  Panat's yes**:

```sql
drop function if exists public.weekly_goal_set(integer); drop function if exists public._acc_impl_weekly_goal_set(integer);
drop function if exists public.funnel_apply(jsonb); drop function if exists public._funnel_role_of(uuid);
drop function if exists public._funnel_clean(text);
drop function if exists public.tour_state_set(text, integer, text, integer);
drop function if exists public.privacy_release_unconfirmed_trial(uuid);
drop table if exists public.product_tour_state;
drop trigger if exists profiles_funnel_guard on public.profiles; drop function if exists public._profiles_funnel_guard();
-- then re-run the function bodies of _access_gate_clear_update (20261118020000_access_guards.sql)
-- and _profiles_delete_keeps_account (20261117163000_profiles_clear_keeps_account.sql)
alter table public.profiles drop constraint if exists profiles_funnel_limits;
alter table public.profiles drop column if exists weekly_goal, drop column if exists help_wishes,
  drop column if exists funnel_completed_at, drop column if exists funnel_version;
delete from public.rate_limits where scope in ('funnel', 'tour', 'weekly-goal'); -- optional
```

## Unconfirmed sign-ups

`scripts/admin/purge-unconfirmed.mjs` – service role, **dry run by default**, `--days N` (default 7), `--apply` deletes users that
were never confirmed and never signed in: `privacy_release_unconfirmed_trial(uid)` → Admin API delete → `admin_audit_log`
(`unconfirmed_signup_purged`, no user id). **Not scheduled**: Panat decides the period (SPEC-DATA §8.1).

## Merge note for the security release (sec-release)

None of the 7 sec-release migrations creates or replaces an object of this migration (checked by name, and by replaying
sec-release's migrations + this one on PGlite: funnel/tour/guards/unit tests and sec-release's DB tests green). Two things to do
when sec-release is merged: (1) `tests/reaudit2-security-db.test.mjs` profiles trigger list = union of both branches
(`profiles_aa_strip_invisible` + `profiles_funnel_guard`) – one-line conflict; (2) its migrations have earlier timestamps →
`supabase db push --include-all`.
