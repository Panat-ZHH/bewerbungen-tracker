-- Launch audit (flows): cap map coins from submitted applications (anti coin farming).
-- Before: every application that reached "applied" (or later) paid +100 coins, without limit. Creating fake applications
-- (or deleting and re-creating one, which gets a new id) gave unlimited coins, and "earned" feeds the friends ranking,
-- the family overview and class goals.
-- Now: at most 10 rewarded applications per user per calendar day (Europe/Zurich). Applications over the cap are NOT
-- marked as rewarded, so they still pay out later (on their next save on a day with room left). Real students rarely send
-- more than 10 applications a day; the house on the map is drawn per application and is not affected.
-- ADDITIVE: only replaces the trigger function reward_submitted_application() (trigger unchanged), adds one index.
-- Does not touch any of the rate-limited RPCs.

create index if not exists map_application_rewards_user_created_idx
  on public.map_application_rewards (user_id, created_at);

create or replace function public.reward_submitted_application()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  rewarded text;
  daily_cap constant integer := 10;
  day_start timestamptz := date_trunc('day', now() at time zone 'Europe/Zurich') at time zone 'Europe/Zurich';
  today_count integer;
begin
  if new.user_id is null or not (new.applied_at is not null or new.status in ('applied', 'aptitude_test', 'interview', 'final_interview', 'offer', 'contract_signed', 'rejected')) then
    return new;
  end if;
  -- Already rewarded: nothing to do (cheap exit, no lock).
  if exists (select 1 from public.map_application_rewards r where r.user_id = new.user_id and r.application_id = new.id) then
    return new;
  end if;
  -- Serialise rewards per user so parallel inserts cannot overshoot the cap.
  perform pg_advisory_xact_lock(hashtextextended('map_reward:' || new.user_id::text, 0));
  select count(*) into today_count from public.map_application_rewards r
    where r.user_id = new.user_id and r.created_at >= day_start;
  if today_count >= daily_cap then
    return new;
  end if;
  insert into public.map_application_rewards (user_id, application_id) values (new.user_id, new.id)
    on conflict do nothing returning application_id into rewarded;
  if rewarded is not null then
    insert into public.map_wallets (user_id, balance, earned) values (new.user_id, 100, 100)
      on conflict (user_id) do update set balance = public.map_wallets.balance + 100, earned = public.map_wallets.earned + 100;
  end if;
  return new;
end;
$$;

revoke all on function public.reward_submitted_application() from public, anon, authenticated;
