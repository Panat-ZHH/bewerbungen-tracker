-- Security re-audit 2 (2026-11-17): profiles.id can no longer be squatted.
-- profiles.id is a text primary key that the app (lib/storage.ts, lib/avatar-storage.ts) and the SECURITY DEFINER RPCs
-- (student_onboarding_save, onboarding_tour_set, account_set_type) always derive as 'profile-' || user_id. The RLS policy
-- only checks user_id, so any signed-in user could INSERT or UPDATE their own row with id = 'profile-<victim uid>'. The
-- victim's first profile write then hit the primary key (not the user_id conflict target) and failed for good:
-- onboarding, account type choice and profile saving were blocked for that account.
-- Fix: for direct table writes (roles authenticated / anon) the guard trigger pins the id: INSERT always gets the
-- canonical 'profile-' || user_id, UPDATE keeps the old id. RPCs (function owner) and the service role are unchanged.
-- ADDITIVE: create or replace of the trigger function only (same name, trigger unchanged, not one of the rate-limited RPCs).
-- Rows squatted before this migration: see docs in REAUDIT-2-security.md (one read-only query finds them).
-- Test: tests/reaudit2-security-db.test.mjs.

create or replace function public._profiles_account_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.account_type = 'independent_student'
    and exists (select 1 from public.class_members m where m.student_id = new.user_id) then
    new.account_type := 'school_student'; -- e.g. profile created by onboarding after joining a class
  end if;
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.id := 'profile-' || new.user_id::text;
    new.account_type := case when exists (select 1 from public.class_members m where m.student_id = new.user_id)
      then 'school_student' else 'independent_student' end;
    new.birth_year := null;
  else
    new.id := old.id;
    new.account_type := old.account_type;
    new.birth_year := old.birth_year;
  end if;
  return new;
end;
$$;
revoke all on function public._profiles_account_guard() from public, anon, authenticated;
