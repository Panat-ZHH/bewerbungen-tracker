-- Flows re-audit 3 (2026-11-17): "Meine Daten löschen" must not reset the account type.
-- Since 20261116140000_family_accounts.sql the profiles row also stores account_type (parent / independent_student /
-- school_student, chosen once at signup via account_set_type; the app never re-syncs it: user_metadata.account_type_synced)
-- and birth_year (parental consent). Settings → "Meine Daten löschen" (lib/storage.ts clearLocalData) DELETED the row, so
-- public._account_type() fell back to 'independent_student': a parent could no longer create a family (NOT_A_PARENT),
-- could not redeem a child's "invite your parent" code (INVITE_WRONG_ACCOUNT_TYPE) and could instead join a family as a
-- CHILD with a parent's code. A later profile save re-inserts the row, and the guard (_profiles_account_guard) pins direct
-- inserts to a student type, so the account stayed wrong for good.
-- Fix: a direct DELETE of one's own profile row by a signed-in user (roles authenticated / anon) blanks the personal
-- fields instead and keeps the row (id, user_id, account_type, birth_year). The new app does the same with an UPDATE;
-- this trigger covers cached old app bundles and direct API calls. Service role / SECURITY DEFINER code (account deletion,
-- cascades from auth.users) still deletes for real.
-- ADDITIVE + idempotent: one new trigger function + trigger. No function wrapped by the rate-limit migrations is touched.

create or replace function public._profiles_delete_keeps_account()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then return old; end if;
  update public.profiles p set
    first_name = '', last_name = '', email = '', phone = null, location = null, website = null, linkedin = null,
    avatar_url = null, display_name = null, school = null, grade_level = null, desired_profession = null,
    school_level = null, desired_professions = '{}', canton = null, desired_start_year = null,
    onboarding_completed_at = null, onboarding_tour_completed_at = null, onboarding_tour_step = null
  where p.id = old.id;
  return null; -- row stays (blanked); account_type / birth_year are kept
end;
$$;
revoke all on function public._profiles_delete_keeps_account() from public, anon, authenticated;

drop trigger if exists profiles_delete_keeps_account on public.profiles;
create trigger profiles_delete_keeps_account before delete on public.profiles
  for each row execute function public._profiles_delete_keeps_account();
