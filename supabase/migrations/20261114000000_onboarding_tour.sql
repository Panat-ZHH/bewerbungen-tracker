-- First-login onboarding tour for students (additive only).
-- profiles.onboarding_tour_completed_at: set when the tour was finished or skipped. NULL = the tour is shown after login.
-- profiles.onboarding_tour_step: last step reached (0..4), so an interrupted tour resumes where it stopped.

alter table public.profiles add column if not exists onboarding_tour_completed_at timestamptz;
alter table public.profiles add column if not exists onboarding_tour_step smallint;

alter table public.profiles drop constraint if exists profiles_onboarding_tour_step_range;
alter table public.profiles add constraint profiles_onboarding_tour_step_range check (onboarding_tour_step is null or onboarding_tour_step between 0 and 4);

-- Existing users are not forced through the tour: every profile row that exists right now counts as "tour done".
-- The backfill runs only on the first apply (before onboarding_tour_set exists), so re-running the file never marks
-- newer users who have not finished the tour yet.
update public.profiles set onboarding_tour_completed_at = coalesce(onboarding_completed_at, now())
where onboarding_tour_completed_at is null and not exists (
  select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'onboarding_tour_set');

-- Stores the tour progress of the signed-in user only (auth.uid()). Creates the profile row if needed (email from auth).
-- p_step: step reached (clamped to 0..4, NULL keeps the stored one). p_complete = true marks the tour as done (kept forever,
-- a later call with false never clears it). Returns the stored completion time (NULL while the tour is open).
create or replace function public.onboarding_tour_set(p_step integer default null, p_complete boolean default false)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  mail text;
  step smallint := case when p_step is null then null else greatest(0, least(4, p_step))::smallint end;
  done timestamptz;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select coalesce(u.email, '') into mail from auth.users u where u.id = uid;

  insert into public.profiles (id, user_id, first_name, last_name, email, onboarding_tour_step, onboarding_tour_completed_at)
  values ('profile-' || uid::text, uid, '', '', coalesce(mail, ''), step, case when coalesce(p_complete, false) then now() end)
  on conflict (user_id) do update set
    onboarding_tour_step = coalesce(step, public.profiles.onboarding_tour_step),
    onboarding_tour_completed_at = case when coalesce(p_complete, false)
      then coalesce(public.profiles.onboarding_tour_completed_at, now())
      else public.profiles.onboarding_tour_completed_at end
  returning onboarding_tour_completed_at into done;
  return done;
end;
$$;
revoke all on function public.onboarding_tour_set(integer, boolean) from public, anon;
grant execute on function public.onboarding_tour_set(integer, boolean) to authenticated;
