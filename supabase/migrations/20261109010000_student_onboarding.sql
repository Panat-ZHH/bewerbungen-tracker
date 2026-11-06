-- Student onboarding (P0 items 3 + 11): answers on profiles (additive) and a safe public invite context.

alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists school_level text;
alter table public.profiles add column if not exists desired_professions text[] not null default '{}';
alter table public.profiles add column if not exists canton text;
alter table public.profiles add column if not exists desired_start_year integer;
alter table public.profiles add column if not exists onboarding_completed_at timestamptz;

alter table public.profiles drop constraint if exists profiles_onboarding_limits;
alter table public.profiles add constraint profiles_onboarding_limits check (
  (display_name is null or length(display_name) <= 60)
  and (school_level is null or length(school_level) <= 60)
  and coalesce(array_length(desired_professions, 1), 0) <= 8
  and (canton is null or canton ~ '^[A-Z]{2}$')
  and (desired_start_year is null or desired_start_year between 2000 and 2100)
);

-- Saves the onboarding answers of the signed-in student. Creates the profile row if needed (email comes from auth),
-- prefills first/last name + Wohnort, and keeps the name other people see (user_roles.display_name) in sync.
-- p_complete = true marks onboarding as done; false only stores a partial answer.
create or replace function public.student_onboarding_save(
  p_first_name text default null, p_last_name text default null, p_school_level text default null,
  p_professions text[] default null, p_canton text default null, p_place text default null,
  p_start_year integer default null, p_complete boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  mail text;
  first text := left(btrim(coalesce(p_first_name, '')), 40);
  last text := left(btrim(coalesce(p_last_name, '')), 40);
  full_name text;
  profs text[];
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select coalesce(u.email, '') into mail from auth.users u where u.id = uid;
  full_name := btrim(first || ' ' || last);
  select coalesce(array_agg(x), '{}') into profs from (
    select distinct on (lower(btrim(v))) left(btrim(v), 60) as x from unnest(coalesce(p_professions, '{}')) v where btrim(v) <> '' limit 8) s;

  insert into public.profiles (id, user_id, first_name, last_name, email, location, display_name, school_level, desired_professions, canton, desired_start_year, onboarding_completed_at)
  values ('profile-' || uid::text, uid, first, last, mail, nullif(left(btrim(coalesce(p_place, '')), 80), ''), nullif(full_name, ''),
    nullif(left(btrim(coalesce(p_school_level, '')), 60), ''), profs, nullif(upper(btrim(coalesce(p_canton, ''))), ''), p_start_year,
    case when p_complete then now() end)
  on conflict (user_id) do update set
    first_name = case when first <> '' then first else public.profiles.first_name end,
    last_name = case when first <> '' then last else public.profiles.last_name end,
    location = coalesce(nullif(left(btrim(coalesce(p_place, '')), 80), ''), public.profiles.location),
    display_name = coalesce(nullif(full_name, ''), public.profiles.display_name),
    school_level = coalesce(nullif(left(btrim(coalesce(p_school_level, '')), 60), ''), public.profiles.school_level),
    desired_professions = case when p_professions is not null then profs else public.profiles.desired_professions end,
    canton = coalesce(nullif(upper(btrim(coalesce(p_canton, ''))), ''), public.profiles.canton),
    desired_start_year = coalesce(p_start_year, public.profiles.desired_start_year),
    onboarding_completed_at = case when p_complete then coalesce(public.profiles.onboarding_completed_at, now()) else public.profiles.onboarding_completed_at end;

  -- The name classmates / the teacher see. Only students may change it here (teachers have their own onboarding).
  if full_name <> '' then
    update public.user_roles r set display_name = full_name where r.user_id = uid and r.role = 'student';
  end if;
end;
$$;
revoke all on function public.student_onboarding_save(text, text, text, text[], text, text, integer, boolean) from public, anon;
grant execute on function public.student_onboarding_save(text, text, text, text[], text, text, integer, boolean) to authenticated;

-- Public (login page): who invited me? Returns ONLY teacher display name + class name, and only for a currently usable
-- class code (8 chars) or invitation token. Nothing else (no ids, member counts, e-mail restrictions). Zero rows otherwise,
-- so a wrong guess is indistinguishable from a revoked one. Stable + indexed lookups only.
create or replace function public.invite_context(p_code text)
returns table (teacher_name text, class_name text)
language plpgsql stable security definer set search_path = '' as $$
declare code text := btrim(coalesce(p_code, ''));
begin
  if length(code) < 4 or length(code) > 128 then return; end if;
  if length(code) >= 22 then
    return query
      select t.display_name, c.name
      from public.class_invitations i
      join public.classes c on c.id = i.class_id and not c.archived
      join public.user_roles t on t.user_id = c.teacher_id
      where i.token = code and not i.revoked and i.expires_at > now() and (i.max_uses is null or i.uses < i.max_uses)
      limit 1;
  else
    return query
      select t.display_name, c.name
      from public.classes c
      join public.user_roles t on t.user_id = c.teacher_id
      where c.join_code = upper(code) and not c.archived
      limit 1;
  end if;
end;
$$;
revoke all on function public.invite_context(text) from public;
grant execute on function public.invite_context(text) to anon, authenticated;
