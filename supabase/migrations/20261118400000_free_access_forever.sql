-- Free access without an end date ("Gratis (unbefristet)") for a person or a whole school (2026-11-17, branch free-forever).
-- ADDITIVE + idempotent. Builds on 20261118010000_access_core.sql and 20261118300000_access_security_review.sql.
--
-- Model (docs/access/DB.md "Free access"):
--  * Person: account_access.free_access_forever (bool) next to the existing free_access_until. A grant is active when
--    free_access_forever OR free_access_until > now(). Both are never set together (check). Plus who / when granted.
--    A separate flag (instead of "free_access_until null = unlimited") because null already means "no grant" for every
--    existing row and every existing reader; 'infinity' would break JSON / JS dates.
--  * School: public.school_access_grants (one row per school: forever OR until, note, granted_by, granted_at). Revoking
--    deletes the row (the history is in admin_audit_log). An active school grant counts exactly like a valid school
--    licence: everybody the licence model covers (students in not archived classes, school admins, school teachers with the
--    teacher role, class owners / co-teachers) gets access with reason 'school_licence' – and no seat limit applies.
--  * Writes only by the service role (the /api/admin routes after the platform-admin guard, which audit every change).
--    No client can read or write school_access_grants; clients can read (never write) their own free_access_forever.
--  * app_access() reports it in a new key "grant": {scope: 'user'|'school', forever, until} (null otherwise).
--  * Order unchanged: blocked > person grant > school (licence or grant) > staff licence_required > subscriptions > trial.

-- ---------------------------------------------------------------- 1. person: forever flag
alter table public.account_access add column if not exists free_access_forever boolean not null default false;
alter table public.account_access add column if not exists free_access_granted_at timestamptz;
alter table public.account_access add column if not exists free_access_granted_by uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'account_access_free_access_one_kind') then
    alter table public.account_access add constraint account_access_free_access_one_kind
      check (not (free_access_forever and free_access_until is not null));
  end if;
end $$;
-- Own row: the user may see that the grant is unlimited (my_access() reports it anyway). Never a write.
grant select (free_access_forever) on public.account_access to authenticated;

-- ---------------------------------------------------------------- 2. school grants
create table if not exists public.school_access_grants (
  school_id uuid primary key references public.schools(id) on delete cascade,
  forever boolean not null default false,
  until timestamptz,
  note text check (note is null or length(note) <= 500),
  granted_by uuid,
  granted_at timestamptz not null default now(),
  check (forever = (until is null))
);
alter table public.school_access_grants enable row level security;
revoke all on public.school_access_grants from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on public.school_access_grants to service_role;
  end if;
end $$;

-- Active free grant of a school (forever, or until in the future).
create or replace function public._access_school_granted(p_school_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.school_access_grants g where g.school_id = p_school_id
    and (g.forever or g.until > now()));
$$;
revoke all on function public._access_school_granted(uuid) from public, anon, authenticated;

-- A school gives access when it has a valid licence (pilot / active today) OR an active free grant.
create or replace function public._access_school_valid(p_school_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select public._licence_state(l.status, l.pilot_end, l.valid_from, l.valid_until) in ('pilot', 'active')
    from public._school_current_licence(p_school_id) l where l.id is not null), false)
    or public._access_school_granted(p_school_id);
$$;
revoke all on function public._access_school_valid(uuid) from public, anon, authenticated;

-- Seats: a school with an active free grant has no seat limit and needs no licence row for joins
-- (otherwise unchanged from 20261116100000_b2b_schools_licences.sql).
create or replace function public._school_assert_capacity(p_school_id uuid, p_new_students uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare lic public.school_licences; st text; used integer; added integer;
begin
  if p_school_id is null then return; end if;
  if public._access_school_granted(p_school_id) then return; end if;
  perform 1 from public.schools s where s.id = p_school_id for update;
  -- Only students who are not yet counted for this school need a seat.
  select count(distinct x)::integer into added from unnest(coalesce(p_new_students, '{}'::uuid[])) x
    where not exists (select 1 from public.class_members m join public.classes c on c.id = m.class_id
      where c.school_id = p_school_id and not c.archived and m.student_id = x);
  if added = 0 then return; end if;
  lic := public._school_current_licence(p_school_id);
  if lic.id is null then
    raise exception 'LICENCE_MISSING' using errcode = 'WA003',
      detail = 'Für diese Schule ist noch keine Lizenz hinterlegt. Bitte wende dich an deine Lehrperson oder die Schulleitung.';
  end if;
  st := public._licence_state(lic.status, lic.pilot_end, lic.valid_from, lic.valid_until);
  if st not in ('pilot', 'active') then
    raise exception 'LICENCE_EXPIRED' using errcode = 'WA002',
      detail = case when lic.status = 'pilot' or st = 'expired' and lic.package = 'pilot'
        then 'Die Pilotphase dieser Schule ist abgelaufen. Neue Beitritte sind erst mit einer Jahreslizenz möglich.'
        else 'Die Lizenz dieser Schule ist nicht aktiv. Neue Beitritte sind erst nach der Verlängerung möglich.' end;
  end if;
  used := public._school_student_count(p_school_id);
  if used + added > lic.student_limit then
    raise exception 'LICENCE_LIMIT_REACHED' using errcode = 'WA001',
      detail = format('Die Schullizenz ist voll (%s von %s Plätzen belegt). Die Schulleitung kann die Lizenz erweitern.', used, lic.student_limit);
  end if;
end;
$$;
revoke all on function public._school_assert_capacity(uuid, uuid[]) from public, anon, authenticated;

-- ---------------------------------------------------------------- 3. the decision
-- AccessInfo (lib/access/types.ts) of p_uid. Same as 20261118300000 plus: person grant may be unlimited, a school grant
-- counts like a licence, and the new key "grant" describes the free access that applies.
create or replace function public.app_access(p_uid uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  now_ts timestamptz := now();
  mode text;
  aa public.account_access;
  v_urole text; v_role text; v_type text;
  v_school uuid; v_school_json jsonb; v_lic public.school_licences; v_lic_valid boolean; v_sgrant public.school_access_grants;
  solo public.billing_subscriptions; fam public.billing_subscriptions; shown public.billing_subscriptions;
  v_family uuid; v_fam_plan boolean := false;
  v_blocked boolean; v_enforced boolean; v_staff boolean;
  v_state text; v_reason text; v_trial_end timestamptz; v_grace timestamptz; v_grant timestamptz; v_grant_forever boolean; v_real boolean;
  v_grant_json jsonb;
  v_interval text; v_family_role text; v_family_pending boolean := false; v_expired_reason text;
begin
  if p_uid is null then return null; end if;
  select s.enforce_mode into mode from public.access_settings s where s.id = 1;
  mode := coalesce(mode, 'test_users');
  select * into aa from public.account_access a where a.user_id = p_uid;
  if aa.user_id is null then
    -- No row (signup hook failed, or a user created before the trigger existed): trial counted from the signup time.
    select p_uid, coalesce((to_jsonb(u) ->> 'created_at')::timestamptz, now_ts),
           coalesce((to_jsonb(u) ->> 'created_at')::timestamptz, now_ts) + interval '7 days', false
      into aa.user_id, aa.trial_started_at, aa.trial_ends_at, aa.enforce_test
      from auth.users u where u.id = p_uid;
    if aa.user_id is null then return null; end if;
  end if;

  -- Role: teacher / school admin by user_roles (+ school_admins rows), else parent / student by profiles.account_type.
  select r.role into v_urole from public.user_roles r where r.user_id = p_uid;
  v_type := public._account_type(p_uid);
  v_role := case
    when v_urole = 'teacher' then 'teacher'
    when v_urole = 'school_admin' then 'school_admin'
    when v_type = 'parent' then 'parent'
    when exists (select 1 from public.school_admins a where a.user_id = p_uid)
      and not exists (select 1 from public.class_members m where m.student_id = p_uid) then 'school_admin'
    else 'student' end;
  v_staff := v_role in ('teacher', 'school_admin');
  if v_staff then v_type := null; end if;

  v_blocked := aa.blocked_at is not null;
  v_enforced := mode = 'on' or (mode = 'test_users' and coalesce(aa.enforce_test, false)) or (v_blocked and mode <> 'off');
  v_grant_forever := coalesce(aa.free_access_forever, false);
  v_grant := case when not v_grant_forever and aa.free_access_until > now_ts then aa.free_access_until end;

  v_school := public._access_licensed_school(p_uid);
  if v_school is not null then
    v_lic := public._school_current_licence(v_school);
    v_lic_valid := coalesce(v_lic.id is not null
      and public._licence_state(v_lic.status, v_lic.pilot_end, v_lic.valid_from, v_lic.valid_until) in ('pilot', 'active'), false);
    select * into v_sgrant from public.school_access_grants g where g.school_id = v_school and (g.forever or g.until > now_ts);
    select jsonb_build_object('id', s.id, 'name', s.name,
      -- jsonb per branch: a licence keeps its plain date ("2099-12-31"), a dated school grant is a timestamp.
      'valid_until', case
        when v_lic_valid then to_jsonb(case when v_lic.status = 'pilot' then v_lic.pilot_end else v_lic.valid_until end)
        when v_sgrant.school_id is not null and not v_sgrant.forever then to_jsonb(v_sgrant.until)
        else 'null'::jsonb end,
      'free', v_sgrant.school_id is not null)
      into v_school_json from public.schools s where s.id = v_school;
  end if;

  select * into solo from public.billing_subscriptions s where s.user_id = p_uid and s.plan_id = 'solo'
    order by (public._access_sub_state(s, now_ts) = 'active') desc, (public._access_sub_state(s, now_ts) = 'grace') desc,
      s.updated_at desc, s.id limit 1;

  select m.family_id, m.role into v_family, v_family_role from public.family_members m where m.user_id = p_uid and m.status = 'active' limit 1;
  if v_family is not null then
    select * into fam from public.billing_subscriptions s where s.family_id = v_family
      order by (public._access_sub_state(s, now_ts) = 'active') desc, (public._access_sub_state(s, now_ts) = 'grace') desc,
        s.updated_at desc, s.id limit 1;
    -- Admin-assigned family plan (pilot / active). The old 30-day family 'trial' row does NOT grant access any more.
    v_fam_plan := exists (select 1 from public.school_licences l where l.family_id = v_family
      and coalesce(l.source, 'manual') <> 'stripe' and l.status in ('pilot', 'active')
      and public._family_plan_state(l) in ('pilot', 'active'));
  end if;

  if v_blocked and mode <> 'off' then v_state := 'blocked'; v_reason := 'none';
  elsif v_grant_forever or v_grant is not null then v_state := 'active'; v_reason := 'grant';
  elsif v_school is not null then v_state := 'active'; v_reason := 'school_licence';
  -- Security review S1: teachers / school admins only via licence or grant – never via a solo / family subscription.
  elsif v_staff then v_state := 'licence_required'; v_reason := 'none';
  elsif public._access_sub_state(solo, now_ts) = 'active' then v_state := 'active'; v_reason := 'subscription';
  elsif public._access_sub_state(fam, now_ts) = 'active' or v_fam_plan then v_state := 'active'; v_reason := 'family_subscription';
  elsif public._access_sub_state(solo, now_ts) = 'grace' then
    v_state := 'grace'; v_reason := 'grace'; v_grace := public._access_sub_grace_until(solo);
  elsif public._access_sub_state(fam, now_ts) = 'grace' then
    v_state := 'grace'; v_reason := 'grace'; v_grace := public._access_sub_grace_until(fam);
  elsif aa.trial_ends_at > now_ts then v_state := 'trial'; v_reason := 'trial';
  else v_state := 'expired'; v_reason := 'none';
  end if;
  v_real := v_state in ('active', 'trial', 'grace');

  -- Which free access applies (shown as "Gratis (unbefristet)" / "Gratis bis …"). A school grant only when it is what
  -- gives the access (no valid licence of that school).
  v_grant_json := case
    when v_reason = 'grant' then jsonb_build_object('scope', 'user', 'forever', v_grant_forever, 'until', v_grant)
    when v_reason = 'school_licence' and v_sgrant.school_id is not null and not coalesce(v_lic_valid, false)
      then jsonb_build_object('scope', 'school', 'forever', v_sgrant.forever, 'until', case when v_sgrant.forever then null else v_sgrant.until end)
  end;

  -- A child in a family that is not (yet) paid waits for the parent: the paywall says so instead of offering prices (G14).
  v_family_pending := coalesce(v_family_role = 'child' and v_reason <> 'family_subscription'
    and public._access_sub_state(fam, now_ts) = 'none' and not v_fam_plan, false);
  -- Why there is no access (G12): only for expired / licence_required.
  if v_state in ('expired', 'licence_required') then
    v_expired_reason := case
      when coalesce(solo.status, fam.status) in ('past_due', 'unpaid') then 'payment_failed'
      when v_state = 'expired' and v_family_pending then 'family_pending'
      when coalesce(solo.id, fam.id) is not null and v_state = 'expired' then 'subscription_ended'
      when public._access_licence_ended(p_uid) then 'licence_ended'
      when v_state = 'expired' then 'trial_ended'
    end;
  end if;

  -- No trial for teachers / school admins and for school-licensed users.
  v_trial_end := case when v_staff or v_reason = 'school_licence' then null else aa.trial_ends_at end;
  shown := case when solo.id is not null then solo else fam end;
  if shown.id is not null then
    v_interval := case public._billing_interval_from_period(shown.current_period_start, shown.current_period_end)
      when 'monthly' then 'month' when 'yearly' then 'year' end;
  end if;

  return jsonb_build_object(
    'has_access', case when v_enforced then v_real else true end,
    'state', v_state,
    'reason', v_reason,
    'role', v_role,
    'account_type', v_type,
    'trial_ends_at', v_trial_end,
    'trial_days_left', case when v_trial_end is null then null
      else greatest(0, ceil(extract(epoch from (v_trial_end - now_ts)) / 86400.0))::integer end,
    'grace_until', v_grace,
    'grant_until', v_grant,
    'grant', v_grant_json,
    'subscription', case when shown.id is null then null else jsonb_build_object(
      'plan', case when shown.plan_id = 'solo' then 'solo' else 'family' end,
      'status', shown.status, 'interval', v_interval, 'current_period_end', shown.current_period_end,
      'cancel_at_period_end', shown.cancel_at_period_end) end,
    'school', v_school_json,
    'blocked', v_blocked,
    'enforced', v_enforced,
    'expired_reason', v_expired_reason,
    'family_pending', v_family_pending);
end;
$$;
revoke all on function public.app_access(uuid) from public, anon, authenticated;
