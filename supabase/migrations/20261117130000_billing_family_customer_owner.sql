-- Payments re-audit 2026-11-17: a family's Stripe customer belongs to the parent who created it.
-- A Stripe customer holds that parent's card, billing address and invoice history. The billing API now only hands a
-- family customer to its creator or to another parent who is still active in the family (lib/billing/server.ts
-- pickFamilyCustomer). A parent who joins later – after the creator left or deleted the account – can no longer open
-- the former parent's portal (invoices, address) or renew a cancelling subscription on the former parent's card.
--
-- Consequence for the guards of 20261117120000: "another active parent can manage the plan" is only true when that
-- parent can still reach the customer. If the departing parent IS the creator of the customer of a renewing family
-- subscription, nobody can manage it after they are gone, so:
--   * account_billing_blockers(uid) also lists that subscription (account deletion + family_leave refuse, 409 / SUBSCRIPTION_ACTIVE);
--   * family_remove_member() refuses to remove such a parent (SUBSCRIPTION_ACTIVE).
-- ADDITIVE: create or replace of two functions (same signatures, grants kept). Neither is wrapped by
-- 20261117020000_rate_limit_rpcs.sql. Test: tests/billing-family-customer.test.mjs.

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
  ) b
$$;
revoke all on function public.account_billing_blockers(uuid) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.account_billing_blockers(uuid) to service_role;
  end if;
end $$;

-- Unchanged except for the new SUBSCRIPTION_ACTIVE check (removing the parent who pays would orphan the subscription).
create or replace function public.family_remove_member(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me public.family_members := public._family_me();
begin
  if me.role <> 'parent' or me.status <> 'active' then raise exception 'FORBIDDEN'; end if;
  if p_user_id is null or p_user_id = me.user_id then raise exception 'INVALID_REQUEST' using detail = 'Um selbst auszutreten, verwende «Familie verlassen».'; end if;
  if exists (select 1 from public.billing_subscriptions s
      join public.billing_customers c on c.stripe_customer_id = s.stripe_customer_id
      join public.family_members t on t.family_id = s.family_id and t.user_id = p_user_id and t.role = 'parent' and t.status = 'active'
      where s.family_id = me.family_id and c.created_by = p_user_id
        and s.status in ('trialing', 'active', 'past_due', 'unpaid', 'incomplete', 'paused') and not s.cancel_at_period_end) then
    raise exception 'SUBSCRIPTION_ACTIVE' using detail = 'Dieser Elternteil bezahlt das Familien-Abo. Es muss zuerst unter «Abo verwalten» gekündigt werden.';
  end if;
  update public.family_members x set status = 'removed',
    share_settings = '{"progress":false,"applications":false,"village":false,"documents":false}'::jsonb
  where x.family_id = me.family_id and x.user_id = p_user_id and x.status <> 'removed';
  if not found then raise exception 'NOT_FOUND'; end if;
end;
$$;
