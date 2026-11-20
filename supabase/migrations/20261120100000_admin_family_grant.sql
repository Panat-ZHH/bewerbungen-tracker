-- Family package granted by a platform admin from the admin board (branch family-admin, 2026-11-20).
-- ADDITIVE + idempotent: three new functions, no table / column / policy / existing function is changed.
-- Rollback: supabase/rollback/20261120100000_admin_family_grant.down.sql (drops the three functions only).
--
-- Model (builds on 20261116140000_family_accounts.sql, 20261116200000_billing_stripe.sql, 20261118010000_access_core.sql,
-- 20261118400000_free_access_forever.sql):
--  * A manual family package is a row in public.school_licences with family_id, plan_type/package 'family',
--    status 'active', source 'manual', stripe_subscription_id NULL, external_ref NULL and assigned_by = 'admin:<admin uuid>'.
--    End date = valid_until (date, last day of access in Europe/Zurich); NULL = unlimited.
--    app_access() already counts such a row (source <> 'stripe', status active, _family_plan_state active) for EVERY active
--    member of the family (reason 'family_subscription').
--  * Stripe never overwrites it: billing_apply_subscription() only ever selects / updates the row with ITS
--    stripe_subscription_id, so manual rows are untouched by webhooks.
--  * The functions refuse to work on Stripe-managed families (an open Stripe subscription of the family, or a usable
--    licence row with source 'stripe' / external_ref): error STRIPE_MANAGED. Cancel in Stripe first.
--  * Callers: authenticated users that are in public.platform_admins (am_i_platform_admin()). The service role and
--    everybody else get FORBIDDEN – the admin API route calls these with the admin's own session (JWT).
--  * Every change writes an admin_audit_log row (family_grant / family_revoke) with before / after in the same transaction.
--  * Never deletes anything: revoke sets status 'cancelled'; families and members stay.
--
-- Who becomes a member when the person has no family yet: a new family «Familie» is created. A parent account
-- (profiles.account_type 'parent') joins as 'parent'; a student joins as 'child' (consent 'pending' when under 16,
-- exactly like family_create_invite) so parents can still join later through the normal invite flow.
-- Teachers / school admins are refused (NOT_ELIGIBLE): app_access() never gives staff access through a family.

-- Admin check in every function: auth.uid() must be set AND public.am_i_platform_admin() (20261118010000) must be true.
-- auth.uid() null (service role, SQL editor, anon) is refused as well.

-- ---------------------------------------------------------------- 1. status (read)
create or replace function public.admin_family_status(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_admin uuid := auth.uid();
  v_member public.family_members;
  v_family public.families;
  v_lic public.school_licences;
  v_manual public.school_licences;
  v_access jsonb;
  v_stripe boolean := false;
  v_kind text;
  v_role text;
begin
  if v_admin is null or not public.am_i_platform_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'Nur Plattform-Admins.';
  end if;
  if p_user_id is null or not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'NOT_FOUND' using detail = 'Konto nicht gefunden.';
  end if;

  v_access := public.app_access(p_user_id);
  select r.role into v_role from public.user_roles r where r.user_id = p_user_id;
  select * into v_member from public.family_members m where m.user_id = p_user_id and m.status <> 'removed' limit 1;
  if v_member.family_id is not null then
    select * into v_family from public.families f where f.id = v_member.family_id;
    v_lic := public._family_current_plan(v_member.family_id);
    select * into v_manual from public.school_licences l
      where l.family_id = v_member.family_id and l.source = 'manual' and l.stripe_subscription_id is null
        and l.external_ref is null and l.assigned_by like 'admin:%' and l.status = 'active'
      order by l.created_at desc, l.id limit 1;
    v_stripe := exists (select 1 from public.billing_subscriptions s where s.family_id = v_member.family_id
        and s.status in ('active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete'))
      or exists (select 1 from public.school_licences l where l.family_id = v_member.family_id
        and (l.source = 'stripe' or l.stripe_subscription_id is not null or l.external_ref is not null)
        and public._family_plan_state(l) in ('pilot', 'active', 'paused'));
  end if;

  -- What gives the access today, in one word for the admin board.
  v_kind := case coalesce(v_access ->> 'reason', 'none')
    when 'grant' then 'grant'
    when 'school_licence' then 'school'
    when 'subscription' then 'solo'
    when 'family_subscription' then case
      when v_manual.id is not null and not v_stripe then 'family_manual'
      when v_stripe then 'family_stripe'
      else 'family_manual' end
    when 'grace' then 'grace'
    when 'trial' then 'trial'
    else 'none' end;

  return jsonb_build_object(
    'user_id', p_user_id,
    'plan_kind', v_kind,
    'access_state', v_access ->> 'state',
    'access_reason', v_access ->> 'reason',
    'eligible', coalesce(v_role, 'student') not in ('teacher', 'school_admin'),
    'stripe_managed', v_stripe,
    'family', case when v_family.id is null then null else jsonb_build_object(
      'id', v_family.id, 'name', v_family.name, 'created_at', v_family.created_at,
      'my_role', v_member.role, 'my_status', v_member.status) end,
    'members', case when v_family.id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', u.email, 'role', m.role, 'status', m.status,
          'consent_status', m.consent_status, 'joined_at', m.joined_at) order by (m.role = 'parent') desc, m.joined_at, m.user_id)
        from public.family_members m left join auth.users u on u.id = m.user_id
        where m.family_id = v_family.id and m.status <> 'removed'), '[]'::jsonb) end,
    'licence', case when v_lic.id is null then null else jsonb_build_object(
      'id', v_lic.id, 'status', v_lic.status, 'state', public._family_plan_state(v_lic), 'source', v_lic.source,
      'valid_from', v_lic.valid_from, 'valid_until', v_lic.valid_until, 'seats_parents', v_lic.seats_parents,
      'seats_children', v_lic.seats_children, 'assigned_by', v_lic.assigned_by, 'notes', v_lic.notes,
      'created_at', v_lic.created_at,
      'manual', v_lic.source = 'manual' and v_lic.stripe_subscription_id is null and v_lic.external_ref is null
        and coalesce(v_lic.assigned_by, '') like 'admin:%') end,
    'manual_licence_id', v_manual.id,
    'can_grant', coalesce(v_role, 'student') not in ('teacher', 'school_admin') and not v_stripe
      and coalesce(v_member.status, 'active') = 'active',
    'can_revoke', v_manual.id is not null and not v_stripe);
end;
$$;

-- ---------------------------------------------------------------- 2. grant (idempotent)
create or replace function public.admin_family_grant(p_user_id uuid, p_until timestamptz default null, p_note text default null,
  p_seats_parents integer default 2, p_seats_children integer default 4)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := auth.uid();
  v_role text;
  v_type text;
  v_member public.family_members;
  v_fid uuid;
  v_created boolean := false;
  v_lic public.school_licences;
  v_before jsonb;
  v_until date;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_parents integer := coalesce(p_seats_parents, 2);
  v_children integer := coalesce(p_seats_children, 4);
  v_used_p integer;
  v_used_c integer;
begin
  if v_admin is null or not public.am_i_platform_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'Nur Plattform-Admins.';
  end if;
  if p_user_id is null or not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'NOT_FOUND' using detail = 'Konto nicht gefunden.';
  end if;
  if p_until is not null and p_until <= now() then
    raise exception 'INVALID_UNTIL' using detail = 'Das Enddatum muss in der Zukunft liegen.';
  end if;
  if p_until is not null and p_until > now() + interval '10 years' then
    raise exception 'INVALID_UNTIL' using detail = 'Das Enddatum darf höchstens 10 Jahre in der Zukunft liegen.';
  end if;
  if v_note is not null and (length(v_note) > 500) then
    raise exception 'INVALID_NOTE' using detail = 'Die Notiz darf höchstens 500 Zeichen haben.';
  end if;
  if v_parents not between 1 and 10 or v_children not between 1 and 20 then
    raise exception 'INVALID_SEATS' using detail = 'Plätze: 1–10 Eltern, 1–20 Kinder.';
  end if;

  select r.role into v_role from public.user_roles r where r.user_id = p_user_id;
  if v_role in ('teacher', 'school_admin') then
    raise exception 'NOT_ELIGIBLE' using detail = 'Lehrpersonen und Schuladmins bekommen keinen Zugang über eine Familie.';
  end if;

  -- Serialise grants / revokes for the same person (two admins clicking at once).
  perform pg_advisory_xact_lock(hashtext('admin_family:' || p_user_id::text));

  select * into v_member from public.family_members m where m.user_id = p_user_id and m.status <> 'removed' limit 1;
  if v_member.family_id is not null and v_member.status <> 'active' then
    raise exception 'FAMILY_PENDING' using detail = 'Die Person ist noch nicht aktiv in ihrer Familie (Einladung offen).';
  end if;
  v_fid := v_member.family_id;

  if v_fid is not null then
    perform 1 from public.families f where f.id = v_fid for update;
    if exists (select 1 from public.billing_subscriptions s where s.family_id = v_fid
        and s.status in ('active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete'))
      or exists (select 1 from public.school_licences l where l.family_id = v_fid
        and (l.source = 'stripe' or l.stripe_subscription_id is not null or l.external_ref is not null)
        and public._family_plan_state(l) in ('pilot', 'active', 'paused')) then
      raise exception 'STRIPE_MANAGED' using detail = 'Diese Familie hat ein Stripe-Abo. Bitte zuerst in Stripe kündigen.';
    end if;
    -- Never fewer seats than people already in the family.
    select count(*) filter (where m.role = 'parent')::integer, count(*) filter (where m.role = 'child')::integer
      into v_used_p, v_used_c
      from public.family_members m where m.family_id = v_fid and m.status in ('active', 'pending');
    if v_parents < v_used_p or v_children < v_used_c then
      raise exception 'SEATS_TOO_LOW' using detail = format('In der Familie sind schon %s Eltern und %s Kinder.', v_used_p, v_used_c);
    end if;
    select * into v_lic from public.school_licences l
      where l.family_id = v_fid and l.source = 'manual' and l.stripe_subscription_id is null and l.external_ref is null
        and l.assigned_by like 'admin:%' and l.status = 'active'
      order by l.created_at desc, l.id limit 1
      for update;
  else
    v_type := public._account_type(p_user_id);
    insert into public.families (name, created_by) values ('Familie', p_user_id) returning id into v_fid;
    insert into public.family_members (family_id, user_id, role, status, consent_status)
      values (v_fid, p_user_id,
        case when v_type = 'parent' then 'parent' else 'child' end, 'active',
        case when v_type <> 'parent' and public._family_needs_consent(p_user_id) then 'pending' else 'not_required' end);
    v_created := true;
  end if;

  v_until := case when p_until is null then null else (p_until at time zone 'Europe/Zurich')::date end;

  if v_lic.id is not null then
    v_before := jsonb_build_object('licence_id', v_lic.id, 'status', v_lic.status, 'valid_until', v_lic.valid_until,
      'seats_parents', v_lic.seats_parents, 'seats_children', v_lic.seats_children, 'assigned_by', v_lic.assigned_by, 'notes', v_lic.notes);
    update public.school_licences l set
      valid_from = least(coalesce(l.valid_from, current_date), current_date),
      valid_until = v_until,
      seats_parents = v_parents, seats_children = v_children,
      assigned_by = 'admin:' || v_admin::text,
      notes = coalesce(v_note, l.notes)
    where l.id = v_lic.id
    returning * into v_lic;
  else
    v_before := null;
    insert into public.school_licences (family_id, plan_type, package, status, student_limit, seats_parents, seats_children,
      valid_from, valid_until, billing_interval, notes, assigned_by, source, external_ref)
    values (v_fid, 'family', 'family', 'active', v_children, v_parents, v_children,
      current_date, v_until, 'yearly', v_note, 'admin:' || v_admin::text, 'manual', null)
    returning * into v_lic;
  end if;

  insert into public.admin_audit_log (admin_id, action, target_user, details)
  values (v_admin, 'family_grant', p_user_id, jsonb_build_object(
    'family_id', v_fid, 'family_created', v_created, 'licence_id', v_lic.id, 'note', v_note,
    'before', v_before,
    'after', jsonb_build_object('licence_id', v_lic.id, 'status', v_lic.status, 'valid_until', v_lic.valid_until,
      'seats_parents', v_lic.seats_parents, 'seats_children', v_lic.seats_children, 'assigned_by', v_lic.assigned_by)));

  return jsonb_build_object('family_id', v_fid, 'family_created', v_created, 'licence_id', v_lic.id,
    'status', v_lic.status, 'valid_until', v_lic.valid_until, 'seats_parents', v_lic.seats_parents,
    'seats_children', v_lic.seats_children, 'assigned_by', v_lic.assigned_by, 'updated', v_before is not null);
end;
$$;

-- ---------------------------------------------------------------- 3. revoke (cancel, never delete)
create or replace function public.admin_family_revoke(p_user_id uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := auth.uid();
  v_fid uuid;
  v_lic public.school_licences;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_ids uuid[];
  v_before jsonb;
begin
  if v_admin is null or not public.am_i_platform_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'Nur Plattform-Admins.';
  end if;
  if p_user_id is null or not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'NOT_FOUND' using detail = 'Konto nicht gefunden.';
  end if;
  if v_note is not null and length(v_note) > 500 then
    raise exception 'INVALID_NOTE' using detail = 'Die Notiz darf höchstens 500 Zeichen haben.';
  end if;

  perform pg_advisory_xact_lock(hashtext('admin_family:' || p_user_id::text));
  select m.family_id into v_fid from public.family_members m where m.user_id = p_user_id and m.status <> 'removed' limit 1;
  if v_fid is null then
    raise exception 'NOT_GRANTED' using detail = 'Diese Person ist in keiner Familie.';
  end if;

  -- Only admin-granted manual rows. A Stripe-managed licence is never touched (refused with a clear error).
  if not exists (select 1 from public.school_licences l where l.family_id = v_fid and l.source = 'manual'
      and l.stripe_subscription_id is null and l.external_ref is null and l.assigned_by like 'admin:%' and l.status = 'active') then
    if exists (select 1 from public.school_licences l where l.family_id = v_fid
        and (l.source = 'stripe' or l.stripe_subscription_id is not null or l.external_ref is not null)
        and public._family_plan_state(l) in ('pilot', 'active', 'paused'))
      or exists (select 1 from public.billing_subscriptions s where s.family_id = v_fid
        and s.status in ('active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete')) then
      raise exception 'STRIPE_MANAGED' using detail = 'Das Familienpaket läuft über Stripe. Bitte in Stripe kündigen.';
    end if;
    raise exception 'NOT_GRANTED' using detail = 'Diese Familie hat kein vom Admin vergebenes Familienpaket.';
  end if;

  select jsonb_agg(jsonb_build_object('licence_id', l.id, 'status', l.status, 'valid_until', l.valid_until,
      'seats_parents', l.seats_parents, 'seats_children', l.seats_children, 'assigned_by', l.assigned_by) order by l.created_at),
    array_agg(l.id)
    into v_before, v_ids
    from public.school_licences l
    where l.family_id = v_fid and l.source = 'manual' and l.stripe_subscription_id is null and l.external_ref is null
      and l.assigned_by like 'admin:%' and l.status = 'active';

  update public.school_licences l set status = 'cancelled',
    notes = left(concat_ws(E'\n', l.notes, 'Entzogen ' || to_char(now() at time zone 'Europe/Zurich', 'YYYY-MM-DD')
      || coalesce(': ' || v_note, '')), 2000)
  where l.id = any(v_ids);

  insert into public.admin_audit_log (admin_id, action, target_user, details)
  values (v_admin, 'family_revoke', p_user_id, jsonb_build_object(
    'family_id', v_fid, 'licence_ids', to_jsonb(v_ids), 'note', v_note,
    'before', v_before, 'after', jsonb_build_object('status', 'cancelled')));

  return jsonb_build_object('family_id', v_fid, 'licence_ids', to_jsonb(v_ids), 'status', 'cancelled');
end;
$$;

-- ---------------------------------------------------------------- 4. privileges
revoke all on function public.admin_family_status(uuid) from public, anon, authenticated;
revoke all on function public.admin_family_grant(uuid, timestamptz, text, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_family_revoke(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_family_status(uuid) to authenticated;
grant execute on function public.admin_family_grant(uuid, timestamptz, text, integer, integer) to authenticated;
grant execute on function public.admin_family_revoke(uuid, text) to authenticated;
-- Supabase's default privileges also grant new functions to service_role: take that away (they refuse it anyway).
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke all on function public.admin_family_status(uuid), public.admin_family_grant(uuid, timestamptz, text, integer, integer),
      public.admin_family_revoke(uuid, text) from service_role;
  end if;
end $$;
