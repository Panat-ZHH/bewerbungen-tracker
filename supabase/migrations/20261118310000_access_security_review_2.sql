-- Independent security review #2 of the access model (branch acc-sec2, 2026-11-17). Report: _access/REPORT-security-2.md.
-- Run AFTER 20261118300000_access_security_review.sql. ADDITIVE ONLY and idempotent (create or replace / insert … on conflict
-- do nothing). Tests: tests/access-security-review-2-db.test.mjs.
--
-- R1 (LOW, regression of S4)  20261118300000 changed public._access_email_hash (e-mail normalisation), but the trial ledger rows
--            of every EXISTING user were written earlier with the old hash (backfill + signup trigger of 20261118010000, which
--            run before 20261118300000 even when all four files are applied together). For an existing user whose address
--            changes under the normalisation (Gmail with dots, any "+tag", googlemail.com) the old row no longer matches: after
--            deleting the account, a re-signup with the SAME address got a fresh 7-day trial (SPEC §1: it must not).
--            Fix: (a) every existing user also gets a ledger row under the new hash (first trial end kept), (b) _access_ensure
--            also looks at the legacy hash, so ledger rows of accounts already deleted keep counting.
-- R2 (LOW)   _access_after_signup did the trial row and the profile insert in ONE exception block: if the profile insert ever
--            failed, the trial row AND its ledger row were rolled back with it (no ledger row = a later delete + re-signup gets
--            a new trial). Now two blocks; neither can ever block a signup.

-- ---------------------------------------------------------------- R1: legacy hash (= 20261118010000 _access_email_hash)
create or replace function public._access_email_hash_legacy(p_email text)
returns text language sql immutable set search_path = '' as $$
  select case when nullif(btrim(coalesce(p_email, '')), '') is null then null
    else encode(sha256(convert_to(lower(btrim(p_email)), 'UTF8')), 'hex') end;
$$;
revoke all on function public._access_email_hash_legacy(text) from public, anon, authenticated;

-- Same contract as 20261118010000; the inherited first trial end is the earliest of the new-hash and the legacy-hash row.
create or replace function public._access_ensure(p_uid uuid, p_email text, p_start timestamptz, p_min_end timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_hash text := public._access_email_hash(p_email);
  v_legacy text := public._access_email_hash_legacy(p_email);
  v_end timestamptz; v_first timestamptz; v_old timestamptz;
begin
  if p_uid is null or exists (select 1 from public.account_access a where a.user_id = p_uid) then return; end if;
  v_end := greatest(coalesce(p_start, now()) + interval '7 days', coalesce(p_min_end, '-infinity'::timestamptz));
  if v_hash is not null then
    select l.first_trial_ends_at into v_old from public.trial_ledger l where l.email_hash = v_legacy and v_legacy <> v_hash;
    insert into public.trial_ledger (email_hash, first_trial_ends_at) values (v_hash, least(v_end, coalesce(v_old, v_end)))
      on conflict (email_hash) do nothing;
    select l.first_trial_ends_at into v_first from public.trial_ledger l where l.email_hash = v_hash;
    v_end := least(v_end, coalesce(v_first, v_end), coalesce(v_old, v_end));
  end if;
  insert into public.account_access (user_id, trial_started_at, trial_ends_at)
  values (p_uid, coalesce(p_start, now()), v_end) on conflict (user_id) do nothing;
end;
$$;
revoke all on function public._access_ensure(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;

-- Existing users: a ledger row under the new hash too (first trial end = their legacy ledger row, else their trial end).
insert into public.trial_ledger (email_hash, first_trial_ends_at)
select x.h, x.first_end from (
  select distinct on (public._access_email_hash(u.email)) public._access_email_hash(u.email) as h,
    coalesce(l.first_trial_ends_at, a.trial_ends_at, (to_jsonb(u) ->> 'created_at')::timestamptz + interval '7 days', now() + interval '7 days') as first_end
  from auth.users u
  left join public.trial_ledger l on l.email_hash = public._access_email_hash_legacy(u.email)
  left join public.account_access a on a.user_id = u.id
  where public._access_email_hash(u.email) is not null
  order by public._access_email_hash(u.email), 2
) x
on conflict (email_hash) do nothing;

-- ---------------------------------------------------------------- R2: signup hook in two independent blocks
create or replace function public._access_after_signup()
returns trigger language plpgsql security definer set search_path = '' as $$
declare meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb); v_type text; v_year integer; v_start timestamptz;
begin
  begin
    v_start := coalesce((to_jsonb(new) ->> 'email_confirmed_at')::timestamptz, (to_jsonb(new) ->> 'created_at')::timestamptz, now());
    perform public._access_ensure(new.id, new.email, v_start);
  exception when others then
    -- Never block a signup because of the access row: app_access treats a missing row as "trial from signup".
    raise warning 'access signup hook (trial) failed for %: %', new.id, sqlerrm;
  end;
  begin
    v_type := meta ->> 'account_type';
    if v_type in ('parent', 'independent_student') and coalesce(meta ->> 'role', 'student') <> 'teacher' then
      if v_type = 'independent_student' and coalesce(meta ->> 'birth_year', '') ~ '^[0-9]{4}$' then
        v_year := (meta ->> 'birth_year')::integer;
        if v_year not between extract(year from current_date)::integer - 100 and extract(year from current_date)::integer then v_year := null; end if;
      end if;
      insert into public.profiles (id, user_id, first_name, last_name, email, account_type, birth_year)
      values ('profile-' || new.id::text, new.id, '', '', coalesce(new.email, ''), v_type, v_year)
      on conflict do nothing;
    end if;
  exception when others then
    raise warning 'access signup hook (profile) failed for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function public._access_after_signup() from public, anon, authenticated;
