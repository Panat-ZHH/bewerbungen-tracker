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

-- Same gap via "Familie verlassen": the last active parent could leave a family whose subscription still renews (children
-- stay without anyone who can cancel; an emptied family cascades its billing rows away while Stripe keeps charging).
-- family_leave() is unchanged otherwise (grants are kept by create or replace; not one of the rate-limited RPCs).
create or replace function public.family_leave()
returns void language plpgsql security definer set search_path = '' as $$
declare me public.family_members := public._family_me();
begin
  if me.role = 'parent' and me.status = 'active'
    and exists (select 1 from jsonb_array_elements(public.account_billing_blockers(me.user_id)) b where b ->> 'kind' = 'family') then
    raise exception 'SUBSCRIPTION_ACTIVE' using detail = 'Das Familien-Abo läuft noch und du bist der letzte Elternteil, der es verwalten kann. Kündige es zuerst unter «Abo verwalten» oder lade einen zweiten Elternteil ein.';
  end if;
  update public.family_members x set status = 'removed',
    share_settings = '{"progress":false,"applications":false,"village":false,"documents":false}'::jsonb
  where x.family_id = me.family_id and x.user_id = me.user_id;
  delete from public.family_invites i where i.family_id = me.family_id and i.created_by = me.user_id and i.used_by is null;
  perform public._family_cleanup(me.family_id);
end;
$$;
