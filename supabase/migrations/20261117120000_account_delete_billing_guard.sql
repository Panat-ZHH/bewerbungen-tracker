-- Launch audit (flows): account deletion must not orphan a running Stripe subscription.
-- Before: the last parent of a family (or the last admin of a school) could delete their account while the family / school
-- subscription was still running. Stripe kept charging the card, but nobody could open the billing portal any more
-- (portal requires is_family_parent / is_school_admin), and when the family was emptied its billing rows cascaded away.
-- Now: app/api/account/delete calls account_billing_blockers(uid) first and refuses (409 SUBSCRIPTION_ACTIVE) while the
-- user is the LAST active parent / admin of an owner with a subscription that still renews (not cancelled, not set to
-- cancel at period end). If another parent / admin remains, they can manage the plan, so deletion is allowed.
-- ADDITIVE: one new service-role-only function.

create or replace function public.account_billing_blockers(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('kind', b.kind, 'plan_id', b.plan_id, 'status', b.status) order by b.kind, b.plan_id), '[]'::jsonb)
  from (
    select 'family'::text as kind, s.plan_id, s.status
    from public.billing_subscriptions s
    join public.family_members m on m.family_id = s.family_id and m.user_id = p_user_id and m.role = 'parent' and m.status = 'active'
    where s.status in ('trialing', 'active', 'past_due', 'unpaid', 'incomplete', 'paused') and not s.cancel_at_period_end
      and not exists (select 1 from public.family_members o where o.family_id = s.family_id and o.role = 'parent' and o.status = 'active' and o.user_id <> p_user_id)
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
