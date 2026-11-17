-- Flows re-audit 2 (2026-11-17): applications over the daily coin cap are paid out automatically later.
-- 20261117110000_coin_daily_cap.sql caps map coins at 10 rewarded applications per user per day (anti farming), but an
-- application over the cap was only paid "on its next save on a day with room left". A student who enters a backlog on
-- day one (typical: 20-30 applications that were already sent) kept 100 coins per extra application missing forever
-- unless they edited every single one again – although the guide promises "für jede abgeschickte Bewerbung einmalig
-- 100 Punkte", and "earned" feeds islands, class goals and the friends ranking.
-- Now: whenever a reward is paid (any submitted application saved) and whenever the village is opened
-- (map_claim_application_rewards(), called by lib/storage.ts getMapShop before map_shop_state), still-unpaid submitted
-- applications are paid, oldest first, up to the room left in today's cap. The cap itself is unchanged (10 per day).
-- ADDITIVE: one internal helper, one new RPC, create or replace of the trigger function reward_submitted_application()
-- (trigger unchanged). None of these is wrapped by 20261117020000_rate_limit_rpcs.sql.

-- Pays unpaid submitted applications of p_user (p_first first, then oldest first) up to the room left in today's cap.
-- Returns the number of applications paid. Internal: not callable by clients.
create or replace function public._map_pay_application_rewards(p_user uuid, p_first text default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  daily_cap constant integer := 10;
  day_start timestamptz := date_trunc('day', now() at time zone 'Europe/Zurich') at time zone 'Europe/Zurich';
  room integer;
  paid integer := 0;
  app record;
  rewarded text;
begin
  if p_user is null then return 0; end if;
  -- Serialise rewards per user so parallel saves cannot overshoot the cap (same lock key as 20261117110000).
  perform pg_advisory_xact_lock(hashtextextended('map_reward:' || p_user::text, 0));
  select daily_cap - count(*) into room from public.map_application_rewards r
    where r.user_id = p_user and r.created_at >= day_start;
  if room <= 0 then return 0; end if;
  for app in
    select a.id from public.applications a
    where a.user_id = p_user
      and (a.applied_at is not null or a.status in ('applied', 'aptitude_test', 'interview', 'final_interview', 'offer', 'contract_signed', 'rejected'))
      and not exists (select 1 from public.map_application_rewards r where r.user_id = p_user and r.application_id = a.id)
    order by (a.id = p_first) desc nulls last, a.applied_at nulls last, a.created_at, a.id
    limit room
  loop
    rewarded := null;
    insert into public.map_application_rewards (user_id, application_id) values (p_user, app.id)
      on conflict do nothing returning application_id into rewarded;
    if rewarded is not null then paid := paid + 1; end if;
  end loop;
  if paid > 0 then
    insert into public.map_wallets (user_id, balance, earned) values (p_user, 100 * paid, 100 * paid)
      on conflict (user_id) do update set balance = public.map_wallets.balance + 100 * paid, earned = public.map_wallets.earned + 100 * paid;
  end if;
  return paid;
end;
$$;
revoke all on function public._map_pay_application_rewards(uuid, text) from public, anon, authenticated;

-- Same rules as 20261117110000 (cap 10/day, per-user lock, drafts never pay); additionally pays waiting ones.
create or replace function public.reward_submitted_application()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is null or not (new.applied_at is not null or new.status in ('applied', 'aptitude_test', 'interview', 'final_interview', 'offer', 'contract_signed', 'rejected')) then
    return new;
  end if;
  -- Already rewarded: nothing to do (cheap exit, no lock).
  if exists (select 1 from public.map_application_rewards r where r.user_id = new.user_id and r.application_id = new.id) then
    return new;
  end if;
  perform public._map_pay_application_rewards(new.user_id, new.id);
  return new;
end;
$$;
revoke all on function public.reward_submitted_application() from public, anon, authenticated;

-- Called when the village opens: pays waiting applications of the caller within today's cap. Returns how many were paid.
create or replace function public.map_claim_application_rewards()
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  return public._map_pay_application_rewards(uid, null);
end;
$$;
revoke all on function public.map_claim_application_rewards() from public, anon, authenticated;
grant execute on function public.map_claim_application_rewards() to authenticated;
