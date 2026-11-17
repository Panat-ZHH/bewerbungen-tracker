-- Re-audit 1 (auth + limits), 2026-11-17. ADDITIVE, idempotent. Builds on 20261117020000_rate_limit_rpcs.sql.
--
-- 1. class_invite_create_many_v2 (the bulk-invite RPC the app actually calls, lib/teacher-more.ts) was not wrapped:
--    only the unused v1 class_invite_create_many was limited, so a teacher account could create invitation rows
--    without any limit (200 per call). Same wrapper pattern as 20261117020000: the original is renamed to
--    public._rl_impl_class_invite_create_many_v2 (no API grants), a wrapper with the identical name, arguments, defaults,
--    return type and grants takes its place and counts the shared "invite-create" budget first.
-- 2. _rl_client_ip(): IPv6 addresses written with "::" inside the first four groups (e.g. 2001:db8:1::5, i.e. subnet 0
--    of a /48 – very common) were not bucketed to their /64, so one /64 gave an attacker 2^64 separate IP budgets.
--    Now the address is parsed as inet and reduced to its /64 (IPv4 stays the exact address). It is a helper, not one
--    of the wrapped API functions, so replacing it is safe.

select public._rl_rename_impl('class_invite_create_many_v2', 'uuid, text[], integer');

create or replace function public.class_invite_create_many_v2(p_class_id uuid, p_emails text[], p_expires_in_days integer default 14)
returns table (email text, outcome text, token text)
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public._rl_enforce('invite-create', 30, 300, 3600);
  return query select * from public._rl_impl_class_invite_create_many_v2(p_class_id, p_emails, p_expires_in_days);
end;
$$;

revoke all on function public.class_invite_create_many_v2(uuid, text[], integer) from public, anon, authenticated;
grant execute on function public.class_invite_create_many_v2(uuid, text[], integer) to authenticated;

create or replace function public._rl_client_ip()
returns text language plpgsql stable set search_path = '' as $$
declare h json; v text; a inet;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then return null;
  end;
  if h is null then return null; end if;
  -- Supabase sits behind Cloudflare: cf-connecting-ip is set by Cloudflare and cannot be forged by the client.
  foreach v in array array[h ->> 'cf-connecting-ip', h ->> 'x-real-ip', split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1)] loop
    v := btrim(coalesce(v, ''));
    if v <> '' and length(v) <= 64 and v ~ '^[0-9a-fA-F:.]+$' then
      begin
        a := v::inet;
      exception when others then
        continue;
      end;
      if family(a) = 6 then return network(set_masklen(a, 64))::text; end if;
      return host(a);
    end if;
  end loop;
  return null;
end;
$$;
revoke all on function public._rl_client_ip() from public, anon, authenticated;
