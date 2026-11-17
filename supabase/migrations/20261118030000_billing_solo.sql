-- Access model, part 3: billing for the 'solo' plan ("Einzelabo", one student, CHF 4.90 / month or CHF 49 / year).
-- Contract: docs/access/SPEC.md §2 + §4, docs/billing/DATA-MODEL.md ("Solo"). Run AFTER 20261118010000_access_core.sql, which
-- added billing_customers.user_id / billing_subscriptions.user_id, plan_id 'solo' and the owner checks
-- (exactly one of school_id / family_id / user_id; plan 'solo' <=> user_id set).
-- ADDITIVE ONLY and idempotent (create or replace / drop policy if exists). Nothing here talks to Stripe.
--
-- What this adds:
--  * public.billing_apply_user_subscription(...)  webhook writer for solo subscriptions (service role only). Same rules as
--      billing_apply_subscription: processed event = duplicate, older event = stale, advisory lock per subscription, owner of a
--      customer can never change. NO school_licences row: access comes from public.app_access() reading billing_subscriptions.
--      A NEW name on purpose: an overload of billing_apply_subscription would make supabase-js named-arg calls ambiguous.
--  * public.billing_status_for_user(uuid)          status for GET /api/billing/status?owner=me (caller = owner, or service role).
--  * public.billing_solo_eligibility(uuid)         may this user buy 'solo'? (service role only, used by POST /api/billing/checkout).
--  * RLS: a solo owner reads their own billing_customers / billing_subscriptions rows (user_id = auth.uid()).
--  * public.account_billing_blockers(uid): a renewing solo subscription blocks account deletion (same signature, grants kept).
-- Tests: tests/billing-solo-db.test.mjs.

-- ---------------------------------------------------------------- 1. RLS: the solo owner reads their own rows
-- (Permissive policies are OR-ed with the existing school admin / parent policies; authenticated already has SELECT.)
drop policy if exists "solo owner reads own customer" on public.billing_customers;
create policy "solo owner reads own customer" on public.billing_customers for select to authenticated
  using (user_id is not null and user_id = (select auth.uid()));
drop policy if exists "solo owner reads own subscriptions" on public.billing_subscriptions;
create policy "solo owner reads own subscriptions" on public.billing_subscriptions for select to authenticated
  using (user_id is not null and user_id = (select auth.uid()));

-- ---------------------------------------------------------------- 2. webhook writer (service role only)
-- Returns jsonb { applied, reason?, subscription_id, user_id }. reason: duplicate_event | stale_event | owner_not_found.
-- Errors (permanent, the webhook acknowledges them): FORBIDDEN, INVALID_REQUEST, INVALID_PLAN, INVALID_STATUS,
-- BILLING_OWNER_REQUIRED, BILLING_OWNER_MISMATCH.
create or replace function public.billing_apply_user_subscription(
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_status text,
  p_current_period_end timestamptz,
  p_current_period_start timestamptz default null,
  p_cancel_at_period_end boolean default false,
  p_collection_method text default 'charge_automatically',
  p_latest_invoice_status text default null,
  p_user_id uuid default null,
  p_plan_id text default 'solo',
  p_event_id text default null,
  p_event_type text default null,
  p_event_created timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  cust public.billing_customers;
  sub public.billing_subscriptions;
begin
  if auth.uid() is not null then raise exception 'FORBIDDEN'; end if; -- service role / SQL editor only (EXECUTE is not granted to users either)
  if coalesce(p_stripe_customer_id, '') !~ '^cus_[A-Za-z0-9]+$' or coalesce(p_stripe_subscription_id, '') !~ '^sub_[A-Za-z0-9]+$' then
    raise exception 'INVALID_REQUEST' using detail = 'Stripe customer/subscription id missing or malformed.';
  end if;
  if p_plan_id is distinct from 'solo' then raise exception 'INVALID_PLAN' using detail = coalesce(p_plan_id, 'null'); end if;
  if p_status is null or p_status not in ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused') then
    raise exception 'INVALID_STATUS' using detail = coalesce(p_status, 'null');
  end if;
  if p_collection_method is not null and p_collection_method not in ('charge_automatically', 'send_invoice') then
    raise exception 'INVALID_REQUEST' using detail = 'collection_method';
  end if;
  if p_latest_invoice_status is not null and p_latest_invoice_status not in ('draft', 'open', 'paid', 'uncollectible', 'void') then
    raise exception 'INVALID_REQUEST' using detail = 'latest_invoice_status';
  end if;

  -- Event idempotency (only a processed event is a duplicate).
  if p_event_id is not null then
    if exists (select 1 from public.stripe_events e where e.id = p_event_id and e.processed_at is not null) then
      return jsonb_build_object('applied', false, 'reason', 'duplicate_event');
    end if;
    insert into public.stripe_events (id, type) values (p_event_id, coalesce(p_event_type, 'unknown')) on conflict (id) do nothing;
  end if;

  -- Serialise concurrent deliveries for the same subscription (same key as billing_apply_subscription).
  perform pg_advisory_xact_lock(hashtext('billing_sub:' || p_stripe_subscription_id));

  -- Customer: created on first sight with its owner; the owner never changes afterwards.
  select * into cust from public.billing_customers c where c.stripe_customer_id = p_stripe_customer_id;
  if cust.id is null then
    if p_user_id is null then raise exception 'BILLING_OWNER_REQUIRED'; end if;
    if not exists (select 1 from auth.users u where u.id = p_user_id) then
      -- Account deleted meanwhile: acknowledge (no retry storm), change nothing.
      if p_event_id is not null then update public.stripe_events e set processed_at = now() where e.id = p_event_id; end if;
      return jsonb_build_object('applied', false, 'reason', 'owner_not_found');
    end if;
    insert into public.billing_customers (stripe_customer_id, user_id, created_by)
    values (p_stripe_customer_id, p_user_id, p_user_id)
    on conflict (stripe_customer_id) do nothing;
    select * into cust from public.billing_customers c where c.stripe_customer_id = p_stripe_customer_id;
  end if;
  -- A school / family customer can never carry a solo subscription.
  if cust.user_id is null then raise exception 'INVALID_PLAN' using detail = 'Customer belongs to a school or family.'; end if;
  if p_user_id is not null and p_user_id is distinct from cust.user_id then raise exception 'BILLING_OWNER_MISMATCH'; end if;

  select * into sub from public.billing_subscriptions s where s.stripe_subscription_id = p_stripe_subscription_id;
  if sub.id is not null and (sub.stripe_customer_id <> p_stripe_customer_id or sub.user_id is distinct from cust.user_id) then
    raise exception 'BILLING_OWNER_MISMATCH';
  end if;
  if sub.id is not null and p_event_created is not null and sub.last_event_at is not null and p_event_created < sub.last_event_at then
    if p_event_id is not null then update public.stripe_events e set processed_at = now() where e.id = p_event_id; end if;
    return jsonb_build_object('applied', false, 'reason', 'stale_event', 'subscription_id', sub.id, 'user_id', cust.user_id);
  end if;

  insert into public.billing_subscriptions as s (stripe_subscription_id, stripe_customer_id, plan_id, status, current_period_start,
    current_period_end, cancel_at_period_end, collection_method, latest_invoice_status, user_id, last_event_at)
  values (p_stripe_subscription_id, p_stripe_customer_id, 'solo', p_status, p_current_period_start, p_current_period_end,
    coalesce(p_cancel_at_period_end, false), coalesce(p_collection_method, 'charge_automatically'), p_latest_invoice_status,
    cust.user_id, p_event_created)
  on conflict (stripe_subscription_id) do update set
    status = excluded.status,
    current_period_start = coalesce(excluded.current_period_start, s.current_period_start),
    current_period_end = coalesce(excluded.current_period_end, s.current_period_end),
    cancel_at_period_end = excluded.cancel_at_period_end, collection_method = excluded.collection_method,
    latest_invoice_status = coalesce(excluded.latest_invoice_status, s.latest_invoice_status),
    last_event_at = greatest(s.last_event_at, excluded.last_event_at), updated_at = now()
  returning * into sub;

  if p_event_id is not null then update public.stripe_events e set processed_at = now() where e.id = p_event_id; end if;
  return jsonb_build_object('applied', true, 'subscription_id', sub.id, 'user_id', cust.user_id);
end;
$$;

-- ---------------------------------------------------------------- 3. status (GET /api/billing/status?owner=me)
-- The caller's own solo subscription (a user may only ask about themselves; the service role about anyone).
-- Shown row: usable first (active, then grace), else the newest. state: 'active' | 'grace' | 'expired' | null (no subscription).
create or replace function public.billing_status_for_user(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); sub public.billing_subscriptions; v_state text; v_grace timestamptz;
begin
  if p_user_id is null then raise exception 'INVALID_REQUEST'; end if;
  if uid is not null and uid <> p_user_id then raise exception 'FORBIDDEN'; end if;
  select * into sub from public.billing_subscriptions s where s.user_id = p_user_id and s.plan_id = 'solo'
    order by (public._access_sub_state(s, now()) = 'active') desc, (public._access_sub_state(s, now()) = 'grace') desc,
      s.updated_at desc, s.id limit 1;
  if sub.id is not null then
    v_state := case public._access_sub_state(sub, now()) when 'active' then 'active' when 'grace' then 'grace' else 'expired' end;
    v_grace := case when v_state = 'grace' then public._access_sub_grace_until(sub) end;
  end if;
  return jsonb_build_object(
    'user_id', p_user_id,
    'plan', case when sub.id is not null then 'solo' end,
    'state', v_state,
    'subscription_status', sub.status,
    'interval', case public._billing_interval_from_period(sub.current_period_start, sub.current_period_end)
      when 'monthly' then 'month' when 'yearly' then 'year' end,
    'current_period_end', sub.current_period_end,
    'valid_until', case when v_state = 'grace' then (v_grace at time zone 'Europe/Zurich')::date
      when sub.current_period_end is not null then (sub.current_period_end at time zone 'Europe/Zurich')::date end,
    'grace_until', v_grace,
    'cancel_at_period_end', coalesce(sub.cancel_at_period_end, false),
    'collection_method', sub.collection_method,
    'latest_invoice_status', sub.latest_invoice_status,
    'has_customer', exists (select 1 from public.billing_customers c where c.user_id = p_user_id));
end;
$$;

-- ---------------------------------------------------------------- 4. who may buy 'solo' (service role only)
-- jsonb { role: 'student' | 'parent' | 'staff', account_type, blocked: boolean, covered_by: null | 'solo' | 'family' | 'school' }.
--   blocked: account blocked by a WendApply admin (account_access.blocked_at) – may export / delete data, never buy (SPEC §8 G11).
--   role: 'staff' = user_roles.role teacher / school_admin, or a school admin row without class membership (same rule as
--         app_access); 'parent' = profiles.account_type parent; else 'student' (school_student / independent_student).
--   covered_by: 'solo' = an open solo subscription (trialing/active/past_due/unpaid/paused/incomplete; also when set to cancel
--         at period end: renew it in the portal), 'family' = covered by a family subscription / admin family plan (app_access
--         reason family_subscription, or grace on a family subscription), 'school' = valid school licence.
create or replace function public.billing_solo_eligibility(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_urole text; v_type text; v_role text; v_info jsonb; v_cov text;
begin
  if auth.uid() is not null then raise exception 'FORBIDDEN'; end if;
  if p_user_id is null or not exists (select 1 from auth.users u where u.id = p_user_id) then raise exception 'NOT_FOUND'; end if;
  select r.role into v_urole from public.user_roles r where r.user_id = p_user_id;
  v_type := public._account_type(p_user_id);
  v_role := case
    when v_urole in ('teacher', 'school_admin') then 'staff'
    when v_type = 'parent' then 'parent'
    when exists (select 1 from public.school_admins a where a.user_id = p_user_id)
      and not exists (select 1 from public.class_members m where m.student_id = p_user_id) then 'staff'
    when v_type in ('school_student', 'independent_student') then 'student'
    else 'staff' end;
  if exists (select 1 from public.billing_subscriptions s where s.user_id = p_user_id and s.plan_id = 'solo'
      and s.status in ('trialing', 'active', 'past_due', 'unpaid', 'paused', 'incomplete')) then
    v_cov := 'solo';
  else
    v_info := public.app_access(p_user_id);
    v_cov := case
      when v_info ->> 'reason' = 'school_licence' then 'school'
      when v_info ->> 'reason' = 'family_subscription' then 'family'
      when v_info ->> 'reason' = 'grace' and v_info -> 'subscription' ->> 'plan' = 'family' then 'family'
      end;
  end if;
  return jsonb_build_object('role', v_role, 'account_type', case when v_role = 'staff' then null else v_type end,
    'blocked', exists (select 1 from public.account_access a where a.user_id = p_user_id and a.blocked_at is not null),
    'covered_by', v_cov);
end;
$$;

-- ---------------------------------------------------------------- 5. account deletion guard (+ solo)
-- Body of 20261117130000_billing_family_customer_owner.sql unchanged, plus: the user's OWN solo subscription that still renews
-- (not canceled, not set to cancel at period end) blocks account deletion – otherwise Stripe keeps charging the card while
-- the account (and with it the billing rows and the portal access) is gone. Blocker kind 'solo'.
create or replace function public.account_billing_blockers(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('kind', b.kind, 'plan_id', b.plan_id, 'status', b.status) order by b.kind, b.plan_id), '[]'::jsonb)
  from (
    select 'family'::text as kind, s.plan_id, s.status
    from public.billing_subscriptions s
    join public.family_members m on m.family_id = s.family_id and m.user_id = p_user_id and m.role = 'parent' and m.status = 'active'
    where s.status in ('trialing', 'active', 'past_due', 'unpaid', 'incomplete', 'paused') and not s.cancel_at_period_end
      and (
        not exists (select 1 from public.family_members o where o.family_id = s.family_id and o.role = 'parent' and o.status = 'active' and o.user_id <> p_user_id)
        or exists (select 1 from public.billing_customers c where c.stripe_customer_id = s.stripe_customer_id and c.created_by = p_user_id)
      )
    union all
    select 'school'::text, s.plan_id, s.status
    from public.billing_subscriptions s
    join public.school_admins a on a.school_id = s.school_id and a.user_id = p_user_id
    where s.status in ('trialing', 'active', 'past_due', 'unpaid', 'incomplete', 'paused') and not s.cancel_at_period_end
      and not exists (select 1 from public.school_admins o where o.school_id = s.school_id and o.user_id <> p_user_id)
    union all
    select 'solo'::text, s.plan_id, s.status
    from public.billing_subscriptions s
    where s.user_id = p_user_id
      and s.status in ('trialing', 'active', 'past_due', 'unpaid', 'incomplete', 'paused') and not s.cancel_at_period_end
  ) b
$$;

-- ---------------------------------------------------------------- 6. privileges
revoke all on function public.billing_apply_user_subscription(text, text, text, timestamptz, timestamptz, boolean, text, text, uuid, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.billing_status_for_user(uuid) from public, anon;
grant execute on function public.billing_status_for_user(uuid) to authenticated;
revoke all on function public.billing_solo_eligibility(uuid) from public, anon, authenticated;
revoke all on function public.account_billing_blockers(uuid) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.billing_apply_user_subscription(text, text, text, timestamptz, timestamptz, boolean, text, text, uuid, text, text, text, timestamptz) to service_role;
    grant execute on function public.billing_status_for_user(uuid) to service_role;
    grant execute on function public.billing_solo_eligibility(uuid) to service_role;
    grant execute on function public.account_billing_blockers(uuid) to service_role;
  end if;
end $$;
