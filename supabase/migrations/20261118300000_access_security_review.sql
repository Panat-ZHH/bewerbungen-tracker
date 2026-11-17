-- Independent security review #1 of the access model (branch acc-sec, 2026-11-17). Report: _access/REPORT-security-1.md.
-- Run AFTER 20261118030000_billing_solo.sql. ADDITIVE ONLY and idempotent (create or replace / grants). Tests:
-- tests/access-security-review-db.test.mjs.
--
-- S1 (HIGH)  app_access: teachers / school admins got access through a solo or family subscription (or its payment grace).
--            A student with a CHF 4.90 Einzelabo – or a child in a paid family, or a parent – could switch to the teacher role
--            (set_my_role / account type) and use every teacher RPC (class_create, invitations, student views) without a
--            school licence. SPEC §1: staff have access ONLY via a valid school licence or an admin grant. The staff check now
--            comes right after grant + school licence, before every subscription branch.
-- S2 (MED)   school_add_teacher accepted any account that is not a class member or parent (e.g. an independent student) and
--            _access_licensed_school counted that school_teachers row as a licence → a school admin could hand out free,
--            uncounted access to anybody. Now: the target must have the teacher role, and a school_teachers row only gives
--            access while the user still has the teacher role (a linked teacher switching to "student" loses it).
-- S3 (LOW)   account_access: the user could read the admin's internal note (free_access_note) and the admin's id
--            (updated_by). Column grants now hide both.
-- S4 (LOW)   trial ledger: "name+1@…" and Gmail dot variants of the same mailbox each got a new 7-day trial. The e-mail is
--            normalised before hashing (lowercase, "+tag" removed, Gmail dots removed, googlemail.com → gmail.com).

-- ---------------------------------------------------------------- S4: e-mail normalisation for the trial ledger
create or replace function public._access_email_hash(p_email text)
returns text language sql immutable set search_path = '' as $$
  with e as (select lower(btrim(coalesce(p_email, ''))) as v),
  parts as (select case when position('@' in v) > 1 then split_part(v, '@', 1) end as loc,
                   case when position('@' in v) > 1 then substr(v, length(split_part(v, '@', 1)) + 2) end as dom, v from e),
  norm as (select v, dom, case when loc is null then null else
      case when dom in ('gmail.com', 'googlemail.com') then replace(split_part(loc, '+', 1), '.', '') else split_part(loc, '+', 1) end end as loc
    from parts)
  select case when v = '' then null
    when loc is null or loc = '' then encode(sha256(convert_to(v, 'UTF8')), 'hex')
    else encode(sha256(convert_to(loc || '@' || case when dom = 'googlemail.com' then 'gmail.com' else dom end, 'UTF8')), 'hex') end
  from norm;
$$;
revoke all on function public._access_email_hash(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- S2: staff links count only for teachers
create or replace function public._access_licensed_school(p_uid uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select x.school_id from (
    select c.school_id from public.class_members m join public.classes c on c.id = m.class_id
      where m.student_id = p_uid and c.school_id is not null and not coalesce(c.archived, false)
    union select a.school_id from public.school_admins a where a.user_id = p_uid
    union select t.school_id from public.school_teachers t where t.user_id = p_uid
      and exists (select 1 from public.user_roles r where r.user_id = p_uid and r.role in ('teacher', 'school_admin'))
    union select c.school_id from public.classes c where c.teacher_id = p_uid and c.school_id is not null and not coalesce(c.archived, false)
    union select c.school_id from public.class_teachers t join public.classes c on c.id = t.class_id
      where t.teacher_id = p_uid and c.school_id is not null and not coalesce(c.archived, false)
  ) x where public._access_school_valid(x.school_id)
  order by x.school_id limit 1;
$$;
revoke all on function public._access_licensed_school(uuid) from public, anon, authenticated;

-- school_add_teacher is wrapped by the access guard (20261118020000): the logic lives in _acc_impl_school_add_teacher.
do $$ begin
  if to_regprocedure('public._acc_impl_school_add_teacher(uuid, text)') is null then
    raise exception 'security review: public._acc_impl_school_add_teacher(uuid, text) missing (run 20261118020000 first)';
  end if;
end $$;
create or replace function public._acc_impl_school_add_teacher(p_school_id uuid, p_email text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); v_user uuid;
begin
  if uid is not null then
    if not public.is_school_admin(p_school_id) then raise exception 'FORBIDDEN'; end if;
    perform public._rl_enforce('school-teacher', 30, 300, 3600); -- e-mail lookups (enumeration)
  end if;
  if not exists (select 1 from public.schools s where s.id = p_school_id) then raise exception 'NOT_FOUND'; end if;
  if nullif(btrim(coalesce(p_email, '')), '') is null or length(p_email) > 254 then raise exception 'INVALID_REQUEST'; end if;
  select u.id into v_user from auth.users u where lower(u.email) = lower(btrim(p_email)) limit 1;
  if v_user is null then
    raise exception 'USER_NOT_FOUND' using detail = 'Zu dieser E-Mail gibt es noch kein WendApply-Konto. Die Lehrperson muss sich zuerst registrieren.';
  end if;
  if exists (select 1 from public.class_members m where m.student_id = v_user)
    or exists (select 1 from public.profiles p where p.user_id = v_user and p.account_type = 'parent')
    or not exists (select 1 from public.user_roles r where r.user_id = v_user and r.role in ('teacher', 'school_admin')) then
    raise exception 'NOT_A_TEACHER' using detail = 'Dieses Konto ist kein Lehrpersonen-Konto. Die Lehrperson muss sich als Lehrperson registrieren.';
  end if;
  insert into public.school_teachers (school_id, user_id, added_by) values (p_school_id, v_user, uid) on conflict do nothing;
  return jsonb_build_object('school_id', p_school_id, 'user_id', v_user);
end;
$$;
revoke all on function public._acc_impl_school_add_teacher(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- S3: hide admin-only columns of account_access
revoke select on public.account_access from authenticated;
grant select (user_id, trial_started_at, trial_ends_at, free_access_until, blocked_at, blocked_reason, enforce_test, updated_at)
  on public.account_access to authenticated;

-- ---------------------------------------------------------------- S1: staff only via licence / grant
-- AccessInfo (lib/access/types.ts) of p_uid. Internal: service role / definer callers only (my_access() for the user).
create or replace function public.app_access(p_uid uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  now_ts timestamptz := now();
  mode text;
  aa public.account_access;
  v_urole text; v_role text; v_type text;
  v_school uuid; v_school_json jsonb; v_lic public.school_licences;
  solo public.billing_subscriptions; fam public.billing_subscriptions; shown public.billing_subscriptions;
  v_family uuid; v_fam_plan boolean := false;
  v_blocked boolean; v_enforced boolean; v_staff boolean;
  v_state text; v_reason text; v_trial_end timestamptz; v_grace timestamptz; v_grant timestamptz; v_real boolean;
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
  v_grant := case when aa.free_access_until > now_ts then aa.free_access_until end;

  v_school := public._access_licensed_school(p_uid);
  if v_school is not null then
    v_lic := public._school_current_licence(v_school);
    select jsonb_build_object('id', s.id, 'name', s.name,
      'valid_until', case when v_lic.status = 'pilot' then v_lic.pilot_end else v_lic.valid_until end)
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
  elsif v_grant is not null then v_state := 'active'; v_reason := 'grant';
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
