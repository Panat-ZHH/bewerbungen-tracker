-- Rate limits for the RPCs the browser calls directly through PostgREST (branch audit-rate, 2026-11-17).
-- Builds on public.rate_limit_hit (migration 20261117010000_rate_limits.sql, owned by branch audit-ai).
--
-- Most important: brute force of the short codes (class join codes, family invite codes, friend codes; 8 chars from a
-- 32-letter alphabet). Every lookup/redeem RPC counts per user AND per client IP, in one shared budget ("code"), so an
-- attacker cannot multiply the budget by switching between class_preview / class_join / family_join / friend lookup.
--
-- How it works (ADDITIVE, nothing dropped):
--  * The original function is RENAMED to public._rl_impl_<name> (no grants: not callable from the API) and a wrapper with
--    the identical name, arguments and return type takes its place. The wrapper calls public._rl_enforce(...) first,
--    then the original. So the original logic stays byte-for-byte as it was.
--  * Over the limit: PostgREST answers HTTP 429 + Retry-After with the JSON body
--    { code: "rate_limited", message: "RATE_LIMITED", details: "<friendly German text>", hint: "<seconds>" }.
--  * A failed guess must be COUNTED, but a raised error rolls the whole transaction back (incl. the counter). So when the
--    call comes through the API (PostgREST sets the GUC request.method), "code not found" does not raise:
--      - table-returning RPCs return NO ROW (the app treats an empty answer as CLASS_NOT_FOUND / USER_NOT_FOUND),
--      - family_join (jsonb) returns the same error object PostgREST would send ({code,message,details,hint}) with
--        response.status 400/403, so the app sees exactly the error it saw before.
--    Outside the API (SQL tests, service scripts) the original errors are raised unchanged.
--  * Limits are configurable without a deploy: public.rate_limit_settings (service role only):
--      insert into public.rate_limit_settings (scope, user_limit, ip_limit, window_seconds) values ('code', 50, 500, 3600)
--        on conflict (scope) do update set user_limit = excluded.user_limit, ip_limit = excluded.ip_limit, window_seconds = excluded.window_seconds;
--      update public.rate_limit_settings set enabled = false where scope = 'code';     -- one scope off
--      insert into public.rate_limit_settings (scope, enabled) values ('*', false);       -- ALL RPC limits off (emergency)
-- MERGE NOTE: a later migration that does "create or replace function public.<name>" for one of the wrapped functions
-- replaces the wrapper (the limit is gone, the app keeps working). Re-apply the wrapper pattern below in that case.

-- ---------------------------------------------------------------- settings
create table if not exists public.rate_limit_settings (
  scope text primary key check (scope ~ '^([a-z0-9-]{1,40}|\*)$'),
  enabled boolean not null default true,
  user_limit integer check (user_limit >= 0),
  ip_limit integer check (ip_limit >= 0),
  window_seconds integer check (window_seconds between 1 and 2678400),
  note text,
  updated_at timestamptz not null default now()
);
alter table public.rate_limit_settings enable row level security;
revoke all on table public.rate_limit_settings from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on table public.rate_limit_settings to service_role;
  end if;
end $$;

-- ---------------------------------------------------------------- helpers (internal, not callable from the API)
-- Client IP from the PostgREST request headers (Supabase: Cloudflare sets cf-connecting-ip). IPv6 → its /64.
create or replace function public._rl_client_ip()
returns text language plpgsql stable set search_path = '' as $$
declare h json; v text; g text[];
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then return null;
  end;
  if h is null then return null; end if;
  foreach v in array array[h ->> 'cf-connecting-ip', h ->> 'x-real-ip', split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1)] loop
    v := btrim(coalesce(v, ''));
    if v <> '' and length(v) <= 64 and v ~ '^[0-9a-fA-F:.]+$' then
      if position(':' in v) > 0 then
        g := array_remove(string_to_array(split_part(v, '::', 1), ':'), '');
        v := case when coalesce(array_length(g, 1), 0) >= 4 then array_to_string(g[1:4], ':') || '::/64' else lower(v) end;
      end if;
      return v;
    end if;
  end loop;
  return null;
end;
$$;

-- true when the call comes through PostgREST (the Data API), false in SQL tests / psql / service scripts.
create or replace function public._rl_via_api()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(current_setting('request.method', true), '') <> ''
$$;

-- Raises the PostgREST "custom response" error: HTTP 429 + Retry-After, friendly German text in details.
create or replace function public._rl_deny(p_retry_after integer)
returns void language plpgsql set search_path = '' as $$
declare secs integer := greatest(1, coalesce(p_retry_after, 60)); wait text;
begin
  wait := case when secs <= 60 then 'eine Minute'
               when secs < 5400 then ceil(secs / 60.0)::integer || ' Minuten'
               when secs < 43200 then round(secs / 3600.0)::integer || ' Stunden'
               else 'bis morgen' end;
  raise sqlstate 'PGRST' using
    message = json_build_object('code', 'rate_limited', 'message', 'RATE_LIMITED',
      'details', 'Du hast das gerade sehr oft versucht. Bitte warte ' || wait || ' und versuche es dann nochmals.',
      'hint', secs::text)::text,
    detail = json_build_object('status', 429, 'headers', json_build_object('Retry-After', secs::text))::text;
end;
$$;

-- Counts one call of p_scope for the caller (auth.uid()) and the client IP; raises 429 when one of them is over.
-- NULL limit = that dimension is not limited. rate_limit_settings can override or disable a scope.
create or replace function public._rl_enforce(p_scope text, p_user_limit integer, p_ip_limit integer, p_window_seconds integer)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := auth.uid(); ip text; s record; r record;
  ul integer := p_user_limit; il integer := p_ip_limit; w integer := p_window_seconds;
begin
  if exists (select 1 from public.rate_limit_settings x where x.scope = '*' and not x.enabled) then return; end if;
  select * into s from public.rate_limit_settings x where x.scope = p_scope;
  if found then
    if not s.enabled then return; end if;
    ul := coalesce(s.user_limit, ul); il := coalesce(s.ip_limit, il); w := coalesce(s.window_seconds, w);
  end if;
  ip := public._rl_client_ip();
  if ip is not null and il is not null then
    select * into r from public.rate_limit_hit(p_scope || ':ip:' || md5('wendapply-rl|' || ip), il, w);
    if not r.allowed then perform public._rl_deny(r.retry_after); end if;
  end if;
  if uid is not null and ul is not null then
    select * into r from public.rate_limit_hit(p_scope || ':user:' || uid::text, ul, w);
    if not r.allowed then perform public._rl_deny(r.retry_after); end if;
  end if;
end;
$$;

-- Shared budget for every short-code lookup / redeem: 30 per hour and 100 per day per user; per IP 300/h and 1000/day
-- (a whole school class joins from one IP: ~25 pupils × ~4 calls). 40-bit codes → guessing stays hopeless.
create or replace function public._rl_code()
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public._rl_enforce('code', 30, 300, 3600);
  perform public._rl_enforce('code-day', 100, 1000, 86400);
end;
$$;

-- Rename once (idempotent): public.<name>(args) → public._rl_impl_<name>(args).
create or replace function public._rl_rename_impl(p_name text, p_args text)
returns void language plpgsql set search_path = '' as $$
begin
  if to_regprocedure(format('public._rl_impl_%s(%s)', p_name, p_args)) is null
     and to_regprocedure(format('public.%s(%s)', p_name, p_args)) is not null then
    execute format('alter function public.%I(%s) rename to %I', p_name, p_args, '_rl_impl_' || p_name);
  end if;
  execute format('revoke all on function public.%I(%s) from public, anon, authenticated', '_rl_impl_' || p_name, p_args);
end;
$$;

select public._rl_rename_impl(n, a) from (values
  ('class_join', 'text'), ('class_preview', 'text'), ('class_invite_preview', 'text'), ('class_invite_accept', 'text'),
  ('invite_context', 'text'), ('family_join', 'text'), ('family_create_invite', 'text'), ('social_find_by_code', 'text'),
  ('social_send_request', 'text'), ('school_attach_class', 'uuid, text'), ('export_my_data', ''),
  ('teacher_class_applications_export', 'uuid'), ('class_invite_create', 'uuid, text, integer, integer'),
  ('class_invite_create_many', 'uuid, text[], integer')
) as t(n, a);

-- ---------------------------------------------------------------- short codes (brute force)
create or replace function public.class_join(p_code text)
returns table (class_id uuid, name text, school_year text, teacher_name text, share_applications boolean, joined_at timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public._rl_code();
  begin
    return query select * from public._rl_impl_class_join(p_code);
  exception when raise_exception then
    if sqlerrm = 'CLASS_NOT_FOUND' and public._rl_via_api() then return; end if; -- empty = not found (counter commits)
    raise;
  end;
end;
$$;

create or replace function public.class_preview(p_code text)
returns table (class_id uuid, name text, school_year text, teacher_name text, member_count integer, already_member boolean)
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public._rl_code();
  begin
    return query select * from public._rl_impl_class_preview(p_code);
  exception when raise_exception then
    if sqlerrm = 'CLASS_NOT_FOUND' and public._rl_via_api() then return; end if;
    raise;
  end;
end;
$$;

-- School admins attach a class by its join code: same code budget.
create or replace function public.school_attach_class(p_school_id uuid, p_join_code text)
returns table (class_id uuid, name text, students integer)
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public._rl_code();
  begin
    return query select * from public._rl_impl_school_attach_class(p_school_id, p_join_code);
  exception when raise_exception then
    if sqlerrm = 'CLASS_NOT_FOUND' and public._rl_via_api() then return; end if;
    raise;
  end;
end;
$$;

-- Onboarding context of a class code or invite link. Callable by anon too (limited per IP). Was STABLE: PostgREST runs
-- non-volatile functions read-only, the counter needs a write, so the wrapper is VOLATILE.
create or replace function public.invite_context(p_code text)
returns table (teacher_name text, class_name text)
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public._rl_code();
  return query select * from public._rl_impl_invite_context(p_code);
end;
$$;

create or replace function public.social_find_by_code(p_code text)
returns table (display_name text, avatar_seed text, role text, invite_code text, relation text)
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public._rl_code();
  return query select * from public._rl_impl_social_find_by_code(p_code);
end;
$$;

-- Friend request by code or e-mail (account enumeration by e-mail): own budget 20/h, 60/day per user.
create or replace function public.social_send_request(p_code_or_email text)
returns table (id uuid, status text)
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public._rl_enforce('friend-request', 20, 200, 3600);
  perform public._rl_enforce('friend-request-day', 60, 600, 86400);
  begin
    return query select * from public._rl_impl_social_send_request(p_code_or_email);
  exception when raise_exception then
    if sqlerrm = 'USER_NOT_FOUND' and public._rl_via_api() then return; end if; -- empty = not found (counter commits)
    raise;
  end;
end;
$$;

create or replace function public.family_join(p_code text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare st text; msg text; det text; hnt text;
begin
  perform public._rl_code();
  begin
    return public._rl_impl_family_join(p_code);
  exception when others then
    if not public._rl_via_api() then raise; end if;
    -- Same error PostgREST would have sent, but the transaction (and the attempt counter) commits.
    get stacked diagnostics st = returned_sqlstate, msg = message_text, det = pg_exception_detail, hnt = pg_exception_hint;
    perform set_config('response.status', case when st = '42501' then '403' else '400' end, true);
    return jsonb_build_object('code', st, 'message', msg, 'details', nullif(det, ''), 'hint', nullif(hnt, ''));
  end;
end;
$$;

-- ---------------------------------------------------------------- invite links (long random tokens; flood protection)
create or replace function public.class_invite_preview(p_token text)
returns table (class_id uuid, name text, school_year text, teacher_name text, member_count integer, already_member boolean, valid boolean, reason text)
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public._rl_enforce('invite-token', 60, 300, 3600);
  return query select * from public._rl_impl_class_invite_preview(p_token);
end;
$$;

create or replace function public.class_invite_accept(p_token text)
returns table (class_id uuid, name text, school_year text, teacher_name text, share_applications boolean, joined_at timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public._rl_enforce('invite-token', 60, 300, 3600);
  return query select * from public._rl_impl_class_invite_accept(p_token);
end;
$$;

-- ---------------------------------------------------------------- creating invites / codes
create or replace function public.family_create_invite(p_direction text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public._rl_enforce('invite-create', 30, 300, 3600);
  return public._rl_impl_family_create_invite(p_direction);
end;
$$;

create or replace function public.class_invite_create(p_class_id uuid, p_email text default null, p_max_uses integer default null, p_expires_in_days integer default 14)
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public._rl_enforce('invite-create', 30, 300, 3600);
  return query select * from public._rl_impl_class_invite_create(p_class_id, p_email, p_max_uses, p_expires_in_days);
end;
$$;

create or replace function public.class_invite_create_many(p_class_id uuid, p_emails text[], p_expires_in_days integer default 14)
returns table (email text, token text)
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public._rl_enforce('invite-create', 30, 300, 3600);
  return query select * from public._rl_impl_class_invite_create_many(p_class_id, p_emails, p_expires_in_days);
end;
$$;

-- ---------------------------------------------------------------- expensive exports
create or replace function public.export_my_data()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public._rl_enforce('export', 10, 60, 3600);
  return public._rl_impl_export_my_data();
end;
$$;

create or replace function public.teacher_class_applications_export(p_class_id uuid)
returns table (student_id uuid, display_name text, company text, "position" text, status text, applied_at date, deadline date, created_at date)
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public._rl_enforce('export', 30, 120, 3600);
  return query select * from public._rl_impl_teacher_class_applications_export(p_class_id);
end;
$$;

-- ---------------------------------------------------------------- contact / waitlist form (anon)
-- waitlist_join keeps its own global brake (300/h). Per IP / user on top: 5 per hour. Not wrapped by rename because the
-- per-IP check must run before its validation; it is short, so it is redefined here 1:1 plus the limit line.
create or replace function public.waitlist_join(p_email text, p_kind text, p_message text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare mail text := lower(btrim(coalesce(p_email, ''))); msg text := nullif(btrim(coalesce(p_message, '')), '');
begin
  perform public._rl_enforce('contact', 5, 10, 3600);
  if length(mail) not between 3 and 254 or mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_EMAIL' using detail = 'Bitte gib eine gültige E-Mail-Adresse an.';
  end if;
  if p_kind is null or p_kind not in ('family', 'parent', 'student', 'school', 'other') then raise exception 'INVALID_REQUEST'; end if;
  if msg is not null and length(msg) > 1000 then raise exception 'INVALID_REQUEST' using detail = 'Die Nachricht darf höchstens 1000 Zeichen haben.'; end if;
  -- Crude global brake against scripted floods (the API gateway rate limit is the real protection).
  if (select count(*) from public.waitlist_requests w where w.created_at > now() - interval '1 hour') >= 300 then
    raise exception 'RATE_LIMITED' using detail = 'Gerade kommen sehr viele Anfragen. Bitte versuche es später nochmals.';
  end if;
  insert into public.waitlist_requests (email, kind, message, user_id) values (mail, p_kind, msg, auth.uid())
  on conflict (lower(email), kind) do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- code generator: full 5 bits per character
-- _soc_code took the bytes 0..7 of a v4 UUID; byte 6 holds the UUID version (4 fixed bits), so character 7 only had
-- 16 possible values (39 instead of 40 bits). Same alphabet and length (family_invites checks ^[A-Z0-9]{8}$).
create or replace function public._soc_code()
returns text language plpgsql volatile security definer set search_path = '' as $$
declare alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; result text := ''; bytes bytea := uuid_send(gen_random_uuid()); i integer;
begin
  foreach i in array array[0, 1, 2, 3, 4, 5, 7, 9] loop result := result || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1); end loop;
  return result;
end;
$$;

-- ---------------------------------------------------------------- grants
do $$
declare f text;
begin
  foreach f in array array[
    'public._rl_client_ip()', 'public._rl_via_api()', 'public._rl_deny(integer)', 'public._rl_enforce(text, integer, integer, integer)',
    'public._rl_code()', 'public._rl_rename_impl(text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'public.class_join(text)', 'public.class_preview(text)', 'public.class_invite_preview(text)', 'public.class_invite_accept(text)',
    'public.invite_context(text)', 'public.family_join(text)', 'public.family_create_invite(text)', 'public.social_find_by_code(text)',
    'public.social_send_request(text)', 'public.school_attach_class(uuid, text)', 'public.export_my_data()',
    'public.teacher_class_applications_export(uuid)', 'public.class_invite_create(uuid, text, integer, integer)',
    'public.class_invite_create_many(uuid, text[], integer)', 'public.waitlist_join(text, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  execute 'grant execute on function public.invite_context(text) to anon';
  execute 'grant execute on function public.waitlist_join(text, text, text) to anon';
end $$;
