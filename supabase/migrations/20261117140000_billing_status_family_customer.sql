-- Payments re-audit 2 (2026-11-17): billing_status_for_family().has_customer follows the same rule as the billing API.
-- Since 20261117130000 / lib/billing/server.ts pickFamilyCustomer, a family's Stripe customer is only handed to its creator
-- or to another parent who is still active in the family. has_customer still said true for ANY customer row of the family,
-- so a later parent saw "Abo verwalten" and got 404 "no_customer". Now, for a user (auth.uid() set), has_customer is true
-- only for a customer the caller may use; the service role (auth.uid() null) still sees any customer row.
-- ADDITIVE + idempotent: create or replace with the same signature (grants are kept, re-stated below). Not wrapped by
-- 20261117020000_rate_limit_rpcs.sql. Test: tests/billing-reaudit2-db.test.mjs.

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
      sub, exists (select 1 from public.billing_customers c where c.family_id = p_family_id
        and (uid is null or c.created_by = uid or exists (select 1 from public.family_members m
          where m.family_id = p_family_id and m.user_id = c.created_by and m.role = 'parent' and m.status = 'active'))));
end;
$$;

revoke all on function public.billing_status_for_family(uuid) from public, anon;
grant execute on function public.billing_status_for_family(uuid) to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.billing_status_for_family(uuid) to service_role;
  end if;
end $$;
