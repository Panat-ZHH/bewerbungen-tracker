-- Generic persistent rate limiter (shared by all serverless instances: Netlify functions, Supabase edge functions).
-- Fixed windows aligned to the Unix epoch (a 86400 s window resets at 00:00 UTC). One row per (key, window).
-- Only the service role may touch it: the table has RLS without policies and the function is not executable by
-- anon / authenticated. Callers: lib/rate-limit (Next.js server) and supabase/functions/_shared/rate-limit-core.ts.
-- Additive + idempotent.

create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);
create index if not exists rate_limits_window_start_idx on public.rate_limits (window_start);

alter table public.rate_limits enable row level security;
revoke all on table public.rate_limits from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on table public.rate_limits to service_role;
  end if;
end $$;

-- rate_limit_hit(key, limit, window_seconds, cost = 1) → (allowed, retry_after)
--   cost > 0 : adds cost to the current window; allowed = new count <= limit (denied hits are counted too).
--   cost = 0 : peek only; allowed = current count < limit (use for budgets you settle after the work is done).
--   cost < 0 : refund (count never drops below 0); allowed = true.
--   retry_after = seconds until the current window ends when denied, else 0.
create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer, p_cost integer default 1)
returns table (allowed boolean, retry_after integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_epoch bigint := floor(extract(epoch from v_now))::bigint;
  v_cost integer := coalesce(p_cost, 1);
  v_start timestamptz;
  v_count integer;
  v_allowed boolean;
  v_retry integer;
begin
  if p_key is null or length(p_key) = 0 or length(p_key) > 200 then
    raise exception 'rate_limit_hit: invalid key' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 0 or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 2678400 then
    raise exception 'rate_limit_hit: invalid limit or window' using errcode = '22023';
  end if;

  v_start := to_timestamp(v_epoch - (v_epoch % p_window_seconds));

  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, v_start, greatest(v_cost, 0))
  on conflict (key, window_start) do update
    set count = least(greatest(r.count::bigint + v_cost, 0), 2147483647)::integer
  returning r.count into v_count;

  v_allowed := case
    when v_cost > 0 then v_count <= p_limit
    when v_cost = 0 then v_count < p_limit
    else true
  end;
  v_retry := case when v_allowed then 0
    else greatest(1, ceil(extract(epoch from (v_start + make_interval(secs => p_window_seconds)) - v_now))::integer)
  end;

  -- Housekeeping (~1 % of calls): windows are at most 31 days long, so rows older than 35 days are dead.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < v_now - interval '35 days';
  end if;

  return query select v_allowed, v_retry;
end;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer, integer) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.rate_limit_hit(text, integer, integer, integer) to service_role;
  end if;
end $$;
