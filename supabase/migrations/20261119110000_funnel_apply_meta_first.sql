-- Fix loop 1 (QA-ONB M1 + L1), additive: create or replace of two functions from 20261119100000_onboarding_funnel.sql.
-- Everything else (grants, revokes, validation, rate limit, advisory lock, role rules) is copied unchanged.
--
-- M1 (shared computer): funnel_apply used `coalesce(p_answers, wa_funnel metadata)`, so a browser copy left behind by
-- another person won over the account's own sign-up copy. Now the account's own server copy (auth metadata wa_funnel,
-- written at sign-up) always wins; p_answers is only used when the account has no copy (Google sign-up). A JSON null
-- (metadata cleared by the client after a save) counts as "no copy". The client (lib/funnel/apply.ts) additionally sends
-- p_answers = null whenever the metadata exists and drops a local copy that is older than the account.
--
-- L1 (invisible-looking names): _funnel_clean also strips the Hangul fillers U+115F, U+1160, U+3164, U+FFA0 (they count
-- as letters, so «ㅤ» passed the [[:alpha:]] check) and the tag characters U+E0000–U+E007F. After the strip every letter
-- left is a visible one, so the existing [[:alpha:]] rule in funnel_apply = «at least one visible letter».
-- Mirror: lib/funnel/validate.ts INVISIBLE (parity test tests/onb-data-funnel-db.test.mjs).

-- ---------------------------------------------------------------- _funnel_clean (L1)
create or replace function public._funnel_clean(p_value text)
returns text language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(
    regexp_replace(p_value, '[\u0001-\u001F\u007F؜᠎​‎‏‪-‮⁠-⁤⁦-⁩﻿￹-￻ᅟᅠㅤﾠ\U000E0000-\U000E007F]', '', 'g'),
    '\s+', ' ', 'g'));
$$;
revoke all on function public._funnel_clean(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- funnel_apply (M1: server copy wins)
-- Saves the funnel answers of the signed-in user ONCE. The copy stored at sign-up (auth metadata wa_funnel) wins; p_answers
-- (browser copy) only counts when the account has none (Google sign-up). Validates everything (mirror: lib/funnel/validate.ts).
-- Never changes an established role; never grants school_admin / admin; teacher access stays behind the licence gate.
-- Errors: NOT_AUTHENTICATED, RATE_LIMITED (via _rl_enforce), INVALID_FUNNEL (detail = field name only, never the value).
create or replace function public.funnel_apply(p_answers jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  y integer := extract(year from current_date)::integer;
  u record; a jsonb; k text; e jsonb;
  v_role text; v_skip boolean; v_first text; v_year integer; v_level text; v_canton text; v_place text;
  v_profs text[] := '{}'; v_unsure boolean := false; v_start integer; v_goal integer; v_help text[] := '{}';
  cur_role text; in_class boolean; mismatch boolean := false;
  levels constant text[] := array['7. Klasse', '8. Klasse', '9. Klasse – Sek A / Bezirk', '9. Klasse – Sek B / Real',
    '9. Klasse – Sek C / Werkklasse', '9. Klasse – Gymnasium', '10. Schuljahr / Brückenangebot',
    'Schon in einer Lehre / Ausbildung', 'Etwas anderes'];
  cantons constant text[] := array['AG','AI','AR','BE','BL','BS','FR','GE','GL','GR','JU','LU','NE','NW','OW','SG','SH','SO',
    'SZ','TG','TI','UR','VD','VS','ZG','ZH'];
  help_student constant text[] := array['lebenslauf', 'brief', 'schnuppern', 'ueberblick', 'eltern'];
  help_parent constant text[] := array['ueberblick', 'fristen', 'dokumente', 'ermutigen'];
  keys constant text[] := array['v','role','skipped','firstName','birthYear','schoolLevel','canton','place','professions','unsure',
    'startYear','weeklyGoal','help'];
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform public._rl_enforce('funnel', 10, 300, 3600);
  perform public._soc_ensure(uid);
  select x.email, (to_jsonb(x) ->> 'created_at')::timestamptz as created_at, x.raw_user_meta_data as meta
    into u from auth.users x where x.id = uid;
  -- one save at a time per user (double click, two tabs): the second call waits and then sees already_done
  perform pg_advisory_xact_lock(hashtextextended('funnel_apply:' || uid::text, 0));

  -- apply once, only to new accounts
  if exists (select 1 from public.profiles p where p.user_id = uid
             and (p.funnel_completed_at is not null or p.onboarding_completed_at is not null)) then
    return jsonb_build_object('applied', false, 'reason', 'already_done', 'role', public._funnel_role_of(uid));
  end if;
  if u.created_at is null or u.created_at < now() - interval '14 days' then
    return jsonb_build_object('applied', false, 'reason', 'not_new', 'role', public._funnel_role_of(uid));
  end if;
  -- M1: the account's own copy (written at sign-up) beats whatever the browser sends; JSON null = no copy
  a := coalesce(nullif(u.meta -> 'wa_funnel', 'null'::jsonb), p_answers);
  if a is null or a = 'null'::jsonb then
    return jsonb_build_object('applied', false, 'reason', 'no_answers', 'role', public._funnel_role_of(uid));
  end if;

  -- shape
  if jsonb_typeof(a) <> 'object' then raise exception 'INVALID_FUNNEL' using detail = 'size'; end if;
  if octet_length(a::text) > 4096 then raise exception 'INVALID_FUNNEL' using detail = 'size'; end if;
  for k in select jsonb_object_keys(a) loop
    if not (k = any (keys)) then raise exception 'INVALID_FUNNEL' using detail = 'key'; end if;
  end loop;
  if a -> 'v' is distinct from '1'::jsonb then raise exception 'INVALID_FUNNEL' using detail = 'v'; end if;
  v_role := case when jsonb_typeof(a -> 'role') = 'string' then a ->> 'role' end;
  if v_role is null or v_role not in ('student', 'parent', 'staff') then raise exception 'INVALID_FUNNEL' using detail = 'role'; end if;
  if a ? 'skipped' and jsonb_typeof(a -> 'skipped') not in ('boolean', 'null') then raise exception 'INVALID_FUNNEL' using detail = 'key'; end if;
  v_skip := coalesce(a -> 'skipped' = 'true'::jsonb, false);

  if not v_skip then
    -- first name (all roles)
    if jsonb_typeof(a -> 'firstName') is distinct from 'string' then raise exception 'INVALID_FUNNEL' using detail = 'firstName'; end if;
    -- C1 controls (U+0080–009F) are refused on the raw value (some of them count as whitespace for \s)
    if (a ->> 'firstName') ~ '[\u0080-\u009F]' then raise exception 'INVALID_FUNNEL' using detail = 'firstName'; end if;
    v_first := public._funnel_clean(a ->> 'firstName');
    if char_length(v_first) not between 1 and 40 or v_first ~ '[[:cntrl:]]' or v_first !~ '[[:alpha:]]' then
      raise exception 'INVALID_FUNNEL' using detail = 'firstName';
    end if;

    if v_role = 'student' then
      if jsonb_typeof(a -> 'birthYear') is distinct from 'number' or (a ->> 'birthYear') !~ '^[0-9]{4}$' then
        raise exception 'INVALID_FUNNEL' using detail = 'birthYear'; end if;
      v_year := (a ->> 'birthYear')::integer;
      if v_year not between y - 100 and y - 8 then raise exception 'INVALID_FUNNEL' using detail = 'birthYear'; end if;

      v_level := case when jsonb_typeof(a -> 'schoolLevel') = 'string' then a ->> 'schoolLevel' end;
      if v_level is null or not (v_level = any (levels)) then raise exception 'INVALID_FUNNEL' using detail = 'schoolLevel'; end if;

      v_canton := case when jsonb_typeof(a -> 'canton') = 'string' then a ->> 'canton' end;
      if v_canton is null or not (v_canton = any (cantons)) then raise exception 'INVALID_FUNNEL' using detail = 'canton'; end if;

      if jsonb_typeof(a -> 'place') = 'string' then
        if (a ->> 'place') ~ '[\u0080-\u009F]' then raise exception 'INVALID_FUNNEL' using detail = 'place'; end if;
        v_place := nullif(public._funnel_clean(a ->> 'place'), '');
        if char_length(coalesce(v_place, '')) > 60 or v_place ~ '[[:cntrl:]]' then raise exception 'INVALID_FUNNEL' using detail = 'place'; end if;
      elsif a ? 'place' and a -> 'place' <> 'null'::jsonb then raise exception 'INVALID_FUNNEL' using detail = 'place';
      end if;

      if a ? 'unsure' and jsonb_typeof(a -> 'unsure') not in ('boolean', 'null') then raise exception 'INVALID_FUNNEL' using detail = 'unsure'; end if;
      v_unsure := coalesce(a -> 'unsure' = 'true'::jsonb, false);
      if a ? 'professions' and a -> 'professions' <> 'null'::jsonb then
        if jsonb_typeof(a -> 'professions') <> 'array' or jsonb_array_length(a -> 'professions') > 3 then
          raise exception 'INVALID_FUNNEL' using detail = 'professions'; end if;
        for e in select * from jsonb_array_elements(a -> 'professions') loop
          if jsonb_typeof(e) <> 'string' or char_length(public._funnel_clean(e #>> '{}')) not between 1 and 60
            or (e #>> '{}') ~ '[\u0080-\u009F]' or public._funnel_clean(e #>> '{}') ~ '[[:cntrl:]]' then
            raise exception 'INVALID_FUNNEL' using detail = 'professions'; end if;
        end loop;
        select coalesce(array_agg(s.x order by s.i), '{}') into v_profs from (
          select distinct on (lower(public._funnel_clean(t.v))) public._funnel_clean(t.v) as x, t.i
          from jsonb_array_elements_text(a -> 'professions') with ordinality t(v, i)
          order by lower(public._funnel_clean(t.v)), t.i) s;
      end if;
      if v_unsure and cardinality(v_profs) > 0 then raise exception 'INVALID_FUNNEL' using detail = 'professions'; end if;

      if a ? 'startYear' and a -> 'startYear' <> 'null'::jsonb then
        if jsonb_typeof(a -> 'startYear') <> 'number' or (a ->> 'startYear') !~ '^[0-9]{4}$' then
          raise exception 'INVALID_FUNNEL' using detail = 'startYear'; end if;
        v_start := (a ->> 'startYear')::integer;
        if v_start not between y - 1 and y + 4 then raise exception 'INVALID_FUNNEL' using detail = 'startYear'; end if;
        if cardinality(v_profs) = 0 then v_start := null; end if;
      end if;

      if jsonb_typeof(a -> 'weeklyGoal') is distinct from 'number' or (a ->> 'weeklyGoal') !~ '^[0-9]{1,2}$' then
        raise exception 'INVALID_FUNNEL' using detail = 'weeklyGoal'; end if;
      v_goal := (a ->> 'weeklyGoal')::integer;
      if v_goal not between 1 and 10 then raise exception 'INVALID_FUNNEL' using detail = 'weeklyGoal'; end if;
    end if;

    if v_role in ('student', 'parent') and a ? 'help' and a -> 'help' <> 'null'::jsonb then
      if jsonb_typeof(a -> 'help') <> 'array' or jsonb_array_length(a -> 'help') > 5 then
        raise exception 'INVALID_FUNNEL' using detail = 'help'; end if;
      for e in select * from jsonb_array_elements(a -> 'help') loop
        if jsonb_typeof(e) <> 'string' or not ((e #>> '{}') = any (case when v_role = 'student' then help_student else help_parent end)) then
          raise exception 'INVALID_FUNNEL' using detail = 'help'; end if;
      end loop;
      select coalesce(array_agg(distinct h), '{}') into v_help from jsonb_array_elements_text(a -> 'help') h;
    end if;
  end if;

  -- role: established roles are never changed by the funnel; school_admin / platform admin never come from here
  select r.role into cur_role from public.user_roles r where r.user_id = uid;
  in_class := exists (select 1 from public.class_members m where m.student_id = uid);
  if v_role = 'staff' then
    if coalesce(cur_role, 'student') not in ('teacher', 'school_admin') then
      begin perform public.set_my_role('teacher');
      exception when others then mismatch := true; end;
    end if;
  elsif cur_role in ('teacher', 'school_admin') or exists (select 1 from public.school_admins s where s.user_id = uid) then
    mismatch := true;
  else
    begin
      perform public.account_set_type(
        case when v_role = 'parent' then 'parent' when in_class then 'school_student' else 'independent_student' end,
        v_year);
    exception when others then mismatch := true; end;
  end if;
  -- role kept → keep only the first name; answers of the other role are not stored (data minimisation)
  if mismatch then
    v_year := null; v_level := null; v_canton := null; v_place := null; v_profs := '{}'; v_start := null; v_goal := null;
    v_help := '{}'; v_skip := true;
  end if;
  if v_year is not null then
    update public.user_roles r set under_16 = (y - v_year - 1 < 16) where r.user_id = uid and r.under_16 is null;
  end if;

  -- answers
  insert into public.profiles (id, user_id, first_name, last_name, email, display_name, school_level, desired_professions, canton,
    location, desired_start_year, weekly_goal, help_wishes, funnel_completed_at, funnel_version, onboarding_completed_at,
    onboarding_tour_completed_at)
  values ('profile-' || uid::text, uid, coalesce(v_first, ''), '', coalesce(u.email, ''), v_first, v_level, v_profs, v_canton,
    v_place, v_start, v_goal, v_help, now(), 1, case when v_role = 'student' and not v_skip then now() end, now())
  on conflict (user_id) do update set
    first_name = coalesce(v_first, public.profiles.first_name),
    display_name = coalesce(v_first, public.profiles.display_name),
    school_level = coalesce(v_level, public.profiles.school_level),
    desired_professions = case when v_role = 'student' and not v_skip then v_profs else public.profiles.desired_professions end,
    canton = coalesce(v_canton, public.profiles.canton),
    location = coalesce(v_place, public.profiles.location),
    desired_start_year = coalesce(v_start, public.profiles.desired_start_year),
    weekly_goal = coalesce(v_goal, public.profiles.weekly_goal),
    help_wishes = case when cardinality(v_help) > 0 then v_help else public.profiles.help_wishes end,
    funnel_completed_at = now(), funnel_version = 1,
    onboarding_completed_at = coalesce(public.profiles.onboarding_completed_at, case when v_role = 'student' and not v_skip then now() end),
    onboarding_tour_completed_at = coalesce(public.profiles.onboarding_tour_completed_at, now());  -- old wizard/tour never shown

  -- the name others see: the first name instead of the e-mail local part (pupils, parents; teachers only if it was the e-mail part)
  if v_first is not null then
    update public.user_roles r set display_name = v_first
    where r.user_id = uid and (r.role = 'student' or r.display_name = '' or r.display_name = split_part(coalesce(u.email, ''), '@', 1));
  end if;

  return jsonb_build_object('applied', true, 'role', public._funnel_role_of(uid), 'role_mismatch', mismatch,
    'under_16', v_year is not null and y - v_year - 1 < 16);
end;
$$;
revoke all on function public.funnel_apply(jsonb) from public, anon;
grant execute on function public.funnel_apply(jsonb) to authenticated;
