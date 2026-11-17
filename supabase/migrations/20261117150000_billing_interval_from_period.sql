-- Preview e2e fix B4 (2026-11-17): a MONTHLY family subscription was mirrored as school_licences.billing_interval =
-- 'yearly' (billing_apply_subscription hard-coded 'yearly' on insert). Additive + idempotent:
--  1. _billing_interval_from_period(start, end): 'monthly' for a Stripe period of up to 62 days, 'yearly' for longer,
--     null when a date is missing. Stripe periods are 28-31 days (month) or 365/366 days (year).
--  2. billing_apply_subscription: replaced with the SAME signature (no overload, the webhook is unchanged); it now stores
--     the real interval on insert and keeps it current on every update (portal switch month <-> year). Everything else
--     is the body of 20261117100000_billing_hardening.sql unchanged. Not wrapped by the rate-limit migrations.
--  3. Backfill: existing Stripe licences get the interval of their subscription's period (no-op on a second run).
-- Run AFTER 20261117100000_billing_hardening.sql. Test: tests/fix-preview-db.test.mjs.

create or replace function public._billing_interval_from_period(p_start timestamptz, p_end timestamptz)
returns text language sql immutable set search_path = '' as $$
  select case when p_start is null or p_end is null then null
    when p_end - p_start <= interval '62 days' then 'monthly' else 'yearly' end;
$$;
revoke all on function public._billing_interval_from_period(timestamptz, timestamptz) from public, anon, authenticated;

create or replace function public.billing_apply_subscription(
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_plan_id text,
  p_status text,
  p_current_period_end timestamptz,
  p_current_period_start timestamptz default null,
  p_cancel_at_period_end boolean default false,
  p_collection_method text default 'charge_automatically',
  p_latest_invoice_status text default null,
  p_school_id uuid default null,
  p_family_id uuid default null,
  p_created_by uuid default null,
  p_student_limit integer default null,
  p_event_id text default null,
  p_event_type text default null,
  p_event_created timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  cust public.billing_customers;
  sub public.billing_subscriptions;
  lic public.school_licences;
  pkg text;
  lim integer;
  lic_status text;
  v_from date;
  v_until date;
  is_family boolean;
  v_interval text;
begin
  if auth.uid() is not null then raise exception 'FORBIDDEN'; end if; -- service role / SQL editor only (EXECUTE is not granted to users either)
  if coalesce(p_stripe_customer_id, '') !~ '^cus_[A-Za-z0-9]+$' or coalesce(p_stripe_subscription_id, '') !~ '^sub_[A-Za-z0-9]+$' then
    raise exception 'INVALID_REQUEST' using detail = 'Stripe customer/subscription id missing or malformed.';
  end if;
  if p_plan_id is null or p_plan_id not in ('starter', 'professional', 'enterprise', 'individual', 'family') then
    raise exception 'INVALID_PLAN' using detail = coalesce(p_plan_id, 'null');
  end if;
  if p_status is null or p_status not in ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused') then
    raise exception 'INVALID_STATUS' using detail = coalesce(p_status, 'null');
  end if;

  -- Event idempotency (the webhook may or may not have inserted the row already; only a processed event is a duplicate).
  if p_event_id is not null then
    if exists (select 1 from public.stripe_events e where e.id = p_event_id and e.processed_at is not null) then
      return jsonb_build_object('applied', false, 'reason', 'duplicate_event');
    end if;
    insert into public.stripe_events (id, type) values (p_event_id, coalesce(p_event_type, 'unknown')) on conflict (id) do nothing;
  end if;

  -- Serialise concurrent deliveries for the same subscription.
  perform pg_advisory_xact_lock(hashtext('billing_sub:' || p_stripe_subscription_id));

  -- Customer: created on first sight, owner can never change afterwards.
  select * into cust from public.billing_customers c where c.stripe_customer_id = p_stripe_customer_id;
  if cust.id is null then
    if num_nonnulls(p_school_id, p_family_id) <> 1 then raise exception 'BILLING_OWNER_REQUIRED'; end if;
    if (p_school_id is not null and not exists (select 1 from public.schools s where s.id = p_school_id))
      or (p_family_id is not null and not exists (select 1 from public.families f where f.id = p_family_id)) then
      -- Owner was deleted meanwhile: acknowledge (no retry storm), change nothing.
      if p_event_id is not null then update public.stripe_events e set processed_at = now() where e.id = p_event_id; end if;
      return jsonb_build_object('applied', false, 'reason', 'owner_not_found');
    end if;
    insert into public.billing_customers (stripe_customer_id, school_id, family_id, created_by)
    values (p_stripe_customer_id, p_school_id, p_family_id,
      case when exists (select 1 from auth.users u where u.id = p_created_by) then p_created_by end)
    on conflict (stripe_customer_id) do nothing;
    select * into cust from public.billing_customers c where c.stripe_customer_id = p_stripe_customer_id;
  end if;
  if (p_school_id is not null and p_school_id is distinct from cust.school_id)
    or (p_family_id is not null and p_family_id is distinct from cust.family_id) then
    raise exception 'BILLING_OWNER_MISMATCH';
  end if;
  is_family := cust.family_id is not null;
  if is_family <> (p_plan_id = 'family') then raise exception 'INVALID_PLAN' using detail = 'Plan does not match the customer (school vs family).'; end if;

  select * into sub from public.billing_subscriptions s where s.stripe_subscription_id = p_stripe_subscription_id;
  if sub.id is not null and sub.stripe_customer_id <> p_stripe_customer_id then raise exception 'BILLING_OWNER_MISMATCH'; end if;
  if sub.id is not null and p_event_created is not null and sub.last_event_at is not null and p_event_created < sub.last_event_at then
    if p_event_id is not null then update public.stripe_events e set processed_at = now() where e.id = p_event_id; end if;
    return jsonb_build_object('applied', false, 'reason', 'stale_event', 'subscription_id', sub.id, 'licence_id', sub.licence_id);
  end if;

  insert into public.billing_subscriptions as s (stripe_subscription_id, stripe_customer_id, plan_id, status, current_period_start,
    current_period_end, cancel_at_period_end, collection_method, latest_invoice_status, school_id, family_id, last_event_at)
  values (p_stripe_subscription_id, p_stripe_customer_id, p_plan_id, p_status, p_current_period_start, p_current_period_end,
    coalesce(p_cancel_at_period_end, false), coalesce(p_collection_method, 'charge_automatically'), p_latest_invoice_status,
    cust.school_id, cust.family_id, p_event_created)
  on conflict (stripe_subscription_id) do update set
    plan_id = excluded.plan_id, status = excluded.status,
    current_period_start = coalesce(excluded.current_period_start, s.current_period_start),
    current_period_end = coalesce(excluded.current_period_end, s.current_period_end),
    cancel_at_period_end = excluded.cancel_at_period_end, collection_method = excluded.collection_method,
    latest_invoice_status = coalesce(excluded.latest_invoice_status, s.latest_invoice_status),
    last_event_at = greatest(s.last_event_at, excluded.last_event_at), updated_at = now()
  returning * into sub;

  -- Licence row (source 'stripe'). Never touches manual/pilot rows.
  select * into lic from public.school_licences l where l.stripe_subscription_id = p_stripe_subscription_id;
  lic_status := case
    when p_status in ('active', 'trialing', 'past_due', 'canceled') then 'active'
    when p_status = 'paused' and is_family then 'paused'
    when p_status in ('unpaid', 'incomplete_expired', 'paused') then 'expired'
    else null end; -- incomplete
  if lic_status is null then
    if p_event_id is not null then update public.stripe_events e set processed_at = now() where e.id = p_event_id; end if;
    return jsonb_build_object('applied', true, 'subscription_id', sub.id, 'licence_id', lic.id, 'licence_status', lic.status);
  end if;

  pkg := case when is_family then 'family' when p_plan_id = 'individual' then 'custom' else p_plan_id end;
  lim := coalesce(p_student_limit, public._licence_default_limit(pkg), lic.student_limit);
  if not is_family and lim is null then raise exception 'LICENCE_LIMIT_REQUIRED' using detail = 'Individual plans need p_student_limit.'; end if;
  v_from := coalesce((p_current_period_start at time zone 'Europe/Zurich')::date, lic.valid_from, current_date);
  v_until := coalesce((sub.current_period_end at time zone 'Europe/Zurich')::date, lic.valid_until);
  -- past_due: Stripe has already moved the period forward to the NEW (unpaid) period. Access only for a grace period
  -- after the period start (card: 14 days of retries; invoice: 30 days payment term + 14), never the whole unpaid period.
  -- Paid later => invoice.paid / subscription.updated 'active' restores the full period end.
  if p_status = 'past_due' and sub.current_period_start is not null then
    v_until := least(v_until, (sub.current_period_start at time zone 'Europe/Zurich')::date
      + case when sub.collection_method = 'send_invoice' then 44 else 14 end);
  end if;
  if v_until is not null and v_until < v_from then v_from := v_until; end if;
  -- Real billing interval from the Stripe period (preview e2e B4); null (no period known) keeps the stored value.
  v_interval := public._billing_interval_from_period(sub.current_period_start, sub.current_period_end);

  if lic.id is null then
    insert into public.school_licences (school_id, family_id, plan_type, package, status, student_limit, valid_from, valid_until,
      billing_interval, source, stripe_subscription_id, assigned_by)
    values (cust.school_id, cust.family_id, case when is_family then 'family' else 'school' end, pkg, lic_status,
      case when is_family then 1 else lim end, v_from, v_until, coalesce(v_interval, 'yearly'), 'stripe', p_stripe_subscription_id, 'stripe')
    returning * into lic;
  else
    update public.school_licences l set package = pkg, status = lic_status,
      student_limit = case when is_family then l.student_limit else lim end,
      valid_from = v_from, valid_until = v_until, billing_interval = coalesce(v_interval, l.billing_interval)
    where l.id = lic.id returning * into lic;
  end if;
  update public.billing_subscriptions s set licence_id = lic.id where s.id = sub.id and s.licence_id is distinct from lic.id;

  if p_event_id is not null then update public.stripe_events e set processed_at = now() where e.id = p_event_id; end if;
  return jsonb_build_object('applied', true, 'subscription_id', sub.id, 'licence_id', lic.id, 'licence_status', lic.status);
end;
$$;

do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'billing_apply_subscription' loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    if exists (select 1 from pg_roles where rolname = 'service_role') then execute format('grant execute on function %s to service_role', f); end if;
  end loop;
end $$;


-- Backfill existing Stripe-mirrored licences (only rows whose interval differs; manual/pilot rows are never touched).
update public.school_licences l set billing_interval = x.iv
from (
  select s.stripe_subscription_id, public._billing_interval_from_period(s.current_period_start, s.current_period_end) iv
  from public.billing_subscriptions s
) x
where l.source = 'stripe' and l.stripe_subscription_id = x.stripe_subscription_id and x.iv is not null
  and l.billing_interval is distinct from x.iv;
