-- Billing with Stripe (schools + families): customers, subscriptions, webhook idempotency, Stripe-backed licences.
-- Run AFTER 20261116140000_family_accounts.sql. Additive and idempotent. Docs: docs/billing/DATA-MODEL.md.
--
-- Nothing here talks to Stripe. The webhook route (service role) calls billing_apply_subscription(), which upserts the
-- subscription mirror AND the matching licence row in public.school_licences in one transaction. The existing seat logic
-- (_school_assert_capacity / class_members_licence_check / _family_assert_seat) is NOT changed: a Stripe licence is just
-- another licence row (source = 'stripe'), so the student limit stays enforced by the existing triggers.
--
-- Existing rows: manual and pilot licences keep working unchanged. They get source = 'manual' (or 'pilot' for the pilot
-- package) and are never touched by billing_apply_subscription, which only ever writes rows with source = 'stripe'.
--
-- Access model: RLS on every new table. School admins read their school's customer/subscription rows, parents read their
-- family's rows. Nobody writes directly (no INSERT/UPDATE/DELETE grants for anon/authenticated). stripe_events has no
-- policy at all (service role only). billing_apply_subscription is executable by service_role only.

-- ---------- 1. extend school_licences (non-destructive) ----------
-- status and valid_until already exist (20261116100000). Constant default => metadata-only column add, no table rewrite.
alter table public.school_licences add column if not exists source text not null default 'manual';
alter table public.school_licences add column if not exists stripe_subscription_id text;
-- Existing pilot rows are pilots (only rows still on the default are relabelled; idempotent).
update public.school_licences set source = 'pilot' where source = 'manual' and package = 'pilot' and stripe_subscription_id is null;

alter table public.school_licences drop constraint if exists school_licences_source_check;
alter table public.school_licences add constraint school_licences_source_check check (source in ('manual', 'pilot', 'stripe'));
alter table public.school_licences drop constraint if exists school_licences_stripe_check;
alter table public.school_licences add constraint school_licences_stripe_check check ((source = 'stripe') = (stripe_subscription_id is not null));
-- One licence row per Stripe subscription (renewals and plan changes update that row).
create unique index if not exists school_licences_stripe_sub_idx on public.school_licences (stripe_subscription_id) where stripe_subscription_id is not null;

-- New manual pilot rows (platform_assign_licence(..., 'pilot')) are labelled 'pilot' automatically.
create or replace function public._licence_source_default()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.source = 'manual' and new.package = 'pilot' and new.stripe_subscription_id is null then new.source := 'pilot'; end if;
  return new;
end;
$$;
drop trigger if exists school_licences_source_default on public.school_licences;
create trigger school_licences_source_default before insert on public.school_licences
  for each row execute function public._licence_source_default();

-- School admins may read the source column of their licence rows (column grant, like 20261116130000).
grant select (source) on table public.school_licences to authenticated;

-- ---------- 2. tables ----------
create table if not exists public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  stripe_customer_id text not null unique check (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  school_id uuid references public.schools(id) on delete cascade,
  family_id uuid references public.families(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint billing_customers_owner_check check (num_nonnulls(school_id, family_id) = 1)
);
-- Normally one Stripe customer per school / family (the API reuses the newest one for checkout, invoices and the portal).
-- Deliberately NOT unique: a duplicate customer created by a race must not make its webhooks fail forever.
create index if not exists billing_customers_school_idx on public.billing_customers (school_id, created_at desc) where school_id is not null;
create index if not exists billing_customers_family_idx on public.billing_customers (family_id, created_at desc) where family_id is not null;

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  stripe_subscription_id text not null unique check (stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  stripe_customer_id text not null references public.billing_customers(stripe_customer_id) on delete cascade,
  plan_id text not null check (plan_id in ('starter', 'professional', 'enterprise', 'individual', 'family')),
  status text not null check (status in ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  collection_method text not null default 'charge_automatically' check (collection_method in ('charge_automatically', 'send_invoice')),
  latest_invoice_status text check (latest_invoice_status is null or latest_invoice_status in ('draft', 'open', 'paid', 'uncollectible', 'void')),
  school_id uuid references public.schools(id) on delete cascade,
  family_id uuid references public.families(id) on delete cascade,
  licence_id uuid references public.school_licences(id) on delete set null,
  last_event_at timestamptz, -- Stripe event.created of the last applied event (older events are ignored)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_subscriptions_owner_check check (num_nonnulls(school_id, family_id) = 1),
  constraint billing_subscriptions_plan_owner_check check ((plan_id = 'family') = (family_id is not null))
);
create index if not exists billing_subscriptions_school_idx on public.billing_subscriptions (school_id, updated_at desc) where school_id is not null;
create index if not exists billing_subscriptions_family_idx on public.billing_subscriptions (family_id, updated_at desc) where family_id is not null;
create index if not exists billing_subscriptions_customer_idx on public.billing_subscriptions (stripe_customer_id);

-- Webhook idempotency: one row per Stripe event id. No payload is stored (no personal data).
create table if not exists public.stripe_events (
  id text primary key check (id ~ '^evt_[A-Za-z0-9]+$'),
  type text not null check (length(type) between 1 and 100),
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

-- ---------- 3. RLS ----------
alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.stripe_events enable row level security;
revoke all on public.billing_customers, public.billing_subscriptions, public.stripe_events from public, anon, authenticated;
grant select on public.billing_customers, public.billing_subscriptions to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.billing_customers, public.billing_subscriptions, public.stripe_events to service_role;
  end if;
end $$;

-- Active parent of the family (children never see billing).
create or replace function public.is_family_parent(p_family_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from public.family_members m
    where m.family_id = p_family_id and m.user_id = auth.uid() and m.role = 'parent' and m.status = 'active');
$$;

drop policy if exists "billing owners read customers" on public.billing_customers;
drop policy if exists "billing owners read subscriptions" on public.billing_subscriptions;
create policy "billing owners read customers" on public.billing_customers for select to authenticated
  using ((school_id is not null and public.is_school_admin(school_id)) or (family_id is not null and public.is_family_parent(family_id)));
create policy "billing owners read subscriptions" on public.billing_subscriptions for select to authenticated
  using ((school_id is not null and public.is_school_admin(school_id)) or (family_id is not null and public.is_family_parent(family_id)));
-- stripe_events: RLS on, no policy => service role only.

-- ---------- 4. apply a Stripe subscription (webhook, service role only) ----------
-- Upserts billing_customers (first time only), billing_subscriptions and the 'stripe' licence row atomically.
-- Idempotent: the same input twice leaves the same state; a processed p_event_id is skipped; an event older than the
-- last applied one (p_event_created < last_event_at) is skipped (Stripe does not guarantee delivery order).
--
-- Stripe status -> licence:
--   active / trialing / past_due -> licence status 'active', valid_from..valid_until = current period (Zurich dates).
--                                   past_due keeps access until the period end (Stripe retries / invoice is still open).
--   canceled                     -> licence stays 'active' but ends at the period end (valid_until = period end date).
--   unpaid / incomplete_expired  -> licence 'expired' (school) / 'expired' (family): no new joins.
--   paused                       -> school 'expired', family 'paused'.
--   incomplete                   -> no licence yet (first payment pending); an existing row is left unchanged.
-- Returns jsonb { applied, reason?, subscription_id, licence_id, licence_status }.
-- Errors: BILLING_OWNER_REQUIRED, BILLING_OWNER_MISMATCH, INVALID_PLAN, INVALID_STATUS, INVALID_REQUEST, LICENCE_LIMIT_REQUIRED, FORBIDDEN.
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
  if v_until is not null and v_until < v_from then v_from := v_until; end if;

  if lic.id is null then
    insert into public.school_licences (school_id, family_id, plan_type, package, status, student_limit, valid_from, valid_until,
      billing_interval, source, stripe_subscription_id, assigned_by)
    values (cust.school_id, cust.family_id, case when is_family then 'family' else 'school' end, pkg, lic_status,
      case when is_family then 1 else lim end, v_from, v_until, 'yearly', 'stripe', p_stripe_subscription_id, 'stripe')
    returning * into lic;
  else
    update public.school_licences l set package = pkg, status = lic_status,
      student_limit = case when is_family then l.student_limit else lim end,
      valid_from = v_from, valid_until = v_until
    where l.id = lic.id returning * into lic;
  end if;
  update public.billing_subscriptions s set licence_id = lic.id where s.id = sub.id and s.licence_id is distinct from lic.id;

  if p_event_id is not null then update public.stripe_events e set processed_at = now() where e.id = p_event_id; end if;
  return jsonb_build_object('applied', true, 'subscription_id', sub.id, 'licence_id', lic.id, 'licence_status', lic.status);
end;
$$;

-- ---------- 5. status for the UI (school admins / parents; service role) ----------
create or replace function public._billing_status_json(p_lic public.school_licences, p_state text, p_sub public.billing_subscriptions, p_has_customer boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'plan', case when p_lic.id is null then null when p_lic.package = 'custom' then 'individual' else p_lic.package end,
    'state', p_state,
    'licence_status', p_lic.status,
    'source', p_lic.source,
    'student_limit', p_lic.student_limit,
    'valid_until', case when p_lic.status = 'pilot' then p_lic.pilot_end
      when p_lic.status = 'trial' then (p_lic.trial_ends_at at time zone 'Europe/Zurich')::date else p_lic.valid_until end,
    'subscription_status', p_sub.status,
    'cancel_at_period_end', coalesce(p_sub.cancel_at_period_end, false),
    'current_period_end', p_sub.current_period_end,
    'collection_method', p_sub.collection_method,
    'latest_invoice_status', p_sub.latest_invoice_status,
    'has_customer', p_has_customer);
$$;

create or replace function public.billing_status_for_school(p_school_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); lic public.school_licences; sub public.billing_subscriptions;
begin
  if uid is not null and not public.is_school_admin(p_school_id) then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from public.schools s where s.id = p_school_id) then raise exception 'NOT_FOUND'; end if;
  lic := public._school_current_licence(p_school_id);
  select * into sub from public.billing_subscriptions s where s.school_id = p_school_id
    order by (s.stripe_subscription_id is not distinct from lic.stripe_subscription_id) desc, s.updated_at desc, s.id limit 1;
  return jsonb_build_object('school_id', p_school_id, 'students_used', public._school_student_count(p_school_id))
    || public._billing_status_json(lic, case when lic.id is not null then public._licence_state(lic.status, lic.pilot_end, lic.valid_from, lic.valid_until) end,
      sub, exists (select 1 from public.billing_customers c where c.school_id = p_school_id));
end;
$$;

create or replace function public.billing_status_for_family(p_family_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); lic public.school_licences; sub public.billing_subscriptions;
begin
  if uid is not null and not public.is_family_parent(p_family_id) then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from public.families f where f.id = p_family_id) then raise exception 'NOT_FOUND'; end if;
  lic := public._family_current_plan(p_family_id);
  select * into sub from public.billing_subscriptions s where s.family_id = p_family_id
    order by (s.stripe_subscription_id is not distinct from lic.stripe_subscription_id) desc, s.updated_at desc, s.id limit 1;
  return jsonb_build_object('family_id', p_family_id)
    || public._billing_status_json(lic, public._family_plan_state(lic),
      sub, exists (select 1 from public.billing_customers c where c.family_id = p_family_id));
end;
$$;

-- ---------- 6. privileges ----------
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in (
    '_licence_source_default', 'is_family_parent', 'billing_apply_subscription', '_billing_status_json',
    'billing_status_for_school', 'billing_status_for_family') loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in (
    'is_family_parent', 'billing_status_for_school', 'billing_status_for_family') loop
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in (
      'billing_apply_subscription', 'billing_status_for_school', 'billing_status_for_family') loop
      execute format('grant execute on function %s to service_role', f);
    end loop;
  end if;
end $$;
