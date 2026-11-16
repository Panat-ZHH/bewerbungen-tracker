-- Familien / Privatkunden: parent accounts, independent students, family package (1 parent + 1 child, extensible via seats).
-- Run AFTER 20261116130000_b2b_rls_audit.sql. Additive and idempotent. Docs: docs/family/README.md, docs/b2b/DATA-MODEL.md ("Familien").
--
-- NO payment code: plans are assigned by hand (service role, admin_assign_family_plan). The family plan is a row in the
-- existing licence table public.school_licences (owner = exactly one of school_id / family_id, plan_type 'school'|'family').
-- School-managed students are unaffected: no existing RPC, trigger or policy of the school/teacher model is changed;
-- school rows keep their old status set and the school seat logic only ever reads rows with school_id.
--
-- Privacy model:
--  * Nobody reads other people's family rows directly. RLS: own membership rows, own invites, the own family's name.
--  * A parent sees a child ONLY through family_child_overview(), and only the parts the child shares (share_settings).
--  * A child under 16 (by birth year, conservative) can use the app, but family sharing stays OFF until a parent of the
--    family grants consent (Swiss DSG / DSGVO Art. 8). The child can switch every part off at any time.
--  * No classmates, classes, schools or other families are ever returned.
--  * Every SECURITY DEFINER function sets search_path = '' and checks auth.uid().

-- ---------- 1. profiles: account type + birth year ----------
alter table public.profiles add column if not exists account_type text not null default 'independent_student';
alter table public.profiles add column if not exists birth_year integer;
alter table public.profiles drop constraint if exists profiles_account_type_check;
alter table public.profiles add constraint profiles_account_type_check check (account_type in ('school_student', 'independent_student', 'parent'));
alter table public.profiles drop constraint if exists profiles_birth_year_check;
alter table public.profiles add constraint profiles_birth_year_check check (birth_year is null or birth_year between 1900 and 2100);

-- Existing students in a (school or teacher) class are school-managed. Teachers and school admins keep their user_roles role;
-- account_type is only a product label for students and parents.
update public.profiles p set account_type = 'school_student'
where p.account_type = 'independent_student' and exists (select 1 from public.class_members m where m.student_id = p.user_id);

-- Direct table access (PostgREST, role authenticated) may not set account_type / birth_year: they are written only by
-- account_set_type() (consent depends on them). Inserts get the derived default, updates keep the old values silently, so
-- existing client code that upserts profiles keeps working. SECURITY INVOKER on purpose: inside our RPCs current_user is
-- the function owner and the guard does not apply.
create or replace function public._profiles_account_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.account_type = 'independent_student'
    and exists (select 1 from public.class_members m where m.student_id = new.user_id) then
    new.account_type := 'school_student'; -- e.g. profile created by onboarding after joining a class
  end if;
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.account_type := case when exists (select 1 from public.class_members m where m.student_id = new.user_id)
      then 'school_student' else 'independent_student' end;
    new.birth_year := null;
  else
    new.account_type := old.account_type;
    new.birth_year := old.birth_year;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_account_guard on public.profiles;
create trigger profiles_account_guard before insert or update on public.profiles
  for each row execute function public._profiles_account_guard();

-- Joining a class makes an independent student school-managed (label only; parents stay parents).
create or replace function public._class_members_account_type()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles p set account_type = 'school_student' where p.user_id = new.student_id and p.account_type = 'independent_student';
  return new;
end;
$$;
drop trigger if exists class_members_account_type on public.class_members;
create trigger class_members_account_type after insert on public.class_members
  for each row execute function public._class_members_account_type();

-- ---------- 2. families ----------
create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Meine Familie' check (length(btrim(name)) between 1 and 80),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.family_members (
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('parent', 'child')),
  status text not null default 'active' check (status in ('pending', 'active', 'removed')),
  consent_status text not null default 'not_required' check (consent_status in ('not_required', 'pending', 'granted', 'withdrawn')),
  consent_at timestamptz,
  consent_by uuid references auth.users(id) on delete set null,
  share_settings jsonb not null default '{"progress":true,"applications":false,"village":true,"documents":false}'::jsonb
    check (jsonb_typeof(share_settings) = 'object'),
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id),
  check (role = 'child' or consent_status = 'not_required')
);
-- One family per person (removed rows do not count, so a removed member can join another family).
create unique index if not exists family_members_one_family_idx on public.family_members (user_id) where status <> 'removed';
create index if not exists family_members_family_idx on public.family_members (family_id, role) where status <> 'removed';

create table if not exists public.family_invites (
  code text primary key check (code ~ '^[A-Z0-9]{8}$'),
  family_id uuid not null references public.families(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  direction text not null check (direction in ('parent_invites_child', 'child_invites_parent')),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists family_invites_family_idx on public.family_invites (family_id, created_at desc);

-- Waitlist / "Zugang anfragen" (anon allowed, only through waitlist_join()).
create table if not exists public.waitlist_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null check (length(email) between 3 and 254),
  kind text not null check (kind in ('family', 'parent', 'student', 'school', 'other')),
  message text check (message is null or length(message) <= 1000),
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists waitlist_requests_email_kind_idx on public.waitlist_requests (lower(email), kind);
create index if not exists waitlist_requests_created_idx on public.waitlist_requests (created_at);

-- ---------- 3. family plan = the B2B licence table, extended ----------
alter table public.school_licences alter column school_id drop not null;
alter table public.school_licences add column if not exists family_id uuid references public.families(id) on delete cascade;
alter table public.school_licences add column if not exists plan_type text not null default 'school';
alter table public.school_licences add column if not exists seats_parents integer not null default 1;
alter table public.school_licences add column if not exists seats_children integer not null default 1;
alter table public.school_licences add column if not exists trial_ends_at timestamptz;
alter table public.school_licences add column if not exists assigned_by text;
alter table public.school_licences add column if not exists external_ref text; -- placeholder for a future payment provider id, unused
create index if not exists school_licences_family_idx on public.school_licences (family_id, created_at desc) where family_id is not null;

alter table public.school_licences drop constraint if exists school_licences_owner_check;
alter table public.school_licences add constraint school_licences_owner_check check (
  num_nonnulls(school_id, family_id) = 1 and (plan_type = 'school') = (school_id is not null));
alter table public.school_licences drop constraint if exists school_licences_plan_type_check;
alter table public.school_licences add constraint school_licences_plan_type_check check (plan_type in ('school', 'family'));
alter table public.school_licences drop constraint if exists school_licences_package_check;
alter table public.school_licences add constraint school_licences_package_check check (
  (plan_type = 'school' and package in ('pilot', 'starter', 'professional', 'enterprise', 'custom'))
  or (plan_type = 'family' and package = 'family'));
-- 'trial' and 'paused' exist only for family plans: the school seat logic (_licence_state) does not know them.
alter table public.school_licences drop constraint if exists school_licences_status_check;
alter table public.school_licences add constraint school_licences_status_check check (
  status in ('pilot', 'active', 'expired', 'cancelled') or (plan_type = 'family' and status in ('trial', 'paused')));
alter table public.school_licences drop constraint if exists school_licences_seats_check;
alter table public.school_licences add constraint school_licences_seats_check check (seats_parents between 1 and 10 and seats_children between 1 and 20);
alter table public.school_licences drop constraint if exists school_licences_trial_check;
alter table public.school_licences add constraint school_licences_trial_check check (status <> 'trial' or trial_ends_at is not null);
alter table public.school_licences drop constraint if exists school_licences_admin_text_check;
alter table public.school_licences add constraint school_licences_admin_text_check check (
  (assigned_by is null or length(assigned_by) <= 120) and (external_ref is null or length(external_ref) <= 200));

-- Family rows: owner decides plan_type, package 'family', student_limit mirrors seats_children, 30-day trial by default.
-- Runs before school_licences_defaults (triggers fire in name order), which then only handles pilot dates.
create or replace function public._family_plan_defaults()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.family_id is null then return new; end if;
  new.plan_type := 'family';
  new.package := 'family';
  new.student_limit := new.seats_children;
  if new.status = 'trial' and new.trial_ends_at is null then new.trial_ends_at := now() + interval '30 days'; end if;
  return new;
end;
$$;
drop trigger if exists licences_family_defaults on public.school_licences;
create trigger licences_family_defaults before insert or update on public.school_licences
  for each row execute function public._family_plan_defaults();

-- School admins keep their column grant from 20261116130000 (no notes); the new columns are not readable directly.
-- The school admin policy uses is_school_admin(school_id), which is false for family rows (school_id is null).

-- ---------- 4. RLS ----------
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.family_invites enable row level security;
alter table public.waitlist_requests enable row level security;
revoke all on public.families, public.family_members, public.family_invites, public.waitlist_requests from anon, authenticated;
grant select on public.families, public.family_members, public.family_invites to authenticated;

create or replace function public._family_of(p_user uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select m.family_id from public.family_members m where m.user_id = p_user and m.status <> 'removed' limit 1;
$$;

drop policy if exists "family members read own family" on public.families;
drop policy if exists "own family membership" on public.family_members;
drop policy if exists "own family invites" on public.family_invites;
create policy "family members read own family" on public.families for select to authenticated
  using (id in (select m.family_id from public.family_members m where m.user_id = auth.uid() and m.status <> 'removed'));
create policy "own family membership" on public.family_members for select to authenticated using (user_id = auth.uid());
create policy "own family invites" on public.family_invites for select to authenticated using (created_by = auth.uid());
-- waitlist_requests: no policy at all (service role only; inserts through waitlist_join).

-- ---------- 5. helpers ----------
-- Consent needed for family sharing? Only the birth year is stored, so this is conservative: everyone who turns 16 this
-- year or later counts as under 16. Unknown birth year = consent needed.
create or replace function public._family_needs_consent(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select extract(year from current_date)::integer - p.birth_year <= 16 from public.profiles p where p.user_id = p_user and p.birth_year is not null), true);
$$;

-- Is family sharing currently allowed for this child row?
create or replace function public._family_sharing_allowed(p_member public.family_members)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_member.role = 'child' and p_member.status = 'active'
    and (p_member.consent_status = 'granted' or not public._family_needs_consent(p_member.user_id));
$$;

-- Only student accounts (user_roles.role = 'student') can be children in a family.
create or replace function public._family_is_student(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select r.role = 'student' from public.user_roles r where r.user_id = p_user), true);
$$;

create or replace function public._account_type(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select p.account_type from public.profiles p where p.user_id = p_user),
    case when exists (select 1 from public.class_members m where m.student_id = p_user) then 'school_student' else 'independent_student' end);
$$;

-- Governing family plan: usable (trial/pilot/active) newest first, else newest.
create or replace function public._family_plan_state(p_plan public.school_licences)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when p_plan.id is null then null
    when p_plan.status = 'trial' then case when p_plan.trial_ends_at < now() then 'expired' else 'trial' end
    when p_plan.status = 'paused' then 'paused'
    else public._licence_state(p_plan.status, p_plan.pilot_end, p_plan.valid_from, p_plan.valid_until) end;
$$;

create or replace function public._family_current_plan(p_family_id uuid)
returns public.school_licences language sql stable security definer set search_path = '' as $$
  select l.* from public.school_licences l where l.family_id = p_family_id
  order by (public._family_plan_state(l) in ('trial', 'pilot', 'active')) desc, l.created_at desc, l.id
  limit 1;
$$;

create or replace function public._family_plan_json(p_family_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare pl public.school_licences := public._family_current_plan(p_family_id);
begin
  if pl.id is null then return null; end if;
  return jsonb_build_object('plan_type', pl.plan_type, 'status', pl.status, 'state', public._family_plan_state(pl),
    'seats_parents', pl.seats_parents, 'seats_children', pl.seats_children, 'trial_ends_at', pl.trial_ends_at,
    'pilot_end', pl.pilot_end, 'valid_until', pl.valid_until);
end;
$$;

-- Raises WA010 FAMILY_SEAT_LIMIT when the family has no free seat for p_role. Without a plan: 1 parent + 1 child.
-- Locks the family row so two simultaneous joins cannot take the last seat twice.
create or replace function public._family_assert_seat(p_family_id uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare pl public.school_licences; seats integer; used integer;
begin
  perform 1 from public.families f where f.id = p_family_id for update;
  pl := public._family_current_plan(p_family_id);
  seats := case when p_role = 'parent' then coalesce(pl.seats_parents, 1) else coalesce(pl.seats_children, 1) end;
  select count(*)::integer into used from public.family_members m
    where m.family_id = p_family_id and m.role = p_role and m.status in ('active', 'pending');
  if used >= seats then
    raise exception 'FAMILY_SEAT_LIMIT' using errcode = 'WA010',
      detail = case when p_role = 'parent'
        then format('In dieser Familie sind alle Plätze für Eltern belegt (%s von %s).', used, seats)
        else format('In dieser Familie sind alle Plätze für Kinder belegt (%s von %s). Weitere Kinder sind bald verfügbar.', used, seats) end;
  end if;
end;
$$;

-- The caller's non-removed membership (or raises NOT_IN_FAMILY).
create or replace function public._family_me()
returns public.family_members language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._soc_uid(); m public.family_members;
begin
  select * into m from public.family_members x where x.user_id = uid and x.status <> 'removed';
  if not found then raise exception 'NOT_IN_FAMILY' using detail = 'Du bist in keiner Familie.'; end if;
  return m;
end;
$$;

-- Deletes a family when nobody (active or pending) is left. Its plan rows and invites cascade.
create or replace function public._family_cleanup(p_family_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.family_members m where m.family_id = p_family_id and m.status in ('active', 'pending')) then
    delete from public.families f where f.id = p_family_id;
  end if;
end;
$$;

-- Account deletion cascades family_members; afterwards remove empty families (name is personal data).
create or replace function public._family_members_after_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public._family_cleanup(old.family_id);
  return null;
end;
$$;
drop trigger if exists family_members_after_delete on public.family_members;
create trigger family_members_after_delete after delete on public.family_members
  for each row execute function public._family_members_after_delete();

create or replace function public._family_new_code()
returns text language plpgsql volatile security definer set search_path = '' as $$
declare candidate text;
begin
  loop
    candidate := public._soc_code();
    exit when not exists (select 1 from public.family_invites i where i.code = candidate);
  end loop;
  return candidate;
end;
$$;

create or replace function public._family_member_json(p_member public.family_members)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('user_id', p_member.user_id,
    'display_name', coalesce((select r.display_name from public.user_roles r where r.user_id = p_member.user_id), ''),
    'role', p_member.role, 'status', p_member.status, 'consent_status', p_member.consent_status,
    'needs_consent', p_member.role = 'child' and public._family_needs_consent(p_member.user_id),
    'sharing_active', public._family_sharing_allowed(p_member));
$$;

-- ---------- 6. RPCs ----------
-- Set my account type ('independent_student' | 'parent'; 'school_student' only when in a class) and/or birth year.
create or replace function public.account_set_type(p_type text, p_birth_year integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._soc_uid(); cur text; old_year integer; fm public.family_members; in_class boolean; mail text;
begin
  if p_type is null or p_type not in ('school_student', 'independent_student', 'parent') then
    raise exception 'INVALID_ACCOUNT_TYPE' using detail = 'Unbekannter Kontotyp.';
  end if;
  if p_birth_year is not null and p_birth_year not between extract(year from current_date)::integer - 100 and extract(year from current_date)::integer then
    raise exception 'INVALID_BIRTH_YEAR' using detail = 'Bitte gib ein gültiges Geburtsjahr an.';
  end if;
  in_class := exists (select 1 from public.class_members m where m.student_id = uid);
  if p_type = 'school_student' and not in_class then
    raise exception 'INVALID_ACCOUNT_TYPE' using detail = 'Ein Schulkonto entsteht mit dem Beitritt zu einer Klasse.';
  end if;
  if in_class and p_type <> 'school_student' then
    raise exception 'FORBIDDEN' using detail = 'Konten in einer Schulklasse bleiben Schulkonten.';
  end if;
  if p_type = 'parent' and exists (select 1 from public.user_roles r where r.user_id = uid and r.role = 'school_admin') then
    raise exception 'FORBIDDEN';
  end if;
  select * into fm from public.family_members x where x.user_id = uid and x.status <> 'removed';
  if found and ((fm.role = 'parent') <> (p_type = 'parent')) then
    raise exception 'IN_FAMILY' using detail = 'Verlasse zuerst deine Familie, um den Kontotyp zu wechseln.';
  end if;
  select p.account_type, p.birth_year into cur, old_year from public.profiles p where p.user_id = uid;
  -- A child in a family cannot make itself older (that would skip the parental consent). Younger is always fine.
  if fm.role = 'child' and p_birth_year is not null and (old_year is null or p_birth_year < old_year) then
    raise exception 'BIRTH_YEAR_LOCKED' using detail = 'Das Geburtsjahr kann in einer Familie nur von dir zusammen mit deinen Eltern geändert werden.';
  end if;
  select coalesce(u.email, '') into mail from auth.users u where u.id = uid;
  insert into public.profiles (id, user_id, first_name, last_name, email, account_type, birth_year)
  values ('profile-' || uid::text, uid, '', '', mail, p_type, p_birth_year)
  on conflict (user_id) do update set account_type = excluded.account_type,
    birth_year = coalesce(excluded.birth_year, public.profiles.birth_year);
  return jsonb_build_object('account_type', p_type,
    'birth_year', (select p.birth_year from public.profiles p where p.user_id = uid),
    'needs_parental_consent', p_type <> 'parent' and public._family_needs_consent(uid));
end;
$$;

-- My family (or null): family, my role, members (active + pending), plan, my share settings (children), my open invites.
create or replace function public.family_get_my()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); me public.family_members;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into me from public.family_members x where x.user_id = uid and x.status <> 'removed';
  if not found then return null; end if;
  return jsonb_build_object(
    'family', (select jsonb_build_object('id', f.id, 'name', f.name, 'created_at', f.created_at) from public.families f where f.id = me.family_id),
    'my_role', me.role, 'my_status', me.status, 'my_consent_status', me.consent_status,
    'my_share_settings', case when me.role = 'child' then me.share_settings end,
    'my_sharing_active', case when me.role = 'child' then public._family_sharing_allowed(me) end,
    'members', coalesce((select jsonb_agg(public._family_member_json(m) order by m.role desc, m.joined_at, m.user_id)
      from public.family_members m where m.family_id = me.family_id and m.status in ('active', 'pending')), '[]'::jsonb),
    'plan', public._family_plan_json(me.family_id),
    'invites', coalesce((select jsonb_agg(jsonb_build_object('code', i.code, 'direction', i.direction, 'expires_at', i.expires_at) order by i.created_at)
      from public.family_invites i where i.family_id = me.family_id and i.created_by = uid and i.used_by is null and i.expires_at > now()), '[]'::jsonb));
end;
$$;

-- Parent creates a family (and is its first member).
create or replace function public.family_create(p_name text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._soc_uid(); nm text := btrim(coalesce(p_name, '')); fid uuid;
begin
  if public._account_type(uid) <> 'parent' then raise exception 'NOT_A_PARENT' using detail = 'Nur Elternkonten können eine Familie erstellen.'; end if;
  if public._family_of(uid) is not null then raise exception 'ALREADY_IN_FAMILY' using detail = 'Du bist bereits in einer Familie.'; end if;
  if nm = '' then nm := 'Meine Familie'; end if;
  if length(nm) > 80 then raise exception 'INVALID_NAME' using detail = 'Der Familienname darf höchstens 80 Zeichen haben.'; end if;
  insert into public.families (name, created_by) values (nm, uid) returning id into fid;
  insert into public.family_members (family_id, user_id, role, status, consent_status) values (fid, uid, 'parent', 'active', 'not_required');
  return fid;
end;
$$;

-- Invite code (8 chars, 7 days, single use). parent_invites_child: an active parent. child_invites_parent: a student;
-- a student without a family gets one automatically ("Meine Familie").
create or replace function public.family_create_invite(p_direction text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._soc_uid(); me public.family_members; fid uuid; c text; exp timestamptz;
begin
  if p_direction is null or p_direction not in ('parent_invites_child', 'child_invites_parent') then raise exception 'INVALID_REQUEST'; end if;
  select * into me from public.family_members x where x.user_id = uid and x.status <> 'removed';
  if p_direction = 'parent_invites_child' then
    if me.role is distinct from 'parent' or me.status <> 'active' then
      raise exception 'FORBIDDEN' using detail = 'Nur Eltern einer Familie können Kinder einladen.';
    end if;
    fid := me.family_id;
  else
    if public._account_type(uid) = 'parent' or not public._family_is_student(uid) then
      raise exception 'FORBIDDEN' using detail = 'Nur Schülerkonten können ihre Eltern einladen.';
    end if;
    if me.family_id is null then
      if not exists (select 1 from public.profiles p where p.user_id = uid and p.birth_year is not null) then
        raise exception 'BIRTH_YEAR_REQUIRED' using detail = 'Bitte gib zuerst dein Geburtsjahr an.';
      end if;
      insert into public.families (name, created_by) values ('Meine Familie', uid) returning id into fid;
      insert into public.family_members (family_id, user_id, role, status, consent_status)
        values (fid, uid, 'child', 'active', case when public._family_needs_consent(uid) then 'pending' else 'not_required' end);
    elsif me.role <> 'child' or me.status <> 'active' then
      raise exception 'FORBIDDEN';
    else
      fid := me.family_id;
    end if;
  end if;
  perform public._family_assert_seat(fid, case when p_direction = 'parent_invites_child' then 'child' else 'parent' end);
  delete from public.family_invites i where i.family_id = fid and i.used_by is null and i.expires_at <= now();
  if (select count(*) from public.family_invites i where i.family_id = fid and i.used_by is null) >= 10 then
    raise exception 'TOO_MANY_INVITES' using detail = 'Es gibt schon 10 offene Einladungen. Bitte warte, bis sie ablaufen.';
  end if;
  c := public._family_new_code();
  exp := now() + interval '7 days';
  insert into public.family_invites (code, family_id, created_by, direction, expires_at) values (c, fid, uid, p_direction, exp);
  return jsonb_build_object('code', c, 'expires_at', exp, 'family_id', fid);
end;
$$;

-- Join with a code. Children need a birth year (consent rule); seat limit enforced (WA010).
create or replace function public.family_join(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public._soc_uid();
  v_code text := upper(btrim(coalesce(p_code, '')));
  inv public.family_invites;
  my_role text;
  me public.family_members;
  cs text;
begin
  select * into inv from public.family_invites i where i.code = v_code for update;
  if not found then raise exception 'INVITE_INVALID' using detail = 'Dieser Code ist ungültig.'; end if;
  if inv.used_by is not null then
    if inv.used_by = uid then
      select * into me from public.family_members x where x.family_id = inv.family_id and x.user_id = uid and x.status <> 'removed';
      if found then return jsonb_build_object('family_id', me.family_id, 'role', me.role, 'status', me.status, 'consent_status', me.consent_status); end if;
    end if;
    raise exception 'INVITE_USED' using detail = 'Dieser Code wurde schon verwendet.';
  end if;
  if inv.expires_at <= now() then raise exception 'INVITE_EXPIRED' using detail = 'Dieser Code ist abgelaufen. Bitte einen neuen erstellen.'; end if;
  if inv.created_by = uid then raise exception 'INVITE_INVALID' using detail = 'Du kannst deinen eigenen Code nicht verwenden.'; end if;
  my_role := case when inv.direction = 'parent_invites_child' then 'child' else 'parent' end;
  if (my_role = 'parent') <> (public._account_type(uid) = 'parent') then
    raise exception 'INVITE_WRONG_ACCOUNT_TYPE' using detail = case when my_role = 'parent'
      then 'Dieser Code ist für ein Elternkonto.' else 'Dieser Code ist für ein Schülerkonto.' end;
  end if;
  if public._family_of(uid) is not null then raise exception 'ALREADY_IN_FAMILY' using detail = 'Du bist bereits in einer Familie.'; end if;
  if my_role = 'child' and not public._family_is_student(uid) then
    raise exception 'INVITE_WRONG_ACCOUNT_TYPE' using detail = 'Dieser Code ist für ein Schülerkonto.';
  end if;
  if my_role = 'child' and not exists (select 1 from public.profiles p where p.user_id = uid and p.birth_year is not null) then
    raise exception 'BIRTH_YEAR_REQUIRED' using detail = 'Bitte gib zuerst dein Geburtsjahr an.';
  end if;
  perform public._family_assert_seat(inv.family_id, my_role);
  cs := case when my_role = 'child' and public._family_needs_consent(uid) then 'pending' else 'not_required' end;
  insert into public.family_members (family_id, user_id, role, status, consent_status, consent_at, consent_by, share_settings, joined_at)
  values (inv.family_id, uid, my_role, 'active', cs, null, null, default, now())
  on conflict (family_id, user_id) do update set role = excluded.role, status = 'active', consent_status = excluded.consent_status,
    consent_at = null, consent_by = null, share_settings = excluded.share_settings, joined_at = now();
  update public.family_invites i set used_by = uid, used_at = now() where i.code = inv.code;
  return jsonb_build_object('family_id', inv.family_id, 'role', my_role, 'status', 'active', 'consent_status', cs,
    'family_name', (select f.name from public.families f where f.id = inv.family_id));
end;
$$;

-- Parent grants or withdraws consent for a child of the same family (needed while the child is under 16).
create or replace function public.family_set_consent(p_child_id uuid, p_granted boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me public.family_members := public._family_me(); ch public.family_members;
begin
  if me.role <> 'parent' or me.status <> 'active' then raise exception 'FORBIDDEN'; end if;
  if p_granted is null then raise exception 'INVALID_REQUEST'; end if;
  select * into ch from public.family_members x where x.family_id = me.family_id and x.user_id = p_child_id and x.role = 'child' and x.status = 'active';
  if not found then raise exception 'NOT_FOUND'; end if;
  if ch.consent_status = 'not_required' and not public._family_needs_consent(ch.user_id) then
    raise exception 'CONSENT_NOT_REQUIRED' using detail = 'Ab 16 Jahren entscheidet dein Kind selbst, was es teilt.';
  end if;
  update public.family_members x set consent_status = case when p_granted then 'granted' else 'withdrawn' end,
    consent_at = now(), consent_by = me.user_id
  where x.family_id = ch.family_id and x.user_id = ch.user_id returning * into ch;
  return public._family_member_json(ch);
end;
$$;

-- Child changes what the family may see (known keys only, booleans; missing keys keep their value).
create or replace function public.family_set_share(p_settings jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me public.family_members := public._family_me(); k text; merged jsonb;
begin
  if me.role <> 'child' or me.status <> 'active' then raise exception 'FORBIDDEN'; end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then raise exception 'INVALID_SETTINGS'; end if;
  for k in select jsonb_object_keys(p_settings) loop
    if k not in ('progress', 'applications', 'village', 'documents') or jsonb_typeof(p_settings -> k) <> 'boolean' then
      raise exception 'INVALID_SETTINGS' using detail = format('Unbekannte Einstellung: %s', left(k, 40));
    end if;
  end loop;
  merged := '{"progress":false,"applications":false,"village":false,"documents":false}'::jsonb || me.share_settings || p_settings;
  merged := jsonb_build_object('progress', merged -> 'progress', 'applications', merged -> 'applications',
    'village', merged -> 'village', 'documents', merged -> 'documents');
  update public.family_members x set share_settings = merged where x.family_id = me.family_id and x.user_id = me.user_id returning * into me;
  return jsonb_build_object('share_settings', me.share_settings, 'sharing_active', public._family_sharing_allowed(me));
end;
$$;

-- Parent view of one child: only the parts the child shares, only while sharing is allowed (consent).
-- Never notes, salary, contacts, links, file paths, classes, classmates or other families.
create or replace function public.family_child_overview(p_child_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me public.family_members := public._family_me(); ch public.family_members; s jsonb; result jsonb;
begin
  if me.role <> 'parent' or me.status <> 'active' then raise exception 'FORBIDDEN'; end if;
  select * into ch from public.family_members x where x.family_id = me.family_id and x.user_id = p_child_id and x.role = 'child' and x.status = 'active';
  if not found then raise exception 'NOT_FOUND'; end if;
  result := jsonb_build_object('child', jsonb_build_object('user_id', ch.user_id,
    'display_name', coalesce((select r.display_name from public.user_roles r where r.user_id = ch.user_id), '')),
    'consent_status', ch.consent_status, 'needs_consent', public._family_needs_consent(ch.user_id));
  if not public._family_sharing_allowed(ch) then
    return result || jsonb_build_object('sharing_active', false,
      'reason', case when ch.consent_status = 'withdrawn' then 'consent_withdrawn' else 'consent_pending' end);
  end if;
  s := ch.share_settings;
  result := result || jsonb_build_object('sharing_active', true, 'shared', jsonb_build_object(
    'progress', coalesce((s ->> 'progress')::boolean, false), 'applications', coalesce((s ->> 'applications')::boolean, false),
    'village', coalesce((s ->> 'village')::boolean, false), 'documents', coalesce((s ->> 'documents')::boolean, false)));
  if coalesce((s ->> 'progress')::boolean, false) then
    result := result || jsonb_build_object('progress', jsonb_build_object(
      'applications_total', (select count(*)::integer from public.applications a where a.user_id = ch.user_id),
      'status_counts', public._soc_status_counts(ch.user_id),
      'placed', exists (select 1 from public.applications a where a.user_id = ch.user_id and a.status in ('offer', 'contract_signed')),
      'last_activity', (select max(greatest(a.applied_at, a.created_at, a.updated_at)) from public.applications a where a.user_id = ch.user_id)));
  end if;
  if coalesce((s ->> 'village')::boolean, false) then
    result := result || jsonb_build_object('village', jsonb_build_object(
      'islands', public.map_islands_count(ch.user_id),
      'items', (select count(*)::integer from public.map_items i where i.user_id = ch.user_id),
      'points_earned', coalesce((select w.earned from public.map_wallets w where w.user_id = ch.user_id), 0)));
  end if;
  if coalesce((s ->> 'applications')::boolean, false) then
    result := result || jsonb_build_object('applications', coalesce((select jsonb_agg(jsonb_build_object(
        'company', a.company, 'position', a.position, 'status', a.status, 'deadline', a.deadline, 'applied_at', a.applied_at,
        'updated_at', a.updated_at) order by a.updated_at desc, a.id)
      from public.applications a where a.user_id = ch.user_id), '[]'::jsonb));
  end if;
  if coalesce((s ->> 'documents')::boolean, false) then
    result := result || jsonb_build_object('documents', coalesce((select jsonb_agg(jsonb_build_object(
        'name', d.name, 'type', d.type, 'status', d.status, 'updated_at', d.updated_at) order by d.updated_at desc, d.id)
      from public.cvs d where d.user_id = ch.user_id), '[]'::jsonb));
  end if;
  return result;
end;
$$;

-- Parent removes another member (child or co-parent). Sharing of a removed child is switched off.
create or replace function public.family_remove_member(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me public.family_members := public._family_me();
begin
  if me.role <> 'parent' or me.status <> 'active' then raise exception 'FORBIDDEN'; end if;
  if p_user_id is null or p_user_id = me.user_id then raise exception 'INVALID_REQUEST' using detail = 'Um selbst auszutreten, verwende «Familie verlassen».'; end if;
  update public.family_members x set status = 'removed',
    share_settings = '{"progress":false,"applications":false,"village":false,"documents":false}'::jsonb
  where x.family_id = me.family_id and x.user_id = p_user_id and x.status <> 'removed';
  if not found then raise exception 'NOT_FOUND'; end if;
end;
$$;

-- Leave my family (anyone). The family is deleted when nobody is left.
create or replace function public.family_leave()
returns void language plpgsql security definer set search_path = '' as $$
declare me public.family_members := public._family_me();
begin
  update public.family_members x set status = 'removed',
    share_settings = '{"progress":false,"applications":false,"village":false,"documents":false}'::jsonb
  where x.family_id = me.family_id and x.user_id = me.user_id;
  delete from public.family_invites i where i.family_id = me.family_id and i.created_by = me.user_id and i.used_by is null;
  perform public._family_cleanup(me.family_id);
end;
$$;

-- Everything about me in the family feature (part of export_my_data; also callable alone). Invite codes are omitted.
create or replace function public.family_export_my_data()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); mail text;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select lower(u.email) into mail from auth.users u where u.id = uid;
  return jsonb_build_object(
    'format', 'wendapply-family-export-v1',
    'account_type', public._account_type(uid),
    'birth_year', (select p.birth_year from public.profiles p where p.user_id = uid),
    'memberships', coalesce((select jsonb_agg(jsonb_build_object('family', f.name, 'role', m.role, 'status', m.status,
        'consent_status', m.consent_status, 'consent_at', m.consent_at, 'share_settings', m.share_settings, 'joined_at', m.joined_at,
        'members', (select coalesce(jsonb_agg(jsonb_build_object('display_name', coalesce(r.display_name, ''), 'role', o.role, 'status', o.status)
            order by o.joined_at), '[]'::jsonb)
          from public.family_members o left join public.user_roles r on r.user_id = o.user_id
          where o.family_id = m.family_id and o.status in ('active', 'pending') and m.status <> 'removed'),
        'plan', case when m.status <> 'removed' then public._family_plan_json(m.family_id) end) order by m.joined_at)
      from public.family_members m join public.families f on f.id = m.family_id where m.user_id = uid), '[]'::jsonb),
    'consents_given', coalesce((select jsonb_agg(jsonb_build_object('child', coalesce(r.display_name, ''), 'consent_status', m.consent_status,
        'consent_at', m.consent_at) order by m.consent_at)
      from public.family_members m left join public.user_roles r on r.user_id = m.user_id where m.consent_by = uid), '[]'::jsonb),
    'invites_created', coalesce((select jsonb_agg(jsonb_build_object('direction', i.direction, 'created_at', i.created_at,
        'expires_at', i.expires_at, 'used', i.used_by is not null, 'used_at', i.used_at) order by i.created_at)
      from public.family_invites i where i.created_by = uid), '[]'::jsonb),
    'waitlist', coalesce((select jsonb_agg(jsonb_build_object('email', w.email, 'kind', w.kind, 'message', w.message, 'created_at', w.created_at)
        order by w.created_at)
      from public.waitlist_requests w where w.user_id = uid or lower(w.email) = mail), '[]'::jsonb));
end;
$$;

-- Platform admin (service role only): assign a family plan by hand. One row per period; the newest usable row governs.
create or replace function public.admin_assign_family_plan(p_family_id uuid, p_status text, p_trial_ends_at timestamptz default null,
  p_seats_children integer default 1, p_seats_parents integer default 1, p_notes text default null, p_assigned_by text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare st text := coalesce(p_status, 'trial'); new_id uuid;
begin
  if auth.uid() is not null then raise exception 'FORBIDDEN'; end if; -- service role / SQL editor only
  if not exists (select 1 from public.families f where f.id = p_family_id) then raise exception 'NOT_FOUND'; end if;
  if st not in ('trial', 'pilot', 'active', 'paused', 'cancelled') then raise exception 'INVALID_REQUEST' using detail = 'Unbekannter Status.'; end if;
  insert into public.school_licences (family_id, plan_type, package, status, student_limit, seats_parents, seats_children, trial_ends_at,
    pilot_start, valid_from, notes, assigned_by)
  values (p_family_id, 'family', 'family', st, greatest(coalesce(p_seats_children, 1), 1), coalesce(p_seats_parents, 1), coalesce(p_seats_children, 1),
    case when st = 'trial' then coalesce(p_trial_ends_at, now() + interval '30 days') else p_trial_ends_at end,
    case when st = 'pilot' then current_date end, case when st not in ('trial', 'pilot') then current_date end,
    p_notes, p_assigned_by)
  returning id into new_id;
  return new_id;
end;
$$;

-- "Zugang anfragen" / waitlist (anon allowed). Always answers {ok:true} for valid input (no e-mail enumeration).
create or replace function public.waitlist_join(p_email text, p_kind text, p_message text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare mail text := lower(btrim(coalesce(p_email, ''))); msg text := nullif(btrim(coalesce(p_message, '')), '');
begin
  if length(mail) not between 3 and 254 or mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_EMAIL' using detail = 'Bitte gib eine gültige E-Mail-Adresse an.';
  end if;
  if p_kind is null or p_kind not in ('family', 'parent', 'student', 'school', 'other') then raise exception 'INVALID_REQUEST'; end if;
  if msg is not null and length(msg) > 1000 then raise exception 'INVALID_REQUEST' using detail = 'Die Nachricht darf höchstens 1000 Zeichen haben.'; end if;
  -- Crude global brake against scripted floods (the API gateway rate limit is the real protection).
  if (select count(*) from public.waitlist_requests w where w.created_at > now() - interval '1 hour') >= 300 then
    raise exception 'RATE_LIMITED' using detail = 'Gerade kommen sehr viele Anfragen. Bitte versuche es später nochmals.';
  end if;
  insert into public.waitlist_requests (email, kind, message, user_id) values (mail, p_kind, msg, auth.uid())
  on conflict (lower(email), kind) do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------- 7. data rights: export + deletion summary extended ----------
create or replace function public.export_my_data()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  r record;
  rows_json jsonb;
  tables jsonb := '{}'::jsonb;
  -- 'code' = family invite codes (still usable credentials until they expire).
  redacted constant text[] := array['token', 'p256dh', 'auth', 'code'];
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  for r in
    select c.conrelid::regclass as tbl, c.conrelid::regclass::text as name,
      string_agg(format('%I = $1', a.attname), ' or ' order by a.attname) as cond
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and n.nspname = 'public'
    group by c.conrelid
    order by 2
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x) - $2), ''[]''::jsonb) from %s x where %s', r.tbl, r.cond)
      into rows_json using uid, redacted;
    if jsonb_array_length(rows_json) > 0 then tables := tables || jsonb_build_object(replace(r.name, 'public.', ''), rows_json); end if;
  end loop;
  return jsonb_build_object(
    'format', 'wendapply-export-v1',
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'email', u.email) from auth.users u where u.id = uid),
    'friends', coalesce((select jsonb_agg(jsonb_build_object('display_name', o.display_name, 'status', f.status, 'since', f.created_at) order by f.created_at)
      from public.friendships f join public.user_roles o on o.user_id = case when f.requester_id = uid then f.addressee_id else f.requester_id end
      where uid in (f.requester_id, f.addressee_id)), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(jsonb_build_object('class', c.name, 'school_year', c.school_year, 'teacher', t.display_name,
        'school', s.name, 'joined_at', m.joined_at, 'share_applications', m.share_applications, 'share_status', m.share_status,
        'share_companies', m.share_companies) order by m.joined_at)
      from public.class_members m join public.classes c on c.id = m.class_id
      left join public.user_roles t on t.user_id = c.teacher_id left join public.schools s on s.id = c.school_id
      where m.student_id = uid), '[]'::jsonb),
    'family', public.family_export_my_data(),
    'tables', tables);
end;
$$;

-- Deletion dialog: also say what happens to the family (the family itself is deleted when nobody is left).
create or replace function public.account_delete_summary()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); v_role text; fid uuid;
begin
  if uid is null then raise exception 'FORBIDDEN'; end if;
  select role into v_role from public.user_roles where user_id = uid;
  select family_id into fid from public.family_members where user_id = uid and status <> 'removed';
  return jsonb_build_object(
    'role', coalesce(v_role, 'student'),
    'applications', (select count(*) from public.applications where user_id = uid),
    'documents', (select count(*) from public.cvs where user_id = uid),
    'friends', (select count(*) from public.friendships where requester_id = uid or addressee_id = uid),
    'classes_joined', (select count(*) from public.class_members where student_id = uid),
    'classes_owned', (select count(*) from public.classes where teacher_id = uid),
    'students_in_owned_classes', (select count(*) from public.class_members m join public.classes c on c.id = m.class_id where c.teacher_id = uid),
    'family_member', fid is not null,
    'family_others', case when fid is null then 0 else (select count(*) from public.family_members
      where family_id = fid and user_id <> uid and status in ('active', 'pending')) end
  );
end $$;

-- ---------- 8. privileges ----------
revoke all on table public.families, public.family_members, public.family_invites, public.waitlist_requests from anon;
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in (
    '_profiles_account_guard', '_class_members_account_type', '_family_plan_defaults', '_family_of', '_family_needs_consent',
    '_family_sharing_allowed', '_family_is_student', '_account_type', '_family_plan_state', '_family_current_plan', '_family_plan_json', '_family_assert_seat',
    '_family_me', '_family_cleanup', '_family_members_after_delete', '_family_new_code', '_family_member_json',
    'account_set_type', 'family_get_my', 'family_create', 'family_create_invite', 'family_join', 'family_set_consent', 'family_set_share',
    'family_child_overview', 'family_remove_member', 'family_leave', 'family_export_my_data', 'admin_assign_family_plan', 'waitlist_join',
    'export_my_data', 'account_delete_summary') loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in (
    'account_set_type', 'family_get_my', 'family_create', 'family_create_invite', 'family_join', 'family_set_consent', 'family_set_share',
    'family_child_overview', 'family_remove_member', 'family_leave', 'family_export_my_data', 'waitlist_join',
    'export_my_data', 'account_delete_summary') loop
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- The only anon RPC of this feature: the public waitlist form.
  execute 'grant execute on function public.waitlist_join(text, text, text) to anon';
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.admin_assign_family_plan(uuid, text, timestamptz, integer, integer, text, text) to service_role';
    execute 'grant all on table public.waitlist_requests to service_role';
  end if;
end $$;
