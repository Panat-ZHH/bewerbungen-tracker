# Access model – what the paywall guards in the database

Migration: `supabase/migrations/20261118020000_access_guards.sql`. Test: `tests/access-guards-db.test.mjs` (it fails when a new
security-definer RPC appears that is neither wrapped nor listed below as ungated – decide, then update both).

Every guard asks `public.has_app_access()` (core: `20261118010000_access_core.sql`). While `access_settings.enforce_mode` is
`test_users` (default after the migration) or `off`, it is `true` for every normal user, so nothing changes for live users
before `public.access_go_live()`.

## 1. Tables the client writes directly (PostgREST)

Found by listing every INSERT/UPDATE/ALL policy for `authenticated` after all migrations. Each table gets a RESTRICTIVE
`"access gate insert"` and `"access gate update"` policy (`with check ((select public.has_app_access()))`).
SELECT and DELETE are unchanged.

| Table | Insert | Update | Exception |
|---|---|---|---|
| applications | gated | gated | – (delete stays allowed) |
| application_documents | gated | gated | – |
| cvs (documents) | gated | trigger `cvs_zz_access_gate` | without access only "clearing": file_name/storage_path/file_type/file_size → null, status → 'Draft', updated_at free |
| profiles | gated | trigger `profiles_zz_access_gate` | without access only "clearing" to the values of `CLEARED_PROFILE` (lib/storage.ts) – covers "Meine Daten löschen", removeAvatar and the delete→blank trigger of 20261117163000; since 20261119100000 also `weekly_goal` → null, `help_wishes` → '{}' |
| push_subscriptions | gated | gated | API `/api/reminders/push` POST also answers 402; DELETE (unsubscribe) allowed |
| reminder_settings | gated | gated | switching e-mail AND push off is always allowed |
| calendar_feeds | gated | gated | – (ICS feed reads unchanged) |
| class_goals | gated | gated | teacher-only table |

`product_tour_state` (20261119100000): SELECT own row only, no client write grants (writes via `tour_state_set`).

All other public tables have no client write policy (writes only through definer RPCs / service role).

## 2. Storage

RESTRICTIVE `"access gate insert"` / `"access gate update"` on `storage.objects` for the buckets `cvs` and `avatars`
(other buckets untouched). Downloads and removals are unchanged (delete own files after the trial).

## 3. Wrapped security-definer RPCs (raise `PAYWALL`, SQLSTATE P0001)

Pattern (like 20261117020000_rate_limit_rpcs): the original is renamed to `public._acc_impl_<name>` (no client grants) and a
wrapper with the identical name, arguments, defaults, return type and grants calls `public._assert_app_access()` first.
Helper: `public._acc_wrap(name, args, mode)` (service/migration use only).

- Teacher side: class_create, class_rename, class_set_archived, class_regenerate_code, class_add_coteacher, class_coteachers,
  class_members, class_list_mine, class_announce, class_deadline_add, class_invite_create, class_invite_create_many,
  class_invite_create_many_v2, class_invite_list, class_log_view, class_nudge, class_overview, class_overview_stats,
  class_set_self_report, class_set_student_alias, class_student_aliases, class_student_applications, class_student_timeline,
  class_school_info, teacher_attention, teacher_class_applications_export, teacher_class_students, teacher_dashboard,
  school_attach_class, school_add_teacher.
- Shared class views, gated **only for the class's teachers** (students keep reading): class_announcement_list,
  class_deadline_list, class_goal_progress (`_acc_assert_teacher(p_class_id)`).
- Student content: map_claim_application_rewards, map_island_unlock, map_move_object, map_shop_buy, map_shop_place
  (village, shop, coins, rewards), social_send_request, social_find_by_code, social_respond_request, social_update_profile,
  profile_set_display_name, student_onboarding_save, weekly_goal_set (20261119100000), family_child_overview (parent's view of the child).
- AI usage: the edge function `ai-review` checks `has_app_access` itself (402 `paywall`) – its writes run as service role.

## 4. Deliberately NOT gated (reason)

| RPC | Why |
|---|---|
| class_join, class_preview, class_invite_accept, class_invite_preview, invite_context | SPEC §8 G1: joining a licensed class is how a student GETS access |
| family_create, family_create_invite, family_join, family_set_consent, family_set_share, family_get_my, family_leave, family_remove_member | G3: needed to buy / join the family plan |
| account_set_type, set_my_role | G3/G7: Jahrgang before family_join; wrong role picked |
| export_my_data, family_export_my_data, account_delete_summary | G2/G11 data rights (also when blocked) |
| billing_status_for_school/family/user | billing must work behind the paywall |
| school_admin_my_schools, school_admin_overview, school_detach_class, school_remove_teacher | school admins see licence state / clean up without a licence |
| class_delete, class_leave, class_remove_student, class_remove_coteacher, class_invite_revoke, class_deadline_delete, social_remove_friend | removing / deleting own data is always allowed |
| class_set_sharing, class_set_sharing_v2, social_set_share_companies, social_set_share_outcomes, profile_set_under_16 | privacy switches |
| onboarding_tour_set, mark_notification_read, tour_state_set | UI state only (tour_state_set: 20261119100000, product tour must save behind the paywall / licence gate) |
| funnel_apply | 20261119100000: saves the sign-up answers right after account creation – also for unlicensed teachers and expired trials; validates + rate-limits itself, apply-once (docs/onboarding/DATA.md) |
| reads: class_my_classes, my_class_deadlines, my_notifications, my_self_reports, my_view_log, map_shop_state, map_islands_state, map_friend_island, social_list, social_friends_overview, social_my_profile, social_avatars, social_get_share_companies, social_get_share_outcomes, profile_name_status, school_student_count, is_* helpers | reading own data stays allowed |
| my_access, has_app_access, _assert_app_access, am_i_platform_admin, waitlist_join | the access model itself / public waitlist |
| admin_family_status, admin_family_grant, admin_family_revoke | 20261120100000: platform admins only (checked inside, FORBIDDEN for everybody else); an admin works regardless of their own subscription |

## MERGE NOTE

A later `create or replace function public.<name>` of a wrapped function REPLACES the wrapper: the guard is gone (the app keeps
working). Either base the change on `public._acc_impl_<name>` or call `select public._acc_wrap('<name>', '<args>')` again at the
end of the new migration (it detects the replaced wrapper and wraps the new body). The coverage test catches new RPCs, not
silently removed guards on existing ones – the wrapped-RPC test (`every wrapped RPC raises PAYWALL`) does.
